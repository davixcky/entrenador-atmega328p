// Sincronizacion con Supabase (REST de PostgREST). Cada periodo_ms:
//   1. GET controles -> entradas v1..v4 (sin fila = ceros)
//   2. al entrenador "C v1 v2 v3 v4" -> "OK s1 s2 s3 s4", y el texto del LCD
//      "M 0 <lcd1>" y "M 1 <lcd2>" (lo muestra lcd_nube(fila))
//   3. POST lecturas con salidas y entradas
// El HTTP va fuera del mutex del entrenador: solo el paso 2 lo toma, asi la app
// no espera por la red.
#include <stdio.h>
#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "protocolo.h"
#include "puente.h"

#define ESPERA_HTTP_MS 4000
#define CUERPO_MAX 512

typedef enum { NUBE_APAGADA, NUBE_OK, NUBE_ERROR } estado_nube_t;

static volatile estado_nube_t estado = NUBE_APAGADA;
static config_t cfg;  // copia de la tarea; static para no gastar pila
// Donde fallo el ultimo ciclo, para @? (detalle=get:401, detalle=entrenador, ...)
static char detalle[96] = "-";

const char *nube_detalle(void) { return detalle; }

static bool fallo(const char *paso, int codigo) {
  if (codigo) snprintf(detalle, sizeof detalle, "%s:%d", paso, codigo);
  else snprintf(detalle, sizeof detalle, "%s", paso);
  return false;
}

// El cliente se reusa entre ciclos (keep-alive): con https un handshake TLS por
// ciclo tarda tanto como el periodo.
static esp_http_client_handle_t cliente = NULL;
static char cliente_url[sizeof cfg.url], cliente_llave[sizeof cfg.llave];

static char cuerpo[CUERPO_MAX];
static int largo_cuerpo;

const char *nube_estado(void) {
  switch (estado) {
    case NUBE_OK: return "ok";
    case NUBE_ERROR: return "error";
    default: return "apagada";
  }
}

static esp_err_t al_evento_http(esp_http_client_event_t *ev) {
  if (ev->event_id == HTTP_EVENT_ON_DATA && largo_cuerpo + ev->data_len < CUERPO_MAX) {
    memcpy(cuerpo + largo_cuerpo, ev->data, ev->data_len);
    largo_cuerpo += ev->data_len;
    cuerpo[largo_cuerpo] = '\0';
  }
  return ESP_OK;
}

static void cerrar_cliente(void) {
  if (cliente) esp_http_client_cleanup(cliente);
  cliente = NULL;
}

static bool abrir_cliente(const char *url_inicial) {
  if (cliente && strcmp(cliente_url, cfg.url) == 0 && strcmp(cliente_llave, cfg.llave) == 0)
    return true;
  cerrar_cliente();
  const esp_http_client_config_t c = {
      .url = url_inicial,
      .timeout_ms = ESPERA_HTTP_MS,
      .event_handler = al_evento_http,
      .crt_bundle_attach = esp_crt_bundle_attach,  // solo se usa con https://
      .keep_alive_enable = true,
      .buffer_size_tx = 2048,  // las cabeceras llevan la llave dos veces
  };
  cliente = esp_http_client_init(&c);
  if (cliente == NULL) return false;
  static char bearer[sizeof cfg.llave + 8];
  snprintf(bearer, sizeof bearer, "Bearer %s", cfg.llave);
  esp_http_client_set_header(cliente, "apikey", cfg.llave);
  esp_http_client_set_header(cliente, "Authorization", bearer);
  esp_http_client_set_header(cliente, "Content-Type", "application/json");
  esp_http_client_set_header(cliente, "Prefer", "return=minimal");
  strcpy(cliente_url, cfg.url);
  strcpy(cliente_llave, cfg.llave);
  return true;
}

