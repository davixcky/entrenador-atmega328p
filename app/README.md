# App del entrenador

Aplicación de escritorio (Wails: Go + React) para programar el entrenador con un
diagrama de nodos o con código en español, verlo en vivo y grabarle el firmware.

- **Diagrama** (React Flow) y **código** (CodeMirror): dos vistas del mismo
  programa que se actualizan entre sí. Se pueden ver juntas con **Ambos**.
  Los errores se marcan en el nodo o en la línea mientras se escribe.
- **Editor de código**: plantillas al autocompletar (`si`, `repetir`... con Tab entre
  huecos), ayuda de cada función al pasar el ratón y de sus parámetros al escribirlos,
  plegado de bloques, buscar (Ctrl+F), **Formatear** (Shift+Alt+F) y Ctrl+Enter para
  ejecutar.
- **Generado**: el mismo programa como sketch de Arduino (C++ con la biblioteca
  [`Entrenador`](../firmware/libraries/Entrenador/src/Entrenador.h)) y como el
  bytecode que recibe el entrenador. El sketch se puede copiar, guardar como `.ino`
  y compilar en el IDE de Arduino; **Instalar biblioteca** la copia en
  `~/Arduino/libraries`.
- El lenguaje, el compilador y la conversión entre diagrama y código están en la
  librería propia [`lenguaje/`](lenguaje/README.md), que también documenta la sintaxis.
- Incluye ejemplos y guarda el programa solo.
- **Monitor en vivo**: LEDs, displays, potenciómetro y DIP cada 150 ms.
- **Control manual**: clic en un LED para cambiarlo; número en los displays.
- **Ejecutar / Guardar en la placa**: el programa se envía por serie, sin
  recompilar firmware. “Guardar” lo deja en la EEPROM y corre al encender.
- **Firmware**: graba el puente en el Uno y el firmware `bloques` en el
  entrenador con avrdude.

## Cómo funciona

```text
App ──USB──> Arduino Uno (firmware/puente-uno) ──ISP D10-D13──> ATmega328P
                                              └─serie D2/D3───> (firmware/bloques)
```

- El **Uno** corre `puente-uno`: es el ArduinoISP de siempre, y si el primer
  byte tras abrir el puerto es `!`, pasa a reenviar el serie al entrenador por
  SoftwareSerial (19200 baudios). Así no hay que recablear para grabar o monitorear.
- El **entrenador** corre `bloques`: una máquina virtual de pila
  ([`maquina.h`](../firmware/bloques/maquina.h)) que ejecuta el bytecode que
  genera [`lenguaje/src/compilador.ts`](lenguaje/src/compilador.ts). Nunca usa
  `delay()`: `esperar(ms)` se resuelve con `millis()`.
- El hardware (multiplexado con Timer2, cableado del bus, entradas) está en la
  biblioteca [`firmware/libraries/Entrenador`](../firmware/libraries/Entrenador/src/Entrenador.h).
  La usan `bloques` y los sketches generados, con funciones que se llaman igual que
  en el lenguaje (`mostrar`, `leds`, `pot99`...). Así un programa hace lo mismo en la
  máquina virtual y compilado como sketch.

## Conexiones del serie

| Arduino Uno | Entrenador |
|---|---|
| D2 | ATmega pin 3 (TX, PD1) |
| D3 | ATmega pin 2 (RX, PD0) |
| GND | GND |

Se suman a las del ISP (D10→pin 1, D11→pin 17, D12→pin 18, D13→pin 19).

## Primer uso

Paso a paso con el diagrama de cables y solución de problemas: [GUIA-USO.md](../GUIA-USO.md).

1. Abrir la app, elegir el puerto del Uno y pulsar **Firmware**.
2. **Grabar puente en el Uno** (una sola vez).
3. **Grabar firmware en el entrenador**.
4. Cablear D2/D3/GND y pulsar **Conectar**. Los indicadores *Puente* y
   *Entrenador* deben quedar en verde.

## Desarrollo

En NixOS, las dependencias nativas de Wails están en `shell.nix`:

```bash
cd app
nix-shell
wails dev -tags webkit2_41                 # con recarga en caliente
wails build -tags webkit2_41               # deja build/bin/entrenador-bloques
```

En otras distribuciones hace falta GTK 3 y WebKitGTK 4.1 (o 4.0 sin la etiqueta).

El firmware y la biblioteca van incrustados en el ejecutable. Después de cambiar
`firmware/bloques`, `firmware/puente-uno` o `firmware/libraries/Entrenador`:

```bash
./compilar-firmware.sh   # requiere arduino-cli con arduino:avr
```

Pruebas sin hardware:

```bash
(cd lenguaje && npm test)    # librería del lenguaje (Node 22.18 o posterior)
./pruebas/correr.sh [ms] [pot]  # ejemplos ejecutados en maquina.h compilada para el PC
./pruebas/comparar.sh [ms] [pot]  # sketch generado (C++ en el PC) vs. maquina virtual,
                                  # y cada sketch compilado para el Uno con la biblioteca
```

Para compilar `bloques` a mano con arduino-cli hay que indicarle la biblioteca:
`arduino-cli compile -b arduino:avr:uno --libraries firmware/libraries firmware/bloques`.

Los códigos de operación de `maquina.h` y `lenguaje/src/opcodes.ts` deben coincidir.
