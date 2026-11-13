/*
 * Puente ESP32 del entrenador (actividad 15.3, ver INTEGRADOR.md).
 *
 * Reemplaza al Uno con puente-uno: por el USB de la DevKit (UART0, 19200 baudios)
 * la app ve lo mismo que antes. '!' -> "PUENTE OK" y las lineas van al entrenador
 * por UART2 (una respuesta por comando). Ademas:
 *
 *   @?                   -> OK ESP32 1 wifi=.. ip=.. nube=.. dispositivo=..
 *   @CONF <json>         -> OK   ssid, clave, url, llave, dispositivo, periodo_ms
 *   @NUBE 1 / @NUBE 0    -> OK   sincronizacion con Supabase (queda guardado)
 *   @RESET               -> OK   pulso de reset al ATmega
 *   @ISP INICIO | BORRAR | PAGINA <dir> <hex> | LEER <dir> <n> | FUSIBLES |
 *        FUSIBLE <L|H|E|B> <hex> | FIN     grabar el ATmega por J3 (sin avrdude)
 *
 * Errores: ERR <motivo>. La consola de ESP-IDF esta apagada (sdkconfig.defaults):
 * UART0 es solo del protocolo.
 */
#include <stdio.h>
#include <string.h>
#include <strings.h>

#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "protocolo.h"
#include "puente.h"

#define UART_ANFITRION UART_NUM_0

static SemaphoreHandle_t mutex_salida;
static char linea[LINEA_MAX];
static acumulador_t acum;

// ---- Salida al anfitrion ----

// Las lineas de varias tareas (respuestas, lineas sueltas del entrenador) no se mezclan
void anfitrion_linea(const char *l) {
  xSemaphoreTake(mutex_salida, portMAX_DELAY);
  uart_write_bytes(UART_ANFITRION, l, strlen(l));
  uart_write_bytes(UART_ANFITRION, "\r\n", 2);
  xSemaphoreGive(mutex_salida);
}

static void responder_ok(void) { anfitrion_linea("OK"); }

static void responder_error(const char *motivo) {
  char r[96];
  snprintf(r, sizeof r, "ERR %s", motivo);
  anfitrion_linea(r);
}

// "PALABRA resto": si l empieza con la palabra (sin importar mayusculas), devuelve el resto
static const char *palabra(const char *l, const char *p) {
  size_t n = strlen(p);
  if (strncasecmp(l, p, n) != 0 || (l[n] != '\0' && l[n] != ' ')) return NULL;
  l += n;
  while (*l == ' ') l++;
  return l;
}

// ---- @ISP ----

static void comando_isp(const char *args) {
  static uint8_t datos[ISP_PAGINA_BYTES];
  static char hex[2 * ISP_PAGINA_BYTES + 8];
  const char *resto;
  uint32_t dir;
  int n;

  if ((resto = palabra(args, "INICIO"))) {
    uint8_t firma[3];
    if (!isp_inicio(firma)) {
      responder_error("sin sincronizar (revisar J3 y alimentacion)");
      return;
    }
    bytes_a_hex(firma, 3, hex + 3);
    memcpy(hex, "OK ", 3);
    anfitrion_linea(hex);
    return;
  }
  if ((resto = palabra(args, "FIN"))) {
    isp_fin();
    responder_ok();
    return;
  }
  if (!isp_activo()) {
    responder_error("sin @ISP INICIO");
    return;
  }

  if ((resto = palabra(args, "BORRAR"))) {
    if (isp_borrar()) responder_ok();
    else responder_error("chip ocupado");
  } else if ((resto = palabra(args, "PAGINA"))) {
    if (!isp_parsear_pagina(resto, &dir, datos, &n)) responder_error("PAGINA <dir multiplo de 128> <hex hasta 128 bytes>");
    else if (isp_pagina(dir, datos, n)) responder_ok();
    else responder_error("chip ocupado");
  } else if ((resto = palabra(args, "LEER"))) {
    if (!isp_parsear_leer(resto, &dir, &n)) {
      responder_error("LEER <dir> <1 a 128>");
      return;
    }
    isp_leer(dir, datos, n);
    memcpy(hex, "OK ", 3);
    bytes_a_hex(datos, (size_t)n, hex + 3);
    anfitrion_linea(hex);
  } else if ((resto = palabra(args, "FUSIBLES"))) {
    uint8_t f[4];
    isp_fusibles(f);
    snprintf(hex, sizeof hex, "OK %02X %02X %02X %02X", f[0], f[1], f[2], f[3]);
    anfitrion_linea(hex);
  } else if ((resto = palabra(args, "FUSIBLE"))) {
    char cual;
    uint8_t valor;
    if (!isp_parsear_fusible(resto, &cual, &valor)) responder_error("FUSIBLE <L|H|E|B> <hex>");
    else if (cual == 'H' && !isp_hfuse_seguro(valor)) responder_error("hfuse apagaria el ISP (RSTDISBL/DWEN)");
    else if (isp_escribir_fusible(cual, valor)) responder_ok();
    else responder_error("chip ocupado");
  } else {
    responder_error("ISP INICIO|BORRAR|PAGINA|LEER|FUSIBLES|FUSIBLE|FIN");
  }
}

