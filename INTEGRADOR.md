# Circuito integrador (actividad 15.3): entrenador ATmega328P + ESP32 + nube propia

Enunciado: conectar por serie un ATmega328P (UC1, el entrenador) y un ESP32 (UC2).
El potenciómetro de UC1 se muestra en un tablero en la nube; desde el tablero se fija
VALOR1 (0 a 100), que vuelve a UC1 y controla con PWM el brillo de un LED. Un LCD en
UC1 muestra el ADC y VALOR1.

Cambios respecto al enunciado, aprobados por el profesor:

- **LCD por I2C** (módulo PCF8574). El entrenador no tiene pines libres para un LCD en
  paralelo; el I2C del ATmega usa PC4 (SDA, también DIP4) y PC5 (SCL, libre en la placa
  armada). Con el LCD conectado, DIP4 debe quedar abierto.
- **Nube propia** en lugar de Arduino Cloud: Supabase (local con Docker para
  desarrollar, el mismo esquema en el Supabase alojado) y el tablero dentro de la app.

## Arquitectura

```text
App (web: Chrome/Edge con Web Serial, o escritorio: Wails)
   │ USB (19200 baudios)
   ▼
ESP32 (firmware/esp32-puente, ESP-IDF)
   ├─ UART2 19200 (solo TX/RX) ─▶ ATmega328P (firmware/bloques, máquina virtual)
   └─ Wi-Fi ── HTTP(S) REST ───▶ Supabase (nube/): lecturas ↑  controles ↓
```

El ESP32 reemplaza al Uno **solo como puente serie**: responde al `!` de la app con
`PUENTE OK`, así la app de escritorio actual funciona sin cambios para monitorear y cargar
programas. **El ESP32 no graba al ATmega**: el firmware `bloques` versión 2 se graba una vez
con el Uno como ISP por J3, como antes (app de escritorio → *Firmware → Con el Arduino Uno*,
o `arduino-cli upload -P arduinoasisp`). Los programas del lenguaje se cargan por serie y no
necesitan ISP.

## Conexiones ESP32 ↔ entrenador

Esquemático: bloque **ESP32 Y LCD I2C** del esquemático del entrenador
([`kicad/esquematico.pdf`](kicad/esquematico.pdf), hoja A2, revisión 4; ERC sin errores). El LCD
va al ATmega (pines 27 y 28). U5 (ESP32),
U6 (LCD), R20 y R21 se cablean aparte: están marcados "no va en la placa" y la PCB de
`kicad/` no cambia.


| ESP32 (DevKit) | Entrenador | Nota |
|---|---|---|
| GPIO17 (TX2) | ATmega pin 2 (RXD, PD0) | 3.3 V entra directo: el ATmega lee alto desde 3.0 V |
| GPIO16 (RX2) | ATmega pin 3 (TXD, PD1) | **Divisor 1 kΩ / 2 kΩ**: 5 V → 3.3 V (el ESP32 no tolera 5 V) |
| GND | GND del entrenador (J2 o J3-6) | Tierra común obligatoria |

Son tres cables. Los pines GPIO16/17 son los de un ESP32-WROOM (en un WROVER los usa la
PSRAM).

El ESP32 se alimenta por su USB; el entrenador por su jack/bornera (7805). No unir los 5 V.

LCD I2C (PCF8574, dirección 0x20–0x27 o 0x38–0x3F, se detecta sola): SDA → ATmega pin 27
(PC4), SCL → pin 28 (PC5), VCC → +5V, GND → GND.

El pin 28 (PC5) no tiene nada más conectado en la placa armada. **DIP4 (pin 27 = SDA) debe
quedar abierto**: cerrado pone SDA a GND y el LCD no responde.

## Protocolo serie del entrenador (firmware/bloques, versión 2)

Por líneas, 19200 baudios, una respuesta por comando. Igual que la versión 1 más:

| Comando | Respuesta | Uso |
|---|---|---|
| `?` | `OK ENTRENADOR 2` | versión 2 = tiene LCD, brillo y nube |
| `C [e1 [e2 [e3 [e4]]]]` | `OK <s1> <s2> <s3> <s4>` | el ESP32 fija las entradas de la nube (las que vengan, en orden) y lee las salidas |

Salidas `s1..s4`: las escribe el programa con `nube_enviar(n, valor)`.
Entradas `e1..e4`: las lee el programa con `nube(n)`. Para la actividad: s1 = ADC, e1 = VALOR1.
Todos los valores son enteros de -32768 a 32767.

## Comandos del ESP32 (empiezan con `@`; el resto de líneas va al entrenador)

| Comando | Respuesta |
|---|---|
| `!` | `PUENTE OK` (compatibilidad con la app de escritorio) |
| `@?` | `OK ESP32 1 wifi=<desconectado\|conectando\|conectado> ip=<ip\|-> nube=<apagada\|ok\|error> dispositivo=<id>` |
| `@CONF <json>` | `OK` — guarda en NVS las claves que vengan: `ssid`, `clave`, `url`, `llave`, `dispositivo`, `periodo_ms` |
| `@NUBE 1` / `@NUBE 0` | `OK` — activa o pausa la sincronización |
| `@RESET` | `OK` — pulso de reset en GPIO4 (no cableado: sin efecto) |
| `@ISP INICIO` | `OK <firma hex, ej. 1E950F>` — reset abajo y modo programación |
| `@ISP BORRAR` | `OK` — borrado del chip |
| `@ISP PAGINA <dir> <hex>` | `OK` — escribe una página de flash; `<dir>` en bytes (múltiplo de 128), hasta 128 bytes |
| `@ISP LEER <dir> <n>` | `OK <hex>` — lee n bytes (máx. 128) desde la dirección de byte dir |
| `@ISP FUSIBLES` | `OK <lfuse> <hfuse> <efuse> <lock>` (hex) |
| `@ISP FUSIBLE <L\|H\|E> <hex>` | `OK` |
| `@ISP FUSIBLE B <hex>` | `OK` — bits de bloqueo (lock) |
| `@ISP FIN` | `OK` — suelta las líneas y deja correr al ATmega |

