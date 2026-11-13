// Wi-Fi en modo estacion con las credenciales de NVS. Se reconecta solo.
// El LED de la DevKit muestra el estado: parpadea conectando, fijo conectado.
#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "puente.h"

#define REINTENTO_MS 3000

static volatile estado_wifi_t estado = WIFI_DESCONECTADO;
static volatile bool caido = false;  // se cayo la conexion: la tarea reintenta
static esp_netif_t *netif;

static void al_evento(void *arg, esp_event_base_t base, int32_t id, void *datos) {
  (void)arg;
  (void)datos;
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    if (estado != WIFI_DESCONECTADO) estado = WIFI_CONECTANDO;
    caido = true;
  } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    estado = WIFI_CONECTADO;
    caido = false;
  }
}

static void conectar(void) {
  static config_t c;  // static (es grande); lo llaman app_main y despues solo el anfitrion
  config_copiar(&c);
  esp_wifi_disconnect();
  if (c.ssid[0] == '\0') {
    estado = WIFI_DESCONECTADO;
    return;
  }
  wifi_config_t w = {0};
  // memcpy y no strlcpy: un SSID de 32 o una clave de 64 llenan el campo sin '\0'
  memcpy(w.sta.ssid, c.ssid, strnlen(c.ssid, sizeof w.sta.ssid));
  memcpy(w.sta.password, c.clave, strnlen(c.clave, sizeof w.sta.password));
  w.sta.threshold.authmode = WIFI_AUTH_OPEN;  // acepta red abierta si no hay clave
  esp_wifi_set_config(WIFI_IF_STA, &w);
  estado = WIFI_CONECTANDO;
  caido = false;
  esp_wifi_connect();
}

void wifi_reconfigurar(void) { conectar(); }

estado_wifi_t wifi_estado(void) { return estado; }

void wifi_ip(char *dst, size_t cap) {
  esp_netif_ip_info_t ip;
  if (estado == WIFI_CONECTADO && esp_netif_get_ip_info(netif, &ip) == ESP_OK) {
    snprintf(dst, cap, IPSTR, IP2STR(&ip.ip));
  } else {
    strlcpy(dst, "-", cap);
  }
}

static void tarea_wifi(void *arg) {
  (void)arg;
  TickType_t ultimo_intento = xTaskGetTickCount();
  bool led = false;
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(250));
    estado_wifi_t e = estado;
    led = e == WIFI_CONECTADO ? true : (e == WIFI_CONECTANDO ? !led : false);
    gpio_set_level(PIN_LED, led);

    // Reintento espaciado: llamar esp_wifi_connect en el evento mismo satura si el AP no esta
    if (e == WIFI_CONECTANDO && caido &&
        xTaskGetTickCount() - ultimo_intento >= pdMS_TO_TICKS(REINTENTO_MS)) {
      caido = false;
      ultimo_intento = xTaskGetTickCount();
      esp_wifi_connect();
    }
  }
}

void wifi_iniciar(void) {
  gpio_reset_pin(PIN_LED);
  gpio_set_direction(PIN_LED, GPIO_MODE_OUTPUT);
  gpio_set_level(PIN_LED, 0);

  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  netif = esp_netif_create_default_wifi_sta();
  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));  // las credenciales ya estan en NVS
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_STA_DISCONNECTED, al_evento, NULL));
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, al_evento, NULL));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_start());
  conectar();
  xTaskCreate(tarea_wifi, "wifi", 3072, NULL, 3, NULL);
}
