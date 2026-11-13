/*
 * Biblioteca del entrenador ATmega328P.
 *
 * Cada funcion se llama igual que en el lenguaje de la app (app/lenguaje) y hace lo
 * mismo que la instruccion de la maquina virtual (firmware/bloques/maquina.h), asi un
 * programa da el mismo resultado corriendo en la maquina virtual o compilado como
 * sketch. Los valores son int16_t, como en el lenguaje.
 *
 * Las salidas se multiplexan con Timer2 (2 ms por grupo): los displays y los LEDs se
 * siguen viendo durante esperar() o un bucle sin pausas. Timer2 queda ocupado, y con
 * el tambien analogWrite() en los pines 3 y 11.
 */

#pragma once
#include <Arduino.h>

// Constantes del lenguaje
const int16_t verdadero = 1;
const int16_t falso = 0;
const int16_t encendido = 1;
const int16_t apagado = 0;

// Configura los pines, el Timer2 y la semilla de aleatorio(). Va al principio de setup().
void entrenador_iniciar();

// ---- Salidas ----

// Pausa de ms milisegundos (0 o negativo: no espera). Las salidas siguen encendidas.
void esperar(int16_t ms);
// Enciende (estado != 0) o apaga el LED n, de 0 (abajo) a 7. Otro n no hace nada.
void led(int16_t n, int16_t estado);
// Los 8 LEDs en binario: el bit 0 es el LED de abajo
void leds(int16_t valor);
// Numero de 0 a 99 en los displays; fuera de ese rango muestra "--"
void mostrar(int16_t numero);
void apagar_displays();

// Brillo de los 8 LEDs, 0 a 100 %, por PWM: el turno de los LEDs en el multiplexado
// se corta antes (unos 166 Hz, no parpadea). Fuera de rango se recorta.
void brillo(int16_t porcentaje);

// ---- LCD 16x2 por I2C (modulo PCF8574, direccion 0x20..0x27 o 0x38..0x3F, se busca sola) ----
// SDA = PC4 (pin 27) y SCL = PC5 (pin 28): con el LCD conectado, DIP4 debe quedar abierto
// (cerrado pone SDA a GND).
// Sin LCD las funciones no hacen nada. Filas 0..1, columnas 0..15.

void lcd_limpiar();
void lcd_texto(int16_t fila, int16_t columna, const char *texto);
// numero alineado a la derecha en "ancho" columnas (1 a 6), con espacios a la izquierda
void lcd_numero(int16_t fila, int16_t columna, int16_t numero, int16_t ancho);
// Luz de fondo: 1 encendida (al iniciar), 0 apagada
void lcd_luz(int16_t estado);
// Cursor: 0 sin cursor (al iniciar), 1 raya fija, 2 bloque que parpadea
void lcd_cursor(int16_t modo);
bool lcd_conectado();
// Vuelve a luz encendida y sin cursor (firmware bloques, al cargar otro programa)
void lcd_reiniciar();
uint8_t lcd_luz_actual();
uint8_t lcd_cursor_actual();
// Para la app: 0 = sin usar, 1 = conectado, 2 = usado pero sin respuesta; y el texto de
// cada fila (16 caracteres), que se guarda aunque no haya LCD (LCD virtual en la app).
uint8_t lcd_estado();
const char *lcd_linea(uint8_t fila);

// ---- Nube: 4 valores hacia el ESP32 y 4 desde el (comando serie C, INTEGRADOR.md) ----

void nube_enviar(int16_t n, int16_t valor);  // n de 1 a 4
int16_t nube(int16_t n);                     // n de 1 a 4; 0 hasta que llegue un valor
// Escribe en la fila 0 o 1 del LCD el texto que llego de la nube (controles.lcd1 / lcd2),
// completando con espacios hasta las 16 columnas
void lcd_nube(int16_t fila);
// En un sketch el serie (19200) se atiende solo al usar la nube y durante esperar().
// El firmware bloques lo atiende el mismo: llama a nube_sin_atender() y pasa los
// comandos C a nube_comando().
void nube_atender();
void nube_sin_atender();
void nube_comando(const char *argumentos, Print &salida);
void nube_texto_comando(const char *argumentos, Print &salida);  // "M <fila> <texto>"
void nube_reiniciar();

// ---- Entradas ----

int16_t pot();    // potenciometro, 0 a 1023
int16_t pot99();  // potenciometro, 0 a 99
// Con estado distinto de 0, pot() y pot99() se invierten (1023 - lectura); al iniciar, no
void invertir_pot(int16_t estado);
int16_t dip();    // DIP switch, 0 a 15 (interruptor cerrado = 1)
int16_t interruptor(int16_t n);  // interruptor n (1 a 4): 1 cerrado, 0 abierto; otro n da 0
int16_t aleatorio(int16_t desde, int16_t hasta);  // incluye los dos extremos, en cualquier orden

// ---- Aritmetica del lenguaje ----

// Division entera y resto; dividir entre 0 da 0 (en C seria un error)
int16_t dividir(int16_t a, int16_t b);
int16_t modulo(int16_t a, int16_t b);

// Termina el programa: las salidas quedan como estan
void detener();

// ---- Estado de las salidas (lo usa el firmware bloques para la telemetria) ----

int16_t brillo_actual();
uint8_t leds_actuales();
bool displays_encendidos();
int16_t numero_actual();
