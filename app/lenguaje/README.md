# Lenguaje del entrenador

*English: [README.en.md](README.en.md).*

Librería propia, en TypeScript y sin dependencias, que define el lenguaje con el que
se programa el entrenador. Un mismo programa se puede escribir como **texto** o como
**diagrama de nodos**; los dos se convierten al mismo árbol de sintaxis y se compilan
al bytecode de la máquina virtual del firmware
([`firmware/bloques/maquina.h`](../../firmware/bloques/maquina.h)).

```text
texto ──analizar──┐                    ┌──formatear──────> texto
                  ├──> Programa (AST) ─┼──compilar───────> bytecode ──> entrenador
diagrama ─────────┘                    ├──generarArduino─> sketch .ino (biblioteca Entrenador)
         grafoAPrograma                └──programaAGrafo─> diagrama
```

| Archivo | Contenido |
|---|---|
| [`src/ast.ts`](src/ast.ts) | Tipos del árbol: expresiones y sentencias |
| [`src/sintaxis.ts`](src/sintaxis.ts) | Analizador léxico y sintáctico, con errores en línea y columna |
| [`src/formato.ts`](src/formato.ts) | Árbol → texto, con paréntesis solo donde hacen falta |
| [`src/compilador.ts`](src/compilador.ts) | Árbol → bytecode; revisa variables, funciones y bucles |
| [`src/arduino.ts`](src/arduino.ts) | Árbol → sketch de Arduino en C++ que usa la biblioteca Entrenador |
| [`src/desensamblador.ts`](src/desensamblador.ts) | Bytecode → listado legible (dirección, bytes, instrucción) |
| [`src/grafo.ts`](src/grafo.ts) | Diagrama ↔ árbol, tipos de nodo y acomodo automático |
| [`src/funciones.ts`](src/funciones.ts) | Funciones y constantes predefinidas |
| [`src/opcodes.ts`](src/opcodes.ts) | Códigos de operación; deben coincidir con `maquina.h` |
| [`src/ejemplos.ts`](src/ejemplos.ts) | Programas de ejemplo |

La app (`app/frontend`) la importa como `@entrenador/lenguaje`. El diagrama no
depende de React Flow: es una lista de nodos y aristas con posiciones, y la app
solo lo dibuja.

## El lenguaje

```text
// Cuenta de 00 a 99
cuenta = 0
siempre {
  mostrar(cuenta)
  leds(cuenta)
  esperar(300)
  cuenta += 1
  si cuenta > 99 {
    cuenta = 0
  }
}
```

- Una instrucción por línea (o separadas con `;`). Los bloques van entre `{ }`.
- Las variables se crean al asignarles un valor. Son enteros de 16 bits
  (−32768 a 32767). Hay hasta 24 variables.
- Números en decimal, hexadecimal (`0xFF`) o binario (`0b10100101`).
- Comentarios con `//`.

### Instrucciones

| Instrucción | Qué hace |
|---|---|
| `x = valor`, `x += valor`, `x -= valor` | Guarda, suma o resta en una variable |
| `si cond { } sino si cond { } sino { }` | Condición |
| `mientras cond { }` | Repite mientras se cumpla |
| `repetir n { }` | Repite n veces |
| `siempre { }` | Repite sin fin |
| `romper`, `continuar` | Sale del bucle o salta a la siguiente vuelta |
| `detener` | Termina el programa |
| `esperar(ms)` | Pausa sin bloquear el firmware |
| `mostrar(n)` | Número 0 a 99 en los displays (fuera de rango muestra `--`) |
| `apagar_displays()` | Apaga los displays |
| `leds(valor)` | Los 8 LEDs en binario; el bit 0 es el LED de abajo |
| `led(n, estado)` | Enciende o apaga el LED n (0 a 7) |

### Valores

| Expresión | Valor |
|---|---|
| `pot()` | Potenciómetro, 0 a 1023 |
| `pot99()` | Potenciómetro, 0 a 99 |
| `dip()` | DIP switch, 0 a 15 |
| `interruptor(n)` | Interruptor n (1 a 4) del DIP: 1 cerrado, 0 abierto |
| `aleatorio(min, max)` | Número al azar entre min y max |
| `verdadero`, `falso`, `encendido`, `apagado` | 1, 0, 1, 0 |

Operadores, de menor a mayor precedencia: `o`, `y`, `no`,
`== != < <= > >=`, `+ -`, `* / %`, `-` (negativo). La división es entera, y
dividir entre 0 da 0.

## El diagrama

Cada nodo es una instrucción y las flechas marcan el orden de ejecución. Todo
empieza en el nodo **Al iniciar**. Los nodos de control tienen salidas extra:

- `cuerpo`: en *Repetir*, *Mientras* y *Repetir siempre*.
- `entonces` / `sino`: en *Si*.

Lo que se escribe en los campos (condiciones, valores) usa las mismas expresiones
que el texto. Los nodos que no están conectados a *Al iniciar* no se ejecutan.

## Sketch de Arduino

`generarArduino(programa)` traduce cada instrucción a una línea de C++ con el mismo
nombre, usando la biblioteca
[`firmware/libraries/Entrenador`](../../firmware/libraries/Entrenador/src/Entrenador.h),
que se mantiene junto con la máquina virtual:

| Lenguaje | C++ |
|---|---|
| `x = 5`, `x += 1` | `int16_t x` global; `x = 5;`, `x += 1;` |
| `si … sino si … sino` | `if … else if … else` |
| `mientras c`, `siempre` | `while (c)`, `while (true)` |
| `repetir n` | `for (int16_t vuelta = n; vuelta > 0; vuelta--)` |
| `romper`, `continuar`, `detener` | `break;`, `continue;`, `detener();` |
| `y`, `o`, `no` | `&&`, `\|\|`, `!` |
| `a / b`, `a % b` | `dividir(a, b)`, `modulo(a, b)` (entre 0 da 0); con un número fijo, `/` y `%` |
| `año`, `int` | `ano`, `v_int`: sin tildes y sin chocar con C++ o Arduino |

El programa corre una vez dentro de `setup()`, como en la máquina virtual. Si algo
cambia en la máquina virtual (`maquina.h`), hay que cambiarlo también en la biblioteca;
`../pruebas/comparar.sh` comprueba que los dos den las mismas salidas.

## Pruebas

Corren con Node 22.18 o posterior, que ejecuta TypeScript sin compilarlo:

```bash
npm test                 # analizador, formato, diagrama, compilador y errores
npm run ejemplos         # imprime el bytecode de los ejemplos en hexadecimal
../pruebas/correr.sh     # ejecuta los ejemplos en maquina.h compilada para el PC
../pruebas/comparar.sh   # sketch generado vs. maquina virtual; compila cada sketch para el Uno
```
