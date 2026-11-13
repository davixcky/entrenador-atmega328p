// Programacion serie del ATmega328P por bit-bang en J3 (datasheet, "Serial Downloading").
// Reemplaza al Uno con ArduinoISP + avrdude. Fuera de INICIO..FIN los cuatro pines
// quedan como entradas sin pull: el ATmega usa PB3/PB4/PB5 mientras corre y la
// pull-up de 10 kOhm de RESET lo deja correr.
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "protocolo.h"
#include "puente.h"

// Medio periodo de SCK: 5 us = 100 kHz. El datasheet pide SCK alto y bajo de mas de
// 2 ciclos del ATmega (3 si va a 12 MHz o mas): sirve a 16 MHz y tambien a 1 MHz
// (chip nuevo con CKDIV8).
#define MEDIO_PERIODO_US 5
#define INTENTOS_SINCRONIZAR 8
#define ESPERA_ESCRITURA_MS 10  // tWD_FLASH y tWD_FUSE 4.5 ms, tWD_ERASE 9 ms

static bool activo = false;

static void como_entrada(int pin) {
  gpio_set_direction(pin, GPIO_MODE_INPUT);
  gpio_set_pull_mode(pin, GPIO_FLOATING);
}

static void como_salida(int pin, int nivel) {
  gpio_set_level(pin, nivel);  // primero el nivel: que no salga un pulso al cambiar
  gpio_set_direction(pin, GPIO_MODE_OUTPUT);
}

// RESET nunca se maneja en alto: los 3.3 V del ESP32 contra la pull-up a 5 V no
// hacen falta. Alto = soltar (entrada) y que la pull-up suba la linea.
static void reset_abajo(void) { como_salida(PIN_ISP_RESET, 0); }
static void reset_soltar(void) { como_entrada(PIN_ISP_RESET); }

void isp_soltar_pines(void) {
  const int pines[] = {PIN_ISP_RESET, PIN_ISP_MOSI, PIN_ISP_MISO, PIN_ISP_SCK};
  for (int i = 0; i < 4; i++) {
    gpio_reset_pin(pines[i]);  // gpio_reset_pin deja pull-up: se saca en como_entrada
    como_entrada(pines[i]);
  }
  activo = false;
}

bool isp_activo(void) { return activo; }

// Modo 0, MSB primero: el ATmega toma MOSI en el flanco de subida y cambia MISO en
// el de bajada, asi que MISO se lee con SCK alto.
static uint8_t transferir(uint8_t b) {
  uint8_t r = 0;
  for (int i = 0; i < 8; i++) {
    gpio_set_level(PIN_ISP_MOSI, (b & 0x80) ? 1 : 0);
    b <<= 1;
    esp_rom_delay_us(MEDIO_PERIODO_US);
    gpio_set_level(PIN_ISP_SCK, 1);
    esp_rom_delay_us(MEDIO_PERIODO_US);
    r = (uint8_t)(r << 1 | gpio_get_level(PIN_ISP_MISO));
    gpio_set_level(PIN_ISP_SCK, 0);
  }
  return r;
}

// Envia una instruccion de 4 bytes; devuelve el byte 3 (eco) en eco y el 4 como resultado
static uint8_t instruccion(const uint8_t ins[4], uint8_t *eco) {
  transferir(ins[0]);
  transferir(ins[1]);
  uint8_t e = transferir(ins[2]);
  if (eco) *eco = e;
  return transferir(ins[3]);
}

static uint8_t ins4(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
  const uint8_t ins[4] = {a, b, c, d};
  return instruccion(ins, NULL);
}

// Poll RDY/BSY (0xF0): bit 0 en 1 = ocupado. Con tope por si el chip no contesta.
static bool esperar_listo(void) {
  TickType_t limite = xTaskGetTickCount() + pdMS_TO_TICKS(ESPERA_ESCRITURA_MS * 3);
  while (ins4(0xF0, 0x00, 0x00, 0x00) & 0x01) {
    if ((int32_t)(limite - xTaskGetTickCount()) <= 0) return false;
    vTaskDelay(1);
  }
  return true;
}

