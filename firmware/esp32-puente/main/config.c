// Configuracion guardada en NVS (namespace "puente"). Se cambia con @CONF y @NUBE.
#include <string.h>

#include "cJSON.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "puente.h"

#define ESPACIO "puente"
#define PERIODO_DEFECTO 1000
#define PERIODO_MIN 200  // menos no alcanza para GET + C + POST
#define PERIODO_MAX 600000
#define DISPOSITIVO_DEFECTO "entrenador-1"

static config_t actual;
static SemaphoreHandle_t mutex;

// Claves de texto: nombre en el JSON (= nombre en NVS) y donde se guarda
typedef struct {
  const char *nombre;
  size_t desplazamiento;
  size_t cap;
} campo_t;

#define CAMPO(n) {#n, offsetof(config_t, n), sizeof(((config_t *)0)->n)}
static const campo_t campos[] = {CAMPO(ssid), CAMPO(clave), CAMPO(url), CAMPO(llave),
                                 CAMPO(dispositivo)};
#define N_CAMPOS (sizeof campos / sizeof campos[0])

static char *texto(config_t *c, const campo_t *k) { return (char *)c + k->desplazamiento; }

void config_cargar(void) {
  mutex = xSemaphoreCreateMutex();
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    nvs_flash_erase();  // particion de otra version: empezar de cero
    nvs_flash_init();
  }

  memset(&actual, 0, sizeof actual);
  strcpy(actual.dispositivo, DISPOSITIVO_DEFECTO);
  actual.periodo_ms = PERIODO_DEFECTO;
  actual.nube = true;  // con url y llave puestas, sincroniza sin pedir nada mas

  nvs_handle_t h;
  if (nvs_open(ESPACIO, NVS_READONLY, &h) != ESP_OK) return;  // primera vez: no existe
  for (size_t i = 0; i < N_CAMPOS; i++) {
    size_t largo = campos[i].cap;
    nvs_get_str(h, campos[i].nombre, texto(&actual, &campos[i]), &largo);  // si falta, queda el valor por defecto
  }
  uint32_t periodo;
  if (nvs_get_u32(h, "periodo_ms", &periodo) == ESP_OK) actual.periodo_ms = periodo;
  uint8_t nube;
  if (nvs_get_u8(h, "nube", &nube) == ESP_OK) actual.nube = nube != 0;
  nvs_close(h);
  if (actual.dispositivo[0] == '\0') strcpy(actual.dispositivo, DISPOSITIVO_DEFECTO);
}

void config_copiar(config_t *dst) {
  xSemaphoreTake(mutex, portMAX_DELAY);
  *dst = actual;
  xSemaphoreGive(mutex);
}

static esp_err_t guardar(const config_t *c) {
  nvs_handle_t h;
  esp_err_t err = nvs_open(ESPACIO, NVS_READWRITE, &h);
  if (err != ESP_OK) return err;
  for (size_t i = 0; i < N_CAMPOS && err == ESP_OK; i++)
    err = nvs_set_str(h, campos[i].nombre, texto((config_t *)c, &campos[i]));
  if (err == ESP_OK) err = nvs_set_u32(h, "periodo_ms", c->periodo_ms);
  if (err == ESP_OK) err = nvs_set_u8(h, "nube", c->nube);
  if (err == ESP_OK) err = nvs_commit(h);
  nvs_close(h);
  return err;
}

esp_err_t config_aplicar_json(const char *json, bool *cambio_wifi, const char **error) {
  *cambio_wifi = false;
  cJSON *raiz = cJSON_Parse(json);
  if (!cJSON_IsObject(raiz)) {
    cJSON_Delete(raiz);
    *error = "json";
    return ESP_ERR_INVALID_ARG;
  }

  static config_t nueva;  // static: config_t es grande para la pila de la tarea
  config_copiar(&nueva);
  *error = NULL;

  // Se valida todo antes de guardar: un @CONF con un error no deja nada a medias
  for (cJSON *item = raiz->child; item && !*error; item = item->next) {
    if (strcmp(item->string, "periodo_ms") == 0) {
      double v = cJSON_IsNumber(item) ? item->valuedouble : -1;
      if (v < PERIODO_MIN || v > PERIODO_MAX) *error = "periodo_ms (200 a 600000)";
      else nueva.periodo_ms = (uint32_t)v;
      continue;
    }
    const campo_t *k = NULL;
    for (size_t i = 0; i < N_CAMPOS; i++)
      if (strcmp(item->string, campos[i].nombre) == 0) k = &campos[i];
    if (k == NULL) {
      *error = "clave desconocida";
    } else if (!cJSON_IsString(item)) {
      *error = "se esperaba texto";
    } else if (strlen(item->valuestring) >= k->cap) {
      *error = "texto muy largo";
    } else {
      char *dst = texto(&nueva, k);
      if (k->desplazamiento == offsetof(config_t, ssid) ||
          k->desplazamiento == offsetof(config_t, clave))
        *cambio_wifi |= strcmp(dst, item->valuestring) != 0;
      strcpy(dst, item->valuestring);
    }
  }
  cJSON_Delete(raiz);
  if (*error) {
    *cambio_wifi = false;
    return ESP_ERR_INVALID_ARG;
  }
  if (nueva.dispositivo[0] == '\0') strcpy(nueva.dispositivo, DISPOSITIVO_DEFECTO);

  esp_err_t err = guardar(&nueva);
  if (err != ESP_OK) {
    *cambio_wifi = false;
    *error = "nvs";
    return err;
  }
  xSemaphoreTake(mutex, portMAX_DELAY);
  actual = nueva;
  xSemaphoreGive(mutex);
  return ESP_OK;
}

esp_err_t config_poner_nube(bool activa) {
  static config_t nueva;
  config_copiar(&nueva);
  nueva.nube = activa;
  esp_err_t err = guardar(&nueva);
  if (err != ESP_OK) return err;
  xSemaphoreTake(mutex, portMAX_DELAY);
  actual.nube = activa;
  xSemaphoreGive(mutex);
  return ESP_OK;
}
