"""Genera la PCB de una sola cara (cobre abajo, B.Cu) del entrenador ATMega328P.

Pensada para hacerse en casa: transferencia de toner o fresado CNC sencillo.
  - pistas gruesas (0.8 mm senal, 1.2 mm alimentacion) y separacion de 0.5 mm
  - pads agrandados (>= 1.8 mm) para que no se pierdan al perforar
  - componentes arriba (F), cobre abajo (B); lo que no se puede rutear en una cara
    se resuelve con puentes de alambre (JP*) del lado de los componentes

Uso (antes: exportar el netlist a out/net.net con kicad-cli):
  python3 generar_pcb.py colocar   -> coloca los componentes (sin rutas)
  python3 generar_pcb.py importar  -> coloca y aplica el ruteo guardado (ruteo-freerouting.ses)
  python3 generar_pcb.py rutear    -> coloca y rutea de nuevo con Freerouting 2.5 (java)
                                      VIA_COST / JUMPER_COST / TAG por variable de entorno
"""
import math
import os
import re
import subprocess
import sys

import pcbnew
from pcbnew import FromMM as MM, VECTOR2I, ToMM

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sexpr import parse, find, first  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PRJ = os.path.abspath(os.path.join(HERE, '..'))
NETLIST = os.path.join(PRJ, 'out', 'net.net')
OUT = os.environ.get('PCB_OUT', os.path.join(PRJ, 'entrenador-atmega328p.kicad_pcb'))
WORK = os.path.join(PRJ, 'out', 'pcb')
SES_KEEP = os.environ.get('SES', os.path.join(PRJ, 'ruteo-freerouting.ses'))  # ruteo elegido (15 puentes, 0 sin rutear)
FREEROUTING = os.environ.get('FREEROUTING_JAR', os.path.expanduser('~/.local/share/freerouting/freerouting.jar'))
LIBS = {'entrenador': os.path.join(PRJ, 'entrenador.pretty')}
SYS_FP = '/usr/share/kicad/footprints'

W, H = 100.0, 90.0           # tamano de la placa (mm), cabe en una baquelita de 10 x 10 cm
TRACK, TRACK_PWR = 0.8, 1.2  # anchos de pista
CLEAR = 0.5                  # separacion minima cobre-cobre
# costos de Freerouting (elegidos probando varias combinaciones: menos puentes)
VIA_COST = int(os.environ.get('VIA_COST', 200))
JUMPER_COST = float(os.environ.get('JUMPER_COST', 20))
TAG = os.environ.get('TAG', 'puentes')
# pines conectados internamente (catodo comun 3 y 8 del 5161AS): Freerouting solo rutea uno
INTERNAL_PINS = {'U3-8', 'U4-8'}
EDGE_KEEP = 1.5
SKIP_GND = os.environ.get('SKIP_GND', '0') == '1'
# zonas prohibidas para los puentes (F.Cu) sobre cada componente, para que ningun alambre
# ni agujero de puente quede debajo de una pieza: 'todo', 'bajos' (los alambres pueden pasar
# bajo resistencias y condensadores ceramicos, los agujeros no), 'huecos' (ningun agujero bajo
# una pieza; el alambre puede pasar por debajo si se pone antes) o 'no'
KEEPOUT = os.environ.get('KEEPOUT', 'huecos')
KEEPOUT_MARGIN = float(os.environ.get('KEEPOUT_MARGIN', 0.5))
LOW_FP = re.compile(r'^(Resistor_THT:|Capacitor_THT:C_Disc)')
POWER_NETS = {'GND', '+5V', 'VIN', 'VIN_RAW'}
# redes que nunca pasan por un puente (siempre en cobre): alimentacion, GND y el cristal
COPPER_ONLY = {'XTAL1', 'XTAL2'} | set(filter(None, os.environ.get('COPPER_EXTRA', '').split(',')))
COPPER_ONLY_PWR = {'GND', 'VIN', 'VIN_RAW'}

