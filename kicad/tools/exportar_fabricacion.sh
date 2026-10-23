#!/usr/bin/env bash
# Exporta todo lo necesario para fabricar la PCB de una cara:
#   toner/  -> PDFs a escala 1:1 para imprimir en laser (transferencia de toner)
#   cnc/    -> Gerber + taladros Excellon (FlatCAM / Candle / bCNC)
#   *.png   -> vistas 3D para el informe
set -euo pipefail
cd "$(dirname "$0")/.."
PCB=entrenador-atmega328p.kicad_pcb
OUT=fabricacion
q() { grep -v -e assert -e '^Plotted' -e '^Done' -e '^$' || true; }

rm -rf "$OUT"
mkdir -p "$OUT/toner" "$OUT/cnc"

# Cobre (B.Cu) SIN espejo: el papel va boca abajo sobre el cobre, asi queda bien.
# Comprobacion: el texto de cobre se lee AL REVES en el papel.
kicad-cli pcb export pdf --mode-single --black-and-white --drill-shape-opt 1 \
  --layers B.Cu,Edge.Cuts -o "$OUT/toner/1-cobre-B_Cu-1a1.pdf" "$PCB" 2>&1 | q
# Serigrafia del lado de componentes (opcional), en espejo para transferirla arriba
kicad-cli pcb export pdf --mode-single --black-and-white --mirror --drill-shape-opt 0 \
  --layers F.Silkscreen,Edge.Cuts -o "$OUT/toner/2-serigrafia-F_SilkS-espejo-1a1.pdf" "$PCB" 2>&1 | q
# Guia de montaje en color: componentes + pistas vistas desde arriba
kicad-cli pcb export pdf --mode-single --drill-shape-opt 2 \
  --layers B.Cu,F.Silkscreen,F.Fab,Edge.Cuts -o "$OUT/guia-montaje.pdf" "$PCB" 2>&1 | q
# Vista del cobre como se ve al soldar (desde abajo)
kicad-cli pcb export pdf --mode-single --mirror --drill-shape-opt 2 \
  --layers B.Cu,Edge.Cuts -o "$OUT/vista-cobre-desde-abajo.pdf" "$PCB" 2>&1 | q

# CNC: Gerber y taladros con origen en la esquina de la placa
kicad-cli pcb export gerbers --layers B.Cu,F.Silkscreen,B.Mask,Edge.Cuts \
  --use-drill-file-origin --no-protel-ext -o "$OUT/cnc/" "$PCB" 2>&1 | q
kicad-cli pcb export drill --format excellon --excellon-units mm --drill-origin plot \
  --excellon-separate-th -o "$OUT/cnc/" "$PCB" 2>&1 | q
( cd "$OUT/cnc" && zip -q gerbers-entrenador.zip ./* )

# Vista previa del cobre para el informe (recortada al borde de la placa)
pdftoppm -r 200 -png -singlefile "$OUT/toner/1-cobre-B_Cu-1a1.pdf" "$OUT/vista-toner"
magick "$OUT/vista-toner.png" -trim +repage -bordercolor white -border 20 "$OUT/vista-toner.png"

# Vistas 3D
kicad-cli pcb render --side top --quality high --width 1800 --height 1600 --background opaque \
  -o "$OUT/render-arriba.png" "$PCB" 2>&1 | q
kicad-cli pcb render --side bottom --quality high --width 1800 --height 1600 --background opaque \
  -o "$OUT/render-abajo.png" "$PCB" 2>&1 | q

# DRC
kicad-cli pcb drc --severity-error --schematic-parity -o "$OUT/drc.rpt" "$PCB" 2>&1 | q
grep -E "Found|\*\* " "$OUT/drc.rpt" || true
echo "listo: $OUT/"
