/*
 * Firmware "bloques": el entrenador recibe programas por bloques desde la app
 * (app/) por el puerto serie y los ejecuta con la maquina virtual de maquina.h.
 *
 * Serie a 19200 baudios (PD0/PD1). La app habla a traves del ESP32
 * (firmware/esp32-puente) o del Uno en modo puente (firmware/puente-uno).
 * Protocolo por lineas, una respuesta por comando:
 *
 *   ?                -> OK ENTRENADOR 2   (2: tiene LCD, brillo y nube)
 *   T                -> T <pot> <dip> <leds> <numero|-> <corriendo> <error>
 *   L <0..255>       -> OK      LEDs (bit i = LEDi)
 *   N <numero|->     -> OK      displays (- = apagados)
 *   B                -> OK      empieza a recibir un programa (detiene el actual)
 *   D <pos> <hex>    -> OK      bytes del programa a partir de <pos>
 *   E <largo> <suma> -> OK      fin; <suma> = suma de los bytes mod 65536
 *   R / S            -> OK      ejecutar / detener
 *   W / X            -> OK      guardar en EEPROM (corre al encender) / borrar
 *   C [e1..e4]       -> OK <s1> <s2> <s3> <s4>   el ESP32 fija las entradas de la nube y
 *                                lee las salidas (INTEGRADOR.md)
 *   P                -> OK <lcd> <brillo> <hex> <luz> <cursor>   pantalla para la app: lcd 0 sin usar, 1
 *                                conectado, 2 sin respuesta; brillo 0..100; hex = las 2 filas
 *                                del LCD (32 caracteres, 64 digitos hex)
 *
 * Errores: ERR <motivo>. El hardware (multiplexado con Timer2, cableado del bus) esta en
 * la biblioteca Entrenador, la misma que usan los sketches que genera la app.
 */

#include <EEPROM.h>
#include <Entrenador.h>  // firmware/libraries/Entrenador: salidas, entradas y cableado (PCB)
#include "maquina.h"

// EEPROM: 'B' 'Q' largo(2) suma(2) bytes...
const uint8_t EE_INICIO = 6;

// ---- Hardware para maquina.h ----

void hwLed(uint8_t n, bool estado) { led(n, estado); }
void hwLeds(uint8_t valor) { leds(valor); }
void hwNumero(int16_t valor) { mostrar(valor); }
void hwApagarDisplays() { apagar_displays(); }
int16_t hwPot() { return pot(); }
int16_t hwDip() { return dip(); }
int16_t hwAleatorio(int16_t min, int16_t max) { return aleatorio(min, max); }
unsigned long hwMillis() { return millis(); }
void hwBrillo(int16_t porcentaje) { brillo(porcentaje); }
void hwLcdLimpiar() { lcd_limpiar(); }
void hwLcdLuz(int16_t estado) { lcd_luz(estado); }
void hwLcdCursor(int16_t modo) { lcd_cursor(modo); }
void hwInvertirPot(int16_t estado) { invertir_pot(estado); }
void hwLcdNube(int16_t fila) { lcd_nube(fila); }
void hwLcdTexto(int16_t fila, int16_t columna, const char *texto) { lcd_texto(fila, columna, texto); }
void hwLcdNumero(int16_t fila, int16_t columna, int16_t numero, int16_t ancho) { lcd_numero(fila, columna, numero, ancho); }
void hwNubeEnviar(int16_t n, int16_t valor) { nube_enviar(n, valor); }
int16_t hwNube(int16_t n) { return nube(n); }

// ---- Programa ----

static uint16_t sumaPrograma() {
  uint16_t suma = 0;
  for (uint16_t i = 0; i < progLargo; i++) suma += prog[i];
  return suma;
}

static void reiniciarSalidas() {
  leds(0);
  apagar_displays();
  brillo(100);
  lcd_reiniciar();
  invertir_pot(0);
}

static void ejecutar() {
  reiniciarSalidas();
  maquinaIniciar();
}

static bool cargarEeprom() {
  if (EEPROM.read(0) != 'B' || EEPROM.read(1) != 'Q') return false;
  uint16_t largo = EEPROM.read(2) | (uint16_t)(EEPROM.read(3) << 8);
  uint16_t suma = EEPROM.read(4) | (uint16_t)(EEPROM.read(5) << 8);
  if (largo == 0 || largo > PROG_MAX) return false;
  for (uint16_t i = 0; i < largo; i++) prog[i] = EEPROM.read(EE_INICIO + i);
  progLargo = largo;
  return sumaPrograma() == suma;
}