# referencia -> (x, y, rotacion) del origen de la huella, vista desde arriba
X0, Y0 = 72.0, 52.0  # pin 1 del ATmega (rotado -90: pines 1..14 arriba, de derecha a izquierda)
PLACE = {
    'U1': (X0, Y0, -90),
    # desacople pegado al micro: C5 sobre los pines 7 (VCC) y 8 (GND), C6 bajo los pines
    # 20 (AVCC) y 22 (GND), C7 en AREF; el cristal y sus condensadores arriba de los pines 9-10
    'C5': (59.22, 48.4, 180),
    'C6': (51.9, 63.5, 0),
    'C7': (49.2, 63.5, -90),
    'Y1': (53.0, 43.5, 180),
    'C9': (45.5, 37.0, 0),
    'C8': (53.0, 37.0, 0),
    # filtro de RESET junto al pin 1
    'C11': (75.3, 52.0, 90),
    'D11': (75.3, 62.12, 90),
    # salidas: displays arriba a la izquierda, 8 LED arriba a la derecha
    'U3': (17.5, 18.0, 0),
    'U4': (33.5, 18.0, 0),
    # transistores (E-B-C) debajo de los pines de seleccion 16..18; colectores suben por la izquierda
    'R11': (39.0, 62.5, -90),
    'R12': (42.2, 62.5, -90),
    'R13': (45.4, 62.5, -90),
    'Q1': (12.5, 76.0, 0),
    'Q2': (21.0, 76.0, 0),
    'Q3': (29.5, 76.0, 0),
    # entradas
    'SW2': (61.84, 71.6, 90),
    'RV1': (80.0, 61.2, 0),
    'SW1': (82.0, 40.0, 0),
    'R2': (79.0, 50.5, 0),
    # bornera de alimentacion en el borde derecho (entrada del cable hacia afuera), en paralelo con J1
    'J4': (94.0, 54.6, 90),
    # puntos de prueba (lazos de alambre) junto a lo que miden
    'TP1': (83.0, 86.0, 0),   # GND, junto a la entrada
    'TP2': (12.0, 84.0, 0),   # GND, lado izquierdo
    'TP3': (77.0, 76.0, 0),   # VIN, despues de D1
    'TP4': (50.5, 73.5, 0),   # +5V, junto al 7805
    'TP5': (76.0, 66.0, 0),   # POT
    'TP6': (66.0, 46.5, 0),   # RESET
    # programacion
    'J3': (31.0, 62.0, 0),
    'J2': (95.5, 30.0, 0),
    'C10': (82.0, 33.5, 0),
    # fuente abajo a la derecha; el jack entra por el borde derecho
    'J1': (84.5, 77.0, 180),
    'D1': (68.0, 85.5, 0),
    'C2': (66.0, 79.5, 0),
    'C1': (58.5, 78.5, 0),
    'U2': (55.0, 85.5, 180),
    'C3': (43.0, 79.5, 0),
    'C4': (37.0, 84.5, 0),
    'R1': (5.0, 38.0, -90),
    'D2': (5.0, 49.0, -90),
}
# LED0..LED7 (D3..D10): LED0 a la derecha (bit menos significativo)
for i in range(8):
    PLACE['D%d' % (3 + i)] = (92.0 - i * 7.0, 9.0, 0)
# resistencias del bus R3..R10 verticales, encima del micro (pad 1 = bus abajo)
for i, x in enumerate((72.0, 68.0, 64.0, 42.5, 38.5, 34.5, 30.5, 26.5)):
    PLACE['R%d' % (3 + i)] = (x, 40.6, 90)

# la placa se dibuja a (OX, OY) de la esquina de la hoja A4 para que la impresora no la recorte
OX, OY = 25.0, 25.0
COPPER_TEXT = [('ENTRENADOR\nATMEGA328P', 1.6), ('ENTRENADOR\nATMEGA328P', 1.2),
               ('ATMEGA328P', 1.5), ('ATMEGA328P', 1.1), ('SE1', 1.5)]

MOUNT = [(3.5, 3.5), (W - 3.5, 3.5), (3.5, H - 3.5), (W - 3.5, H - 3.5)]


# Prueba de permutaciones (solo para buscar un ruteo con menos puentes): que linea del bus
# (SEG_A..SEG_DP, salida de R3..R10) va a cada segmento de los displays y a cada LED.
# SEG_PERM[s] = linea del segmento s (a..dp); LED_PERM[k] = linea del LEDk. El firmware lo
# compensa con tablas. Vacio = orden del esquematico.
SEG_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']
SEG_PERM = os.environ.get('SEG_PERM', '')
LED_PERM = os.environ.get('LED_PERM', '')


def apply_perms(pads):
    if SEG_PERM:
        for (ref, pin), net in list(pads.items()):
            if ref in ('U3', 'U4') and net.startswith('SEG_'):
                s = SEG_NAMES.index(net[4:])
                pads[(ref, pin)] = 'SEG_' + SEG_NAMES[int(SEG_PERM[s])]
    if LED_PERM:
        for k in range(8):
            pads[('D%d' % (3 + k), '2')] = 'SEG_' + SEG_NAMES[int(LED_PERM[k])]
    return pads


def load_netlist():
    root = parse(open(NETLIST, encoding='utf-8').read())
    comps = {}
    for c in find(first(root, 'components'), 'comp'):
        comps[first(c, 'ref')[1]] = (first(c, 'value')[1], first(c, 'footprint')[1])
    pads = {}
    for net in find(first(root, 'nets'), 'net'):
        name = first(net, 'name')[1].lstrip('/')
        for node in find(net, 'node'):
            pads[(first(node, 'ref')[1], first(node, 'pin')[1])] = name
    return comps, apply_perms(pads)


def load_fp(fpid):
    lib, name = fpid.split(':')
    path = LIBS.get(lib, os.path.join(SYS_FP, lib + '.pretty'))
    fp = pcbnew.FootprintLoad(path, name)
    if fp is None:
        raise SystemExit('no encuentro la huella ' + fpid)
    fp.SetFPID(pcbnew.LIB_ID(lib, name))
    return fp


