// Sincronizacion con Supabase (REST de PostgREST). Cada periodo_ms:
//   1. GET controles -> entradas v1..v4 (sin fila = ceros)
//   2. al entrenador "C v1 v2 v3 v4" -> "OK s1 s2 s3 s4", y el texto del LCD
//      "M 0 <lcd1>" y "M 1 <lcd2>" (lo muestra lcd_nube(fila))
//   3. POST lecturas con salidas y entradas
// El HTTP va fuera del mutex del entrenador: solo el paso 2 lo toma, asi la app
// no espera por la red.
#include <stdio.h>
#include <string.h>
#include "cJSON.h"

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "protocolo.h"
#include "puente.h"

#define ESPERA_HTTP_MS 4000
#define CUERPO_MAX 4096

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
static bool cuerpo_desbordado;
static SemaphoreHandle_t mutex_lcd;
static mensaje_lcd_t mensajes[2];
static bool lcd_disponible, lcd_activo;

const char *nube_estado(void) {
  switch (estado) {
    case NUBE_OK: return "ok";
    case NUBE_ERROR: return "error";
    default: return "apagada";
  }
}

static esp_err_t al_evento_http(esp_http_client_event_t *ev) {
  if (ev->event_id == HTTP_EVENT_ON_DATA) {
    if (largo_cuerpo + ev->data_len >= CUERPO_MAX) cuerpo_desbordado = true;
    else if (!cuerpo_desbordado) {
      memcpy(cuerpo + largo_cuerpo, ev->data, ev->data_len);
      largo_cuerpo += ev->data_len;
      cuerpo[largo_cuerpo] = '\0';
    }
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
  cuerpo_desbordado = false;
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
  return cuerpo_desbordado ? -2 : esp_http_client_get_status_code(cliente);
}

// Una carga se reclama en la base ANTES de enviarla. Si se reinicia el ESP32 o se
// pierde el acuse HTTP, nunca se vuelve a ejecutar automaticamente.
static programa_wifi_t programa;
static char resultado_programa[384];
static bool confirmar_programa;

static bool cargas_wifi(void) {
  char url[sizeof cfg.url + 128];
  if (confirmar_programa) {
    snprintf(url, sizeof url, "%s/rest/v1/programas?id=eq.%s&estado=eq.enviando", cfg.url, programa.id);
    int codigo = pedir(url, HTTP_METHOD_PATCH, resultado_programa);
    if (codigo < 200 || codigo >= 300) return fallo("confirmar-programa", codigo);
    confirmar_programa = false;
  }
  char json[256];
  cJSON *peticion = cJSON_CreateObject();
  if (!peticion) return fallo("memoria", 0);
  cJSON_AddStringToObject(peticion, "p_dispositivo", cfg.dispositivo);
  bool cabe = cJSON_PrintPreallocated(peticion, json, sizeof json, false);
  cJSON_Delete(peticion);
  if (!cabe) return fallo("json-programa", 0);
  snprintf(url, sizeof url, "%s/rest/v1/rpc/reclamar_programa", cfg.url);
  esp_http_client_set_header(cliente, "Prefer", "return=representation");
  int codigo = pedir(url, HTTP_METHOD_POST, json);
  if (cliente) esp_http_client_set_header(cliente, "Prefer", "return=minimal");
  // Permite instalar este firmware antes de la migracion de la base.
  if (codigo == 404) return true;
  if (codigo != 200) return fallo("reclamar-programa", codigo);
  int carga = parsear_programa_json(cuerpo, &programa);
  if (carga == 0) return true;
  if (!programa.id[0]) return fallo("programa-invalido", 0);
  char razon[128] = "Codigo invalido";
  bool ok = carga == 1 && entrenador_programa(&programa, razon, sizeof razon);
  cJSON *resultado = cJSON_CreateObject();
  if (!resultado) return fallo("memoria", 0);
  cJSON_AddStringToObject(resultado, "estado", ok ? "ejecutado" : "error");
  cJSON_AddStringToObject(resultado, "detalle", razon);
  cabe = cJSON_PrintPreallocated(resultado, resultado_programa, sizeof resultado_programa, false);
  cJSON_Delete(resultado);
  if (!cabe) return fallo("json-programa", 0);
  // Se confirma en el proximo ciclo; los reintentos HTTP no repiten la carga serie.
  confirmar_programa = true;
  return true;
}

static bool ciclo(void) {
  static char url[sizeof cfg.url + 256];
  static char json[640];
  if (url_controles(url, sizeof url, cfg.url, cfg.dispositivo) < 0) return fallo("url", 0);
  if (!abrir_cliente(url)) return fallo("cliente", 0);

  if (!cargas_wifi()) return false;

  int16_t e[4], s[4];
  int codigo = pedir(url, HTTP_METHOD_GET, NULL);
  if (codigo != 200) return fallo("get", codigo);
  if (!parsear_entradas_json(cuerpo, e)) return fallo("json", 0);

  char cmd[48], resp[64];
  formatear_c(cmd, sizeof cmd, e);
  if (!entrenador_transaccion(cmd, resp, sizeof resp) || !parsear_respuesta_c(resp, s))
    return fallo("entrenador", 0);

  // Copiar los mensajes completos: otra tarea mueve la ventana sin esperar al HTTP.
  static const char *claves[2] = {"lcd1", "lcd2"};
  char textos[2][LCD_TEXTO_MAX + 1];
  bool desplazar[2];
  uint32_t paso_ms[2];
  for (int fila = 0; fila < 2; fila++) {
    if (!parsear_texto_json(cuerpo, claves[fila], textos[fila], sizeof textos[fila]) ||
        !parsear_opciones_lcd_json(cuerpo, fila, &desplazar[fila], &paso_ms[fila]))
      return fallo("texto-lcd", 0);
  }
  xSemaphoreTake(mutex_lcd, portMAX_DELAY);
  for (int fila = 0; fila < 2; fila++)
    lcd_actualizar(&mensajes[fila], textos[fila], desplazar[fila], paso_ms[fila], xTaskGetTickCount() * portTICK_PERIOD_MS);
  lcd_disponible = true;
  xSemaphoreGive(mutex_lcd);

  if (url_lecturas(url, sizeof url, cfg.url) < 0) return fallo("url", 0);
  char telemetria[96], pantalla[128];
  bool con_telemetria = entrenador_transaccion("T", telemetria, sizeof telemetria) &&
                        strncmp(telemetria, "T ", 2) == 0;
  bool con_pantalla = entrenador_transaccion("P", pantalla, sizeof pantalla) &&
                      strncmp(pantalla, "OK ", 3) == 0;
  if (json_lectura_estado(json, sizeof json, cfg.dispositivo, s, e,
                         con_telemetria ? telemetria : NULL, con_pantalla ? pantalla : NULL) < 0)
    return fallo("json", 0);
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
    size_t largo_url = strlen(cfg.url);
    while (largo_url && cfg.url[largo_url - 1] == '/') cfg.url[--largo_url] = '\0';
    xSemaphoreTake(mutex_lcd, portMAX_DELAY);
    lcd_activo = cfg.nube;
    xSemaphoreGive(mutex_lcd);
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

static void tarea_lcd(void *arg) {
  (void)arg;
  char enviadas[2][LCD_COLUMNAS + 1] = {{0}};
  uint32_t ultimo_envio[2] = {0};
  for (;;) {
    TickType_t inicio = xTaskGetTickCount();
    char filas[2][LCD_COLUMNAS + 1];
    xSemaphoreTake(mutex_lcd, portMAX_DELAY);
    bool enviar = lcd_activo && lcd_disponible;
    if (enviar) for (int f = 0; f < 2; f++)
      lcd_ventana(&mensajes[f], inicio * portTICK_PERIOD_MS, filas[f]);
    xSemaphoreGive(mutex_lcd);
    if (enviar && !isp_activo()) {
      for (int f = 0; f < 2; f++) {
        uint32_t ahora_ms = xTaskGetTickCount() * portTICK_PERIOD_MS;
        if (strcmp(enviadas[f], filas[f]) == 0 && (uint32_t)(ahora_ms - ultimo_envio[f]) < 1000) continue;
        char linea[24], resp[64];
        formatear_m(linea, sizeof linea, f, filas[f]);
        // Reenviar tambien las filas quietas recupera el LCD tras un reset del ATmega.
        if (!entrenador_transaccion(linea, resp, sizeof resp)) break;
        strcpy(enviadas[f], filas[f]);
        ultimo_envio[f] = ahora_ms;
      }
    }
    TickType_t usado = xTaskGetTickCount() - inicio;
    TickType_t periodo = pdMS_TO_TICKS(100);
    vTaskDelay(usado < periodo ? periodo - usado : pdMS_TO_TICKS(20));
  }
}

void nube_iniciar(void) {
  mutex_lcd = xSemaphoreCreateMutex();
  xTaskCreate(tarea_lcd, "lcd-nube", 3072, NULL, 4, NULL);
  xTaskCreate(tarea_nube, "nube", 10240, NULL, 4, NULL);
}
