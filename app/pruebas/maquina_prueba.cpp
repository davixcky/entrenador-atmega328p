// Ejecuta bytecode en la maquina virtual del firmware (firmware/bloques/maquina.h)
// con hardware simulado e imprime cada cambio de las salidas.
//
//   maquina_prueba <hex> <ms a simular> [pot 0..1023] [esperas]
//
// Con "esperas" solo mira las salidas cuando el programa empieza a esperar, como la
// biblioteca simulada de comparar.sh; sin el, cada milisegundo.

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>

static unsigned long ahora = 0;
static uint8_t leds = 0;
static int16_t numero = 0;
static bool displays = false;
static int16_t pot = 512;

#include "simulacion.h"
#include "../../firmware/bloques/maquina.h"

void hwLed(uint8_t n, bool encendido) {
  if (encendido) leds |= (uint8_t)(1 << n);
  else leds &= (uint8_t)~(1 << n);
}
void hwLeds(uint8_t valor) { leds = valor; }
void hwNumero(int16_t valor) { numero = valor; displays = true; }
void hwApagarDisplays() { displays = false; }
int16_t hwPot() { return sim::leerPot(pot); }
int16_t hwDip() { return 0; }
int16_t hwAleatorio(int16_t min, int16_t max) { return (int16_t)(min + rand() % (max - min + 1)); }
unsigned long hwMillis() { return ahora; }
void hwBrillo(int16_t porcentaje) { sim::ponerBrillo(porcentaje); }
void hwLcdLimpiar() { sim::lcdLimpiar(); }
void hwLcdTexto(int16_t fila, int16_t columna, const char *texto) { sim::lcdEscribir(fila, columna, texto); }
void hwLcdNumero(int16_t fila, int16_t columna, int16_t numero, int16_t ancho) { sim::lcdNumero(fila, columna, numero, ancho); }
void hwLcdNube(int16_t fila) { sim::lcdNube(fila); }
void hwInvertirPot(int16_t estado) { sim::potInvertido = estado != 0; }
void hwLcdLuz(int16_t estado) { sim::ponerLuz(estado); }
void hwLcdCursor(int16_t modo) { sim::ponerCursor(modo); }
void hwNubeEnviar(int16_t n, int16_t valor) { sim::nubeEnviar(n, valor); }
int16_t hwNube(int16_t n) { return sim::nube(n); }

static void imprimirLeds(uint8_t v, char *s) {
  for (int i = 7; i >= 0; i--) *s++ = (v >> i) & 1 ? '#' : '.';
  *s = '\0';
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "uso: %s <hex> <ms> [pot]\n", argv[0]);
    return 2;
  }
  const char *hex = argv[1];
  unsigned long duracion = strtoul(argv[2], NULL, 10);
  if (argc > 3) pot = (int16_t)atoi(argv[3]);
  bool soloEsperas = argc > 4 && strcmp(argv[4], "esperas") == 0;

  size_t n = strlen(hex) / 2;
  if (n > PROG_MAX) { fprintf(stderr, "programa muy largo\n"); return 2; }
  for (size_t i = 0; i < n; i++) {
    unsigned v;
    sscanf(hex + 2 * i, "%2x", &v);
    prog[i] = (uint8_t)v;
  }
  progLargo = (uint16_t)n;

  maquinaIniciar();
  uint8_t ultLeds = 0xFF;
  int16_t ultNumero = -999;
  bool ultDisplays = !displays;
  char ultExtra[128] = "";
  for (ahora = 0; ahora <= duracion && corriendo; ahora++) {
    maquinaPaso(50);
    if (soloEsperas && !esperando && corriendo) continue;
    char extra[128];
    sim::extra(extra, sizeof(extra));
    if (leds != ultLeds || numero != ultNumero || displays != ultDisplays || strcmp(extra, ultExtra) != 0) {
      char l[9];
      imprimirLeds(leds, l);
      if (displays) printf("%6lu ms  LEDs %s  displays %d%s\n", ahora, l, numero, extra);
      else printf("%6lu ms  LEDs %s  displays apagados%s\n", ahora, l, extra);
      ultLeds = leds, ultNumero = numero, ultDisplays = displays;
      strcpy(ultExtra, extra);
    }
  }
  printf("fin: %s, error %u\n", corriendo ? "sigue corriendo" : "detenido", maquinaError);
  return maquinaError ? 1 : 0;
}
