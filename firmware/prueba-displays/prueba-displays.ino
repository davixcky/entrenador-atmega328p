/*
 * Prueba de los 2 displays de 7 segmentos (catodo comun) del entrenador.
 *
 * 1) Enciende un segmento a la vez en ambos displays: a, b, c, d, e, f, g, dp
 *    (0.5 s cada uno). Si se enciende otro segmento, ese cable esta cruzado.
 * 2) Cuenta de 00 a 99 (0.3 s por numero), multiplexando los dos displays.
 *
 * Conexiones (igual que el esquematico):
 *   bus bit 0..5 -> PD2..PD7 (pines 4,5,6,11,12,13) -> 220 Ohm -> a..f
 *   bus bit 6..7 -> PB0..PB1 (pines 14,15)          -> 220 Ohm -> g, dp
 *   PB3 (pin 17) -> 1k -> base Q2 -> catodo display DECENAS
 *   PB4 (pin 18) -> 1k -> base Q3 -> catodo display UNIDADES
 *   PB5 (pin 19) -> LED encendido fijo (indicador de funcionamiento)
 */

#include <avr/interrupt.h>

const uint8_t DIGITO[10] = {
  0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F
};

volatile uint8_t pantalla[3];  // 0 = LEDs, 1 = decenas, 2 = unidades

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

void setup() {
  DDRD |= 0xFC;
  DDRB |= 0x3F;                // PB0..PB4 bus y seleccion, PB5 LED del pin 19
  PORTB |= 0x20;               // LED del pin 19 encendido: el programa corre
  cli();
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22) | (1 << CS21);
  OCR2A = 124;                 // 2 ms por grupo
  TIMSK2 = (1 << OCIE2A);
  sei();

  pantalla[0] = 0;
  for (uint8_t s = 0; s < 8; s++) {
    pantalla[1] = pantalla[2] = (uint8_t)(1 << s);
    delay(500);
  }
}

void loop() {
  for (uint8_t n = 0; n < 100; n++) {
    pantalla[1] = DIGITO[n / 10];
    pantalla[2] = DIGITO[n % 10];
    delay(300);
  }
}
