# Biblioteca Entrenador

Salidas y entradas del entrenador ATmega328P, con los nombres del lenguaje de la app
([`app/lenguaje`](../../../app/lenguaje/README.md)). La usan el firmware
[`bloques`](../../bloques/bloques.ino) y los sketches que genera la app en **Generado**.

```cpp
#include <Entrenador.h>

int16_t cuenta = 0;

void setup() {
  entrenador_iniciar();
  while (true) {
    mostrar(cuenta);
    leds(cuenta);
    esperar(300);
    cuenta = (cuenta + 1) % 100;
  }
}

void loop() {}
```

La interfaz completa está comentada en [`src/Entrenador.h`](src/Entrenador.h). El
cableado del bus se elige con `PCB` en [`src/Entrenador.cpp`](src/Entrenador.cpp)
(2 = la placa armada).

## Instalarla

- Desde la app: **Generado → Instalar biblioteca** la copia en `~/Arduino/libraries`.
- A mano: copiar esta carpeta en `~/Arduino/libraries/Entrenador` (en Windows,
  `Documentos\Arduino\libraries`), o en el IDE *Programa → Incluir biblioteca →
  Añadir biblioteca .ZIP* con esta carpeta comprimida.
- Con arduino-cli, sin instalarla: `--libraries firmware/libraries`.

El sketch se graba en el entrenador por ISP con el Uno (*Herramientas → Programador →
Arduino as ISP*, *Subir usando programador*). Reemplaza al firmware `bloques`: para
volver a usar la app hay que grabarlo de nuevo desde **Firmware**.
