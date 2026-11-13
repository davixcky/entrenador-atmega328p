#include "protocolo.h"

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// ---- Lineas ----

void acum_iniciar(acumulador_t *a, char *buf, size_t cap) {
  a->buf = buf;
  a->cap = cap;
  acum_limpiar(a);
}

void acum_limpiar(acumulador_t *a) {
  a->largo = 0;
  a->desbordado = false;
  if (a->cap) a->buf[0] = '\0';
}

acum_evento_t acum_byte(acumulador_t *a, char c, bool saludo) {
  if (c == '\r') return ACUM_NADA;
  if (c == '\n') {
    bool desbordado = a->desbordado;
    a->buf[a->largo] = '\0';
    a->largo = 0;
    a->desbordado = false;
    return desbordado ? ACUM_DESBORDE : ACUM_LINEA;
  }
  // El '!' no se guarda: si no, la app manda "!!!\n" y eso iria al entrenador
  if (saludo && c == '!' && a->largo == 0 && !a->desbordado) return ACUM_SALUDO;
  if (a->desbordado) return ACUM_NADA;
  if (a->largo + 1 >= a->cap) {
    a->desbordado = true;
    return ACUM_NADA;
  }
  a->buf[a->largo++] = c;
  return ACUM_NADA;
}

tipo_linea_t clasificar_linea(const char *l) {
  while (*l == ' ' || *l == '\t') l++;
  if (*l == '\0') return LINEA_VACIA;
  if (*l == '@') return LINEA_ESP;
  const char *p = l;
  while (*p == '!') p++;
  while (*p == ' ' || *p == '\t') p++;
  if (*p == '\0') return LINEA_SALUDO;
  return LINEA_ENTRENADOR;
}

bool es_fin_respuesta(const char *l) {
  return strncmp(l, "OK", 2) == 0 || strncmp(l, "T ", 2) == 0 || strncmp(l, "ERR", 3) == 0;
}

// ---- Comando C ----

int formatear_c(char *dst, size_t cap, const int16_t e[4]) {
  int n = snprintf(dst, cap, "C %d %d %d %d", e[0], e[1], e[2], e[3]);
  return (n < 0 || (size_t)n >= cap) ? -1 : n;
}

bool parsear_entero(const char *txt, long min, long max, long *valor) {
  if (txt == NULL || *txt == '\0') return false;
  char *fin;
  errno = 0;
  long v = strtol(txt, &fin, 10);
  if (errno || fin == txt || *fin != '\0' || v < min || v > max) return false;
  *valor = v;
  return true;
}

bool parsear_respuesta_c(const char *l, int16_t s[4]) {
  if (strncmp(l, "OK", 2) != 0) return false;
  const char *p = l + 2;
  for (int i = 0; i < 4; i++) {
    if (*p != ' ') return false;
    while (*p == ' ') p++;
    char *fin;
    errno = 0;
    long v = strtol(p, &fin, 10);
    if (errno || fin == p || v < -32768 || v > 32767) return false;
    s[i] = (int16_t)v;
    p = fin;
  }
  while (*p == ' ') p++;
  return *p == '\0';
}

// ---- Hex ----

static int valor_hex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

int hex_a_bytes(const char *hex, uint8_t *dst, size_t max) {
  size_t largo = strlen(hex);
  if (largo % 2 || largo / 2 > max) return -1;
  for (size_t i = 0; i < largo; i += 2) {
    int alto = valor_hex(hex[i]), bajo = valor_hex(hex[i + 1]);
    if (alto < 0 || bajo < 0) return -1;
    dst[i / 2] = (uint8_t)(alto << 4 | bajo);
  }
  return (int)(largo / 2);
}

void bytes_a_hex(const uint8_t *src, size_t n, char *dst) {
  static const char digitos[] = "0123456789ABCDEF";
  for (size_t i = 0; i < n; i++) {
    dst[2 * i] = digitos[src[i] >> 4];
    dst[2 * i + 1] = digitos[src[i] & 0x0F];
  }
  dst[2 * n] = '\0';
}

// ---- Nube ----

static const char *saltar_blancos(const char *p) {
  while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
  return p;
}

bool parsear_entradas_json(const char *cuerpo, int16_t e[4]) {
  for (int i = 0; i < 4; i++) e[i] = 0;
  const char *p = saltar_blancos(cuerpo);
  if (*p != '[') return false;
  // Solo se pide select=entradas, asi que basta buscar la clave
  p = strstr(p, "\"entradas\"");
  if (p == NULL) return true;  // [] = el tablero todavia no escribio controles
  p = saltar_blancos(p + strlen("\"entradas\""));
  if (*p != ':') return false;
  p = saltar_blancos(p + 1);
  if (strncmp(p, "null", 4) == 0) return true;
  if (*p != '[') return false;
  p = saltar_blancos(p + 1);
  for (int i = 0; i < 4 && *p != ']'; i++) {
    if (strncmp(p, "null", 4) == 0) {
      p += 4;
    } else {
      char *fin;
      long v = strtol(p, &fin, 10);
      if (fin == p) return false;
      if (v < -32768) v = -32768;
      if (v > 32767) v = 32767;
      e[i] = (int16_t)v;
      p = fin;
    }
    p = saltar_blancos(p);
    if (*p == ',') p = saltar_blancos(p + 1);
  }
  return true;
}

