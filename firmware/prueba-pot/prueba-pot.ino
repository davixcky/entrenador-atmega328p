/*
 * Prueba del potenciometro (PC0 / A0, pin 23) con indicadores de diagnostico.
 * Usa el mismo mapeo que entrenador.ino con PCB 2 (cableado real de la placa).
 *
 * - Al arrancar: todos los LEDs y "88" durante 0.5 s. Si esto aparece solo,
 *   el micro se esta reiniciando (alimentacion / brown-out).
 * - Displays: lectura directa del pot en 00..99, sin filtro ni histeresis.
 * - LED0..LED6: barra proporcional al pot.
 * - LED7: parpadea cada 250 ms (latido). Si deja de parpadear, el micro se colgo.
 */

#include <avr/interrupt.h>

const uint8_t BIT_SEG[8] = {6, 4, 0, 7, 2, 5, 3, 1};  // bit del bus de cada segmento a..dp
const uint8_t BIT_LED[8] = {0, 1, 2, 3, 4, 5, 6, 7};  // LED0 abajo .. LED7 arriba

const uint8_t DIGITO[10] = {
  0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F
};

volatile uint8_t pantalla[3];  // 0 = LEDs, 1 = decenas, 2 = unidades

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

static void mostrar(uint8_t leds, uint8_t n) {
  pantalla[0] = reordenar(leds, BIT_LED);
  pantalla[1] = reordenar(DIGITO[(n / 10) % 10], BIT_SEG);
  pantalla[2] = reordenar(DIGITO[n % 10], BIT_SEG);
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
  static bool latido = false;
  static unsigned long ultimoLatido = 0;
  const unsigned long ahora = millis();

  if (ahora < 500) {                             // marca de arranque
    mostrar(0xFF, 88);
    return;
  }

  if (ahora - ultimoLatido >= 250) {
    ultimoLatido = ahora;
    latido = !latido;
  }

  uint16_t pot = analogRead(A0);                 // 0..1023
  uint8_t nivel = (uint32_t)pot * 8 / 1024;      // 0..7 LEDs de la barra
  uint8_t leds = (uint8_t)((1u << nivel) - 1) & 0x7F;
  if (latido) leds |= 0x80;
  mostrar(leds, (uint32_t)pot * 100 / 1024);
}