// Hace el pedido y devuelve el codigo HTTP (o -1). El cuerpo queda en cuerpo.
static int pedir(const char *url, esp_http_client_method_t metodo, const char *datos) {
  largo_cuerpo = 0;
  cuerpo[0] = '\0';
  esp_http_client_set_url(cliente, url);
  esp_http_client_set_method(cliente, metodo);
  esp_http_client_set_post_field(cliente, datos, datos ? (int)strlen(datos) : 0);
  // set_post_field(NULL) del GET borra Content-Type, y sin el ESP-IDF manda el POST como
  // x-www-form-urlencoded (PostgREST responde PGRST204): se pone de nuevo en cada pedido.
  if (datos) esp_http_client_set_header(cliente, "Content-Type", "application/json");
  if (esp_http_client_perform(cliente) != ESP_OK) {
    cerrar_cliente();  // conexion rota: el proximo ciclo abre otra
    return -1;
  }
  return esp_http_client_get_status_code(cliente);
}

static bool ciclo(void) {
  static char url[sizeof cfg.url + 128];
  static char json[160];
  if (url_controles(url, sizeof url, cfg.url, cfg.dispositivo) < 0) return fallo("url", 0);
  if (!abrir_cliente(url)) return fallo("cliente", 0);

  int16_t e[4], s[4];
  int codigo = pedir(url, HTTP_METHOD_GET, NULL);
  if (codigo != 200) return fallo("get", codigo);
  if (!parsear_entradas_json(cuerpo, e)) return fallo("json", 0);

  char cmd[48], resp[64];
  formatear_c(cmd, sizeof cmd, e);
  if (!entrenador_transaccion(cmd, resp, sizeof resp) || !parsear_respuesta_c(resp, s))
    return fallo("entrenador", 0);

  // Texto del LCD: se manda en cada ciclo (si el ATmega se reinicio, lo recupera solo).
  // Un firmware viejo contesta "ERR comando": no es motivo para cortar el ciclo.
  static const char *claves[2] = {"lcd1", "lcd2"};
  for (int fila = 0; fila < 2; fila++) {
    char texto[17], linea[24];
    if (parsear_texto_json(cuerpo, claves[fila], texto, sizeof texto) &&
        formatear_m(linea, sizeof linea, fila, texto) > 0)
      entrenador_transaccion(linea, resp, sizeof resp);
  }

  if (url_lecturas(url, sizeof url, cfg.url) < 0) return fallo("url", 0);
  if (json_lectura(json, sizeof json, cfg.dispositivo, s, e) < 0) return fallo("json", 0);
  codigo = pedir(url, HTTP_METHOD_POST, json);
  if (codigo < 200 || codigo >= 300) {
    // codigo y el comienzo de la respuesta, sin espacios (@? separa por espacios)
    int n = snprintf(detalle, sizeof detalle, "post:%d:", codigo);
    for (const char *c = cuerpo; *c && n < (int)sizeof detalle - 1; c++) detalle[n++] = (*c == ' ' || *c < 0x20) ? '_' : *c;
    detalle[n] = '\0';
    return false;
  }
  snprintf(detalle, sizeof detalle, "-");
  return true;
}

static void tarea_nube(void *arg) {
  (void)arg;
  for (;;) {
    TickType_t inicio = xTaskGetTickCount();
    config_copiar(&cfg);
    if (!cfg.nube) {
      estado = NUBE_APAGADA;
      cerrar_cliente();
    } else if (isp_activo()) {
      // grabando: el ATmega esta en reset, no hay a quien preguntarle
    } else if (wifi_estado() != WIFI_CONECTADO || !cfg.url[0] || !cfg.llave[0]) {
      fallo(wifi_estado() != WIFI_CONECTADO ? "sin-wifi" : "sin-url-o-llave", 0);
      estado = NUBE_ERROR;
      cerrar_cliente();
    } else {
      estado = ciclo() ? NUBE_OK : NUBE_ERROR;
    }
    // Periodo medido desde el inicio del ciclo; si el ciclo se paso, igual cede un poco
    TickType_t transcurrido = xTaskGetTickCount() - inicio;
    TickType_t periodo = pdMS_TO_TICKS(cfg.periodo_ms);
    vTaskDelay(transcurrido + pdMS_TO_TICKS(20) < periodo ? periodo - transcurrido
                                                          : pdMS_TO_TICKS(20));
  }
}

void nube_iniciar(void) { xTaskCreate(tarea_nube, "nube", 10240, NULL, 4, NULL); }
