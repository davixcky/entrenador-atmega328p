# Entrenador ATmega328P

Proyecto de **Sistemas Embebidos 1 — Actividad 10.1.12**. Entrenador con ATmega328P a 16 MHz, potenciómetro, DIP switch, 8 LEDs y 2 displays de 7 segmentos.

**Estado:** hardware funcional terminado. Firmware, diseño KiCad y presentación disponibles en este repositorio.

## Documentación

| Archivo | Contenido |
|---|---|
| [Presentación PDF](presentacion/presentacion-final.pdf) · [PowerPoint](presentacion/presentacion-final.pptx) | Hardware y funcionamiento del firmware |
| [Guion](presentacion/guion.pdf) | Notas para preparar la exposición |
| [Esquemático](kicad/esquematico.pdf) · [Conexiones](kicad/CONEXIONES.md) | Circuito y cableado pin a pin |
| [Proyecto KiCad](kicad/entrenador-atmega328p.kicad_pro) · [Fabricación](kicad/fabricacion/) | Diseño de PCB y archivos de fabricación |
| [Registro técnico](REGISTRO-TECNICO.md) | Procedimientos, pruebas y notas del desarrollo |

## Firmware

El programa principal está en [`firmware/entrenador/entrenador.ino`](firmware/entrenador/entrenador.ino). Lee las entradas en `loop()` y refresca LEDs y displays mediante una interrupción de Timer2 cada 2 ms.

Las posiciones SW2/SW1 del DIP seleccionan el modo; **1 significa interruptor cerrado**.

| SW2 SW1 | Modo | Función |
|---|---|---|
| 00 | ADC | Potenciómetro en 00–99 y barra de LEDs |
| 01 | Contador | Cuenta 00–99; velocidad ajustable con el potenciómetro |
| 10 | DIP | Muestra 02, 06, 10 o 14 al cambiar SW3/SW4 |
| 11 | Secuencia | LED que recorre ambos sentidos; velocidad ajustable |

## Compilar y cargar

Con `arduino-cli` y el núcleo `arduino:avr` instalados, ejecutar desde la raíz del repositorio:

```bash
arduino-cli compile -b arduino:avr:uno firmware/entrenador
arduino-cli upload -b arduino:avr:uno -P arduinoasisp \
  -p <puerto-del-uno> firmware/entrenador
```

Para cargar, el Uno debe tener `ArduinoISP` y estar conectado al entrenador por ICSP. Reemplazar `<puerto-del-uno>` por el puerto real. El procedimiento de conexión y configuración está en el [registro técnico](REGISTRO-TECNICO.md#7-programación-arduino-uno-como-isp).

El firmware usa `PCB 1` para el diseño de KiCad y `PCB 0` para el cableado secuencial de protoboard. Elegir el que corresponda al montaje antes de compilar.

Los sketches de prueba están en [`firmware/`](firmware/); las fotos del desarrollo, en [`capturas/`](capturas/). Para editar o presentar las diapositivas, consultar [`presentacion/`](presentacion/README.md).
