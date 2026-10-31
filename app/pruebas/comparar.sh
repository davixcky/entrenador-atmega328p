#!/usr/bin/env bash
# Comprueba que el sketch de Arduino generado hace lo mismo que el bytecode: corre cada
# ejemplo en la maquina virtual (maquina_prueba) y como C++ con la biblioteca simulada
# (sketch_prueba), y compara la secuencia de salidas. Con arduino-cli instalado, tambien
# compila cada sketch para el Uno con la biblioteca real.
#
#   ./comparar.sh [ms a simular] [pot 0..1023]
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
raiz="$(cd "$aqui/../.." && pwd)"
ms="${1:-3000}"
pot="${2:-700}"
temporal="$(mktemp -d)"
trap 'rm -r "$temporal"' EXIT

g++ -std=c++17 -Wall -Wextra -o "$temporal/maquina_prueba" "$aqui/maquina_prueba.cpp"
node --no-warnings "$aqui/../lenguaje/herramientas/arduino-ejemplos.ts" "$temporal/sketches" > "$temporal/ejemplos.tsv"

# Solo la secuencia de estados: los tiempos difieren un poco (la maquina virtual tarda 1 ms
# cada 50 instrucciones). Se compara hasta donde llega la mas corta.
estados() { sed -E 's/^ *[0-9]+ ms  //' "$1" | grep -v '^fin:'; }

fallos=0
while IFS=$'\t' read -r sketch nombre hex; do
  ino="$temporal/sketches/$sketch/$sketch.ino"
  g++ -std=c++17 -Wall -Wextra -Werror -x c++ -DSKETCH="\"$ino\"" -I "$aqui/entrenador-pc" -o "$temporal/$sketch" "$aqui/sketch_prueba.cpp"
  "$temporal/maquina_prueba" "$hex" "$ms" "$pot" esperas > "$temporal/$sketch.vm"
  "$temporal/$sketch" "$ms" "$pot" > "$temporal/$sketch.cpp.txt"
  estados "$temporal/$sketch.vm" > "$temporal/a"
  estados "$temporal/$sketch.cpp.txt" > "$temporal/b"
  n=$(( $(wc -l < "$temporal/a") < $(wc -l < "$temporal/b") ? $(wc -l < "$temporal/a") : $(wc -l < "$temporal/b") ))
  if [ "$n" -gt 0 ] && cmp -s <(head -n "$n" "$temporal/a") <(head -n "$n" "$temporal/b"); then
    resultado="igual ($n estados)"
  else
    resultado="DISTINTO"
    fallos=$((fallos + 1))
    diff <(head -n "$n" "$temporal/a") <(head -n "$n" "$temporal/b") | head -10 || true
  fi
  if command -v arduino-cli > /dev/null; then
    if arduino-cli compile -b arduino:avr:uno --libraries "$raiz/firmware/libraries" "$temporal/sketches/$sketch" > "$temporal/$sketch.avr" 2>&1; then
      resultado="$resultado, compila para el Uno ($(grep -o '[0-9]* bytes' "$temporal/$sketch.avr" | head -1))"
    else
      resultado="$resultado, NO COMPILA para el Uno"
      fallos=$((fallos + 1))
      tail -20 "$temporal/$sketch.avr"
    fi
  fi
  echo "$nombre: $resultado"
done < "$temporal/ejemplos.tsv"

exit "$fallos"
