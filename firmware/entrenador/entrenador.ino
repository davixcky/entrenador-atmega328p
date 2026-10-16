/*
 * Entrenador de microcontroladores con ATMega328P (DIP)
 * Sistemas Embebidos 1 - Actividad 10.1.12
 *
 * Asignacion de pines (ver kicad/entrenador-atmega328p.kicad_sch):
 *
 *   Bus de 8 bits (segmentos a..g,dp y LED0..LED7, compartido):
 *     bit 0..5 -> PD2..PD7 (D2..D7)     bit 6..7 -> PB0..PB1 (D8..D9)
 *   Seleccion de grupo (transistores NPN, activo en alto):
 *     PB2 (D10) -> Q1 LEDs   PB3 (D11) -> Q2 decenas   PB4 (D12) -> Q3 unidades
 *   Potenciometro -> PC0 (A0)
 *   DIP switch SW1..SW4 -> PC1..PC4 (A1..A4), pull-up interna, cerrado = 1
 *   PD0/PD1 libres para el FTDI.
 *
 * Multiplexado: el Timer2 interrumpe cada 2 ms y enciende un grupo a la vez
 * (LEDs -> decenas -> unidades). Cada grupo se refresca a ~166 Hz.
 *
 * Modos (SW2 SW1):
 *   0 0  ADC: displays = pot (00..99), LEDs = barra proporcional
 *   0 1  Contador 00..99, velocidad con el pot, LEDs = cuenta en binario
 *   1 0  DIP: LEDs y displays muestran el valor de SW1..SW4 (00..15)
 *   1 1  Secuencia "auto fantastico", velocidad con el pot
 */

#include <avr/interrupt.h>

// Segmentos: bit0 = a, bit1 = b, ..., bit6 = g, bit7 = dp
const uint8_t DIGITO[10] = {
  0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F
};

// Lo que muestra cada grupo: 0 = LEDs, 1 = decenas, 2 = unidades
volatile uint8_t pantalla[3];

static void escribirBus(uint8_t valor) {
  PORTD = (PORTD & 0x03) | (uint8_t)(valor << 2);  // bits 0..5 -> PD2..PD7
  PORTB = (PORTB & 0xFC) | (valor >> 6);           // bits 6..7 -> PB0..PB1
}

ISR(TIMER2_COMPA_vect) {
  static uint8_t grupo = 0;
  PORTB &= ~0x1C;                    // apagar Q1..Q3 antes de cambiar el bus
  grupo = (grupo + 1) % 3;
  escribirBus(pantalla[grupo]);
  PORTB |= (uint8_t)(1 << (PB2 + grupo));
}

static void mostrarNumero(uint8_t n) {
  pantalla[1] = DIGITO[(n / 10) % 10];
  pantalla[2] = DIGITO[n % 10];
}

static uint8_t leerDip() {
  return (uint8_t)(~PINC >> 1) & 0x0F;  // PC1..PC4, invertido por la pull-up
}

void setup() {
  DDRD |= 0xFC;                // PD2..PD7 salidas (PD0/PD1 quedan para el serial)
  DDRB |= 0x1F;                // PB0..PB1 bus, PB2..PB4 seleccion
  DDRC &= ~0x1E;               // PC1..PC4 entradas
  PORTC |= 0x1E;               // pull-up interna del DIP switch

  // Timer2 en modo CTC: 16 MHz / 256 / 125 = 500 Hz -> una interrupcion cada 2 ms
  cli();
  TCCR2A = (1 << WGM21);
  TCCR2B = (1 << CS22) | (1 << CS21);
  OCR2A = 124;
  TIMSK2 = (1 << OCIE2A);
  sei();
}

void loop() {
  static uint8_t cuenta = 0;
  static uint8_t posicion = 0;
  static int8_t sentido = 1;
  static unsigned long ultimo = 0;

  uint16_t pot = analogRead(A0);              // 0..1023
  uint8_t dip = leerDip();
  uint16_t periodo = 50 + pot;                // 50..1073 ms para modos con tiempo
  bool toca = millis() - ultimo >= periodo;
  if (toca) ultimo = millis();

  switch (dip & 0x03) {
    case 0: {                                  // ADC
      uint8_t nivel = (uint32_t)pot * 9 / 1024; // 0..8 LEDs encendidos
      pantalla[0] = (uint8_t)((1u << nivel) - 1);
      mostrarNumero((uint32_t)pot * 100 / 1024);
      break;
    }
    case 1:                                    // contador
      if (toca) cuenta = (cuenta + 1) % 100;
      pantalla[0] = cuenta;
      mostrarNumero(cuenta);
      break;
    case 2:                                    // lectura del DIP
      pantalla[0] = dip | (uint8_t)(dip << 4);
      mostrarNumero(dip);
      break;
    case 3:                                    // auto fantastico
      if (toca) {
        if (posicion == 7) sentido = -1;
        if (posicion == 0) sentido = 1;
        posicion += sentido;
      }
      pantalla[0] = (uint8_t)(1 << posicion);
      mostrarNumero(posicion + 1);
      break;
  }
}
