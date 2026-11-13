// Hardware del entrenador: bus de 8 lineas (PD2..PD7, PB0, PB1) compartido por los LEDs
// y los dos displays, seleccionados con PB2 (LEDs), PB3 (decenas) y PB4 (unidades).
// Potenciometro en A0 y DIP switch en PC1..PC4 con pull-up.
// LCD por I2C (PCF8574) en PC4/PC5: SDA comparte pin con DIP4, ver lcd_*.

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

static void nube_atender_si_usada();
void nube_atender();

static volatile uint8_t pantalla[3];  // 0 = LEDs, 1 = decenas, 2 = unidades
static volatile uint8_t grupo = 0;
// Brillo de los LEDs: el grupo de LEDs se apaga a los brilloTicks de sus 125 (2 ms).
// 125 = siempre encendido (sin interrupcion B), 0 = no se enciende.
static volatile uint8_t brilloTicks = 125;
static int16_t brilloActual = 100;

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
  PORTB &= ~0x1C;
  grupo = (grupo + 1) % 3;
  escribirBus(pantalla[grupo]);
  if (grupo == 0 && brilloTicks == 0) return;
  PORTB |= (uint8_t)(1 << (PB2 + grupo));
}

// PWM por software: corta el turno de los LEDs antes de tiempo
ISR(TIMER2_COMPB_vect) {
  if (grupo == 0) PORTB &= ~(1 << PB2);
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
  PORTC &= ~(1 << PC5);        // PC5 = SCL del LCD (el modulo trae su pull-up)

  // Semilla de aleatorio(): bits bajos del potenciometro y de A5, que varian de un
  // encendido a otro (A5 al aire sin LCD)
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
  if (ms <= 0) return;
  // mientras espera, responde al ESP32 (solo si el sketch usa la nube)
  unsigned long inicio = millis();
  while (millis() - inicio < (unsigned long)ms) nube_atender_si_usada();
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

// invertir_pot: para potenciometros cableados al reves (o para girar en el otro sentido)
static bool potInvertido = false;
void invertir_pot(int16_t estado) { potInvertido = estado != 0; }
int16_t pot() {
  int16_t v = analogRead(A0);
  return potInvertido ? 1023 - v : v;
}

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

void brillo(int16_t porcentaje) {
  if (porcentaje < 0) porcentaje = 0;
  if (porcentaje > 100) porcentaje = 100;
  brilloActual = porcentaje;
  uint8_t ticks = (uint8_t)((uint16_t)porcentaje * 125 / 100);
  uint8_t sreg = SREG;
  cli();
  brilloTicks = ticks;
  if (ticks > 0 && ticks < 125) {
    OCR2B = ticks;
    TIFR2 = (1 << OCF2B);
    TIMSK2 |= (1 << OCIE2B);
  } else {
    TIMSK2 &= ~(1 << OCIE2B);
  }
  SREG = sreg;
}

// ---- LCD 16x2 por I2C (modulo PCF8574) ----
// TWI del ATmega por registros, sin la biblioteca Wire: no gasta RAM en buffers.
// Pines del modulo: P0 RS, P1 RW, P2 E, P3 luz, P4..P7 = D4..D7 del LCD.

static uint8_t lcdDir = 0;      // 0 = sin detectar todavia
static bool lcdBuscado = false;
static const uint8_t LCD_E = 0x04, LCD_RS = 0x01;
static uint8_t lcdLuz = 0x08;   // P3 = luz de fondo (lcd_luz)
static uint8_t lcdCursor = 0;   // 0 sin cursor, 1 raya, 2 bloque que parpadea (lcd_cursor)

static bool twiEsperar() {
  uint16_t limite = 0;
  while (!(TWCR & (1 << TWINT)))
    if (++limite == 0) return false;  // sin pull-ups o bus trabado: no colgar el programa
  return true;
}

static bool twiInicio(uint8_t dir) {
  TWCR = (1 << TWINT) | (1 << TWSTA) | (1 << TWEN);
  if (!twiEsperar()) return false;
  TWDR = (uint8_t)(dir << 1);
  TWCR = (1 << TWINT) | (1 << TWEN);
  if (!twiEsperar()) return false;
  return (TWSR & 0xF8) == 0x18;  // SLA+W con ACK
}

static void twiFin() {
  TWCR = (1 << TWINT) | (1 << TWSTO) | (1 << TWEN);
  uint16_t limite = 0;
  while ((TWCR & (1 << TWSTO)) && ++limite) {}  // el STOP termina antes del siguiente START
}

static bool twiByte(uint8_t b) {
  TWDR = b;
  TWCR = (1 << TWINT) | (1 << TWEN);
  return twiEsperar() && (TWSR & 0xF8) == 0x28;
}

static void lcdNibble(uint8_t valor) {
  if (!twiInicio(lcdDir)) { twiFin(); return; }
  // datos primero con E abajo, luego el pulso de E: el LCD lee al bajar E
  twiByte((valor | lcdLuz) & ~LCD_E);
  twiByte(valor | lcdLuz | LCD_E);
  twiByte((valor | lcdLuz) & ~LCD_E);
  twiFin();
  delayMicroseconds(100);
}

static void lcdEnviar(uint8_t valor, uint8_t modo) {
  lcdNibble((valor & 0xF0) | modo);
  lcdNibble((uint8_t)(valor << 4) | modo);
}

// Comando del HD44780 "display on/off control": 0x0C pantalla, +2 cursor, +1 parpadeo
static uint8_t lcdControl() { return 0x0C | (lcdCursor == 1 ? 0x02 : lcdCursor == 2 ? 0x01 : 0); }

static bool lcdListo() {
  if (lcdBuscado) return lcdDir != 0;
  lcdBuscado = true;
  TWSR = 0;
  TWBR = 72;                   // 16 MHz / (16 + 2 * 72) = 100 kHz
  TWCR = (1 << TWEN);
  // Direcciones de los modulos comunes: PCF8574 (0x20..0x27) y PCF8574A (0x38..0x3F)
  static const uint8_t DIRS[] = {0x27, 0x3F, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
                                 0x38, 0x39, 0x3A, 0x3B, 0x3C, 0x3D, 0x3E};
  for (uint8_t i = 0; i < sizeof(DIRS) && !lcdDir; i++) {
    if (twiInicio(DIRS[i])) lcdDir = DIRS[i];
    twiFin();
  }
  if (!lcdDir) {
    TWCR = 0;                  // libera PC4/PC5 (DIP4)
    return false;
  }
  // Inicio en 4 bits segun la hoja de datos del HD44780
  delay(50);
  lcdNibble(0x30); delay(5);
  lcdNibble(0x30); delayMicroseconds(150);
  lcdNibble(0x30);
  lcdNibble(0x20);
  lcdEnviar(0x28, 0);          // 2 lineas, 5x8
  lcdEnviar(lcdControl(), 0);  // pantalla encendida y el cursor elegido
  lcdEnviar(0x06, 0);          // escribe hacia la derecha
  lcdEnviar(0x01, 0);          // limpiar
  delay(2);
  return true;
}

static void lcdPosicion(int16_t fila, int16_t columna) {
  if (fila < 0) fila = 0;
  if (fila > 1) fila = 1;
  if (columna < 0) columna = 0;
  if (columna > 15) columna = 15;
  lcdEnviar((uint8_t)(0x80 | (fila ? 0x40 : 0) | columna), 0);
}

// Copia de lo escrito, aunque no haya LCD: la app la muestra (comando P de bloques)
static char lcdSombra[2][17] = {"                ", "                "};
static bool lcdUsado = false;

void lcd_limpiar() {
  lcdUsado = true;
  for (uint8_t f = 0; f < 2; f++)
    for (uint8_t c = 0; c < 16; c++) lcdSombra[f][c] = ' ';
  if (!lcdListo()) return;
  lcdEnviar(0x01, 0);
  delay(2);
}

void lcd_texto(int16_t fila, int16_t columna, const char *texto) {
  lcdUsado = true;
  fila = fila < 0 ? 0 : fila > 1 ? 1 : fila;
  columna = columna < 0 ? 0 : columna > 15 ? 15 : columna;
  for (int16_t c = columna; texto[c - columna] && c < 16; c++) lcdSombra[fila][c] = texto[c - columna];
  if (!lcdListo()) return;
  lcdPosicion(fila, columna);
  for (int16_t c = columna; *texto && c < 16; c++) lcdEnviar((uint8_t)*texto++, LCD_RS);
}

void lcd_numero(int16_t fila, int16_t columna, int16_t numero, int16_t ancho) {
  if (ancho < 1) ancho = 1;
  if (ancho > 6) ancho = 6;
  char cifras[7];
  uint8_t n = 0;
  bool negativo = numero < 0;
  uint16_t v = negativo ? (uint16_t)(-(int32_t)numero) : (uint16_t)numero;
  do { cifras[n++] = (char)('0' + v % 10); v /= 10; } while (v && n < 6);
  if (negativo && n < 6) cifras[n++] = '-';
  // alineado a la derecha en "ancho" columnas; si no cabe, se ven las cifras de la derecha
  char texto[7];
  for (int16_t i = ancho; i > 0; i--) texto[ancho - i] = i > n ? ' ' : cifras[i - 1];
  texto[ancho] = '\0';
  lcd_texto(fila, columna, texto);
}

void lcd_luz(int16_t estado) {
  lcdUsado = true;
  lcdLuz = estado ? 0x08 : 0;
  if (!lcdListo()) return;
  if (twiInicio(lcdDir)) twiByte(lcdLuz);  // solo cambia P3: E queda abajo, el LCD no lee nada
  twiFin();
}

void lcd_cursor(int16_t modo) {
  lcdUsado = true;
  lcdCursor = (modo == 1 || modo == 2) ? (uint8_t)modo : 0;
  if (!lcdListo()) return;
  lcdEnviar(lcdControl(), 0);
}

void lcd_reiniciar() {
  lcdLuz = 0x08;
  lcdCursor = 0;
  if (!lcdDir) return;          // sin LCD detectado no se toca el bus (PC4 = DIP4)
  if (twiInicio(lcdDir)) twiByte(lcdLuz);
  twiFin();
  lcdEnviar(lcdControl(), 0);
}

uint8_t lcd_luz_actual() { return lcdLuz ? 1 : 0; }
uint8_t lcd_cursor_actual() { return lcdCursor; }

bool lcd_conectado() { return lcdListo(); }

// 0 = el programa no usa el LCD, 1 = conectado, 2 = usado pero no responde por I2C.
// No dispara la busqueda: un programa sin LCD deja PC4 para DIP4.
uint8_t lcd_estado() {
  if (!lcdUsado) return 0;
  return lcdDir ? 1 : 2;
}

const char *lcd_linea(uint8_t fila) { return lcdSombra[fila ? 1 : 0]; }

// ---- Variables de la nube (las intercambia el ESP32 con el comando C) ----

static int16_t nubeEntradas[4];
static int16_t nubeSalidas[4];
// En un sketch, usar la nube abre el serie y lo atiende solo. El firmware bloques lo
// atiende el mismo (nube_sin_atender) para no quitarle bytes a su protocolo.
static bool nubeUsada = false;
static bool nubeAtiende = true;

void nube_sin_atender() { nubeAtiende = false; }

void nube_enviar(int16_t n, int16_t valor) {
  nubeUsada = true;
  if (n >= 1 && n <= 4) nubeSalidas[n - 1] = valor;
  if (nubeAtiende) nube_atender();
}

int16_t nube(int16_t n) {
  nubeUsada = true;
  if (nubeAtiende) nube_atender();
  return (n >= 1 && n <= 4) ? nubeEntradas[n - 1] : 0;
}

// Texto del LCD que llega de la nube ("M <fila> <texto>"), para lcd_nube(fila)
static char nubeTexto[2][17];

void nube_reiniciar() {
  for (uint8_t i = 0; i < 4; i++) nubeEntradas[i] = nubeSalidas[i] = 0;
  nubeTexto[0][0] = nubeTexto[1][0] = '\0';
}

// "M <fila> <texto>": guarda hasta 16 caracteres ASCII de la fila 0 o 1
void nube_texto_comando(const char *argumentos, Print &salida) {
  const char *p = argumentos;
  while (*p == ' ') p++;
  if ((*p != '0' && *p != '1') || (p[1] != ' ' && p[1] != '\0')) {
    salida.println(F("ERR fila"));
    return;
  }
  uint8_t fila = (uint8_t)(*p - '0');
  p += p[1] ? 2 : 1;
  uint8_t n = 0;
  for (; *p && n < 16; p++) nubeTexto[fila][n++] = (*p >= ' ' && *p <= '~') ? *p : '?';
  nubeTexto[fila][n] = '\0';
  salida.println(F("OK"));
}

void lcd_nube(int16_t fila) {
  nubeUsada = true;
  if (nubeAtiende) nube_atender();
  fila = fila ? 1 : 0;
  char texto[17];
  uint8_t n = 0;
  for (; nubeTexto[fila][n]; n++) texto[n] = nubeTexto[fila][n];
  for (; n < 16; n++) texto[n] = ' ';  // la fila entera: borra lo que habia
  texto[16] = '\0';
  lcd_texto(fila, 0, texto);
}

// "C [e1 [e2 [e3 [e4]]]]": guarda las entradas que vengan y responde "OK s1 s2 s3 s4"
void nube_comando(const char *argumentos, Print &salida) {
  const char *p = argumentos;
  for (uint8_t i = 0; i < 4; i++) {
    while (*p == ' ') p++;
    if (!*p) break;
    char *fin;
    long v = strtol(p, &fin, 10);
    if (fin == p) break;
    nubeEntradas[i] = (int16_t)v;
    p = fin;
  }
  salida.print(F("OK"));
  for (uint8_t i = 0; i < 4; i++) {
    salida.print(' ');
    salida.print(nubeSalidas[i]);
  }
  salida.println();
}

// Para los sketches que genera la app: atiende al ESP32 sin la maquina virtual
static char nubeLinea[40];
static uint8_t nubeLargo = 0;

void nube_atender() {
  static bool iniciado = false;
  if (!iniciado) {
    Serial.begin(19200);
    iniciado = true;
  }
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (nubeLargo < sizeof(nubeLinea) - 1) nubeLinea[nubeLargo++] = c;
      continue;
    }
    nubeLinea[nubeLargo] = '\0';
    if (nubeLinea[0] == 'C') nube_comando(nubeLinea + 1, Serial);
    else if (nubeLinea[0] == 'M') nube_texto_comando(nubeLinea + 1, Serial);
    else if (nubeLinea[0] == '?') Serial.println(F("OK ENTRENADOR 2"));
    else if (nubeLargo > 0) Serial.println(F("ERR comando"));
    nubeLargo = 0;
  }
}

static void nube_atender_si_usada() {
  if (nubeUsada && nubeAtiende) nube_atender();
}

int16_t dividir(int16_t a, int16_t b) { return b ? a / b : 0; }
int16_t modulo(int16_t a, int16_t b) { return b ? a % b : 0; }

void detener() {
  for (;;) {
  }
}

int16_t brillo_actual() { return brilloActual; }
uint8_t leds_actuales() { return estadoLeds; }
bool displays_encendidos() { return displaysEncendidos; }
int16_t numero_actual() { return numero; }
