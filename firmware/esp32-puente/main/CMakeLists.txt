idf_component_register(
  SRCS "principal.c" "protocolo.c" "config.c" "entrenador.c" "isp.c" "wifi.c" "nube.c"
  INCLUDE_DIRS "."
  PRIV_REQUIRES esp_driver_uart esp_driver_gpio nvs_flash esp_wifi esp_netif esp_event
                esp_http_client mbedtls json
)