static void guardarEeprom() {
  uint16_t suma = sumaPrograma();
  for (uint16_t i = 0; i < progLargo; i++) EEPROM.update(EE_INICIO + i, prog[i]);
  EEPROM.update(2, progLargo & 0xFF);
  EEPROM.update(3, progLargo >> 8);
  EEPROM.update(4, suma & 0xFF);
  EEPROM.update(5, suma >> 8);
  EEPROM.update(0, 'B');       // la marca va al final: un corte a medias no deja basura valida
  EEPROM.update(1, 'Q');
}

// ---- Protocolo serie ----

static char linea[96];
static uint8_t largoLinea = 0;
static bool recibiendo = false;

static int8_t valorHex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static void responderOk() { Serial.println(F("OK")); }
static void responderError(const __FlashStringHelper *motivo) {
  Serial.print(F("ERR "));
  Serial.println(motivo);
}

static void procesarDatos(char *resto) {
  if (!recibiendo) { responderError(F("sin B")); return; }
  char *fin;
  long pos = strtol(resto, &fin, 10);
  if (pos != progLargo) { responderError(F("posicion")); return; }
  while (*fin == ' ') fin++;
  for (char *p = fin; *p; p += 2) {
    int8_t alto = valorHex(p[0]), bajo = p[1] ? valorHex(p[1]) : -1;
    if (alto < 0 || bajo < 0) { responderError(F("hex")); return; }
    if (progLargo >= PROG_MAX) { responderError(F("programa muy largo")); return; }
    prog[progLargo++] = (uint8_t)(alto << 4 | bajo);
  }
  responderOk();
}

static void responderPantalla() {
  Serial.print(F("OK "));
  Serial.print(lcd_estado());
  Serial.print(' ');
  Serial.print(brillo_actual());
  Serial.print(' ');
  for (uint8_t f = 0; f < 2; f++) {
    const char *t = lcd_linea(f);
    for (uint8_t c = 0; c < 16; c++) {
      uint8_t b = (uint8_t)t[c];
      Serial.print((char)("0123456789ABCDEF"[b >> 4]));
      Serial.print((char)("0123456789ABCDEF"[b & 0x0F]));
    }
  }
  Serial.print(' ');
  Serial.print(lcd_luz_actual());
  Serial.print(' ');
  Serial.print(lcd_cursor_actual());
  Serial.println();
}

static void procesarLinea(char *l) {
  char cmd = l[0];
  char *resto = l[1] ? l + 2 : l + 1;

  switch (cmd) {
    case '?': Serial.println(F("OK ENTRENADOR 2")); break;
    case 'C': nube_comando(l + 1, Serial); break;
    case 'M': nube_texto_comando(l + 1, Serial); break;
    case 'P': responderPantalla(); break;
    case 'T':
      Serial.print(F("T "));
      Serial.print(hwPot()); Serial.print(' ');
      Serial.print(hwDip()); Serial.print(' ');
      Serial.print(leds_actuales()); Serial.print(' ');
      if (displays_encendidos()) Serial.print(numero_actual());
      else Serial.print('-');
      Serial.print(' ');
      Serial.print(corriendo ? 1 : 0); Serial.print(' ');
      Serial.println(maquinaError);
      break;
    case 'L': hwLeds((uint8_t)atoi(resto)); responderOk(); break;
    case 'N':
      if (resto[0] == '-' && resto[1] == '\0') hwApagarDisplays();
      else hwNumero((int16_t)atoi(resto));
      responderOk();
      break;
    case 'B':
      maquinaDetener();
      progLargo = 0;
      recibiendo = true;
      responderOk();
      break;
    case 'D': procesarDatos(resto); break;
    case 'E': {
      char *fin;
      long largo = strtol(resto, &fin, 10);
      long suma = strtol(fin, NULL, 10);
      recibiendo = false;
      if (largo != progLargo || (uint16_t)suma != sumaPrograma()) {
        progLargo = 0;
        responderError(F("suma"));
      } else {
        responderOk();
      }
      break;
    }
    case 'R':
      if (progLargo == 0) { responderError(F("sin programa")); break; }
      ejecutar();
      responderOk();
      break;
    case 'S': maquinaDetener(); responderOk(); break;
    case 'W':
      if (progLargo == 0) { responderError(F("sin programa")); break; }
      guardarEeprom();
      responderOk();
      break;
    case 'X': EEPROM.update(0, 0xFF); responderOk(); break;
    default: responderError(F("comando")); break;
  }
}

static void leerSerie() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      linea[largoLinea] = '\0';
      if (largoLinea > 0) procesarLinea(linea);
      largoLinea = 0;
    } else if (largoLinea < sizeof(linea) - 1) {
      linea[largoLinea++] = c;
    }
  }
}

void setup() {
  entrenador_iniciar();
  nube_sin_atender();          // el serie lo atiende leerSerie()
  Serial.begin(19200);
  if (cargarEeprom()) ejecutar();
}

void loop() {
  leerSerie();
  maquinaPaso(50);
}
