# Guía de conexión y uso: Arduino Uno + entrenador + app

*English version: [USER-GUIDE.md](USER-GUIDE.md).*

Esta guía explica cómo conectar el entrenador al PC **usando solo un Arduino Uno** (sin
módulo FTDI), cómo prepararlo la primera vez y qué hacer si algo falla.

El Uno cumple dos funciones con los mismos cables:

1. **Programador ISP**: graba el firmware del entrenador por los pines D10–D13.
2. **Puente serie**: pasa los datos entre la app del PC y el entrenador por los pines D2–D3.

No hay que recablear para pasar de una función a la otra. La app elige el modo sola.

```text
 PC (app) ──USB──> Arduino Uno ──D10..D13 (ISP)──> ATmega328P del entrenador
                    (puente-uno) ──D2/D3 (serie)───>
```

## 1. Qué se necesita

- Arduino Uno con su cable USB.
- 7 cables dupont (8 si el entrenador se alimenta desde el Uno).
- El entrenador con el ATmega328P y su cristal de 16 MHz.
- La app: `app/build/bin/entrenador-bloques` (ver [app/README.md](app/README.md) para compilarla).
- En Linux, permiso para usar el puerto serie: el usuario debe estar en el grupo `dialout`
  (`groups` para revisarlo). Si ya grabaste el chip con avrdude usando el Uno, ya lo tienes.

## 2. Conexiones

### Tabla de cables

| # | Arduino Uno | | ATmega328P del entrenador | Para qué |
|:-:|---|:-:|---|---|
| 1 | **D10** | → | **pin 1** (RESET) | ISP: reinicia el micro al grabar |
| 2 | **D11** | → | **pin 17** (MOSI, PB3) | ISP: datos hacia el micro |
| 3 | **D12** | ← | **pin 18** (MISO, PB4) | ISP: datos desde el micro |
| 4 | **D13** | → | **pin 19** (SCK, PB5) | ISP: reloj |
| 5 | **D3** | → | **pin 2** (RXD, PD0) | Serie: lo que el Uno envía, el entrenador lo recibe |
| 6 | **D2** | ← | **pin 3** (TXD, PD1) | Serie: lo que el entrenador envía, el Uno lo recibe |
| 7 | **GND** | — | **pin 8** (GND) o cualquier GND de la placa | Referencia común. **Sin este cable nada funciona** |
| 8 | 5V | → | pin 7 (VCC) | **Solo** si el entrenador no tiene su propia fuente (ver abajo) |

**El serie va cruzado**: el que transmite (TX) de un lado va al que recibe (RX) del otro.
D3 del Uno transmite y va al pin 2 (RX) del micro. El pin 3 (TX) del micro va a D2 del Uno.

> **No usar los pines 0 y 1 del Uno.** Son el USB del propio Uno. El puente usa D2 y D3.

### Dónde está cada pin del ATmega328P

Visto desde arriba, con la muesca del chip hacia arriba (el pin 1 tiene un punto al lado):

```text
                             ┌────╮ ╭────┐
            Uno D10 ──► RESET│ 1       28 │
            Uno D3  ──►   RXD│ 2       27 │
            Uno D2  ◄──   TXD│ 3       26 │
                             │ 4       25 │
                             │ 5       24 │
                             │ 6       23 │POT (cursor del potenciómetro)
  (opción B) Uno 5V ──►   VCC│ 7       22 │GND
            Uno GND ───   GND│ 8       21 │AREF (solo 100 nF a GND)
                             │ 9       20 │AVCC ◄── +5V (obligatorio)
                             │ 10      19 │SCK   ◄── Uno D13
                             │ 11      18 │MISO  ──► Uno D12
                             │ 12      17 │MOSI  ◄── Uno D11
                             │ 13      16 │
                             │ 14      15 │
                             └────────────┘
```

Si la placa tiene los conectores del esquemático, se pueden usar en lugar de los pines del chip:

- **J3 (ICSP, 2×3)**: 1 MISO ← D12, 3 SCK ← D13, 4 MOSI ← D11, 5 RESET ← D10, 6 GND.
- **J2 (6 pines)**: 1 GND, 4 RXI ← D3, 5 TXO → D2. No conectar el pin 3 (VCC) al Uno.

### Alimentación: elegir una sola opción

