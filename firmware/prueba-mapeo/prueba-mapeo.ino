/*
 * Prueba de mapeo del bus: sirve para llenar BIT_SEG / BIT_LED en entrenador.ino
 * cuando el cableado no sigue el esquematico.
 *
 * Cada ciclo (~40 s) tiene dos partes. Cada paso enciende un solo bit del bus
 * 1.5 s y luego apaga 0.5 s:
 *
 * 1) LEDs: los dos displays encienden completos 1 s (marca de inicio), luego
 *    pasos 1..8 solo con Q1 (PB2). Anotar que LED enciende en cada paso.
 * 2) Segmentos: los LEDs encienden todos 1 s (marca de inicio), luego pasos 1..8
 *    con Q2 y Q3 (ambos displays). Anotar que segmento enciende en cada paso.
 *
 *    paso 1 = bit 0 = PD2 (pin 4)    paso 5 = bit 4 = PD6 (pin 12)
 *    paso 2 = bit 1 = PD3 (pin 5)    paso 6 = bit 5 = PD7 (pin 13)
 *    paso 3 = bit 2 = PD4 (pin 6)    paso 7 = bit 6 = PB0 (pin 14)
 *    paso 4 = bit 3 = PD5 (pin 11)   paso 8 = bit 7 = PB1 (pin 15)
 */

#include <avr/interrupt.h>

volatile uint8_t pantalla[3];  // 0 = LEDs, 1 = decenas, 2 = unidades
volatile uint8_t grupos = 0;   // bit g = grupo g habilitado

static void escribirBus(uint8_t valor) {
  PORTD = (PORTD & 0x03) | (uint8_t)(valor << 2);
  PORTB = (PORTB & 0xFC) | (valor >> 6);
}

ISR(TIMER2_COMPA_vect) {
  static uint8_t grupo = 0;
  PORTB &= ~0x1C;
  grupo = (grupo + 1) % 3;
  if (!(grupos & (1 << grupo))) return;
  escribirBus(pantalla[grupo]);
  PORTB |= (uint8_t)(1 << (PB2 + grupo));
}

static void mostrar(uint8_t bus, uint8_t mascaraGrupos, unsigned long ms) {
  pantalla[0] = pantalla[1] = pantalla[2] = bus;
  grupos = mascaraGrupos;
  delay(ms);
}

static void recorrerBits(uint8_t mascaraGrupos) {
  for (uint8_t b = 0; b < 8; b++) {
    mostrar((uint8_t)(1 << b), mascaraGrupos, 1500);
    mostrar(0x00, 0x00, 500);
  }
}

void setup() {
  DDRD |= 0xFC;
  DDRB |= 0x1F;
  cli();
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22) | (1 << CS21);
  OCR2A = 124;                 // 2 ms por grupo
  TIMSK2 = (1 << OCIE2A);
  sei();
}

void loop() {
  mostrar(0xFF, 0x06, 1000);   // marca: displays completos
  mostrar(0x00, 0x00, 1000);
  recorrerBits(0x01);          // LEDs uno a uno

  mostrar(0xFF, 0x01, 1000);   // marca: todos los LEDs
  mostrar(0x00, 0x00, 1000);
  recorrerBits(0x06);          // segmentos uno a uno, ambos displays

  mostrar(0x00, 0x00, 2000);
}
