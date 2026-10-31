#!/usr/bin/env bash
# Prueba lenguaje + maquina virtual sin hardware: compila los ejemplos (app/lenguaje) y
# los ejecuta en firmware/bloques/maquina.h compilado para el PC.
#
#   ./correr.sh [ms a simular] [pot 0..1023]
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
ms="${1:-2000}"
pot="${2:-512}"
temporal="$(mktemp -d)"
trap 'rm -r "$temporal"' EXIT

g++ -std=c++17 -Wall -Wextra -o "$temporal/maquina_prueba" "$aqui/maquina_prueba.cpp"
node --no-warnings "$aqui/../lenguaje/herramientas/hex-ejemplos.ts" > "$temporal/ejemplos.tsv"

fallos=0
while IFS=$'\t' read -r nombre hex; do
  echo "=== $nombre ($(( ${#hex} / 2 )) bytes)"
  "$temporal/maquina_prueba" "$hex" "$ms" "$pot" || fallos=$((fallos + 1))
done < "$temporal/ejemplos.tsv"

exit "$fallos"