def grow_pads(fp):
    """Agranda los pads para fabricacion casera sin romper la separacion de 0.5 mm."""
    pads = list(fp.Pads())
    pos = [(ToMM(p.GetPosition().x), ToMM(p.GetPosition().y)) for p in pads]
    for p, (x, y) in zip(pads, pos):
        if p.GetAttribute() != pcbnew.PAD_ATTRIB_PTH:
            continue
        # distancia al pad vecino mas cercano, en x y en y
        dx = min([abs(x - a) for a, b in pos if abs(y - b) < 0.1 and abs(x - a) > 0.1] or [99])
        dy = min([abs(y - b) for a, b in pos if abs(x - a) < 0.1 and abs(y - b) > 0.1] or [99])
        size = p.GetSize(pcbnew.F_Cu)
        sx, sy = ToMM(size.x), ToMM(size.y)
        tx = min(max(sx, 2.0), dx - CLEAR - 0.04)
        ty = min(max(sy, 2.0), dy - CLEAR - 0.04)
        # filas de 2.54 mm -> pad ovalado, alargado hacia el lado libre
        if dy < 3 and dx >= 5:
            tx = max(tx, 2.4)
        if dx < 3 and dy >= 5:
            ty = max(ty, 2.4)
        tx, ty = max(tx, sx), max(ty, sy)
        if abs(tx - ty) > 0.01 and p.GetShape(pcbnew.F_Cu) == pcbnew.PAD_SHAPE_CIRCLE:
            p.SetShape(pcbnew.F_Cu, pcbnew.PAD_SHAPE_OVAL)
        p.SetSize(pcbnew.F_Cu, VECTOR2I(MM(tx), MM(ty)))


def build_board():
    comps, padnets = load_netlist()
    board = pcbnew.BOARD()
    board.SetCopperLayerCount(2)
    ds = board.GetDesignSettings()
    ds.m_TrackMinWidth = MM(0.6)  # Freerouting adelgaza a 0.6 mm en algunos pasos estrechos
    ds.m_MinClearance = MM(CLEAR)
    ds.m_CopperEdgeClearance = MM(0.5)
    ds.m_ViasMinSize = MM(1.8)
    ds.m_MinThroughDrill = MM(0.8)
    nc = ds.m_NetSettings.GetDefaultNetclass()
    nc.SetTrackWidth(MM(TRACK))
    nc.SetClearance(MM(CLEAR))
    nc.SetViaDiameter(MM(2.0))
    nc.SetViaDrill(MM(0.8))
    pwr = pcbnew.NETCLASS('Alimentacion')
    pwr.SetTrackWidth(MM(TRACK_PWR))
    pwr.SetClearance(MM(CLEAR))
    pwr.SetViaDiameter(MM(2.0))
    pwr.SetViaDrill(MM(0.8))
    ds.m_NetSettings.SetNetclass('Alimentacion', pwr)
    for n in sorted(POWER_NETS):
        ds.m_NetSettings.SetNetclassPatternAssignment(n, 'Alimentacion')

    nets = {}
    for name in sorted(set(padnets.values())):
        ni = pcbnew.NETINFO_ITEM(board, name)
        board.Add(ni)
        nets[name] = ni

    for ref, (value, fpid) in sorted(comps.items()):
        fp = load_fp(fpid)
        fp.SetReference(ref)
        fp.SetValue(value)
        if ref == 'SW1':
            fp.SetDuplicatePadNumbersAreJumpers(True)  # los 2 pads '1' (y los 2 '2') son el mismo contacto
        grow_pads(fp)
        for p in fp.Pads():
            net = padnets.get((ref, p.GetNumber()))
            if net and not net.startswith('unconnected'):
                p.SetNet(nets[net])
        if ref not in PLACE:
            raise SystemExit('falta posicion para ' + ref)
        x, y, r = PLACE[ref]
        board.Add(fp)
        fp.SetPosition(VECTOR2I(MM(x), MM(y)))
        fp.SetOrientationDegrees(r)
        fp.Reference().SetVisible(True)
        fp.Value().SetVisible(False)

    for i, (x, y) in enumerate(MOUNT):
        fp = load_fp('MountingHole:MountingHole_3.2mm_M3')
        fp.SetReference('H%d' % (i + 1))
        fp.SetAttributes(fp.GetAttributes() | pcbnew.FP_BOARD_ONLY | pcbnew.FP_EXCLUDE_FROM_BOM)
        fp.Reference().SetVisible(False)
        fp.Value().SetVisible(False)
        board.Add(fp)
        fp.SetPosition(VECTOR2I(MM(x), MM(y)))

    # E, B y C junto a las patas de los transistores: comprobar el 2N2222 con el multimetro
    for q in ('Q1', 'Q2', 'Q3'):
        x, y, _ = PLACE[q]
        for i, letter in enumerate('EBC'):
            t = pcbnew.PCB_TEXT(board)
            t.SetText(letter)
            t.SetLayer(pcbnew.F_SilkS)
            t.SetTextSize(VECTOR2I(MM(1.0), MM(1.0)))
            t.SetTextThickness(MM(0.15))
            t.SetPosition(VECTOR2I(MM(x + i * 2.54), MM(y + 2.9)))
            board.Add(t)

    rect = pcbnew.PCB_SHAPE(board)
    rect.SetShape(pcbnew.SHAPE_T_RECT)
    rect.SetStart(VECTOR2I(0, 0))
    rect.SetEnd(VECTOR2I(MM(W), MM(H)))
    rect.SetLayer(pcbnew.Edge_Cuts)
    rect.SetWidth(MM(0.15))
    board.Add(rect)
    return board


