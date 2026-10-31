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
 *   Pines sin uso (PB5/SCK, PC5, PD0/PD1 sin FTDI) con pull-up para que no queden al aire.
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

// PCB 1: placa de una cara (kicad/). Para rutearla con menos puentes, cada segmento y cada
// LED va a otra linea del bus (ver SEG_PERM / LED_PERM en kicad/tools/generar_esquematico.py).
// PCB 0: protoboard, bit i del bus = segmento i = LEDi.
// PCB 2: placa armada con el cableado real, medido con firmware/prueba-mapeo.
#define PCB 2

#if PCB == 2
const uint8_t BIT_SEG[8] = {6, 4, 0, 7, 2, 5, 3, 1};  // bit del bus de cada segmento a..dp
const uint8_t BIT_LED[8] = {0, 1, 2, 3, 4, 5, 6, 7};  // LED0 abajo .. LED7 arriba
#elif PCB == 1
const uint8_t BIT_SEG[8] = {1, 2, 0, 3, 4, 5, 6, 7};  // bit del bus de cada segmento a..dp
const uint8_t BIT_LED[8] = {4, 3, 7, 1, 6, 5, 0, 2};  // bit del bus de cada LED0..LED7
#else
const uint8_t BIT_SEG[8] = {0, 1, 2, 3, 4, 5, 6, 7};
const uint8_t BIT_LED[8] = {0, 1, 2, 3, 4, 5, 6, 7};
#endif

// Segmentos: bit0 = a, bit1 = b, ..., bit6 = g, bit7 = dp
const uint8_t DIGITO[10] = {
  0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F
};

// Lo que sale por el bus en cada grupo (ya reordenado): 0 = LEDs, 1 = decenas, 2 = unidades
volatile uint8_t pantalla[3];

static uint8_t reordenar(uint8_t valor, const uint8_t *tabla) {
  uint8_t bus = 0;
  for (uint8_t i = 0; i < 8; i++)
    if (valor & (1 << i)) bus |= (uint8_t)(1 << tabla[i]);
  return bus;
}

static void mostrarLeds(uint8_t valor) {  // bit i = LEDi
  pantalla[0] = reordenar(valor, BIT_LED);
}

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
  pantalla[1] = reordenar(DIGITO[(n / 10) % 10], BIT_SEG);
  pantalla[2] = reordenar(DIGITO[n % 10], BIT_SEG);
}

// Promedio de 8 lecturas con histeresis de +-2: el valor no salta entre dos numeros
static uint16_t leerPot() {
  static uint16_t estable = 0;
  uint16_t suma = 0;
  for (uint8_t i = 0; i < 8; i++) suma += analogRead(A0);
  uint16_t nuevo = suma / 8;
  if (nuevo > estable + 2 || nuevo + 2 < estable || nuevo == 0 || nuevo == 1023) estable = nuevo;
  return estable;
}

static uint8_t leerDip() {
  return (uint8_t)(~PINC >> 1) & 0x0F;  // PC1..PC4, invertido por la pull-up
}

void setup() {
  DDRD |= 0xFC;                // PD2..PD7 salidas (PD0/PD1 quedan para el serial)
  DDRB |= 0x1F;                // PB0..PB1 bus, PB2..PB4 seleccion
  DDRC &= ~0x1E;               // PC1..PC4 entradas
  PORTC |= 0x1E;               // pull-up interna del DIP switch
  PORTB |= (1 << PB5);         // pines sin uso con pull-up (PB5 es SCK del ICSP)
  PORTC |= (1 << PC5);
  PORTD |= 0x03;               // PD0/PD1 con pull-up mientras no haya FTDI

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

  uint16_t pot = leerPot();                   // 0..1023
  uint8_t dip = leerDip();
  uint16_t periodo = 50 + pot;                // 50..1073 ms para modos con tiempo
  bool toca = millis() - ultimo >= periodo;
  if (toca) ultimo = millis();

  switch (dip & 0x03) {
    case 0: {                                  // ADC
      uint8_t nivel = (uint32_t)pot * 9 / 1024; // 0..8 LEDs encendidos
      mostrarLeds((uint8_t)((1u << nivel) - 1));
      mostrarNumero((uint32_t)pot * 100 / 1024);
      break;
    }
    case 1:                                    // contador
      if (toca) cuenta = (cuenta + 1) % 100;
      mostrarLeds(cuenta);
      mostrarNumero(cuenta);
      break;
    case 2:                                    // lectura del DIP
      mostrarLeds(dip | (uint8_t)(dip << 4));
      mostrarNumero(dip);
      break;
    case 3:                                    // auto fantastico
      if (toca) {
        if (posicion == 7) sentido = -1;
        if (posicion == 0) sentido = 1;
        posicion += sentido;
      }
      mostrarLeds((uint8_t)(1 << posicion));
      mostrarNumero(posicion + 1);
      break;
  }
}
