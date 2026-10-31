/*
 * Maquina virtual de pila para los programas por bloques.
 *
 * No depende de AVR: el sketch (o la prueba en el PC, app/pruebas/) define las
 * funciones hw*. Los valores son int16_t; los programas llegan como bytecode
 * generado por la app (app/lenguaje/src/compilador.ts, mismos codigos de OP_*).
 *
 * Nunca bloquea: maquinaPaso() ejecuta como mucho N instrucciones y vuelve;
 * ESPERAR guarda el instante de despertar y se compara con hwMillis().
 */

#pragma once
#include <stdint.h>

// Codigos de operacion. Cambiarlos aqui obliga a cambiar app/lenguaje/src/opcodes.ts.
enum : uint8_t {
  OP_FIN = 0x00,           // detiene el programa
  OP_NUM = 0x01,           // + int16 LE: apila el numero
  OP_LEER = 0x02,          // + u8 variable: apila su valor
  OP_GUARDAR = 0x03,       // + u8 variable: desapila y guarda
  OP_SUMA = 0x10, OP_RESTA, OP_MULT, OP_DIV, OP_MOD, OP_NEG,
  OP_IGUAL = 0x18, OP_DISTINTO, OP_MENOR, OP_MENOR_IGUAL, OP_MAYOR, OP_MAYOR_IGUAL,
  OP_Y, OP_O, OP_NO,
  OP_SALTO = 0x28,         // + u16 LE direccion
  OP_SALTO_SI_CERO,        // + u16 LE direccion; desapila la condicion
  OP_ESPERAR = 0x30,       // desapila ms
  OP_LED,                  // desapila estado y numero de LED (0..7)
  OP_LEDS,                 // desapila valor binario de los 8 LEDs
  OP_NUMERO,               // desapila el numero de los displays
  OP_APAGAR_DISPLAYS,
  OP_POT = 0x40,           // apila el potenciometro 0..1023
  OP_DIP,                  // apila el DIP 0..15
  OP_INTERRUPTOR,          // desapila 1..4, apila 0/1
  OP_ALEATORIO,            // desapila max y min, apila min..max
};

enum : uint8_t {
  ERR_NINGUNO = 0,
  ERR_PILA_LLENA,
  ERR_PILA_VACIA,
  ERR_OPERACION,
  ERR_DIRECCION,
  ERR_VARIABLE,
};

// Hardware, lo implementa quien incluye este archivo
void hwLed(uint8_t n, bool encendido);
void hwLeds(uint8_t valor);
void hwNumero(int16_t valor);
void hwApagarDisplays();
int16_t hwPot();
int16_t hwDip();
int16_t hwAleatorio(int16_t min, int16_t max);  // min..max incluidos
unsigned long hwMillis();

const uint16_t PROG_MAX = 768;
const uint8_t PILA_MAX = 32;
const uint8_t VARS_MAX = 32;

uint8_t prog[PROG_MAX];
uint16_t progLargo = 0;

static int16_t pila[PILA_MAX];
static uint8_t sp = 0;
static int16_t vars[VARS_MAX];
static uint16_t pc = 0;
static unsigned long despertar = 0;
static bool esperando = false;

bool corriendo = false;
uint8_t maquinaError = ERR_NINGUNO;

void maquinaIniciar() {
  for (uint8_t i = 0; i < VARS_MAX; i++) vars[i] = 0;
  sp = 0;
  pc = 0;
  esperando = false;
  maquinaError = ERR_NINGUNO;
  corriendo = progLargo > 0;
}

void maquinaDetener() {
  corriendo = false;
  esperando = false;
}

static void fallar(uint8_t codigo) {
  maquinaError = codigo;
  corriendo = false;
}

static void apilar(int16_t v) {
  if (sp >= PILA_MAX) { fallar(ERR_PILA_LLENA); return; }
  pila[sp++] = v;
}

static int16_t desapilar() {
  if (sp == 0) { fallar(ERR_PILA_VACIA); return 0; }
  return pila[--sp];
}

static bool hay(uint8_t bytes) {
  if (pc + bytes > progLargo) { fallar(ERR_DIRECCION); return false; }
  return true;
}