def report_overlaps(board):
    fps = [f for f in board.GetFootprints() if not f.GetReference().startswith('H')]
    boxes = {}
    for f in fps:
        bb = f.GetCourtyard(pcbnew.F_CrtYd).BBox() if f.GetCourtyard(pcbnew.F_CrtYd).OutlineCount() else f.GetBoundingBox(False)
        boxes[f.GetReference()] = (ToMM(bb.GetLeft()), ToMM(bb.GetTop()), ToMM(bb.GetRight()), ToMM(bb.GetBottom()))
    refs = sorted(boxes)
    bad = 0
    for i, a in enumerate(refs):
        ax0, ay0, ax1, ay1 = boxes[a]
        if ax0 < 0 or ay0 < 0 or ax1 > W or ay1 > H:
            print('FUERA DE LA PLACA:', a, boxes[a]); bad += 1
        for b in refs[i + 1:]:
            bx0, by0, bx1, by1 = boxes[b]
            if ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1:
                print('SE SOLAPAN:', a, b); bad += 1
    print('solapes:', bad)


def sexpr_blocks(text, head):
    """Devuelve (inicio, fin) de cada bloque '(head ...' con parentesis balanceados."""
    out, i = [], 0
    while True:
        i = text.find('(' + head, i)
        if i < 0:
            return out
        depth, j = 0, i
        while True:
            if text[j] == '(':
                depth += 1
            elif text[j] == ')':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        out.append((i, j + 1))
        i = j + 1


def prepare_dsn(text, jumpers):
    """Una sola cara: los pads solo existen en B.Cu. F.Cu es la 'capa de puentes' (solo en la 2a pasada)."""
    pieces, last = [], 0
    for a, b in sexpr_blocks(text, 'padstack '):
        block = text[a:b]
        if 'Via[' not in block:
            for sa, sb in reversed(sexpr_blocks(block, 'shape (')):
                if 'F.Cu' in block[sa:sb]:
                    block = block[:sa] + block[sb:]
        pieces.append(text[last:a])
        pieces.append(block)
        last = b
    pieces.append(text[last:])
    text = ''.join(pieces)
    # las pistas de la 1a pasada quedan fijas
    # el ruteo se queda a EDGE_KEEP mm del borde (la placa se corta a mano)
    e = EDGE_KEEP * 1000
    box = '(path pcb 0  %d %d  %d %d  %d %d  %d %d  %d %d)' % (
        W * 1000 - e, -H * 1000 + e, e, -H * 1000 + e, e, -e, W * 1000 - e, -e, W * 1000 - e, -H * 1000 + e)
    text = re.sub(r'\(boundary\s*\(path pcb 0[^)]*\)', '(boundary\n      ' + box, text, count=1)
    # pines unidos por dentro del componente: basta con conectar uno
    def strip_pins(m):
        seen, keep = set(), []
        for pin in m.group(2).split():
            ref = pin.split('@')[0]
            if ref in INTERNAL_PINS or ref in seen:
                continue
            seen.add(ref)
            keep.append(pin)
        return m.group(1) + ' '.join(keep) + ')'
    text = re.sub(r'(\(pins )([^()]*)\)', strip_pins, text)
    if SKIP_GND:
        # GND lo resuelve el relleno de cobre; Freerouting no lo rutea
        for a, b in sexpr_blocks(text, 'net GND'):
            text = text[:a] + text[b:]
            break
    text = copper_only_classes(text)
    settings = """    (autoroute_settings
      (fanout off) (autoroute on) (postroute on) (vias %s)
      (via_costs %d) (plane_via_costs 5) (start_ripup_costs 100)
      (layer_rule F.Cu (active %s) (preferred_direction horizontal)
        (preferred_direction_trace_costs %g) (against_preferred_direction_trace_costs %g))
      (layer_rule B.Cu (active on) (preferred_direction vertical)
        (preferred_direction_trace_costs 1) (against_preferred_direction_trace_costs 1))
    )
""" % ('on' if jumpers else 'off', VIA_COST, 'on' if jumpers else 'off', JUMPER_COST, JUMPER_COST)
    a, b = sexpr_blocks(text, 'structure')[0]
    return text[:b - 1] + settings + '  ' + text[b - 1:]