bool isp_inicio(uint8_t firma[3]) {
  // Datasheet: RESET y SCK en 0, esperar 20 ms y mandar Programming Enable.
  // Si el eco del tercer byte no es 0x53, pulso positivo en RESET y otra vez.
  reset_abajo();
  como_salida(PIN_ISP_SCK, 0);
  como_salida(PIN_ISP_MOSI, 0);
  como_entrada(PIN_ISP_MISO);
  activo = true;

  for (int intento = 0; intento < INTENTOS_SINCRONIZAR; intento++) {
    if (intento > 0) {
      // El datasheet pide 2 ciclos, pero RESET sube por 10 kOhm con C11 de 10 nF
      // (RC = 100 us): 1 ms asegura el alto y es mucho menos que el arranque del chip
      reset_soltar();
      esp_rom_delay_us(1000);
      reset_abajo();
    }
    vTaskDelay(pdMS_TO_TICKS(25));
    uint8_t eco;
    const uint8_t habilitar[4] = {0xAC, 0x53, 0x00, 0x00};
    instruccion(habilitar, &eco);
    if (eco == 0x53) {
      for (int i = 0; i < 3; i++) firma[i] = ins4(0x30, 0x00, (uint8_t)i, 0x00);
      return true;
    }
  }
  isp_fin();
  return false;
}

bool isp_borrar(void) {
  ins4(0xAC, 0x80, 0x00, 0x00);
  vTaskDelay(pdMS_TO_TICKS(ESPERA_ESCRITURA_MS));
  return esperar_listo();
}

bool isp_pagina(uint32_t dir, const uint8_t *datos, int n) {
  uint8_t ins[4];
  uint16_t palabra = (uint16_t)(dir / 2);
  // Byte bajo y alto de cada palabra al buffer de pagina; un largo impar se completa con FF
  for (int i = 0; i < n; i += 2) {
    uint16_t w = (uint16_t)(palabra + i / 2);
    isp_ins_cargar(ins, w, false, datos[i]);
    instruccion(ins, NULL);
    isp_ins_cargar(ins, w, true, i + 1 < n ? datos[i + 1] : 0xFF);
    instruccion(ins, NULL);
  }
  isp_ins_escribir_pagina(ins, palabra);
  instruccion(ins, NULL);
  vTaskDelay(pdMS_TO_TICKS(5));  // tWD_FLASH = 4.5 ms
  return esperar_listo();
}

void isp_leer(uint32_t dir, uint8_t *datos, int n) {
  uint8_t ins[4];
  for (int i = 0; i < n; i++) {
    isp_ins_leer(ins, dir + (uint32_t)i);
    datos[i] = instruccion(ins, NULL);
  }
}

void isp_fusibles(uint8_t f[4]) {
  f[0] = ins4(0x50, 0x00, 0x00, 0x00);  // lfuse
  f[1] = ins4(0x58, 0x08, 0x00, 0x00);  // hfuse
  f[2] = ins4(0x50, 0x08, 0x00, 0x00);  // efuse
  f[3] = ins4(0x58, 0x00, 0x00, 0x00);  // lock
}

bool isp_escribir_fusible(char cual, uint8_t valor) {
  uint8_t b2;
  switch (cual) {
    case 'L': b2 = 0xA0; break;
    case 'H': b2 = 0xA8; break;
    case 'E': b2 = 0xA4; break;
    case 'B': b2 = 0xE0; break;  // bits de bloqueo
    default: return false;
  }
  ins4(0xAC, b2, 0x00, valor);
  vTaskDelay(pdMS_TO_TICKS(5));  // tWD_FUSE = 4.5 ms
  return esperar_listo();
}

void isp_fin(void) {
  // Primero se sueltan MOSI y SCK (el ATmega los va a manejar) y al final RESET
  como_entrada(PIN_ISP_MOSI);
  como_entrada(PIN_ISP_SCK);
  como_entrada(PIN_ISP_MISO);
  reset_soltar();
  activo = false;
}

void isp_pulso_reset(void) {
  reset_abajo();
  vTaskDelay(pdMS_TO_TICKS(20));
  reset_soltar();
}
