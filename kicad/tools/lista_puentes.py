"""Genera fabricacion/PUENTES.md: lista de puentes de alambre de la PCB de una cara."""
import math
import os

import pcbnew
from pcbnew import ToMM

HERE = os.path.dirname(os.path.abspath(__file__))
PRJ = os.path.abspath(os.path.join(HERE, '..'))
board = pcbnew.LoadBoard(os.path.join(PRJ, 'entrenador-atmega328p.kicad_pcb'))
org = board.GetDesignSettings().GetAuxOrigin()


def near(x, y):
    """Componente mas cercano a un agujero del puente (para ubicarlo en la placa)."""
    best = None
    for f in board.GetFootprints():
        ref = f.GetReference()
        if ref.startswith(('JP', 'H')):
            continue
        for p in f.Pads():
            d = math.hypot(ToMM(p.GetPosition().x) - x, ToMM(p.GetPosition().y) - y)
            if best is None or d < best[0]:
                best = (d, '%s.%s' % (ref, p.GetNumber()))
    return best[1]


# patio de cada pieza (para saber bajo que piezas pasa cada alambre)
boxes = {}
for f in board.GetFootprints():
    ref = f.GetReference()
    if ref.startswith(('JP', 'H')):
        continue
    cy = f.GetCourtyard(pcbnew.F_CrtYd)
    bb = cy.BBox() if cy.OutlineCount() else f.GetBoundingBox(False)
    boxes[ref] = (ToMM(bb.GetLeft()), ToMM(bb.GetTop()), ToMM(bb.GetRight()), ToMM(bb.GetBottom()))


def under(a, b):
    out = set()
    n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2))
    for k in range(1, n):
        x, y = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
        out |= {r for r, (x0, y0, x1, y1) in boxes.items() if x0 < x < x1 and y0 < y < y1}
    return out


rows = []
for f in board.GetFootprints():
    ref = f.GetReference()
    if not ref.startswith('JP'):
        continue
    pads = list(f.Pads())
    net = pads[0].GetNetname().lstrip('/')
    holes = []
    for p in pads:
        x, y = ToMM(p.GetPosition().x), ToMM(p.GetPosition().y)
        holes.append('(%.1f, %.1f) junto a %s' % (x - ToMM(org.x), y - ToMM(org.y), near(x, y)))
    length, segs, crossed = 0.0, 0, set()
    for item in f.GraphicalItems():
        if item.GetLayer() == pcbnew.F_SilkS and item.GetShape() == pcbnew.SHAPE_T_SEGMENT:
            a, b = item.GetStart(), item.GetEnd()
            length += math.hypot(ToMM(a.x - b.x), ToMM(a.y - b.y))
            segs += 1
            crossed |= under((ToMM(a.x), ToMM(a.y)), (ToMM(b.x), ToMM(b.y)))
    bends = segs - (len(pads) - 1)
    rows.append((int(ref[2:]), ref, net, len(pads) - 1, length, holes, bends, sorted(crossed)))

rows.sort()
total = sum(r[3] for r in rows)
out = ['# Puentes de alambre (lado de componentes)', '',
       'La PCB es de **una sola cara** (cobre abajo). Las conexiones que no caben en el cobre se hacen',
       'con **alambre aislado** (por ejemplo cable UTP pelado en las puntas) del lado de los componentes.',
       'Cada puente esta dibujado en la serigrafia con su nombre `JPn`.', '',
       '- **Ningun agujero de puente queda debajo de una pieza**: todos se pueden soldar en cualquier momento.',
       '- Algunos alambres pasan por debajo de piezas (columna *Pasa bajo*): **instalar todos los puentes',
       '  antes que los componentes**, bien pegados a la placa.',
       '- GND, la entrada (VIN) y el cristal nunca van por un puente. Los puentes de `+5V` llevan la',
       '  corriente de los displays: hacerlos con **alambre rigido de 0.5 mm o mas** (el de UTP sirve).',
       '- Cortar el alambre ~6 mm mas largo que la medida, doblar las puntas y soldar por el lado del cobre.',
       '- Si un puente tiene mas de 2 agujeros, se hace con varios tramos (todos son la misma red).',
       '- *Dobleces* > 0: el alambre no va recto, se dobla siguiendo el dibujo de la serigrafia.', '',
       'Coordenadas en mm desde la esquina superior izquierda de la placa (vista desde los componentes).', '',
       'Total: **%d puentes, %d alambres**.' % (len(rows), total), '',
       '| Puente | Red | Alambres | Dobleces | Largo aprox. | Pasa bajo | Agujeros |',
       '|---|---|---|---|---|---|---|']
for _, ref, net, wires, length, holes, bends, crossed in rows:
    out.append('| %s | `%s` | %d | %d | %.0f mm | %s | %s |' % (ref, net, wires, bends, length,
                                                           ', '.join(crossed) or '-', '<br>'.join(holes)))
path = os.path.join(PRJ, 'fabricacion', 'PUENTES.md')
open(path, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('escrito', path, '-', len(rows), 'puentes,', total, 'alambres')