def _move_to_class(text, src, nets, new, width, layer_only):
    """Saca las redes nets de la clase src del DSN y las pone en una clase nueva."""
    a, b = sexpr_blocks(text, 'class %s' % src)[0]
    head, rest = text[a:b].split('(circuit', 1)
    for n in nets:
        head = re.sub(r'(?<=\s)"?%s"?(?=\s)' % re.escape(n), '', head)
    text = text[:a] + head + '(circuit' + rest + text[b:]
    a, b = sexpr_blocks(text, 'class %s' % src)[0]
    extra = ('\n    (class %s %s\n      (circuit\n        (use_via "Via[0-1]_2000:800_um")\n%s'
             '      )\n      (rule\n        (width %d)\n        (clearance %d)\n      )\n    )'
             % (new, ' '.join(sorted(nets)), '        (use_layer B.Cu)\n' if layer_only else '',
                width * 1000, CLEAR * 1000))
    return text[:b] + extra + text[b:]


def copper_only_classes(text):
    """GND, la entrada y el cristal solo en B.Cu (nunca por un puente de alambre).

    +5V si puede usar puentes en las ramas (hay que hacerlos con alambre rigido de 0.5 mm o mas):
    como arbol de cobre en una sola cara corta la placa en pedazos y no se puede rutear.
    """
    text = _move_to_class(text, 'Alimentacion', COPPER_ONLY_PWR, 'AlimCobre', TRACK_PWR, True)
    return _move_to_class(text, 'kicad_default', COPPER_ONLY, 'SoloCobre', TRACK, True)


def freeroute(board, tag, jumpers):
    dsn = os.path.join(WORK, 'entrenador-%s.dsn' % tag)
    ses = os.path.join(WORK, 'entrenador-%s.ses' % tag)
    log = os.path.join(WORK, 'freerouting-%s.log' % tag)
    pcbnew.ExportSpecctraDSN(board, dsn)
    text = add_image_keepouts(prepare_dsn(open(dsn).read(), jumpers), board)
    open(dsn, 'w').write(text)
    if os.path.exists(ses):
        os.remove(ses)
    cmd = ['java', '-jar', FREEROUTING, '-de', dsn, '-do', ses, '-mp', '200', '-mt', os.environ.get('FR_THREADS', '4'),
           '--gui.enabled=false']
    subprocess.run(cmd, check=True, stdout=open(log, 'w'), stderr=subprocess.STDOUT)
    text = open(log).read()
    res = re.findall(r'incomplete connections: (\d+)', text) or re.findall(r'\((\d+) unrouted and', text)
    print('freerouting %s: conexiones sin rutear = %s' % (tag, res[-1] if res else '?'))
    if not pcbnew.ImportSpecctraSES(board, ses):
        raise SystemExit('no pude importar ' + ses)


BOXES = {}  # patios de los componentes, se leen una vez antes de rutear


def courtyards(board):
    """ref -> (x0, y0, x1, y1) del patio de cada componente (no incluye puentes)."""
    out = {}
    for f in board.GetFootprints():
        ref = f.GetReference()
        if ref.startswith('JP'):
            continue
        cy = f.GetCourtyard(pcbnew.F_CrtYd)
        bb = cy.BBox() if cy.OutlineCount() else f.GetBoundingBox(False)
        out[ref] = (ToMM(bb.GetLeft()), ToMM(bb.GetTop()), ToMM(bb.GetRight()), ToMM(bb.GetBottom()))
    return out


def local_courtyards(board):
    """fpid -> patio (x0, y0, x1, y1) en coordenadas locales de la huella (sin rotar), en mm."""
    out = {}
    for f in board.GetFootprints():
        fpid = f.GetFPID().GetUniStringLibId()
        if fpid in out:
            continue
        cy = f.GetCourtyard(pcbnew.F_CrtYd)
        bb = cy.BBox() if cy.OutlineCount() else f.GetBoundingBox(False)
        cx, cy_ = ToMM(f.GetPosition().x), ToMM(f.GetPosition().y)
        a = math.radians(f.GetOrientationDegrees())
        pts = []
        for x, y in ((bb.GetLeft(), bb.GetTop()), (bb.GetRight(), bb.GetBottom())):
            dx, dy = ToMM(x) - cx, ToMM(y) - cy_
            # mundo -> local (KiCad: y hacia abajo, angulo positivo antihorario en pantalla)
            pts.append((dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)))
        (x0, y0), (x1, y1) = pts
        out[fpid] = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
    return out


