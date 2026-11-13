// UART2 hacia el ATmega. Un solo mutex ordena las transacciones: la app (por el
// anfitrion) y la tarea de la nube comparten la linea y el entrenador atiende un
// comando a la vez. Lo que el entrenador mande fuera de una transaccion va al anfitrion.
#include <string.h>

#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "protocolo.h"
#include "puente.h"

#define UART_ENTRENADOR UART_NUM_2
#define ESPERA_MS 1000

static SemaphoreHandle_t mutex;
static char buf_linea[256];
static acumulador_t acum;  // protegido por mutex

typedef enum { SIN_BYTE, BYTE, LINEA } lectura_t;

// Lee un byte y lo agrega a la linea. LINEA = se completo una (queda en acum.buf).
// Las lineas que no caben se descartan: el entrenador no manda lineas tan largas.
static lectura_t leer_byte(TickType_t espera) {
  uint8_t c;
  if (uart_read_bytes(UART_ENTRENADOR, &c, 1, espera) != 1) return SIN_BYTE;
  return acum_byte(&acum, (char)c, false) == ACUM_LINEA ? LINEA : BYTE;
}

static bool transaccion_bloqueada(const char *cmd, char *respuesta, size_t cap, void *ctx) {
  (void)ctx;
  bool ok = false;
  uart_write_bytes(UART_ENTRENADOR, cmd, strlen(cmd));
  uart_write_bytes(UART_ENTRENADOR, "\n", 1);

  TickType_t limite = xTaskGetTickCount() + pdMS_TO_TICKS(ESPERA_MS);
  for (;;) {
    TickType_t ahora = xTaskGetTickCount();
    if ((int32_t)(limite - ahora) <= 0) break;
    if (leer_byte(limite - ahora) != LINEA) continue;
    if (es_fin_respuesta(acum.buf)) {
      strlcpy(respuesta, acum.buf, cap);
      ok = true;
      break;
    }
    if (acum.buf[0]) anfitrion_linea(acum.buf);  // intermedia: la app la registra
  }
  return ok;
}

bool entrenador_transaccion(const char *cmd, char *respuesta, size_t cap) {
  xSemaphoreTake(mutex, portMAX_DELAY);
  bool ok = transaccion_bloqueada(cmd, respuesta, cap, NULL);
  xSemaphoreGive(mutex);
  return ok;
}

bool entrenador_programa(const programa_wifi_t *p, char *detalle, size_t cap) {
  xSemaphoreTake(mutex, portMAX_DELAY);
  bool ok = enviar_programa_wifi(p, transaccion_bloqueada, NULL, detalle, cap);
  xSemaphoreGive(mutex);
  return ok;
}

// Linea vacia al entrenador y se descarta su "ERR comando": borra lo que haya quedado a
// medias en su buffer (el TX del ESP32 da un pulso al arrancar y el ATmega lo lee como
// un byte basura que arruinaria el primer comando de la app).
void entrenador_vaciar(void) {
  char r[64];
  entrenador_transaccion("", r, sizeof r);
}

// Lineas sueltas del entrenador (fuera de una transaccion) -> anfitrion.
// Solo toma el mutex cuando hay bytes, asi no compite con las transacciones.
static void tarea_lector(void *arg) {
  (void)arg;
  for (;;) {
    size_t pendientes = 0;
    uart_get_buffered_data_len(UART_ENTRENADOR, &pendientes);
    if (pendientes == 0) {
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }
    xSemaphoreTake(mutex, portMAX_DELAY);
    // Una linea a medias queda en acum: la completa la proxima vuelta o una transaccion
    lectura_t r;
    while ((r = leer_byte(0)) != SIN_BYTE) {
      if (r == LINEA && acum.buf[0]) anfitrion_linea(acum.buf);
    }
    xSemaphoreGive(mutex);
    vTaskDelay(1);  // dejar pasar a una transaccion que espera el mutex
  }
}

void entrenador_iniciar(void) {
  mutex = xSemaphoreCreateMutex();
  acum_iniciar(&acum, buf_linea, sizeof buf_linea);

  const uart_config_t cfg = {
      .baud_rate = BAUDIOS,
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_1,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .source_clk = UART_SCLK_DEFAULT,
  };
  ESP_ERROR_CHECK(uart_driver_install(UART_ENTRENADOR, 1024, 512, 0, NULL, 0));
  ESP_ERROR_CHECK(uart_param_config(UART_ENTRENADOR, &cfg));
  ESP_ERROR_CHECK(uart_set_pin(UART_ENTRENADOR, PIN_ENTRENADOR_TX, PIN_ENTRENADOR_RX,
                               UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));
  xTaskCreate(tarea_lector, "lector", 3072, NULL, 5, NULL);
}
