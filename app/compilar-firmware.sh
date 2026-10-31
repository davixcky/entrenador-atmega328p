#!/usr/bin/env bash
# Compila firmware/bloques y firmware/puente-uno y deja los .hex en app/firmware/,
# donde avrdude.go los incrusta en el ejecutable; copia ahi tambien la biblioteca
# Entrenador, que incrusta sketch.go. Requiere arduino-cli + arduino:avr.
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
salida="$raiz/app/firmware"
temporal="$(mktemp -d)"
trap 'rm -r "$temporal"' EXIT

mkdir -p "$salida"
arduino-cli compile -b arduino:avr:uno --libraries "$raiz/firmware/libraries" --output-dir "$temporal/bloques" "$raiz/firmware/bloques"
arduino-cli compile -b arduino:avr:uno --output-dir "$temporal/puente" "$raiz/firmware/puente-uno"

# El entrenador se graba por ISP: lleva Optiboot para poder usar tambien un FTDI.
cp "$temporal/bloques/bloques.ino.with_bootloader.hex" "$salida/bloques.hex"
# El Uno se graba por su propio bootloader: solo el programa.
cp "$temporal/puente/puente-uno.ino.hex" "$salida/puente-uno.hex"

# La biblioteca va incrustada en la app para instalarla desde "Generado".
rm -rf "$salida/Entrenador"
cp -r "$raiz/firmware/libraries/Entrenador" "$salida/Entrenador"
echo "Firmware y biblioteca listos en $salida"