- **Opción A (recomendada): el entrenador con su propia fuente** (jack o bornera de 9–12 V).
  No conectar el 5V del Uno. Solo se une GND.
- **Opción B: el entrenador alimentado por el Uno.** Sin fuente en el jack ni la bornera,
  cable del **5V del Uno al pin 7 (VCC)** además de GND. Sirve para probar, pero el USB da poca
  corriente para los displays.

**Nunca las dos a la vez.**

### No poner el capacitor en el RESET del Uno

Algunas guías de ArduinoISP piden un capacitor de 10 µF entre RESET y GND **del Uno**.
**Con el puente no se pone.** La app reinicia el Uno al abrir el puerto para elegir el modo; con
el capacitor no se reinicia y la segunda conexión falla.

### Revisión antes de enchufar

- [ ] Con el multímetro en continuidad: GND del Uno ↔ pin 8 del ATmega **suena**.
- [ ] D2 va al pin **3** y D3 al pin **2** (no al revés).
- [ ] Ningún cable en los pines 0 o 1 del Uno.
- [ ] Una sola alimentación (opción A u opción B).
- [ ] El chip está en su zócalo con la muesca en el lado correcto.
- [ ] Pin 20 (AVCC) a +5V y pin 22 a GND: con la placa encendida, entre 20 y 22 hay 5 V.
- [ ] El cursor (pata del medio) del potenciómetro va al pin **23**, no al 27 (que es el DIP 4).

## 3. Preparación (una sola vez)

Se hace la primera vez, o cuando se cambie el Uno o el chip del entrenador.

### 3.1 Abrir la app y elegir el puerto

1. Conectar el Uno por USB.
2. Abrir la app:

   ```bash
   cd entrenador-atmega328p/app
   ./build/bin/entrenador-bloques
   ```

3. Arriba a la derecha, en la lista de puertos, elegir el del Uno: en Linux,
   `/dev/ttyACM0 — Arduino Uno` (tras desenchufarlo puede volver como `ttyACM1`).
   Si no aparece, pulsar **⟳**.

### 3.2 Grabar el puente en el Uno

1. Pulsar **Firmware** (arriba a la derecha).
2. Pulsar **Grabar puente en el Uno**. Tarda unos 5 segundos.
3. Debe terminar en verde. Si avrdude dice `not in sync`, revisar que el Uno no tenga el
   capacitor en RESET y volver a intentar.

Esto reemplaza ArduinoISP en el Uno. El puente **sigue siendo ArduinoISP** (el Arduino IDE con
"Arduino as ISP" funciona igual) y además sabe hacer de puente serie.

### 3.3 Grabar el firmware del entrenador

1. En la misma ventana, pulsar **Grabar firmware en el entrenador**. Tarda de 20 a 40 segundos.
2. La salida de avrdude debe mostrar `Device signature = 1E 95 0F` y terminar en verde.
3. Cerrar la ventana de Firmware.

Graba el firmware `bloques`, los fusibles de 16 MHz (L 0xFF, H 0xDE, E 0xFD) y el bootloader.
**Borra el programa guardado** en el entrenador.

## 4. Uso diario

1. Conectar el Uno por USB (y la fuente del entrenador, si es la opción A).
2. Abrir la app, elegir el puerto y pulsar **Conectar**. Tarda unos 3 segundos.
3. Deben quedar en verde **Puente** y **Entrenador**. El registro (abajo a la derecha) muestra:

   ```text
   Abriendo /dev/ttyACM0...
   Puente activo
   Entrenador conectado
   ```

4. El panel **Entrenador** se actualiza solo: al girar el potenciómetro cambia la barra azul y
   al mover el DIP cambian los interruptores. Clic en un LED lo enciende en la placa.
5. Hacer el programa en **Diagrama** o **Código**, o elegir uno de **Ejemplos...**.
   **</> Generado** muestra el mismo programa como sketch de Arduino y como el bytecode que
   recibe el entrenador.
6. **▶ Ejecutar** (o Ctrl+Enter en el editor de código) lo manda al entrenador y corre al instante. **■ Detener** lo para.
7. **Guardar en la placa** lo deja en la memoria del entrenador: corre solo al encenderlo, aun
   sin el Uno ni el PC. **Borrar de la placa** lo quita.
8. Al terminar, **Desconectar** (o cerrar la app).

No hay que volver a grabar firmware para cambiar de programa: **Ejecutar** basta.

