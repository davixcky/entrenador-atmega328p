# The trainer language

*Español: [README.md](README.md).*

A small TypeScript library with no dependencies that defines the language used to
program the trainer. The keywords and functions are in Spanish, because the course is.
The same program can be written as **text** or as a **node diagram**; both turn into the
same syntax tree, which compiles to bytecode for the firmware's virtual machine
([`firmware/bloques/maquina.h`](../../firmware/bloques/maquina.h)) or translates to an
Arduino sketch.

```text
text ────analizar──┐                    ┌──formatear──────> text
                   ├──> Programa (AST) ─┼──compilar───────> bytecode ──> trainer
diagram ───────────┘                    ├──generarArduino─> .ino sketch (Entrenador library)
          grafoAPrograma                └──programaAGrafo─> diagram
```

| File | Contents |
|---|---|
| [`src/ast.ts`](src/ast.ts) | Tree types: expressions and statements |
| [`src/sintaxis.ts`](src/sintaxis.ts) | Lexer and parser, with line and column in errors |
| [`src/formato.ts`](src/formato.ts) | Tree → text, with parentheses only where needed |
| [`src/compilador.ts`](src/compilador.ts) | Tree → bytecode; checks variables, functions and loops |
| [`src/arduino.ts`](src/arduino.ts) | Tree → Arduino C++ sketch using the Entrenador library |
| [`src/desensamblador.ts`](src/desensamblador.ts) | Bytecode → readable listing (address, bytes, instruction) |
| [`src/grafo.ts`](src/grafo.ts) | Diagram ↔ tree, node types and automatic layout |
| [`src/funciones.ts`](src/funciones.ts) | Built-in functions and constants |
| [`src/opcodes.ts`](src/opcodes.ts) | Opcodes; must match `maquina.h` |
| [`src/ejemplos.ts`](src/ejemplos.ts) | Example programs |

The app (`app/frontend`) imports it as `@entrenador/lenguaje`. The diagram does not
depend on React Flow: it is a list of nodes and edges with positions, and the app only
draws it.

## The language

```text
// Count from 00 to 99
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

- One statement per line (or separated with `;`). Blocks go between `{ }`.
- Variables are created by assigning to them. They are 16-bit integers
  (−32768 to 32767). Up to 24 variables.
- Numbers in decimal, hexadecimal (`0xFF`) or binary (`0b10100101`).
- Comments start with `//`.

### Statements

| Statement | Meaning | What it does |
|---|---|---|
| `x = value`, `x += value`, `x -= value` | | Stores, adds to or subtracts from a variable |
| `si cond { } sino si cond { } sino { }` | if / else if / else | Condition |
| `mientras cond { }` | while | Repeats while the condition holds |
| `repetir n { }` | repeat | Repeats n times |
| `siempre { }` | forever | Repeats endlessly |
| `romper`, `continuar` | break, continue | Leaves the loop, or jumps to its next turn |
| `detener` | stop | Ends the program |
| `esperar(ms)` | wait | Pauses without blocking the firmware |
| `mostrar(n)` | show | Number 0 to 99 on the displays (out of range shows `--`) |
| `apagar_displays()` | displays off | Turns the displays off |
| `leds(value)` | | The 8 LEDs in binary; bit 0 is the bottom LED |
| `led(n, state)` | | Turns LED n (0 to 7) on or off |

### Values

| Expression | Value |
|---|---|
| `pot()` | Potentiometer, 0 to 1023 |
| `pot99()` | Potentiometer, 0 to 99 |
| `dip()` | DIP switch, 0 to 15 |
| `interruptor(n)` | Switch n (1 to 4) of the DIP: 1 closed, 0 open |
| `aleatorio(min, max)` | Random number between min and max |
| `verdadero`, `falso`, `encendido`, `apagado` | true 1, false 0, on 1, off 0 |

Operators, from lowest to highest precedence: `o` (or), `y` (and), `no` (not),
`== != < <= > >=`, `+ -`, `* / %`, `-` (negation). Division is integer division, and
dividing by 0 gives 0.

## The diagram

Each node is a statement and the arrows give the order of execution. Everything starts
at the **Al iniciar** (*on start*) node. Control nodes have extra outputs:

- `cuerpo` (*body*): on *Repetir*, *Mientras* and *Repetir siempre*.
- `entonces` / `sino` (*then* / *else*): on *Si*.

Fields (conditions, values) take the same expressions as the text. Nodes that are not
connected to *Al iniciar* do not run.

## Arduino sketch

`generarArduino(programa)` turns each statement into one line of C++ with the same
name, using the
[`firmware/libraries/Entrenador`](../../firmware/libraries/Entrenador/src/Entrenador.h)
library, which is maintained alongside the virtual machine:

| Language | C++ |
|---|---|
| `x = 5`, `x += 1` | global `int16_t x`; `x = 5;`, `x += 1;` |
| `si … sino si … sino` | `if … else if … else` |
| `mientras c`, `siempre` | `while (c)`, `while (true)` |
| `repetir n` | `for (int16_t vuelta = n; vuelta > 0; vuelta--)` |
| `romper`, `continuar`, `detener` | `break;`, `continue;`, `detener();` |
| `y`, `o`, `no` | `&&`, `\|\|`, `!` |
| `a / b`, `a % b` | `dividir(a, b)`, `modulo(a, b)` (by 0 gives 0); with a fixed number, `/` and `%` |
| `año`, `int` | `ano`, `v_int`: no accents, and no clashes with C++ or Arduino |

The program runs once inside `setup()`, as in the virtual machine. If something changes
in the virtual machine (`maquina.h`), it must change in the library too;
`../pruebas/comparar.sh` checks that both give the same outputs.

## Tests

They run on Node 22.18 or later, which executes TypeScript without a build step:

```bash
npm test                 # parser, formatter, diagram, compiler and errors
npm run ejemplos         # prints the examples' bytecode in hex
../pruebas/correr.sh     # runs the examples in maquina.h compiled for the PC
../pruebas/comparar.sh   # generated sketch vs. virtual machine; compiles each sketch for the Uno
```
