// Hardware del entrenador: bus de 8 lineas (PD2..PD7, PB0, PB1) compartido por los LEDs
// y los dos displays, seleccionados con PB2 (LEDs), PB3 (decenas) y PB4 (unidades).
// Potenciometro en A0, DIP switch en PC1..PC4 con pull-up y botones en escalera en A5.

#include "Entrenador.h"
#include <avr/interrupt.h>

// Cableado del bus, como en firmware/entrenador/entrenador.ino:
// PCB 0: protoboard, bit i del bus = segmento i = LEDi.
// PCB 1: placa de una cara de kicad/ (lineas permutadas para rutear con menos puentes).
// PCB 2: placa armada con el cableado real, medido con firmware/prueba-mapeo.
#ifndef PCB
#define PCB 2
#endif

#if PCB == 2
static const uint8_t BIT_SEG[8] = {6, 4, 0, 7, 2, 5, 3, 1};  // bit del bus de cada segmento a..dp
static const uint8_t BIT_LED[8] = {0, 1, 2, 3, 4, 5, 6, 7};  // LED0 abajo .. LED7 arriba
#elif PCB == 1
static const uint8_t BIT_SEG[8] = {1, 2, 0, 3, 4, 5, 6, 7};
static const uint8_t BIT_LED[8] = {4, 3, 7, 1, 6, 5, 0, 2};
#else
static const uint8_t BIT_SEG[8] = {0, 1, 2, 3, 4, 5, 6, 7};
static const uint8_t BIT_LED[8] = {0, 1, 2, 3, 4, 5, 6, 7};
#endif

static const uint8_t DIGITO[10] = {
  0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F
};
static const uint8_t GUION = 0x40;  // segmento g: numero fuera de 0..99

static volatile uint8_t pantalla[3];  // 0 = LEDs, 1 = decenas, 2 = unidades

static uint8_t estadoLeds = 0;
static int16_t numero = 0;
static bool displaysEncendidos = false;

static uint8_t reordenar(uint8_t valor, const uint8_t *tabla) {
  uint8_t bus = 0;
  for (uint8_t i = 0; i < 8; i++)
    if (valor & (1 << i)) bus |= (uint8_t)(1 << tabla[i]);
  return bus;
}

static void escribirBus(uint8_t valor) {
  PORTD = (PORTD & 0x03) | (uint8_t)(valor << 2);
  PORTB = (PORTB & 0xFC) | (valor >> 6);
}

ISR(TIMER2_COMPA_vect) {
  static uint8_t grupo = 0;
  PORTB &= ~0x1C;
  grupo = (grupo + 1) % 3;
  escribirBus(pantalla[grupo]);
  PORTB |= (uint8_t)(1 << (PB2 + grupo));
}

static void refrescar() {
  uint8_t dec = 0, uni = 0;
  if (displaysEncendidos && numero >= 0 && numero <= 99) {
    dec = DIGITO[numero / 10];
    uni = DIGITO[numero % 10];
  } else if (displaysEncendidos) {
    dec = uni = GUION;
  }
  uint8_t bus[3] = {reordenar(estadoLeds, BIT_LED), reordenar(dec, BIT_SEG), reordenar(uni, BIT_SEG)};
  uint8_t sreg = SREG;  // los tres grupos cambian juntos para la interrupcion
  cli();
  for (uint8_t i = 0; i < 3; i++) pantalla[i] = bus[i];
  SREG = sreg;
}

void entrenador_iniciar() {
  DDRD |= 0xFC;
  DDRB |= 0x1F;
  DDRC &= ~0x1E;               // PC1..PC4 entradas
  PORTC |= 0x1E;               // pull-up interna del DIP switch
  PORTB |= (1 << PB5);         // pin sin uso con pull-up (PB5 es SCK del ICSP)
  PORTC &= ~(1 << PC5);        // PC5 = botones en escalera: sin pull-up, la baja R19

  // Semilla de aleatorio(): bits bajos del potenciometro y de A5, que varian de un
  // encendido a otro (A5 ya no queda al aire si estan los botones)
  uint16_t semilla = 0;
  for (uint8_t i = 0; i < 16; i++) semilla = (semilla << 1) ^ analogRead(A0) ^ (analogRead(A5) << 3) ^ micros();
  randomSeed(semilla);
  estadoLeds = 0;
  displaysEncendidos = false;
  refrescar();

  cli();
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22) | (1 << CS21);
  OCR2A = 124;                 // 2 ms por grupo
  TIMSK2 = (1 << OCIE2A);
  sei();
}

void esperar(int16_t ms) {
  if (ms > 0) delay((unsigned long)ms);
}

void led(int16_t n, int16_t estado) {
  if (n < 0 || n > 7) return;
  if (estado) estadoLeds |= (uint8_t)(1 << n);
  else estadoLeds &= (uint8_t)~(1 << n);
  refrescar();
}

void leds(int16_t valor) {
  estadoLeds = (uint8_t)valor;
  refrescar();
}

void mostrar(int16_t valor) {
  numero = valor;
  displaysEncendidos = true;
  refrescar();
}

void apagar_displays() {
  displaysEncendidos = false;
  refrescar();
}

int16_t pot() { return analogRead(A0); }

// pot * 25 / 256 = 0..99, la misma cuenta que hace el lenguaje
int16_t pot99() { return (int16_t)(pot() * 25 / 256); }

int16_t dip() { return (uint8_t)(~PINC >> 1) & 0x0F; }

int16_t interruptor(int16_t n) {
  if (n < 1 || n > 4) return 0;
  return (dip() >> (n - 1)) & 1;
}

int16_t aleatorio(int16_t desde, int16_t hasta) {
  if (desde > hasta) {
    int16_t t = desde;
    desde = hasta;
    hasta = t;
  }
  return (int16_t)random(desde, (long)hasta + 1);
}

int16_t dividir(int16_t a, int16_t b) { return b ? a / b : 0; }
int16_t modulo(int16_t a, int16_t b) { return b ? a % b : 0; }

void detener() {
  for (;;) {
  }
}

uint8_t leds_actuales() { return estadoLeds; }
bool displays_encendidos() { return displaysEncendidos; }
int16_t numero_actual() { return numero; }