// ---- @ ----

static void comando_esp(const char *l) {
  const char *resto;
  if ((resto = palabra(l, "@?"))) {
    static const char *const wifi[] = {"desconectado", "conectando", "conectado"};
    static config_t c;
    char ip[16], r[256];
    config_copiar(&c);
    wifi_ip(ip, sizeof ip);
    snprintf(r, sizeof r, "OK ESP32 1 wifi=%s ip=%s nube=%s dispositivo=%s detalle=%s",
             wifi[wifi_estado()], ip, nube_estado(), c.dispositivo, nube_detalle());
    anfitrion_linea(r);
  } else if ((resto = palabra(l, "@CONF"))) {
    bool cambio_wifi;
    const char *error;
    if (config_aplicar_json(resto, &cambio_wifi, &error) != ESP_OK) {
      responder_error(error);
      return;
    }
    if (cambio_wifi) wifi_reconfigurar();
    responder_ok();
  } else if ((resto = palabra(l, "@NUBE"))) {
    if (strcmp(resto, "1") != 0 && strcmp(resto, "0") != 0) responder_error("NUBE 1|0");
    else if (config_poner_nube(resto[0] == '1') != ESP_OK) responder_error("nvs");
    else responder_ok();
  } else if ((resto = palabra(l, "@RESET"))) {
    isp_fin();  // si estaba grabando, soltar J3 antes de dejarlo correr
    isp_pulso_reset();
    responder_ok();
  } else if ((resto = palabra(l, "@ISP"))) {
    comando_isp(resto);
  } else {
    responder_error("comando");
  }
}

// ---- Lineas del anfitrion ----

static void procesar_linea(const char *l) {
  switch (clasificar_linea(l)) {
    case LINEA_VACIA: break;  // el '\n' que manda la app despues de los '!'
    case LINEA_SALUDO:
      entrenador_vaciar();
      anfitrion_linea("PUENTE OK");
      break;
    case LINEA_ESP: comando_esp(l + strspn(l, " \t")); break;
    case LINEA_ENTRENADOR: {
      char resp[256];
      if (entrenador_transaccion(l, resp, sizeof resp)) anfitrion_linea(resp);
      else responder_error("sin respuesta");
      break;
    }
  }
}

static void tarea_anfitrion(void *arg) {
  (void)arg;
  uint8_t bytes[64];
  for (;;) {
    int n = uart_read_bytes(UART_ANFITRION, bytes, sizeof bytes, pdMS_TO_TICKS(20));
    for (int i = 0; i < n; i++) {
      switch (acum_byte(&acum, (char)bytes[i], true)) {
        case ACUM_SALUDO:
          entrenador_vaciar();  // la app se acaba de conectar: empezar con el buffer limpio
          anfitrion_linea("PUENTE OK");
          break;
        case ACUM_LINEA: procesar_linea(acum.buf); break;
        case ACUM_DESBORDE: responder_error("linea muy larga"); break;
        case ACUM_NADA: break;
      }
    }
  }
}

void anfitrion_iniciar(void) {
  mutex_salida = xSemaphoreCreateMutex();
  acum_iniciar(&acum, linea, sizeof linea);
  const uart_config_t cfg = {
      .baud_rate = BAUDIOS,
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_1,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .source_clk = UART_SCLK_DEFAULT,
  };
  // Buffer de recepcion grande: la app manda paginas ISP de ~270 bytes seguidas
  ESP_ERROR_CHECK(uart_driver_install(UART_ANFITRION, 2048, 2048, 0, NULL, 0));
  ESP_ERROR_CHECK(uart_param_config(UART_ANFITRION, &cfg));
}

void app_main(void) {
  // Primero soltar J3: el ATmega tiene que poder arrancar mientras el ESP32 inicia
  isp_soltar_pines();
  // El anfitrion antes que el Wi-Fi: la app manda '!' apenas abre el puerto
  config_cargar();
  anfitrion_iniciar();
  entrenador_iniciar();
  entrenador_vaciar();  // el pulso del arranque en TX2 dejo basura en el ATmega
  xTaskCreate(tarea_anfitrion, "anfitrion", 6144, NULL, 6, NULL);
  wifi_iniciar();
  nube_iniciar();
}
