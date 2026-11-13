#!/bin/sh
# Compila y corre en la PC las pruebas de la logica pura (main/protocolo.c).
set -e
cd "$(dirname "$0")"
salida="${TMPDIR:-/tmp}/esp32-puente-pruebas"
gcc -std=c11 -Wall -Wextra -Werror -fsanitize=address,undefined -g \
  -o "$salida" pruebas.c ../main/protocolo.c
"$salida"
