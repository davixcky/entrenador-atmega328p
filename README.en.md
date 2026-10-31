# ATmega328P trainer

*Español: [README.md](README.md) · Website: <https://davixcky.github.io/entrenador-atmega328p/>*

Project for **Embedded Systems 1 — Activity 10.1.12** at Universidad de la Costa (CUC). A trainer board with an ATmega328P at 16 MHz, a potentiometer, a DIP switch, 8 LEDs and two 7-segment displays, programmed from a desktop app with a node diagram or with code in a small Spanish language.

**Status:** hardware built and working. Firmware, app, Arduino library, KiCad design and presentation are in this repository. Most documents are in Spanish; the user guide and the language reference have English versions.

## Documentation

| File | Contents |
|---|---|
| [User guide](USER-GUIDE.md) · [PDF](USER-GUIDE.pdf) · [Español](GUIA-USO.md) | Uno ↔ trainer wiring, setup, everyday use and troubleshooting |
| [Schematic](kicad/esquematico.pdf) · [Connections](kicad/CONEXIONES.md) | Circuit and pin-by-pin wiring |
| [Programming app](app/README.md) (Spanish) | Node diagram and code, live monitor, generated code and flashing |
| [Trainer language](app/lenguaje/README.en.md) · [Español](app/lenguaje/README.md) | Syntax, functions, diagram and translation to Arduino |
| [Entrenador library](firmware/libraries/Entrenador/README.md) (Spanish) | Arduino library for the hardware, with the language's names |
| [Technical log](REGISTRO-TECNICO.md) (Spanish) | Procedures, tests and development notes |
| [KiCad project](kicad/entrenador-atmega328p.kicad_pro) · [Fabrication](kicad/fabricacion/) | PCB design and fabrication files |
| [Slides PDF](presentacion/presentacion-final.pdf) · [PowerPoint](presentacion/presentacion-final.pptx) | Project presentation (Spanish) |
| [Website](web/README.md) | Site source (Astro), published on GitHub Pages |

## How it is used

```text
 PC (app) ──USB──> Arduino Uno ──ISP D10..D13──> trainer's ATmega328P
                    (puente-uno) ──serial D2/D3──> (bloques firmware)
```

1. Wire the Uno to the trainer as shown in the [user guide](USER-GUIDE.md#2-wiring).
2. Open the app ([`app/`](app/README.md)) and, from **Firmware**, flash the bridge to the Uno and the firmware to the trainer.
3. Click **Conectar** (*connect*), write the program in **Diagrama** or **Código**, and click **▶ Ejecutar** (*run*).

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

**Generado** (*generated*) shows the same program as an Arduino sketch that uses the [`Entrenador`](firmware/libraries/Entrenador/README.md) library, ready for the Arduino IDE.

## Firmware

| Folder | What it does |
|---|---|
| [`firmware/bloques`](firmware/bloques/bloques.ino) | Firmware for the app: receives programs over serial and runs them in a virtual machine |
| [`firmware/puente-uno`](firmware/puente-uno/puente-uno.ino) | For the Uno: ArduinoISP plus a serial bridge to the trainer |
| [`firmware/libraries/Entrenador`](firmware/libraries/Entrenador/README.md) | Shared hardware layer: Timer2 multiplexing, bus wiring, inputs |
| [`firmware/entrenador`](firmware/entrenador/entrenador.ino) | Original stand-alone firmware: four modes chosen with the DIP switch |
| `firmware/prueba-*` | Hardware test sketches |

The original firmware (`entrenador`) uses DIP switches SW2/SW1 to choose the mode; **1 means switch closed**:

| SW2 SW1 | Mode | Function |
|---|---|---|
| 00 | ADC | Potentiometer as 00–99 and an LED bar |
| 01 | Counter | Counts 00–99; speed set with the potentiometer |
| 10 | DIP | Shows 02, 06, 10 or 14 as SW3/SW4 change |
| 11 | Sequence | An LED sweeps both ways; adjustable speed |

To build it and flash it with the Uno as ISP:

```bash
arduino-cli compile -b arduino:avr:uno firmware/entrenador
arduino-cli upload -b arduino:avr:uno -P arduinoasisp \
  -p <uno-port> firmware/entrenador
```

`PCB 2` (the default) is the wiring of the hand-built board; `PCB 1` is the KiCad PCB and `PCB 0` the breadboard.

Development photos are in [`capturas/`](capturas/).
