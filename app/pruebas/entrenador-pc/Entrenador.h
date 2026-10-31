// Biblioteca Entrenador simulada en el PC, para comparar un sketch generado con la
// maquina virtual (maquina_prueba.cpp). Misma interfaz que
// firmware/libraries/Entrenador/src/Entrenador.h; imprime las salidas en el mismo
// formato que maquina_prueba cada vez que el programa espera.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstdlib>

const int16_t verdadero = 1;
const int16_t falso = 0;
const int16_t encendido = 1;
const int16_t apagado = 0;

namespace simulado {
inline unsigned long ahora = 0, duracion = 2000, llamadas = 0;
inline int16_t pot = 512;
inline uint8_t leds = 0;
inline int16_t numero = 0;
inline bool displays = false;

inline void terminar(const char *como) {
  printf("fin: %s, error 0\n", como);
  exit(0);
}

inline void observar() {
  static uint8_t ultLeds = 0xFF;
  static int16_t ultNumero = -999;
  static bool ultDisplays = true, primera = true;
  if (primera || leds != ultLeds || numero != ultNumero || displays != ultDisplays) {
    char l[9];
    for (int i = 7; i >= 0; i--) l[7 - i] = (leds >> i) & 1 ? '#' : '.';
    l[8] = '\0';
    if (displays) printf("%6lu ms  LEDs %s  displays %d\n", ahora, l, numero);
    else printf("%6lu ms  LEDs %s  displays apagados\n", ahora, l);
    ultLeds = leds, ultNumero = numero, ultDisplays = displays, primera = false;
  }
}

// Un bucle sin esperar() tambien avanza: 50 llamadas = 1 ms, como maquinaPaso(50)
inline void paso() {
  if (++llamadas % 50 == 0) ahora++;
  if (ahora > duracion) terminar("sigue corriendo");
}
}  // namespace simulado

inline void entrenador_iniciar() {}
inline void esperar(int16_t ms) {
  simulado::observar();
  simulado::paso();
  if (ms > 0) simulado::ahora += (unsigned long)ms;
  if (simulado::ahora > simulado::duracion) simulado::terminar("sigue corriendo");
}
inline void led(int16_t n, int16_t estado) {
  simulado::paso();
  if (n < 0 || n > 7) return;
  if (estado) simulado::leds |= (uint8_t)(1 << n);
  else simulado::leds &= (uint8_t)~(1 << n);
}
inline void leds(int16_t valor) { simulado::paso(); simulado::leds = (uint8_t)valor; }
inline void mostrar(int16_t valor) { simulado::paso(); simulado::numero = valor; simulado::displays = true; }
inline void apagar_displays() { simulado::paso(); simulado::displays = false; }
inline int16_t pot() { simulado::paso(); return simulado::pot; }
inline int16_t pot99() { return (int16_t)(pot() * 25 / 256); }
inline int16_t dip() { simulado::paso(); return 0; }
inline int16_t interruptor(int16_t n) { return (n < 1 || n > 4) ? 0 : (dip() >> (n - 1)) & 1; }
inline int16_t aleatorio(int16_t desde, int16_t hasta) {
  simulado::paso();
  if (desde > hasta) { int16_t t = desde; desde = hasta; hasta = t; }
  return (int16_t)(desde + rand() % (hasta - desde + 1));
}
inline int16_t dividir(int16_t a, int16_t b) { return b ? a / b : 0; }
inline int16_t modulo(int16_t a, int16_t b) { return b ? a % b : 0; }
inline void detener() {
  simulado::observar();
  simulado::terminar("detenido");
}