static int valor_hex4(const char *p) {
  int v = 0;
  for (int i = 0; i < 4; i++) {
    int d = valor_hex(p[i]);
    if (d < 0) return -1;
    v = v << 4 | d;
  }
  return v;
}

bool parsear_texto_json(const char *cuerpo, const char *clave, char *dst, size_t cap) {
  if (cap == 0) return false;
  dst[0] = '\0';
  const char *p = saltar_blancos(cuerpo);
  if (*p != '[') return false;
  char buscada[24];
  int m = snprintf(buscada, sizeof buscada, "\"%s\"", clave);
  if (m < 0 || (size_t)m >= sizeof buscada) return false;
  p = strstr(p, buscada);
  if (p == NULL) return true;
  p = saltar_blancos(p + m);
  if (*p != ':') return false;
  p = saltar_blancos(p + 1);
  if (strncmp(p, "null", 4) == 0) return true;
  if (*p != '"') return false;
  p++;
  size_t n = 0;
  while (*p && *p != '"') {
    char c;
    if (*p == '\\') {
      p++;
      switch (*p) {
        case '"': case '\\': case '/': c = *p; p++; break;
        case 'u': {
          int v = valor_hex4(p + 1);
          if (v < 0) return false;
          c = (v >= 0x20 && v <= 0x7E) ? (char)v : (v < 0x20 ? ' ' : '?');
          p += 5;
          break;
        }
        case '\0': return false;
        default: c = ' '; p++; break;  // \n \t \r \b \f
      }
    } else {
      unsigned char u = (unsigned char)*p++;
      if (u >= 0x80) {
        while (((unsigned char)*p & 0xC0) == 0x80) p++;  // resto del caracter UTF-8
        c = '?';
      } else {
        c = u < 0x20 ? ' ' : (char)u;
      }
    }
    if (n + 1 < cap) dst[n++] = c;
  }
  if (*p != '"') return false;
  dst[n] = '\0';
  return true;
}

int formatear_m(char *dst, size_t cap, int fila, const char *texto) {
  int n = snprintf(dst, cap, "M %d %s", fila, texto);
  return (n < 0 || (size_t)n >= cap) ? -1 : n;
}

// Copia src como cadena JSON (con comillas). Devuelve bytes escritos o -1.
static int json_cadena(char *dst, size_t cap, const char *src) {
  size_t n = 0;
  if (cap < 3) return -1;
  dst[n++] = '"';
  for (const unsigned char *p = (const unsigned char *)src; *p; p++) {
    char esc[7];
    size_t largo;
    if (*p == '"' || *p == '\\') {
      esc[0] = '\\';
      esc[1] = (char)*p;
      largo = 2;
    } else if (*p < 0x20) {
      snprintf(esc, sizeof esc, "\\u%04x", *p);
      largo = 6;
    } else {
      esc[0] = (char)*p;
      largo = 1;
    }
    if (n + largo + 2 > cap) return -1;
    memcpy(dst + n, esc, largo);
    n += largo;
  }
  dst[n++] = '"';
  dst[n] = '\0';
  return (int)n;
}

int json_lectura(char *dst, size_t cap, const char *dispositivo, const int16_t s[4],
                 const int16_t e[4]) {
  int n = snprintf(dst, cap, "{\"dispositivo\":");
  if (n < 0 || (size_t)n >= cap) return -1;
  int m = json_cadena(dst + n, cap - n, dispositivo);
  if (m < 0) return -1;
  n += m;
  m = snprintf(dst + n, cap - n, ",\"salidas\":[%d,%d,%d,%d],\"entradas\":[%d,%d,%d,%d]}",
               s[0], s[1], s[2], s[3], e[0], e[1], e[2], e[3]);
  if (m < 0 || (size_t)(n + m) >= cap) return -1;
  return n + m;
}

