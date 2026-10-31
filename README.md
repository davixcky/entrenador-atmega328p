# Entrenador ATmega328P

*English: [README.en.md](README.en.md) · Sitio web: <https://davixcky.github.io/entrenador-atmega328p/>*

Proyecto de **Sistemas Embebidos 1 — Actividad 10.1.12**. Entrenador con ATmega328P a 16 MHz, potenciómetro, DIP switch, 8 LEDs y 2 displays de 7 segmentos, que se programa desde una app de escritorio con un diagrama de nodos o con código en español.

**Estado:** hardware armado y funcionando. Firmware, app, biblioteca de Arduino, diseño KiCad y presentación en este repositorio.

## Documentación

| Archivo | Contenido |
|---|---|
| [Guía de conexión y uso](GUIA-USO.md) · [PDF](GUIA-USO.pdf) · [English](USER-GUIDE.md) | Cables Uno ↔ entrenador, preparación, uso diario y solución de problemas |
| [Esquemático](kicad/esquematico.pdf) · [Conexiones](kicad/CONEXIONES.md) | Circuito y cableado pin a pin |
| [App de programación](app/README.md) | Diagrama de nodos y código, monitor en vivo, código generado y grabación |
| [Lenguaje del entrenador](app/lenguaje/README.md) · [English](app/lenguaje/README.en.md) | Sintaxis, funciones, diagrama y traducción a Arduino |
| [Biblioteca Entrenador](firmware/libraries/Entrenador/README.md) | Biblioteca de Arduino del hardware, con los nombres del lenguaje |
| [Registro técnico](REGISTRO-TECNICO.md) | Procedimientos, pruebas y notas del desarrollo |
| [Proyecto KiCad](kicad/entrenador-atmega328p.kicad_pro) · [Fabricación](kicad/fabricacion/) | Diseño de PCB y archivos de fabricación |
| [Presentación PDF](presentacion/presentacion-final.pdf) · [PowerPoint](presentacion/presentacion-final.pptx) · [Guion](presentacion/guion.pdf) | Exposición del proyecto |
| [Sitio web](web/README.md) | Fuente del sitio (Astro), publicado en GitHub Pages |

## Cómo se usa

```text
 PC (app) ──USB──> Arduino Uno ──ISP D10..D13──> ATmega328P del entrenador
                    (puente-uno) ──serie D2/D3───> (firmware bloques)
```

1. Cablear el Uno al entrenador como dice la [guía](GUIA-USO.md#2-conexiones).
2. Abrir la app ([`app/`](app/README.md)), grabar el puente en el Uno y el firmware en el entrenador desde **Firmware**.
3. **Conectar**, escribir el programa en **Diagrama** o **Código** y pulsar **▶ Ejecutar**.

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

**Generado** muestra el mismo programa como sketch de Arduino con la biblioteca [`Entrenador`](firmware/libraries/Entrenador/README.md), para compilarlo en el IDE de Arduino.

## Firmware

| Carpeta | Qué hace |
|---|---|
| [`firmware/bloques`](firmware/bloques/bloques.ino) | Firmware de la app: recibe programas por serie y los corre en una máquina virtual |
| [`firmware/puente-uno`](firmware/puente-uno/puente-uno.ino) | Para el Uno: ArduinoISP más puente serie hacia el entrenador |
| [`firmware/libraries/Entrenador`](firmware/libraries/Entrenador/README.md) | Hardware compartido: multiplexado con Timer2, cableado del bus, entradas |
| [`firmware/entrenador`](firmware/entrenador/entrenador.ino) | Firmware original sin app: cuatro modos elegidos con el DIP |
| `firmware/prueba-*` | Sketches de prueba del hardware |

El firmware original (`entrenador`) usa SW2/SW1 del DIP para elegir el modo; **1 significa interruptor cerrado**:

| SW2 SW1 | Modo | Función |
|---|---|---|
| 00 | ADC | Potenciómetro en 00–99 y barra de LEDs |
| 01 | Contador | Cuenta 00–99; velocidad ajustable con el potenciómetro |
| 10 | DIP | Muestra 02, 06, 10 o 14 al cambiar SW3/SW4 |
| 11 | Secuencia | LED que recorre ambos sentidos; velocidad ajustable |

Para compilarlo y cargarlo con el Uno como ISP:

```bash
arduino-cli compile -b arduino:avr:uno firmware/entrenador
arduino-cli upload -b arduino:avr:uno -P arduinoasisp \
  -p <puerto-del-uno> firmware/entrenador
```

`PCB 2` (por defecto) es el cableado de la placa armada; `PCB 1`, el de la PCB de KiCad, y `PCB 0`, el de protoboard. Más detalles en el [registro técnico](REGISTRO-TECNICO.md#7-programación-arduino-uno-como-isp).

Las fotos del desarrollo están en [`capturas/`](capturas/). Para editar o presentar las diapositivas, consultar [`presentacion/`](presentacion/README.md).