static uint8_t leer8() { return prog[pc++]; }

static uint16_t leer16() {
  uint16_t v = prog[pc] | (uint16_t)(prog[pc + 1] << 8);
  pc += 2;
  return v;
}

// Ejecuta hasta maxInstrucciones; devuelve false si el programa no esta corriendo
bool maquinaPaso(uint8_t maxInstrucciones) {
  if (!corriendo) return false;
  if (esperando) {
    if ((long)(hwMillis() - despertar) < 0) return true;
    esperando = false;
  }

  for (uint8_t n = 0; n < maxInstrucciones && corriendo && !esperando; n++) {
    if (!hay(1)) break;
    uint8_t op = leer8();
    int16_t a, b;

    switch (op) {
      case OP_FIN: corriendo = false; break;
      case OP_NUM:
        if (!hay(2)) break;
        apilar((int16_t)leer16());
        break;
      case OP_LEER:
      case OP_GUARDAR: {
        if (!hay(1)) break;
        uint8_t v = leer8();
        if (v >= VARS_MAX) { fallar(ERR_VARIABLE); break; }
        if (op == OP_LEER) apilar(vars[v]);
        else vars[v] = desapilar();
        break;
      }

      case OP_SUMA: b = desapilar(); a = desapilar(); apilar(a + b); break;
      case OP_RESTA: b = desapilar(); a = desapilar(); apilar(a - b); break;
      case OP_MULT: b = desapilar(); a = desapilar(); apilar(a * b); break;
      case OP_DIV: b = desapilar(); a = desapilar(); apilar(b ? a / b : 0); break;
      case OP_MOD: b = desapilar(); a = desapilar(); apilar(b ? a % b : 0); break;
      case OP_NEG: apilar(-desapilar()); break;

      case OP_IGUAL: b = desapilar(); a = desapilar(); apilar(a == b); break;
      case OP_DISTINTO: b = desapilar(); a = desapilar(); apilar(a != b); break;
      case OP_MENOR: b = desapilar(); a = desapilar(); apilar(a < b); break;
      case OP_MENOR_IGUAL: b = desapilar(); a = desapilar(); apilar(a <= b); break;
      case OP_MAYOR: b = desapilar(); a = desapilar(); apilar(a > b); break;
      case OP_MAYOR_IGUAL: b = desapilar(); a = desapilar(); apilar(a >= b); break;
      case OP_Y: b = desapilar(); a = desapilar(); apilar(a && b); break;
      case OP_O: b = desapilar(); a = desapilar(); apilar(a || b); break;
      case OP_NO: apilar(!desapilar()); break;

      case OP_SALTO:
      case OP_SALTO_SI_CERO: {
        if (!hay(2)) break;
        uint16_t destino = leer16();
        if (op == OP_SALTO_SI_CERO && desapilar() != 0) break;
        if (destino >= progLargo) { fallar(ERR_DIRECCION); break; }
        pc = destino;
        break;
      }

      case OP_ESPERAR:
        a = desapilar();
        if (a > 0) {
          despertar = hwMillis() + (unsigned long)a;
          esperando = true;
        }
        break;
      case OP_LED: b = desapilar(); a = desapilar(); if (a >= 0 && a < 8) hwLed((uint8_t)a, b != 0); break;
      case OP_LEDS: hwLeds((uint8_t)desapilar()); break;
      case OP_NUMERO: hwNumero(desapilar()); break;
      case OP_APAGAR_DISPLAYS: hwApagarDisplays(); break;

      case OP_POT: apilar(hwPot()); break;
      case OP_DIP: apilar(hwDip()); break;
      case OP_INTERRUPTOR:
        a = desapilar();
        apilar((a >= 1 && a <= 4) ? (hwDip() >> (a - 1)) & 1 : 0);
        break;
      case OP_ALEATORIO:
        b = desapilar(); a = desapilar();
        apilar(a <= b ? hwAleatorio(a, b) : hwAleatorio(b, a));
        break;

      default: fallar(ERR_OPERACION); break;
    }
  }
  return corriendo;
}