## 5. Prueba manual sin la app

Sirve para saber si el problema está en los cables o en la app. Con la app cerrada:

```bash
picocom -b 19200 --omap crlf --echo /dev/ttyACM0
```

Esperar 2 segundos (el Uno se reinicia al abrir el puerto) y escribir:

| Escribir | Respuesta esperada | Qué prueba |
|---|---|---|
| `!` | `PUENTE OK` | El Uno tiene el puente |
| `?` y Enter | `OK ENTRENADOR 1` | Los cables D2/D3/GND y el firmware del entrenador |
| `T` y Enter | `T 512 0 0 - 0 0` (pot, DIP, LEDs, número, corriendo, error) | Las entradas: el primer número cambia al girar el potenciómetro |
| `L 255` y Enter | `OK`, y se encienden los 8 LEDs | Las salidas |
| `N 42` y Enter | `OK`, y los displays muestran 42 | Los displays |

Salir de picocom con **Ctrl+A** y luego **Ctrl+X**.

## 6. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El puerto no aparece en la lista | Uno sin conectar o cable USB solo de carga | Probar otro cable o puerto USB; pulsar **⟳** |
| `permission denied` al abrir el puerto | El usuario no está en `dialout` | Agregarlo (en NixOS: `extraGroups = [ "dialout" ]` en la configuración) y volver a iniciar sesión |
| `el Uno no respondió como puente` | El Uno todavía tiene ArduinoISP | Hacer el paso 3.2 |
| Lo mismo, pero solo la segunda vez | Capacitor de 10 µF en el RESET del Uno | Quitarlo |
| Lo mismo, con otro programa abierto | El Arduino IDE o picocom tienen el puerto | Cerrar el monitor serie |
| **Puente** en verde, **Entrenador** en rojo | D2 y D3 al revés | Intercambiarlos: D3 → pin 2, D2 ← pin 3 |
| Lo mismo, con D2/D3 bien | Falta GND común, entrenador sin alimentación o sin el firmware `bloques` | Revisar GND con el multímetro, la fuente, y hacer el paso 3.3 |
| avrdude: `Device signature = 00 00 00` | Falta GND común, entrenador sin alimentación o un cable ISP suelto | Revisar GND y los cables 1–4 de la tabla |
| avrdude: `Device signature = FF FF FF` | MISO/MOSI cruzados o el cristal no oscila | D11 → pin 17, D12 → pin 18; revisar el cristal y sus capacitores de 22 pF |
| avrdude: `not in sync` / `protocol error` | El Uno no tiene el puente o ArduinoISP | Hacer el paso 3.2 |
| Conecta, pero el monitor no cambia | El programa en marcha escribe sobre los LEDs | Pulsar **■ Detener** y probar a mano |
| El potenciómetro se mueve solo, tarda segundos en llegar o no llega a 0 y 1023 | AVCC (pin 20) sin +5V, o el cursor del potenciómetro en otro pin | Medir entre los pines 20 y 22: debe dar 5 V. El cursor va al pin 23. Bien conectado, quieto varía ±2 |
| Los segmentos salen mal | Otro cableado del bus | Revisar con `firmware/prueba-mapeo` y la tabla `BIT_SEG` |

## 7. Cómo funciona por dentro

- El Uno corre [`firmware/puente-uno`](firmware/puente-uno/puente-uno.ino). Al abrir el puerto
  se reinicia y espera:
  - Si llegan comandos de avrdude, funciona como ArduinoISP.
  - Si llega el carácter `!`, responde `PUENTE OK` y desde entonces reenvía todo entre el USB y
    D2/D3 (SoftwareSerial a 19200 baudios), hasta el siguiente reinicio.
- El entrenador corre [`firmware/bloques`](firmware/bloques/bloques.ino). Recibe el programa
  compilado por la app y lo ejecuta en una máquina virtual. El protocolo de comandos de texto
  (`?`, `T`, `L`, `N`, `D`, `E`, `R`, `S`, `W`, `X`) está al principio del archivo.
- El hardware está en la biblioteca de Arduino [`Entrenador`](firmware/libraries/Entrenador/README.md),
  que comparten el firmware y los sketches que genera la app.
- La app es [`app/`](app/README.md), y el lenguaje y el diagrama están en
  [`app/lenguaje/`](app/lenguaje/README.md).