def add_image_keepouts(text, board):
    """Zonas prohibidas en F.Cu dentro de cada imagen (huella) del DSN.

    Freerouting 2.5 deja la placa vacia si hay 'keepout' en la seccion structure, pero
    los acepta dentro de las imagenes. Asi ningun puente (alambre ni agujero) queda debajo
    de una pieza; con KEEPOUT=bajos los alambres pueden pasar bajo resistencias y ceramicos.
    """
    if KEEPOUT == 'no':
        return text
    boxes = local_courtyards(board)
    m = KEEPOUT_MARGIN
    pieces, last = [], 0
    for a, b in sexpr_blocks(text, 'image '):
        block = text[a:b]
        name = block.split('\n', 1)[0][len('(image '):].strip().strip('"').split('::')[0]
        box = boxes.get(name)
        if box:
            x0, y0, x1, y1 = box
            low = KEEPOUT == 'huecos' or (KEEPOUT == 'bajos' and LOW_FP.match(name))
            kind = 'via_keepout' if low else 'keepout'
            # DSN: micrometros y eje y hacia arriba
            rect = '(%s "" (rect F.Cu %d %d %d %d))' % (
                kind, (x0 - m) * 1000, -(y1 + m) * 1000, (x1 + m) * 1000, -(y0 - m) * 1000)
            nl = block.index('\n')
            block = block[:nl + 1] + '      ' + rect + '\n' + block[nl + 1:]
        pieces += [text[last:a], block]
        last = b
    pieces.append(text[last:])
    return ''.join(pieces)


def autoroute(board):
    freeroute(board, TAG, jumpers=True)
    # Freerouting no da siempre el mismo resultado: si este ruteo es el bueno, copiar
    # out/pcb/entrenador-<TAG>.ses a ruteo-freerouting.ses (es el que usa 'importar')


def make_jumpers(board):
    """Convierte cada grupo de tramos en F.Cu (entre vias) en un puente JPn de alambre.

    Un puente une 2 o mas agujeros de la misma red; si son mas de 2, se unen con
    alambres rectos siguiendo el arbol mas corto (la serigrafia muestra cada alambre).
    Si un alambre recto pasara sobre mas piezas que el camino del ruteo, se dibuja siguiendo
    ese camino y hay que doblarlo igual que en la serigrafia.
    """
    boxes = [b for r, b in BOXES.items() if not r.startswith('H')]
    vias = [t for t in board.GetTracks() if t.Type() == pcbnew.PCB_VIA_T]
    segs = [t for t in board.GetTracks() if t.Type() == pcbnew.PCB_TRACE_T and t.GetLayer() == pcbnew.F_Cu]
    key = lambda p: (round(ToMM(p.x), 2), round(ToMM(p.y), 2))
    parent = {}

    def find_(k):
        while parent.setdefault(k, k) != k:
            k = parent[k]
        return k
    for s in segs:
        parent[find_(key(s.GetStart()))] = find_(key(s.GetEnd()))
    groups, paths = {}, {}
    for v in vias:
        groups.setdefault(find_(key(v.GetPosition())), {})[key(v.GetPosition())] = v
    for sg in segs:
        paths.setdefault(find_(key(sg.GetStart())), []).append((key(sg.GetStart()), key(sg.GetEnd())))
    n = wires = 0
    for root, vs in sorted(groups.items(), key=lambda g: sorted(g[1])[0]):
        pts = sorted(vs)
        if len(pts) < 2:
            continue
        net = next(iter(vs.values())).GetNet()
        done, edges = [0], []
        while len(done) < len(pts):
            d, i, j = min(((pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2, i, j)
                          for i in done for j in range(len(pts)) if j not in done)
            done.append(j)
            edges.append((pts[i], pts[j]))
        n += 1
        wires += len(edges)
        # recto si es posible; el camino del ruteo solo si pasa bajo menos piezas que la recta
        over = lambda es: sum(_crosses(a, b, box) for a, b in es for box in boxes)
        path = merge_collinear(paths.get(root, edges))
        if over(edges) and over(path) < over(edges):
            edges = path
        add_jumper(board, 'JP%d' % n, net, pts, edges)
    for t in vias + segs:
        board.Remove(t)
    print('puentes: %d (%d alambres)' % (n, wires))
    return n


def merge_collinear(segs):
    """Une tramos seguidos que van en la misma direccion (menos dobleces que marcar)."""
    segs = [s for s in segs if s[0] != s[1]]
    changed = True
    while changed:
        changed = False
        for i, (a, b) in enumerate(segs):
            for j, (c, d) in enumerate(segs):
                if i == j:
                    continue
                for p, q, r in ((a, b, d) if b == c else (None, None, None),
                                (b, a, d) if a == c else (None, None, None)):
                    if p is None:
                        continue
                    # p-q y q-r colineales y q no es un nodo con mas ramas
                    cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])
                    deg = sum(q in s for s in segs)
                    if abs(cross) < 1e-3 and deg == 2:
                        segs = [s for k, s in enumerate(segs) if k not in (i, j)] + [(p, r)]
                        changed = True
                        break
                if changed:
                    break
            if changed:
                break
    return segs


