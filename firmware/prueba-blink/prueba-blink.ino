/*
 * Prueba de vida del ATMega328P en protoboard.
 *
 * Parpadea PB5 (pin fisico 19, D13) a 1 Hz: 0.5 s encendido, 0.5 s apagado.
 *
 * - Si el Arduino Uno (ArduinoISP) sigue conectado por el ICSP, el LED "L"
 *   del Uno repite el parpadeo, porque su D13 esta unido a PB5 del chip.
 * - Tambien se puede poner un LED + 220 Ohm del pin 19 a GND.
 *
 * Si parpadea cada 1 s exacto, el cristal de 16 MHz esta funcionando.
 * Si parpadea 16 veces mas lento, el chip sigue con el reloj interno:
 * falta hacer "Burn Bootloader".
 */

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
