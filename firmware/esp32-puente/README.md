# esp32-puente

Firmware del ESP32 (ESP-IDF, C) para el circuito integrador (ver `INTEGRADOR.md` en la raíz).
Reemplaza al Uno con `puente-uno` **solo en el serie** (TX/RX); el ATmega se sigue grabando
con el Uno como ISP:

- **Puente serie**: por el USB de la DevKit (19200 baudios) la app ve lo mismo que con el Uno.
  `!` responde `PUENTE OK`; cualquier otra línea va al entrenador por UART2 y vuelve su
  respuesta (`OK…`, `T …` o `ERR…`; si no contesta en 1 s, `ERR sin respuesta`). Lo que el
  entrenador mande por su cuenta también llega a la app.
- **Grabador ISP** (comandos `@ISP`, bit-bang a 100 kHz): está en el firmware pero **no se cablea**
  en este proyecto. Para usarlo habría que unir GPIO4/23/19/18 a J3 (ver el historial de git).
- **Nube**: con Wi-Fi, cada `periodo_ms` lee `controles` en Supabase, manda `C v1 v2 v3 v4` al
  entrenador y guarda la respuesta en `lecturas`. Sirve con Supabase local (`http://IP:54321`)
  y con el alojado (`https://…supabase.co`).
- **LED azul** (GPIO2): parpadea mientras conecta el Wi-Fi, fijo cuando conectó.

## Conexiones

| ESP32 (DevKit) | Entrenador | Nota |
|---|---|---|
| GPIO17 (TX2) | ATmega pin 2 (RXD, PD0) | 3.3 V entra directo: el ATmega lee alto desde 3.0 V |
| GPIO16 (RX2) | ATmega pin 3 (TXD, PD1) | **Divisor 1 kΩ / 2 kΩ**: 5 V → 3.3 V |
| GND | GND del entrenador | Tierra común obligatoria |

El ESP32 se alimenta por su USB y el entrenador por su jack o bornera. No unir los 5 V.
GPIO4, 18, 19 y 23 quedan sin conectar (entradas sin pull fuera de `@ISP`).

## Compilar

No hace falta instalar ESP-IDF, solo Docker:

```sh
./compilar.sh
```

Usa `espressif/idf:v5.4.2` (otra: `IMAGEN=espressif/idf:v5.x ./compilar.sh`) y deja en `dist/`:

| Archivo | Dirección |
|---|---|
| `bootloader.bin` | 0x1000 |
| `partition-table.bin` | 0x8000 |
| `esp32-puente.bin` | 0x10000 |
| `esp32-puente-merged.bin` | 0x0 (los tres juntos, para el grabador web) |

`flasher_args.json` y `flash_args` tienen las mismas direcciones y opciones (dio, 40 MHz, 4 MB).

Las pruebas de la lógica pura (líneas, comando `C`, hex, JSON, ISP) corren en la PC con gcc:

```sh
./pruebas/correr.sh
```

## Grabar

Con Docker (Linux; cambiar `/dev/ttyUSB0` por el puerto de la DevKit):

```sh
docker run --rm --device /dev/ttyUSB0 --group-add "$(stat -c %g /dev/ttyUSB0)" \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/project -w /project \
  espressif/idf:v5.4.2 idf.py -p /dev/ttyUSB0 flash
```

Con esptool (`pip install esptool`), desde `dist/`:

```sh
esptool.py --chip esp32 -p /dev/ttyUSB0 -b 460800 write_flash 0x0 esp32-puente-merged.bin
```

O desde el navegador (Chrome/Edge) con un grabador web basado en esptool-js:
`esp32-puente-merged.bin` en 0x0, o los tres `.bin` sueltos en sus direcciones. Si la DevKit no entra sola en modo descarga, mantener BOOT
apretado al empezar.

## Configurar Wi-Fi y Supabase

Abrir un terminal serie a **19200** baudios con fin de línea `\n` (por ejemplo
`picocom -b 19200 --omap crlf /dev/ttyUSB0`, o el monitor serie de Arduino) y mandar:

```text
@CONF {"ssid":"MiRed","clave":"secreta"}
@CONF {"url":"http://192.168.1.10:54321","llave":"<clave anon o publishable>"}
@CONF {"dispositivo":"entrenador-1","periodo_ms":1000}
@?
```

Cada `@CONF` guarda en NVS solo las claves que trae (sobrevive al reinicio). Si una clave es
desconocida o un valor no sirve, responde `ERR …` y no cambia nada. `@?` muestra el estado:

```text
OK ESP32 1 wifi=conectado ip=192.168.1.42 nube=ok dispositivo=entrenador-1
```

El `dispositivo` tiene que existir en la tabla `dispositivos`; si no, el POST falla y
`nube=error`.

## Comandos `@`

| Comando | Respuesta |
|---|---|
| `!` | `PUENTE OK` |
| `@?` | `OK ESP32 1 wifi=<desconectado\|conectando\|conectado> ip=<ip\|-> nube=<apagada\|ok\|error> dispositivo=<id>` |
| `@CONF <json>` | `OK` — claves `ssid`, `clave`, `url`, `llave`, `dispositivo` (texto) y `periodo_ms` (200 a 600000) |
| `@NUBE 1` / `@NUBE 0` | `OK` — activa o pausa la sincronización (queda guardado; arranca activada) |
| `@RESET` | `OK` — pulso de 20 ms en RESET (si estaba grabando, antes suelta J3) |
| `@ISP INICIO` | `OK 1E950F` — RESET abajo, modo programación y firma |
| `@ISP BORRAR` | `OK` — borrado del chip (flash, y EEPROM si EESAVE no está programado) |
| `@ISP PAGINA <dir> <hex>` | `OK` — `<dir>` en bytes, múltiplo de 128; hasta 128 bytes (impar: se completa con FF) |
| `@ISP LEER <dir> <n>` | `OK <hex>` — n de 1 a 128 bytes |
| `@ISP FUSIBLES` | `OK <lfuse> <hfuse> <efuse> <lock>` |
| `@ISP FUSIBLE <L\|H\|E\|B> <hex>` | `OK` — `B` = bits de bloqueo. Rechaza un hfuse con RSTDISBL o DWEN programados |
| `@ISP FIN` | `OK` — suelta J3 y deja correr al ATmega |

Para grabar el ATmega: `@ISP INICIO`, `@ISP BORRAR`, una `@ISP PAGINA` por cada página con
datos, verificar con `@ISP LEER` y `@ISP FIN`. Los fusibles de un Arduino Uno son
`L FF`, `H DE`, `E FD`.

## Código

| Archivo | Qué hace |
|---|---|
| `main/principal.c` | `app_main`, UART0 hacia la app y los comandos `@` |
| `main/entrenador.c` | UART2, el mutex de las transacciones y las líneas sueltas del ATmega |
| `main/isp.c` | Programación serie del ATmega328P por bit-bang |
| `main/wifi.c` | Estación Wi-Fi con reconexión y el LED |
| `main/nube.c` | Ciclo GET controles → `C` → POST lecturas |
| `main/config.c` | Configuración en NVS (`@CONF`, `@NUBE`) |
| `main/protocolo.c` | Lógica pura sin ESP-IDF (la prueban `pruebas/`) |

La consola de ESP-IDF está apagada (`sdkconfig.defaults`): UART0 es solo del protocolo. Al
resetear, la ROM del ESP32 igual imprime unas líneas a 115200 baudios; la app las ignora.
