/*
 * Prueba estatica (sin multiplexado) para medir con multimetro.
 *
 * - LED en pin 19 (PB5) encendido fijo: el programa esta corriendo.
 * - Los 8 pines del bus en alto (5 V): pines 4, 5, 6, 11, 12, 13, 14, 15.
 * - PB3 (pin 17) y PB4 (pin 18) en alto: Q2 y Q3 encendidos.
 *   Ambos displays deben mostrar "8." con todos los segmentos.
 */

void setup() {
  DDRD |= 0xFC;     // PD2..PD7 salidas
  DDRB |= 0x3F;     // PB0..PB5 salidas
  PORTD |= 0xFC;    // segmentos a..f
  PORTB |= 0x03;    // segmentos g, dp
  PORTB |= 0x18;    // PB3, PB4: transistores de los displays
  PORTB |= 0x20;    // PB5: LED del pin 19
}

void loop() {
}
