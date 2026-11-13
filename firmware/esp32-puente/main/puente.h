// Declaraciones compartidas entre los modulos del puente ESP32.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

// ---- Pines (ver INTEGRADOR.md, "Conexiones ESP32 <-> entrenador") ----

#define PIN_ENTRENADOR_TX 17  // -> ATmega RXD (PD0)
#define PIN_ENTRENADOR_RX 16  // <- ATmega TXD (PD1), con divisor 1k/2k
#define PIN_ISP_RESET 4
#define PIN_ISP_MOSI 23
#define PIN_ISP_MISO 19
#define PIN_ISP_SCK 18
#define PIN_LED 2  // LED azul de la DevKit: estado del Wi-Fi

#define BAUDIOS 19200
#define LINEA_MAX 1024  // cabe "@ISP PAGINA <dir> <256 hex>" y un @CONF con llave JWT

// ---- Anfitrion (UART0, el USB de la DevKit) ----

void anfitrion_iniciar(void);
// Escribe una linea completa (agrega \r\n). Se puede llamar desde cualquier tarea.
void anfitrion_linea(const char *l);

// ---- Configuracion (NVS) ----

typedef struct {
  char ssid[33];
  char clave[65];
  char url[160];
  char llave[600];
  char dispositivo[64];
  uint32_t periodo_ms;
  bool nube;
} config_t;

void config_cargar(void);
void config_copiar(config_t *dst);
// Mezcla las claves del JSON y las guarda. Si falla, *error dice por que y no cambia nada.
esp_err_t config_aplicar_json(const char *json, bool *cambio_wifi, const char **error);
esp_err_t config_poner_nube(bool activa);

// ---- Entrenador (UART2) ----

void entrenador_iniciar(void);
// Envia cmd y espera la linea OK/T/ERR (las lineas intermedias van al anfitrion).
// Falso si no llego en 1 s. Toma el mutex del entrenador: no llamar con el tomado.
bool entrenador_transaccion(const char *cmd, char *respuesta, size_t cap);
void entrenador_vaciar(void);  // linea vacia al entrenador, respuesta descartada

// ---- ISP por bit-bang (J3) ----

void isp_soltar_pines(void);
bool isp_activo(void);
bool isp_inicio(uint8_t firma[3]);
bool isp_borrar(void);
bool isp_pagina(uint32_t dir, const uint8_t *datos, int n);
void isp_leer(uint32_t dir, uint8_t *datos, int n);
void isp_fusibles(uint8_t f[4]);  // lfuse, hfuse, efuse, lock
bool isp_escribir_fusible(char cual, uint8_t valor);
void isp_fin(void);
void isp_pulso_reset(void);

// ---- Wi-Fi ----

typedef enum { WIFI_DESCONECTADO, WIFI_CONECTANDO, WIFI_CONECTADO } estado_wifi_t;

void wifi_iniciar(void);
void wifi_reconfigurar(void);
estado_wifi_t wifi_estado(void);
void wifi_ip(char *dst, size_t cap);  // "-" sin IP

// ---- Nube ----

void nube_iniciar(void);
const char *nube_estado(void);  // apagada | ok | error
const char *nube_detalle(void);  // paso que fallo: get:401, post:-1, entrenador, ... o -
