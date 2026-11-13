#!/bin/sh
# Compila con la imagen oficial de ESP-IDF (no hace falta instalarlo) y deja en dist/
# lo que necesita esptool o el grabador web: binarios sueltos, offsets y una imagen unica.
set -e
cd "$(dirname "$0")"
IMAGEN="${IMAGEN:-espressif/idf:v5.4.2}"

docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/project -w /project "$IMAGEN" \
  sh -c '[ -f sdkconfig ] || idf.py set-target esp32; idf.py build && cd build && \
    esptool.py --chip esp32 merge_bin -o esp32-puente-merged.bin @flash_args'

mkdir -p dist
cp build/bootloader/bootloader.bin build/partition_table/partition-table.bin \
  build/esp32-puente.bin build/flasher_args.json build/flash_args \
  build/esp32-puente-merged.bin dist/
# En dist/ los .bin quedan juntos: las rutas de los argumentos tambien
sed -i -e 's|bootloader/bootloader.bin|bootloader.bin|g' \
  -e 's|partition_table/partition-table.bin|partition-table.bin|g' dist/flasher_args.json dist/flash_args
ls -l dist
