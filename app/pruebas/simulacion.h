// Salidas nuevas simuladas (brillo, LCD 16x2 y nube), compartidas por maquina_prueba.cpp
// y por la biblioteca simulada (entrenador-pc/Entrenador.h): las dos imprimen igual y
// comparar.sh puede comparar la maquina virtual con el sketch generado.
#pragma once
#include <cstdint>
#include <cstdio>
#include <cstring>

namespace sim {
inline int16_t brillo = 100;
inline char lcd[2][17] = {"                ", "                "};
inline bool lcdUsado = false;
inline int16_t lcdLuz = 1, lcdCursor = 0;
inline bool potInvertido = false;
inline int16_t leerPot(int16_t v) { return potInvertido ? 1023 - v : v; }
inline int16_t nubeSalidas[4] = {0, 0, 0, 0};
// Lo que "llega de la nube": fijo, para que las dos simulaciones vean lo mismo
inline const int16_t NUBE_ENTRADAS[4] = {37, 0, 0, 0};
inline bool nubeUsada = false;
inline const char *NUBE_TEXTO[2] = {"Hola nube", ""};

inline void ponerBrillo(int16_t p) { brillo = p < 0 ? 0 : p > 100 ? 100 : p; }

inline void lcdLimpiar() {
  lcdUsado = true;
  for (auto &f : lcd) memset(f, ' ', 16);
}

inline void lcdEscribir(int16_t fila, int16_t col, const char *texto) {
  lcdUsado = true;
  fila = fila < 0 ? 0 : fila > 1 ? 1 : fila;
  col = col < 0 ? 0 : col > 15 ? 15 : col;
  for (int16_t c = col; *texto && c < 16; c++) lcd[fila][c] = *texto++;
}

// Igual que lcd_numero de la biblioteca: alineado a la derecha, cifras de la derecha si no cabe
inline void lcdNumero(int16_t fila, int16_t col, int16_t numero, int16_t ancho) {
  if (ancho < 1) ancho = 1;
  if (ancho > 6) ancho = 6;
  char cifras[7];
  int n = 0;
  bool negativo = numero < 0;
  uint16_t v = negativo ? (uint16_t)(-(int32_t)numero) : (uint16_t)numero;
  do { cifras[n++] = (char)('0' + v % 10); v /= 10; } while (v && n < 6);
  if (negativo && n < 6) cifras[n++] = '-';
  char texto[7];
  for (int i = ancho; i > 0; i--) texto[ancho - i] = i > n ? ' ' : cifras[i - 1];
  texto[ancho] = '\0';
  lcdEscribir(fila, col, texto);
}

inline void ponerLuz(int16_t e) { lcdUsado = true; lcdLuz = e ? 1 : 0; }
inline void ponerCursor(int16_t m) { lcdUsado = true; lcdCursor = (m == 1 || m == 2) ? m : 0; }

inline void lcdNube(int16_t fila) {
  nubeUsada = true;
  char t[17];
  snprintf(t, sizeof t, "%-16s", NUBE_TEXTO[fila ? 1 : 0]);
  lcdEscribir(fila ? 1 : 0, 0, t);
}

inline void nubeEnviar(int16_t n, int16_t valor) {
  nubeUsada = true;
  if (n >= 1 && n <= 4) nubeSalidas[n - 1] = valor;
}

inline int16_t nube(int16_t n) {
  nubeUsada = true;
  return (n >= 1 && n <= 4) ? NUBE_ENTRADAS[n - 1] : 0;
}

// Resumen de estas salidas para detectar cambios y para el final de cada linea
inline void extra(char *s, size_t largo) {
  int u = 0;
  s[0] = '\0';
  if (brillo != 100) u += snprintf(s + u, largo - u, "  brillo %d", brillo);
  if (lcdUsado) u += snprintf(s + u, largo - u, "  lcd |%s|%s| luz %d cursor %d", lcd[0], lcd[1], lcdLuz, lcdCursor);
  if (nubeUsada)
    snprintf(s + u, largo - u, "  nube %d %d %d %d", nubeSalidas[0], nubeSalidas[1], nubeSalidas[2], nubeSalidas[3]);
}
}  // namespace sim