int url_codificar(char *dst, size_t cap, const char *src) {
  static const char digitos[] = "0123456789ABCDEF";
  size_t n = 0;
  for (const unsigned char *p = (const unsigned char *)src; *p; p++) {
    bool libre = (*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z') ||
                 (*p >= '0' && *p <= '9') || *p == '-' || *p == '_' || *p == '.' || *p == '~';
    if (n + (libre ? 1 : 3) >= cap) return -1;
    if (libre) {
      dst[n++] = (char)*p;
    } else {
      dst[n++] = '%';
      dst[n++] = digitos[*p >> 4];
      dst[n++] = digitos[*p & 0x0F];
    }
  }
  if (n >= cap) return -1;
  dst[n] = '\0';
  return (int)n;
}

// Largo de la base sin las '/' finales: "http://x:54321/" y "http://x:54321" son lo mismo
static size_t largo_base(const char *base) {
  size_t n = strlen(base);
  while (n && base[n - 1] == '/') n--;
  return n;
}

int url_controles(char *dst, size_t cap, const char *base, const char *dispositivo) {
  char id[96];
  if (url_codificar(id, sizeof id, dispositivo) < 0) return -1;
  int n = snprintf(dst, cap, "%.*s/rest/v1/controles?dispositivo=eq.%s&select=entradas,lcd1,lcd2",
                   (int)largo_base(base), base, id);
  return (n < 0 || (size_t)n >= cap) ? -1 : n;
}

int url_lecturas(char *dst, size_t cap, const char *base) {
  int n = snprintf(dst, cap, "%.*s/rest/v1/lecturas", (int)largo_base(base), base);
  return (n < 0 || (size_t)n >= cap) ? -1 : n;
}

// ---- ISP ----

// Separa el primer campo de args en tok (sin espacios). Devuelve el resto.
static const char *campo(const char *args, char *tok, size_t cap) {
  while (*args == ' ') args++;
  size_t n = 0;
  while (*args && *args != ' ') {
    if (n + 1 >= cap) return NULL;
    tok[n++] = *args++;
  }
  tok[n] = '\0';
  while (*args == ' ') args++;
  return args;
}

bool isp_parsear_pagina(const char *args, uint32_t *dir, uint8_t *datos, int *n) {
  char tok[16], hex[2 * ISP_PAGINA_BYTES + 2];
  long v;
  const char *resto = campo(args, tok, sizeof tok);
  if (resto == NULL || !parsear_entero(tok, 0, ISP_FLASH_BYTES - 1, &v)) return false;
  if (v % ISP_PAGINA_BYTES) return false;
  resto = campo(resto, hex, sizeof hex);
  if (resto == NULL || *resto != '\0') return false;
  int cant = hex_a_bytes(hex, datos, ISP_PAGINA_BYTES);
  if (cant <= 0) return false;
  *dir = (uint32_t)v;
  *n = cant;
  return true;
}

bool isp_parsear_leer(const char *args, uint32_t *dir, int *n) {
  char tok[16];
  long d, cant;
  const char *resto = campo(args, tok, sizeof tok);
  if (resto == NULL || !parsear_entero(tok, 0, ISP_FLASH_BYTES - 1, &d)) return false;
  resto = campo(resto, tok, sizeof tok);
  if (resto == NULL || *resto != '\0' || !parsear_entero(tok, 1, ISP_PAGINA_BYTES, &cant))
    return false;
  if (d + cant > ISP_FLASH_BYTES) return false;
  *dir = (uint32_t)d;
  *n = (int)cant;
  return true;
}

bool isp_parsear_fusible(const char *args, char *cual, uint8_t *valor) {
  char tok[8], hex[8];
  const char *resto = campo(args, tok, sizeof tok);
  if (resto == NULL || strlen(tok) != 1) return false;
  char c = tok[0];
  if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
  if (c != 'L' && c != 'H' && c != 'E' && c != 'B') return false;
  resto = campo(resto, hex, sizeof hex);
  if (resto == NULL || *resto != '\0') return false;
  // Acepta "FF" o "0xFF"
  const char *h = (hex[0] == '0' && (hex[1] == 'x' || hex[1] == 'X')) ? hex + 2 : hex;
  if (strlen(h) != 2 || hex_a_bytes(h, valor, 1) != 1) return false;
  *cual = c;
  return true;
}

bool isp_hfuse_seguro(uint8_t valor) {
  // Bit 7 RSTDISBL y bit 6 DWEN: programados (0) apagan el ISP por RESET.
  return (valor & 0xC0) == 0xC0;
}

void isp_ins_cargar(uint8_t ins[4], uint16_t palabra, bool alto, uint8_t dato) {
  ins[0] = alto ? 0x48 : 0x40;
  ins[1] = 0x00;
  ins[2] = palabra & 0x3F;  // posicion dentro de la pagina de 64 palabras
  ins[3] = dato;
}

void isp_ins_escribir_pagina(uint8_t ins[4], uint16_t palabra) {
  palabra &= 0x3FC0;  // inicio de la pagina
  ins[0] = 0x4C;
  ins[1] = (uint8_t)(palabra >> 8);
  ins[2] = (uint8_t)(palabra & 0xFF);
  ins[3] = 0x00;
}

void isp_ins_leer(uint8_t ins[4], uint32_t dir_byte) {
  uint16_t palabra = (uint16_t)((dir_byte >> 1) & 0x3FFF);
  ins[0] = (dir_byte & 1) ? 0x28 : 0x20;
  ins[1] = (uint8_t)(palabra >> 8);
  ins[2] = (uint8_t)(palabra & 0xFF);
  ins[3] = 0x00;
}
