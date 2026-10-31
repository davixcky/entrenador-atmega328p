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

// ---- Entradas ----

int16_t pot();    // potenciometro, 0 a 1023
int16_t pot99();  // potenciometro, 0 a 99
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

uint8_t leds_actuales();
bool displays_encendidos();
int16_t numero_actual();