def _crosses(p1, p2, box):
    """El tramo recto p1-p2 pasa por dentro del rectangulo box (muestreado cada 0.2 mm)."""
    x0, y0, x1, y1 = box
    n = max(1, int(((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2) ** 0.5 / 0.2))
    for k in range(1, n):
        x = p1[0] + (p2[0] - p1[0]) * k / n
        y = p1[1] + (p2[1] - p1[1]) * k / n
        if x0 < x < x1 and y0 < y < y1:
            return True
    return False


def jumper_report(board):
    """Resumen para comparar ruteos: agujeros bajo piezas, alambres sobre piezas, largo total."""
    boxes = BOXES
    holes_under, wires_over, total, longest = [], [], 0.0, 0.0
    for f in board.GetFootprints():
        if not f.GetReference().startswith('JP'):
            continue
        for p in f.Pads():
            x, y = ToMM(p.GetPosition().x), ToMM(p.GetPosition().y)
            for ref, (x0, y0, x1, y1) in boxes.items():
                if x0 < x < x1 and y0 < y < y1:
                    holes_under.append('%s/%s' % (f.GetReference(), ref))
        for it in f.GraphicalItems():
            if it.GetLayer() != pcbnew.F_SilkS or it.GetShape() != pcbnew.SHAPE_T_SEGMENT:
                continue
            a = (ToMM(it.GetStart().x), ToMM(it.GetStart().y))
            b = (ToMM(it.GetEnd().x), ToMM(it.GetEnd().y))
            ln = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
            total += ln
            longest = max(longest, ln)
            for ref, box in boxes.items():
                if ref.startswith('H'):
                    continue
                if _crosses(a, b, box):
                    wires_over.append('%s/%s' % (f.GetReference(), ref))
    print('agujeros de puente bajo piezas: %d %s' % (len(holes_under), ' '.join(holes_under)))
    print('alambres que pasan sobre piezas: %d %s' % (len(wires_over), ' '.join(wires_over)))
    print('largo total de alambre: %.0f mm, el mas largo: %.0f mm' % (total, longest))


def add_jumper(board, ref, net, pts, edges):
    fp = pcbnew.FOOTPRINT(board)
    fp.SetReference(ref)
    fp.SetValue('puente')
    fp.SetAttributes(pcbnew.FP_THROUGH_HOLE | pcbnew.FP_BOARD_ONLY | pcbnew.FP_EXCLUDE_FROM_BOM)
    fp.SetDuplicatePadNumbersAreJumpers(True)  # todos los pads '1' quedan unidos por el alambre
    fp.SetFPID(pcbnew.LIB_ID('entrenador', 'Puente_alambre'))
    board.Add(fp)
    fp.SetPosition(VECTOR2I(MM(pts[0][0]), MM(pts[0][1])))
    for (x, y) in pts:
        pad = pcbnew.PAD(fp)
        pad.SetNumber('1')
        pad.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
        pad.SetShape(pcbnew.F_Cu, pcbnew.PAD_SHAPE_CIRCLE)
        pad.SetSize(pcbnew.F_Cu, VECTOR2I(MM(2.0), MM(2.0)))
        pad.SetDrillSize(VECTOR2I(MM(0.8), MM(0.8)))
        pad.SetLayerSet(pcbnew.PAD.PTHMask())
        fp.Add(pad)
        pad.SetPosition(VECTOR2I(MM(x), MM(y)))
        pad.SetNet(net)
    for p1, p2 in edges:
        line = pcbnew.PCB_SHAPE(fp)
        line.SetShape(pcbnew.SHAPE_T_SEGMENT)
        line.SetStart(VECTOR2I(MM(p1[0]), MM(p1[1])))
        line.SetEnd(VECTOR2I(MM(p2[0]), MM(p2[1])))
        line.SetLayer(pcbnew.F_SilkS)
        line.SetWidth(MM(0.4))
        fp.Add(line)
    (x1, y1), (x2, y2) = edges[0]
    fp.Reference().SetPosition(VECTOR2I(MM((x1 + x2) / 2), MM((y1 + y2) / 2 - 1.2)))
    fp.Reference().SetTextSize(VECTOR2I(MM(0.9), MM(0.9)))
    fp.Reference().SetTextThickness(MM(0.15))
    fp.Value().SetVisible(False)


def add_gnd_fill(board):
    gnd = board.FindNet('GND')
    zone = pcbnew.ZONE(board)
    zone.SetLayer(pcbnew.B_Cu)
    zone.SetNet(gnd)
    m = 1.0
    outline = zone.Outline()
    outline.NewOutline()
    for x, y in ((m, m), (W - m, m), (W - m, H - m), (m, H - m)):
        outline.Append(MM(OX + x), MM(OY + y))
    zone.SetLocalClearance(MM(0.8))
    zone.SetMinThickness(MM(0.6))
    zone.SetThermalReliefGap(MM(0.6))
    zone.SetThermalReliefSpokeWidth(MM(1.0))
    zone.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    board.Add(zone)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())


