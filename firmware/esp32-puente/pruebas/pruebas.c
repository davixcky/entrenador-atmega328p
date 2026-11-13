// Pruebas en la PC de main/protocolo.c (sin ESP-IDF). Correr con ./correr.sh
#include <stdio.h>
#include <string.h>

#include "../main/protocolo.h"

static int fallas = 0, total = 0;

#define VERIFICAR(cond)                                         \
  do {                                                          \
    total++;                                                    \
    if (!(cond)) {                                              \
      fallas++;                                                 \
      printf("FALLA %s:%d: %s\n", __FILE__, __LINE__, #cond);   \
    }                                                           \
  } while (0)

// Mete una cadena al acumulador y cuenta eventos; deja la ultima linea en ultima.
typedef struct {
  int lineas, saludos, desbordes;
  char ultima[64];
} eventos_t;

static eventos_t alimentar(acumulador_t *a, const char *txt, bool saludo) {
  eventos_t ev = {0};
  for (const char *p = txt; *p; p++) {
    switch (acum_byte(a, *p, saludo)) {
      case ACUM_LINEA:
        ev.lineas++;
        snprintf(ev.ultima, sizeof ev.ultima, "%s", a->buf);
        break;
      case ACUM_SALUDO: ev.saludos++; break;
      case ACUM_DESBORDE: ev.desbordes++; break;
      case ACUM_NADA: break;
    }
  }
  return ev;
}

static void probar_lineas(void) {
  char buf[16];
  acumulador_t a;
  acum_iniciar(&a, buf, sizeof buf);

  // Lo que manda activarPuente de la app: varios '!' y despues '\n'
  eventos_t ev = alimentar(&a, "!!!", true);
  VERIFICAR(ev.saludos == 3 && ev.lineas == 0);
  ev = alimentar(&a, "\n", true);
  VERIFICAR(ev.lineas == 1 && clasificar_linea(ev.ultima) == LINEA_VACIA);

  ev = alimentar(&a, "T\r\n", true);
  VERIFICAR(ev.lineas == 1 && strcmp(ev.ultima, "T") == 0);
  VERIFICAR(clasificar_linea(ev.ultima) == LINEA_ENTRENADOR);

  // '!' dentro de una linea no es saludo
  ev = alimentar(&a, "@CONF a!b\n", true);
  VERIFICAR(ev.saludos == 0 && strcmp(ev.ultima, "@CONF a!b") == 0);
  VERIFICAR(clasificar_linea(ev.ultima) == LINEA_ESP);

  // Del lado del entrenador el '!' es un byte mas
  ev = alimentar(&a, "!x\n", false);
  VERIFICAR(ev.saludos == 0 && strcmp(ev.ultima, "!x") == 0);

  // Desborde: se descarta la linea entera y la siguiente llega bien
  ev = alimentar(&a, "0123456789ABCDEFGHIJ\nOK\n", true);
  VERIFICAR(ev.desbordes == 1 && ev.lineas == 1 && strcmp(ev.ultima, "OK") == 0);
  ev = alimentar(&a, "0123456789ABCDEF\n", true);  // 16 + '\0' no entra en 16
  VERIFICAR(ev.desbordes == 1);
  ev = alimentar(&a, "0123456789ABCDE\n", true);  // 15 + '\0' entra justo
  VERIFICAR(ev.lineas == 1 && strcmp(ev.ultima, "0123456789ABCDE") == 0);

  VERIFICAR(clasificar_linea("") == LINEA_VACIA);
  VERIFICAR(clasificar_linea("   ") == LINEA_VACIA);
  VERIFICAR(clasificar_linea("!") == LINEA_SALUDO);
  VERIFICAR(clasificar_linea(" !! ") == LINEA_SALUDO);
  VERIFICAR(clasificar_linea("@?") == LINEA_ESP);
  VERIFICAR(clasificar_linea("D 0 0A0B") == LINEA_ENTRENADOR);

  VERIFICAR(es_fin_respuesta("OK"));
  VERIFICAR(es_fin_respuesta("OK ENTRENADOR 2"));
  VERIFICAR(es_fin_respuesta("T 512 3 1 - 1 0"));
  VERIFICAR(es_fin_respuesta("ERR suma"));
  VERIFICAR(!es_fin_respuesta("T"));
  VERIFICAR(!es_fin_respuesta("hola"));
  VERIFICAR(!es_fin_respuesta(""));
}

static void probar_c(void) {
  char buf[64];
  int16_t e[4] = {100, -5, 0, 32767}, s[4];
  VERIFICAR(formatear_c(buf, sizeof buf, e) > 0 && strcmp(buf, "C 100 -5 0 32767") == 0);
  VERIFICAR(formatear_c(buf, 8, e) == -1);

  VERIFICAR(parsear_respuesta_c("OK 1023 0 -1 32767", s));
  VERIFICAR(s[0] == 1023 && s[1] == 0 && s[2] == -1 && s[3] == 32767);
  VERIFICAR(parsear_respuesta_c("OK -32768 2 3 4 ", s) && s[0] == -32768);
  VERIFICAR(!parsear_respuesta_c("OK 1 2 3", s));
  VERIFICAR(!parsear_respuesta_c("OK 1 2 3 4 5", s));
  VERIFICAR(!parsear_respuesta_c("OK 1 2 3 40000", s));
  VERIFICAR(!parsear_respuesta_c("OK 1 2 x 4", s));
  VERIFICAR(!parsear_respuesta_c("OK1 2 3 4 5", s));
  VERIFICAR(!parsear_respuesta_c("ERR comando", s));
  VERIFICAR(!parsear_respuesta_c("OK", s));
}

static void probar_hex(void) {
  uint8_t b[4];
  char txt[16];
  VERIFICAR(hex_a_bytes("0aFf10", b, 4) == 3 && b[0] == 0x0A && b[1] == 0xFF && b[2] == 0x10);
  VERIFICAR(hex_a_bytes("", b, 4) == 0);
  VERIFICAR(hex_a_bytes("abc", b, 4) == -1);
  VERIFICAR(hex_a_bytes("zz", b, 4) == -1);
  VERIFICAR(hex_a_bytes("0011223344", b, 4) == -1);
  bytes_a_hex((const uint8_t[]){0x1E, 0x95, 0x0F}, 3, txt);
  VERIFICAR(strcmp(txt, "1E950F") == 0);

  long v;
  VERIFICAR(parsear_entero("128", 0, 200, &v) && v == 128);
  VERIFICAR(!parsear_entero("12a", 0, 200, &v));
  VERIFICAR(!parsear_entero("", 0, 200, &v));
  VERIFICAR(!parsear_entero("201", 0, 200, &v));
}

static void probar_nube(void) {
  int16_t e[4] = {9, 9, 9, 9};
  VERIFICAR(parsear_entradas_json("[{\"entradas\":[50,2,-3,4]}]", e));
  VERIFICAR(e[0] == 50 && e[1] == 2 && e[2] == -3 && e[3] == 4);
  VERIFICAR(parsear_entradas_json(" [ { \"entradas\" : [ 7 , null ] } ] ", e));
  VERIFICAR(e[0] == 7 && e[1] == 0 && e[2] == 0 && e[3] == 0);
  VERIFICAR(parsear_entradas_json("[]", e) && e[0] == 0);
  VERIFICAR(parsear_entradas_json("[{\"entradas\":null}]", e) && e[0] == 0);
  VERIFICAR(parsear_entradas_json("[{\"entradas\":[99999,-99999,0,0]}]", e));
  VERIFICAR(e[0] == 32767 && e[1] == -32768);
  VERIFICAR(!parsear_entradas_json("{\"message\":\"JWT expired\"}", e));
  VERIFICAR(!parsear_entradas_json("", e));

  char buf[160];
  int16_t s[4] = {512, 0, 0, -1}, en[4] = {50, 0, 0, 0};
  VERIFICAR(json_lectura(buf, sizeof buf, "entrenador-1", s, en) > 0);
  VERIFICAR(strcmp(buf,
                   "{\"dispositivo\":\"entrenador-1\",\"salidas\":[512,0,0,-1],"
                   "\"entradas\":[50,0,0,0]}") == 0);
  VERIFICAR(json_lectura(buf, sizeof buf, "a\"b\\c", s, en) > 0);
  VERIFICAR(strncmp(buf, "{\"dispositivo\":\"a\\\"b\\\\c\",", 25) == 0);
  VERIFICAR(json_lectura(buf, 40, "entrenador-1", s, en) == -1);

  // Texto del LCD desde controles
  char t[17];
  const char *r = "[{\"entradas\":[1,2,3,4],\"lcd1\":\"Hola \\\"nube\\\"\",\"lcd2\":null}]";
  VERIFICAR(parsear_texto_json(r, "lcd1", t, sizeof t) && strcmp(t, "Hola \"nube\"") == 0);
  VERIFICAR(parsear_texto_json(r, "lcd2", t, sizeof t) && t[0] == '\0');
  VERIFICAR(parsear_texto_json("[{\"entradas\":[0,0,0,0]}]", "lcd1", t, sizeof t) && t[0] == '\0');
  VERIFICAR(parsear_texto_json("[]", "lcd1", t, sizeof t) && t[0] == '\0');
  VERIFICAR(parsear_texto_json("[{\"lcd1\":\"0123456789abcdefXYZ\"}]", "lcd1", t, sizeof t) &&
            strcmp(t, "0123456789abcdef") == 0);
  VERIFICAR(parsear_texto_json("[{\"lcd1\":\"a\\u00f1b\\nc\\u0041\"}]", "lcd1", t, sizeof t) &&
            strcmp(t, "a?b cA") == 0);
  VERIFICAR(parsear_texto_json("[{\"lcd1\":\"ca\xc3\xb1o\"}]", "lcd1", t, sizeof t) && strcmp(t, "ca?o") == 0);
  VERIFICAR(!parsear_texto_json("[{\"lcd1\":\"sin cerrar}]", "lcd1", t, sizeof t));
  VERIFICAR(!parsear_texto_json("[{\"lcd1\":42}]", "lcd1", t, sizeof t));
  VERIFICAR(!parsear_texto_json("{\"message\":\"x\"}", "lcd1", t, sizeof t));
  VERIFICAR(formatear_m(buf, sizeof buf, 1, "Hola") > 0 && strcmp(buf, "M 1 Hola") == 0);
  VERIFICAR(formatear_m(buf, sizeof buf, 0, "") > 0 && strcmp(buf, "M 0 ") == 0);

  VERIFICAR(url_codificar(buf, sizeof buf, "aula 3/b") > 0 && strcmp(buf, "aula%203%2Fb") == 0);
  VERIFICAR(url_controles(buf, sizeof buf, "http://192.168.1.10:54321/", "entrenador-1") > 0);
  VERIFICAR(strcmp(buf,
                   "http://192.168.1.10:54321/rest/v1/controles"
                   "?dispositivo=eq.entrenador-1&select=entradas,lcd1,lcd2") == 0);
  VERIFICAR(url_lecturas(buf, sizeof buf, "https://abc.supabase.co") > 0);
  VERIFICAR(strcmp(buf, "https://abc.supabase.co/rest/v1/lecturas") == 0);
  VERIFICAR(url_lecturas(buf, 10, "https://abc.supabase.co") == -1);
}

static void probar_desplazamiento(void) {
  mensaje_lcd_t m = {0};
  char v[17];
  lcd_ventana(&m, 0, v);
  VERIFICAR(strcmp(v, "                ") == 0);
  lcd_actualizar(&m, "Hola", 100);
  lcd_ventana(&m, 100000, v);
  VERIFICAR(strcmp(v, "Hola            ") == 0);
  lcd_actualizar(&m, "0123456789abcdef", 200);
  lcd_ventana(&m, 999999, v);
  VERIFICAR(strcmp(v, "0123456789abcdef") == 0);
  lcd_actualizar(&m, "0123456789abcdefG", 1000);
  lcd_ventana(&m, 1800, v);
  VERIFICAR(strcmp(v, "0123456789abcdef") == 0);
  lcd_ventana(&m, 2200, v);
  VERIFICAR(strcmp(v, "123456789abcdefG") == 0);
  lcd_actualizar(&m, "0123456789abcdefG", 2200);
  lcd_ventana(&m, 2600, v);
  VERIFICAR(strcmp(v, "23456789abcdefG ") == 0); // GET repetido no reinicia
  lcd_ventana(&m, 1000 + 22 * LCD_PASO_MS, v);
  VERIFICAR(strcmp(v, "0123456789abcdef") == 0); // vuelve al inicio
  lcd_actualizar(&m, "Nuevo", 3000);
  lcd_ventana(&m, 3000, v);
  VERIFICAR(strcmp(v, "Nuevo           ") == 0); // limpia restos
  char largo[200]; memset(largo, 'x', sizeof largo); largo[199] = 0;
  lcd_actualizar(&m, largo, UINT32_MAX - 100);
  VERIFICAR(strlen(m.texto) == LCD_TEXTO_MAX);
  lcd_ventana(&m, 1099, v); // reloj de 32 bits desbordado: 1200 ms
  VERIFICAR(strlen(v) == 16);
}

typedef struct { int llamadas; char fallar; bool timeout; char comandos[30][80]; } carga_falsa_t;
static bool intercambio_falso(const char *cmd, char *resp, size_t cap, void *ctx) {
  carga_falsa_t *f = ctx;
  snprintf(f->comandos[f->llamadas++], 80, "%s", cmd);
  snprintf(resp, cap, "%s", cmd[0] == f->fallar ? "ERR suma" : "OK");
  return !(f->timeout && cmd[0] == f->fallar);
}

static void probar_programa_wifi(void) {
  programa_wifi_t p;
  VERIFICAR(parsear_programa_json("[]", &p) == 0);
  VERIFICAR(parsear_programa_json("{}", &p) == -1);
  VERIFICAR(parsear_programa_json("[{\"id\":\"invalido\",\"codigo\":\"FF\"}]", &p) == -1);
  VERIFICAR(parsear_programa_json("[{\"id\":\"12345678-1234-1234-1234-123456789abc\",\"codigo\":\"00FF01\"}]", &p) == 1);
  VERIFICAR(p.largo == 3 && p.bytes[1] == 255);
  char detalle[160];
  carga_falsa_t f = {0};
  VERIFICAR(enviar_programa_wifi(&p, intercambio_falso, &f, detalle, sizeof detalle));
  VERIFICAR(f.llamadas == 4 && strcmp(f.comandos[0], "B") == 0);
  VERIFICAR(strcmp(f.comandos[1], "D 0 00FF01") == 0);
  VERIFICAR(strcmp(f.comandos[2], "E 3 256") == 0 && strcmp(f.comandos[3], "R") == 0);
  f = (carga_falsa_t){ .fallar = 'E' };
  VERIFICAR(!enviar_programa_wifi(&p, intercambio_falso, &f, detalle, sizeof detalle));
  VERIFICAR(f.llamadas == 3 && strstr(detalle, "ERR suma") != NULL); // no ejecuta
  f = (carga_falsa_t){ .fallar = 'D', .timeout = true };
  VERIFICAR(!enviar_programa_wifi(&p, intercambio_falso, &f, detalle, sizeof detalle));
  VERIFICAR(f.llamadas == 2 && strstr(detalle, "Sin confirmacion") != NULL);
  p.largo = PROGRAMA_MAX; memset(p.bytes, 255, p.largo);
  f = (carga_falsa_t){0};
  VERIFICAR(enviar_programa_wifi(&p, intercambio_falso, &f, detalle, sizeof detalle));
  VERIFICAR(f.llamadas == 27 && strcmp(f.comandos[25], "E 768 64768") == 0);
  VERIFICAR(parsear_programa_json("[{\"id\":\"12345678-1234-1234-1234-123456789abc\",\"codigo\":\"0\"}]", &p) == -1);
  VERIFICAR(parsear_programa_json("[{\"id\":\"12345678-1234-1234-1234-123456789abc\",\"codigo\":\"XX\"}]", &p) == -1);
}

static void probar_isp(void) {
  uint32_t dir;
  uint8_t datos[ISP_PAGINA_BYTES];
  int n;
  char linea[300] = "256 ";
  for (int i = 0; i < ISP_PAGINA_BYTES; i++) strcat(linea, "A5");
  VERIFICAR(isp_parsear_pagina(linea, &dir, datos, &n) && dir == 256 && n == 128);
  VERIFICAR(datos[0] == 0xA5 && datos[127] == 0xA5);
  strcat(linea, "00");  // 129 bytes
  VERIFICAR(!isp_parsear_pagina(linea, &dir, datos, &n));
  VERIFICAR(isp_parsear_pagina("0 0C94", &dir, datos, &n) && dir == 0 && n == 2);
  VERIFICAR(!isp_parsear_pagina("100 0C94", &dir, datos, &n));    // no es multiplo de 128
  VERIFICAR(!isp_parsear_pagina("32768 0C94", &dir, datos, &n));  // fuera de la flash
  VERIFICAR(!isp_parsear_pagina("0", &dir, datos, &n));
  VERIFICAR(!isp_parsear_pagina("0 0C9", &dir, datos, &n));
  VERIFICAR(!isp_parsear_pagina("0 0C94 x", &dir, datos, &n));

  VERIFICAR(isp_parsear_leer("0 128", &dir, &n) && dir == 0 && n == 128);
  VERIFICAR(isp_parsear_leer("32767 1", &dir, &n) && dir == 32767);
  VERIFICAR(!isp_parsear_leer("32767 2", &dir, &n));
  VERIFICAR(!isp_parsear_leer("0 129", &dir, &n));
  VERIFICAR(!isp_parsear_leer("0 0", &dir, &n));
  VERIFICAR(!isp_parsear_leer("0", &dir, &n));

  char cual;
  uint8_t v;
  VERIFICAR(isp_parsear_fusible("L FF", &cual, &v) && cual == 'L' && v == 0xFF);
  VERIFICAR(isp_parsear_fusible("h 0xDE", &cual, &v) && cual == 'H' && v == 0xDE);
  VERIFICAR(isp_parsear_fusible("E fd", &cual, &v) && cual == 'E' && v == 0xFD);
  VERIFICAR(isp_parsear_fusible("B 3F", &cual, &v) && cual == 'B' && v == 0x3F);
  VERIFICAR(!isp_parsear_fusible("X FF", &cual, &v));
  VERIFICAR(!isp_parsear_fusible("L F", &cual, &v));
  VERIFICAR(!isp_parsear_fusible("L", &cual, &v));
  VERIFICAR(isp_hfuse_seguro(0xDE) && isp_hfuse_seguro(0xD9));
  VERIFICAR(!isp_hfuse_seguro(0x5E) && !isp_hfuse_seguro(0x9E));

  uint8_t ins[4];
  // Byte 257 = palabra 128 (pagina 2), byte alto
  isp_ins_leer(ins, 257);
  VERIFICAR(ins[0] == 0x28 && ins[1] == 0x00 && ins[2] == 0x80);
  isp_ins_leer(ins, 32766);
  VERIFICAR(ins[0] == 0x20 && ins[1] == 0x3F && ins[2] == 0xFF);
  isp_ins_cargar(ins, 128 + 5, true, 0xAB);
  VERIFICAR(ins[0] == 0x48 && ins[1] == 0 && ins[2] == 5 && ins[3] == 0xAB);
  isp_ins_cargar(ins, 63, false, 0x12);
  VERIFICAR(ins[0] == 0x40 && ins[2] == 63);
  isp_ins_escribir_pagina(ins, 0x3FC0 + 7);
  VERIFICAR(ins[0] == 0x4C && ins[1] == 0x3F && ins[2] == 0xC0 && ins[3] == 0);
}

int main(void) {
  probar_lineas();
  probar_c();
  probar_hex();
  probar_nube();
  probar_isp();
  probar_desplazamiento();
  probar_programa_wifi();
  printf("%d de %d verificaciones pasaron\n", total - fallas, total);
  return fallas ? 1 : 0;
}
