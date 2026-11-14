// Logica pura del puente: sin ESP-IDF, asi se prueba en la PC (pruebas/).
// Lineas, decisiones de ruteo, respuestas del entrenador, hex, JSON y ISP.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// ---- Lineas ----

// Junta bytes hasta '\n'. Ignora '\r'. Una linea mas larga que el buffer se
// descarta entera (se avisa al llegar su '\n').
typedef struct {
  char *buf;
  size_t cap;
  size_t largo;
  bool desbordado;
} acumulador_t;

typedef enum {
  ACUM_NADA,      // byte guardado, la linea sigue
  ACUM_LINEA,     // linea completa en buf (terminada en '\0')
  ACUM_SALUDO,    // '!' al principio de la linea: responder PUENTE OK ya
  ACUM_DESBORDE,  // termino una linea que no cabia
} acum_evento_t;

void acum_iniciar(acumulador_t *a, char *buf, size_t cap);
void acum_limpiar(acumulador_t *a);
// saludo = true en el lado del anfitrion: la app manda '!' sin '\n' y espera
// "PUENTE OK" enseguida, como hacia el Uno.
acum_evento_t acum_byte(acumulador_t *a, char c, bool saludo);

typedef enum {
  LINEA_VACIA,       // nada o solo espacios: se ignora (el '\n' tras los '!')
  LINEA_SALUDO,      // solo '!'
  LINEA_ESP,         // empieza con '@': comando del ESP32
  LINEA_ENTRENADOR,  // todo lo demas va al ATmega
} tipo_linea_t;

tipo_linea_t clasificar_linea(const char *l);

// La respuesta del entrenador termina en una linea OK..., T ... o ERR...
bool es_fin_respuesta(const char *l);

// ---- Comando C ----

int formatear_c(char *dst, size_t cap, const int16_t e[4]);
// "OK s1 s2 s3 s4" -> s. Falso si no es exactamente eso.
bool parsear_respuesta_c(const char *l, int16_t s[4]);

// ---- Numeros y hex ----

// Entero decimal con signo; falso si sobra texto o no cabe en [min, max].
bool parsear_entero(const char *txt, long min, long max, long *valor);
// "A1b2" -> {0xA1, 0xB2}. Devuelve la cantidad de bytes o -1 (impar, invalido, largo).
int hex_a_bytes(const char *hex, uint8_t *dst, size_t max);
// Mayusculas, sin separadores. dst necesita 2*n+1.
void bytes_a_hex(const uint8_t *src, size_t n, char *dst);

// ---- Nube (Supabase) ----

#define LCD_TEXTO_MAX 160
#define LCD_COLUMNAS 16
#define LCD_PASO_MS 400
typedef struct {
  char texto[LCD_TEXTO_MAX + 1];
  uint32_t inicio_ms;
  uint32_t paso_ms;
  bool desplazar;
} mensaje_lcd_t;

// Releer el mismo mensaje no reinicia su desplazamiento.
void lcd_actualizar(mensaje_lcd_t *m, const char *texto, bool desplazar, uint32_t paso_ms, uint32_t ahora_ms);
// Sin columnas de opciones (base anterior): true, 400 ms.
bool parsear_opciones_lcd_json(const char *json, int fila, bool *desplazar, uint32_t *paso_ms);
// Siempre 16 caracteres y terminador. Los mensajes cortos quedan quietos.
void lcd_ventana(const mensaje_lcd_t *m, uint32_t ahora_ms, char salida[LCD_COLUMNAS + 1]);

#define PROGRAMA_MAX 768
typedef struct {
  char id[37];
  uint8_t bytes[PROGRAMA_MAX];
  size_t largo;
} programa_wifi_t;
// Respuesta de reclamar_programa: 0 sin carga, 1 carga valida, -1 invalida.
int parsear_programa_json(const char *json, programa_wifi_t *programa);
typedef bool (*intercambio_programa_t)(const char *cmd, char *resp, size_t cap, void *ctx);
// B, D, E y R: solo ejecuta despues de que el entrenador confirme todo el bytecode.
bool enviar_programa_wifi(const programa_wifi_t *p, intercambio_programa_t intercambio,
                         void *ctx, char *detalle, size_t cap);

// Respuesta del GET de controles: [{"entradas":[v1,v2,v3,v4]}] o [] (sin fila = ceros).
// Faltantes o null valen 0. Falso si no es un arreglo JSON.
bool parsear_entradas_json(const char *cuerpo, int16_t e[4]);
// Texto de la clave (lcd1, lcd2) en la misma respuesta. Sin la clave o null -> "".
// Solo ASCII imprimible: escapes de control -> espacio, \uXXXX fuera de ASCII -> '?'.
// Corta en cap - 1 caracteres. false si el JSON esta mal formado.
bool parsear_texto_json(const char *cuerpo, const char *clave, char *dst, size_t cap);
// "M <fila> <texto>": texto del LCD para lcd_nube(fila) del entrenador.
int formatear_m(char *dst, size_t cap, int fila, const char *texto);
// {"dispositivo":"id","salidas":[...],"entradas":[...]}. -1 si no cabe.
int json_lectura(char *dst, size_t cap, const char *dispositivo, const int16_t s[4],
                 const int16_t e[4]);
// Agrega respuestas T y P (NULL si no respondieron), con escape JSON.
int json_lectura_estado(char *dst, size_t cap, const char *dispositivo, const int16_t s[4],
                        const int16_t e[4], const char *telemetria, const char *pantalla);
// Codifica para la query (?dispositivo=eq.<id>). -1 si no cabe.
int url_codificar(char *dst, size_t cap, const char *src);
// Controles numericos, texto y opciones de desplazamiento (sin '/' doble).
int url_controles(char *dst, size_t cap, const char *base, const char *dispositivo);
int url_lecturas(char *dst, size_t cap, const char *base);

// ---- ISP (ATmega328P) ----

#define ISP_PAGINA_BYTES 128
#define ISP_FLASH_BYTES 32768

// "<dir> <hex>": dir multiplo de 128, de 1 a 128 bytes dentro de la pagina.
bool isp_parsear_pagina(const char *args, uint32_t *dir, uint8_t *datos, int *n);
// "<dir> <n>": n de 1 a 128 sin salirse de la flash.
bool isp_parsear_leer(const char *args, uint32_t *dir, int *n);
// "<L|H|E|B> <hex>": B = bits de bloqueo (lock).
bool isp_parsear_fusible(const char *args, char *cual, uint8_t *valor);
// Rechaza un hfuse que deja al chip sin ISP (RSTDISBL o DWEN programados = 0).
bool isp_hfuse_seguro(uint8_t valor);

// Instrucciones de 4 bytes del datasheet ("Serial Programming Instruction Set").
// Las direcciones de flash son de palabra (2 bytes).
void isp_ins_cargar(uint8_t ins[4], uint16_t palabra, bool alto, uint8_t dato);
void isp_ins_escribir_pagina(uint8_t ins[4], uint16_t palabra);
void isp_ins_leer(uint8_t ins[4], uint32_t dir_byte);