def free_spot(board, w, h, margin=1.0):
    """Busca un rectangulo w x h (mm) sin cobre en B.Cu para poner el texto."""
    obst = []
    for t in board.GetTracks():
        a, b, r = t.GetStart(), t.GetEnd(), ToMM(t.GetWidth()) / 2 + margin
        (x1, y1), (x2, y2) = (ToMM(a.x), ToMM(a.y)), (ToMM(b.x), ToMM(b.y))
        steps = max(1, int(max(abs(x2 - x1), abs(y2 - y1)) / 0.3))
        for k in range(steps + 1):
            x, y = x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps
            obst.append((x - r, y - r, x + r, y + r))
    for f in board.GetFootprints():
        for p in f.Pads():
            bb = p.GetBoundingBox()
            obst.append((ToMM(bb.GetLeft()) - margin, ToMM(bb.GetTop()) - margin,
                         ToMM(bb.GetRight()) + margin, ToMM(bb.GetBottom()) + margin))
    best = None
    for yi in range(int((H - h - 8) / 0.5)):
        for xi in range(int((W - w - 8) / 0.5)):
            x0, y0 = 4 + xi * 0.5, 4 + yi * 0.5
            x1, y1 = x0 + w, y0 + h
            if not any(a < x1 and x0 < c and b < y1 and y0 < d for a, b, c, d in obst):
                cx, cy = x0 + w / 2, y0 + h / 2
                score = (cx - W / 2) ** 2 + (cy - H / 2) ** 2  # lo mas centrado posible
                if best is None or score < best[0]:
                    best = (score, cx, cy)
    return None if best is None else (best[1], best[2])


def add_copper_text(board):
    """Texto en el cobre (en espejo, como todo lo de B.Cu): en el papel se lee al reves,
    ya transferido a la placa se lee al derecho."""
    for msg, size in COPPER_TEXT:
        lines = msg.split('\n')
        w = max(len(l) for l in lines) * size * 0.95
        h = len(lines) * size * 1.7
        spot = free_spot(board, w, h, margin=0.7)
        if spot:
            break
    else:
        print('AVISO: no hay espacio para el texto de cobre')
        return
    x, y = spot
    t = pcbnew.PCB_TEXT(board)
    t.SetText(msg)
    t.SetLayer(pcbnew.B_Cu)
    t.SetMirrored(True)
    t.SetTextSize(VECTOR2I(MM(size), MM(size)))
    t.SetTextThickness(MM(size * 0.18))
    t.SetPosition(VECTOR2I(MM(x), MM(y)))
    board.Add(t)
    print('texto de cobre en (%.1f, %.1f)' % (x, y))


def rename_nets(board):
    """Devuelve a las redes el nombre del esquematico (/BUS0, ...) para la comprobacion de paridad."""
    root = parse(open(NETLIST, encoding='utf-8').read())
    for net in find(first(root, 'nets'), 'net'):
        full = first(net, 'name')[1]
        short = full.lstrip('/')
        if full != short:
            ni = board.FindNet(short)
            if ni is not None:
                ni.SetNetname(full)


def finish(board):
    """Texto de cobre, placa movida dentro de la hoja (la impresora no imprime en el borde) y relleno GND."""
    add_copper_text(board)
    rename_nets(board)
    off = VECTOR2I(MM(OX), MM(OY))
    for it in list(board.GetFootprints()) + list(board.GetTracks()) + list(board.GetDrawings()):
        it.Move(off)
    ds = board.GetDesignSettings()
    # reglas finales de fabricacion casera (Freerouting deja algunos pasos a 0.45-0.5 mm)
    ds.m_MinClearance = MM(0.45)
    ds.m_TrackMinWidth = MM(0.45)
    ds.m_CopperEdgeClearance = MM(0.4)
    for nc in [ds.m_NetSettings.GetDefaultNetclass()] + [ds.m_NetSettings.GetNetClassByName('Alimentacion')]:
        nc.SetClearance(MM(0.45))
    ds.SetAuxOrigin(off)
    ds.SetGridOrigin(off)
    add_gnd_fill(board)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'colocar'
    os.makedirs(WORK, exist_ok=True)
    if mode == 'terminar':
        # etapa final en un proceso nuevo: tras quitar muchas pistas y vias, los objetos de
        # pcbnew en Python quedan corruptos, y el relleno falla sobre una placa creada en memoria
        board = pcbnew.LoadBoard(OUT)
        BOXES.update(courtyards(board))
        jumper_report(board)
        finish(board)
        board.Save(OUT)
        print('PCB guardada:', OUT)
        return
    board = build_board()
    report_overlaps(board)
    BOXES.update(courtyards(board))
    if mode in ('rutear', 'importar'):
        if mode == 'rutear':
            autoroute(board)
        elif not pcbnew.ImportSpecctraSES(board, SES_KEEP):
            raise SystemExit('no hay sesion de Freerouting; usar rutear')
        make_jumpers(board)
    board.Save(OUT)
    if mode in ('rutear', 'importar'):
        sys.stdout.flush()
        subprocess.run([sys.executable, os.path.abspath(__file__), 'terminar'], check=True)
        return
    print('PCB guardada:', OUT)


if __name__ == '__main__':
    main()