Los comandos `@RESET` y `@ISP` siguen en el firmware del ESP32 pero no se usan: GPIO4, 18, 19
y 23 no van al entrenador (fuera de `@ISP` quedan como entradas, así que no molestan).

Protecciones del ESP32: `@ISP FUSIBLE H` rechaza valores que apaguen RSTDISBL o DWEN (el
chip quedaría sin ISP); `@CONF` valida todas las claves antes de guardar (`periodo_ms` de
200 a 600000); las palabras clave no distinguen mayúsculas.

Errores: `ERR <motivo>`. Mientras un comando espera respuesta del entrenador no se
procesa otro; si no responde en 1 s: `ERR sin respuesta`.

## Nube (Supabase, carpeta nube/)

- `dispositivos (id text pk, nombre text, creado_en timestamptz)`
- `lecturas (id bigint identity, dispositivo text → dispositivos, salidas smallint[4], entradas smallint[4], creado_en timestamptz)`
- `controles (dispositivo text pk → dispositivos, entradas smallint[4] default {0,0,0,0}, actualizado_en timestamptz)`

Ciclo del ESP32 (cada `periodo_ms`, 1000 por defecto):

1. `GET {url}/rest/v1/controles?dispositivo=eq.{id}&select=entradas` → `[{"entradas":[v1,v2,v3,v4]}]`
2. Al entrenador: `C v1 v2 v3 v4` → `OK s1 s2 s3 s4`
3. `POST {url}/rest/v1/lecturas` con `{"dispositivo":id,"salidas":[s1..s4],"entradas":[v1..v4]}`

Cabeceras: `apikey: {llave}` y `Authorization: Bearer {llave}` (clave anon/publishable).
El tablero de la app lee `lecturas` en tiempo real y escribe `controles.entradas`.

## Programa de la actividad (lenguaje del entrenador)

```text
lcd_limpiar()
lcd_texto(0, 0, "ADC:")
lcd_texto(1, 0, "VALOR1:")
siempre {
  adc = pot()
  nube_enviar(1, adc)
  valor1 = nube(1)
  brillo(valor1)
  leds(0b00000001)
  lcd_numero(0, 8, adc, 4)
  lcd_numero(1, 8, valor1, 4)
  esperar(200)
}
```

Funciones nuevas del lenguaje: `lcd_limpiar()`, `lcd_texto(fila, columna, "texto")`,
`lcd_numero(fila, columna, numero, ancho)`, `brillo(0..100)` (PWM del grupo de LEDs),
`nube_enviar(n, valor)` y `nube(n)` (n de 1 a 4).

## Cómo ponerlo a andar

1. **Nube local** (Docker): `cd nube && npm install && npm start`, luego `npm run llaves` y
   copiar `API_URL` y `ANON_KEY` a `nube/.env.local` (ver `nube/.env.example`). Prueba:
   `npm run probar`. Para el Supabase alojado: `nube/README.md` (`supabase link` + `db push`).
2. **App**:
   - Web: `cd app/frontend && npm install && npm run dev` y abrir **http://localhost:5173**
     en Chrome o Edge (Web Serial solo funciona en `localhost` o `https`).
     `npm run build` deja la versión publicable en `app/frontend/dist/`.
   - Escritorio: como siempre (`app/README.md`); usa la misma interfaz.
3. **ESP32**: `firmware/esp32-puente/compilar.sh` (Docker con ESP-IDF 5.4) y grabarlo desde la
   app web (*Firmware → Grabar ESP32*) o con `idf.py flash`.
4. **Firmware del entrenador** (una vez): grabar `bloques` versión 2 con el Uno como ISP
   (app de escritorio → *Firmware → Con el Arduino Uno*). Ya incluye LCD, brillo y nube.
5. **Cables** de la tabla de arriba (TX/RX con el divisor y GND) y el LCD (DIP4 abierto).
6. En la app: **Conectar** al puerto del ESP32 → *Firmware → Wi-Fi y nube del ESP32*: red,
   clave, `http://<IP del PC>:54321` y la clave anon.
7. Cargar el ejemplo **Integrador ESP32 (nube)** → *Guardar en la placa* y abrir **Nube**:
   el ADC aparece en vivo y el control de VALOR1 cambia el brillo del LED 0.

## Pruebas sin hardware

| Qué | Comando | Resultado |
|---|---|---|
| Lenguaje (texto, diagrama, compilador) | `cd app/lenguaje && npm test` | 20 pruebas |
| Máquina virtual vs. sketch generado | `cd app/pruebas && ./comparar.sh` | los 7 ejemplos iguales y compilan para el Uno |
| Protocolo, HEX e ISP del frontend | `cd app/frontend && npm test` | 6 pruebas |
| Lógica del ESP32 en el PC | `firmware/esp32-puente/pruebas/correr.sh` | 95 verificaciones |
| Esquema y políticas de la nube | `cd nube && npm run probar` | todo OK |

Probado en el navegador contra la nube local, simulando al ESP32 con las mismas llamadas
REST: el tablero muestra las lecturas en vivo y el control de VALOR1 queda en `controles`.
Falta probar con la placa: ver la lista "Por verificar en hardware" en
`firmware/esp32-puente/README.md`.
