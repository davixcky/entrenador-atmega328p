"""Genera el esquematico de KiCad del entrenador ATMega328P.

Uso: python3 generar_esquematico.py  ->  ../entrenador-atmega328p.kicad_sch

Dentro de cada bloque los componentes se unen con cables siguiendo el camino de
la senal; entre bloques se usan etiquetas de red (dos etiquetas con el mismo
nombre son la misma red). Los puntos de union se calculan solos al guardar.
"""
import math
import os
import uuid as uuidlib
from collections import Counter

from sexpr import Sym, dump, find, first, parse

# Simbolos de KiCad 10 (con otra version cambian los simbolos y se rompen conexiones).
# En NixOS u otras rutas: KICAD10_SYMBOL_DIR=/ruta/a/symbols
LIBDIR = os.path.join(os.environ.get('KICAD10_SYMBOL_DIR', '/usr/share/kicad/symbols'), '')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'entrenador-atmega328p.kicad_sch')
PROJECT = 'entrenador-atmega328p'
NS = uuidlib.UUID('6b1f3c1e-6f7e-4f27-9d0e-2a3c0a328328')
ROOT_UUID = str(uuidlib.uuid5(NS, 'root'))

_counter = [0]


def uid():
    _counter[0] += 1
    return str(uuidlib.uuid5(NS, str(_counter[0])))


S = Sym
FONT = [S('effects'), [S('font'), [S('size'), 1.27, 1.27]]]


def effects(justify=None, hide=False, size=1.27):
    e = [S('effects'), [S('font'), [S('size'), size, size]]]
    if justify:
        e.append([S('justify')] + [S(j) for j in justify.split()])
    if hide:
        e.append([S('hide'), S('yes')])
    return e


# --------------------------------------------------------------------------
# Librerias
# --------------------------------------------------------------------------
_libcache = {}


def _lib(name):
    if name not in _libcache:
        root = parse(open(LIBDIR + name + '.kicad_sym', encoding='utf-8').read())
        _libcache[name] = {s[1]: s for s in find(root, 'symbol')}
    return _libcache[name]


def flatten(libid):
    """Devuelve el simbolo de libreria listo para embeber (resuelve extends)."""
    lib, name = libid.split(':')
    syms = _lib(lib)
    sym = syms[name]
    ext = first(sym, 'extends')
    if not ext:
        out = [x for x in sym]
        out[1] = libid
        return out
    base = flatten(lib + ':' + ext[1])
    base_name = ext[1]
    props = {p[1]: p for p in find(sym, 'property')}
    out = [S('symbol'), libid]
    for x in base[2:]:
        if isinstance(x, list) and x[0] == 'property' and x[1] in props:
            out.append(props.pop(x[1]))
        elif isinstance(x, list) and x[0] == 'symbol':
            sub = [y for y in x]
            sub[1] = name + sub[1][len(base_name):]
            out.append(sub)
        else:
            out.append(x)
    # propiedades nuevas del simbolo derivado (antes de las unidades)
    idx = max(i for i, x in enumerate(out) if isinstance(x, list) and x[0] == 'property') + 1
    for p in props.values():
        out.insert(idx, p)
        idx += 1
    return out


def lib_pins(flat):
    pins = {}
    for unit in find(flat, 'symbol'):
        for p in find(unit, 'pin'):
            at = first(p, 'at')
            num = first(p, 'number')[1]
            pins.setdefault(num, (float(at[1]), float(at[2]), float(at[3]) if len(at) > 3 else 0.0))
    return pins


def lib_prop_at(flat, key):
    p = [x for x in find(flat, 'property') if x[1] == key]
    if not p:
        return None
    at = first(p[0], 'at')
    eff = find(p[0], 'effects')
    hidden = any(first(e, 'hide') for e in eff)
    just = ' '.join(str(j) for e in eff for jj in find(e, 'justify') for j in jj[1:]) or None
    return float(at[1]), float(at[2]), float(at[3]) if len(at) > 3 else 0.0, hidden, just


# --------------------------------------------------------------------------
# Geometria
# --------------------------------------------------------------------------
def rot(u, v, r):
    a = math.radians(r)
    return (round(u * math.cos(a) + v * math.sin(a), 4),
            round(-u * math.sin(a) + v * math.cos(a), 4))


def g(v):
    return round(v / 1.27) * 1.27


DIRS = {(1, 0): 'R', (-1, 0): 'L', (0, -1): 'U', (0, 1): 'D'}


# --------------------------------------------------------------------------
# Esquematico
# --------------------------------------------------------------------------
class Sheet:
    def __init__(self):
        self.lib = {}
        self.items = []
        self.wires = []
        self.pin_pts = []
        self.pwr_n = 0
        self.flg_n = 0
        self.nets = {}  # (ref, pin) -> red (para la verificacion)

    def libsym(self, libid):
        if libid not in self.lib:
            self.lib[libid] = flatten(libid)
        return self.lib[libid]

    # -- primitivas -------------------------------------------------------
    def wire(self, x1, y1, x2, y2):
        a, b = (round(x1, 4), round(y1, 4)), (round(x2, 4), round(y2, 4))
        if a != b:
            self.wires.append((a, b))

    def cable(self, *pts):
        """Cable por varios puntos: cable((x1, y1), (x2, y2), ...)."""
        for a, b in zip(pts, pts[1:]):
            self.wire(a[0], a[1], b[0], b[1])

    def junctions(self):
        """Union donde llegan 3 o mas extremos, o donde un extremo cae dentro de otro cable."""
        count = Counter()
        for a, b in self.wires:
            count[a] += 1
            count[b] += 1
        for p in self.pin_pts:
            if p in count:
                count[p] += 1
        out = {p for p, n in count.items() if n >= 3}
        for a, b in self.wires:
            for p in (a, b):
                for c, d in self.wires:
                    if c[0] == d[0] == p[0] and min(c[1], d[1]) < p[1] < max(c[1], d[1]):
                        out.add(p)
                    if c[1] == d[1] == p[1] and min(c[0], d[0]) < p[0] < max(c[0], d[0]):
                        out.add(p)
        return sorted(out)

    def no_connect(self, x, y):
        self.items.append([S('no_connect'), [S('at'), x, y], [S('uuid'), uid()]])

    def label(self, name, x, y, d):
        ang, just = {'R': (0, 'left bottom'), 'U': (90, 'left bottom'),
                     'L': (180, 'right bottom'), 'D': (270, 'right bottom')}[d]
        self.items.append([S('label'), name, [S('at'), x, y, ang],
                           effects(just), [S('uuid'), uid()]])

    def text(self, txt, x, y, size=1.27, bold=False):
        e = [S('effects'), [S('font'), [S('size'), size, size]] + ([[S('bold'), S('yes')]] if bold else []),
             [S('justify'), S('left'), S('top')]]
        self.items.append([S('text'), txt, [S('exclude_from_sim'), S('no')], [S('at'), x, y, 0],
                           e, [S('uuid'), uid()]])

    def box(self, x1, y1, x2, y2, title):
        self.items.append([S('rectangle'), [S('start'), x1, y1], [S('end'), x2, y2],
                           [S('stroke'), [S('width'), 0.254], [S('type'), S('dash')]],
                           [S('fill'), [S('type'), S('none')]], [S('uuid'), uid()]])
        self.text(title, x1 + 1.27, y1 + 1.27, size=2, bold=True)

    # -- simbolos ---------------------------------------------------------
    def symbol(self, libid, ref, value, x, y, r=0, footprint='', fields=None, hide_value=False, mirror=False):
        """mirror=True refleja el simbolo en x (pines de la izquierda pasan a la derecha); solo con r=0."""
        flat = self.libsym(libid)
        is_power = ref.startswith('#')
        props = []
        for key, val in (('Reference', ref), ('Value', value), ('Footprint', footprint),
                         ('Datasheet', ''), ('Description', '')):
            la = lib_prop_at(flat, key)
            if la is None:
                la = (0, 0, 0, True, None)
            px, py = rot(la[0], -la[1], r)
            ang = (la[2] + r) % 180
            hidden = la[3] or key in ('Footprint', 'Datasheet', 'Description') or (
                is_power and key == 'Reference') or (hide_value and key == 'Value')
            if fields and key in fields:
                fx, fy, just = fields[key]
                props.append([S('property'), key, val, [S('at'), x + fx, y + fy, r % 180], effects(just, hidden)])
            else:
                just = la[4] if r in (0, 180) else None
                if just and r == 180:
                    just = just.replace('left', 'TMP').replace('right', 'left').replace('TMP', 'right')
                props.append([S('property'), key, val, [S('at'), x + px, y + py, ang], effects(just, hidden)])
        node = [S('symbol'), [S('lib_id'), libid], [S('at'), x, y, r]] + ([[S('mirror'), S('y')]] if mirror else []) + [
                [S('unit'), 1],
                [S('exclude_from_sim'), S('no')], [S('in_bom'), S('no') if is_power else S('yes')],
                [S('on_board'), S('no') if is_power else S('yes')], [S('dnp'), S('no')],
                [S('uuid'), uid()]] + props
        pos = {}
        for num, (lx, ly, _) in lib_pins(flat).items():
            node.append([S('pin'), num, [S('uuid'), uid()]])
            px, py = rot(-lx if mirror else lx, -ly, r)
            pos[num] = (round(x + px, 4), round(y + py, 4))
            self.pin_pts.append(pos[num])
        node.append([S('instances'), [S('project'), PROJECT,
                                      [S('path'), '/' + ROOT_UUID, [S('reference'), ref], [S('unit'), 1]]]])
        self.items.append(node)
        return flat, pos

    def power(self, kind, x, y, d):
        """Simbolo de alimentacion cuyo pin queda en (x, y), apuntando hacia d."""
        self.pwr_n += 1
        if kind == 'GND':
            r = {'D': 0, 'U': 180, 'R': 90, 'L': 270}[d]
        else:
            r = {'U': 0, 'D': 180, 'L': 90, 'R': 270}[d]
        self.symbol('power:' + kind, '#PWR%02d' % self.pwr_n, kind, x, y, r)

    def flag(self, x, y, d='U'):
        """PWR_FLAG sobre un punto de cable (marca la red como alimentada para el ERC)."""
        self.flg_n += 1
        r = {'U': 0, 'D': 180, 'L': 90, 'R': 270}[d]
        self.symbol('power:PWR_FLAG', '#FLG%02d' % self.flg_n, 'PWR_FLAG', x, y, r)

    def net(self, name, *refpins):
        """Registra una red dibujada con cables (para verificar_netlist.py)."""
        for rp in refpins:
            self.nets[rp] = name

    def part(self, libid, ref, value, x, y, r=0, footprint='', conns=None, stub=2.54, stubs=None,
             fields=None, hide_value=False, mirror=False):
        """Coloca un componente y conecta cada pin segun conns {pin: red}.

        red puede ser: 'GND', '+5V' (simbolo de alimentacion), 'NC' (sin conexion),
        None (el pin se conecta a mano con wire()) o un nombre de etiqueta.
        Devuelve {pin: (x, y)} con la posicion de cada pin.
        """
        flat, pos = self.symbol(libid, ref, value, x, y, r, footprint, fields, hide_value, mirror)
        done = set()
        for num, (lx, ly, la) in lib_pins(flat).items():
            px, py = pos[num]
            net = (conns or {}).get(num, None)
            if net is None:
                continue
            self.nets[(ref, num)] = net
            if net == 'NC':
                self.no_connect(px, py)
                continue
            if (px, py) in done:
                continue
            done.add((px, py))
            ox, oy = rot(math.cos(math.radians(la + 180)) * (-1 if mirror else 1),
                         -math.sin(math.radians(la + 180)), r)
            d = DIRS[(round(ox), round(oy))]
            ln = (stubs or {}).get(num, stub)
            ex, ey = round(px + round(ox) * ln, 4), round(py + round(oy) * ln, 4)
            self.wire(px, py, ex, ey)
            if net in ('GND', '+5V'):
                self.power(net, ex, ey, d)
            else:
                self.label(net, ex, ey, d)
        return pos

    # -- archivo ----------------------------------------------------------
    def save(self, path):
        body = [[S('junction'), [S('at'), x, y], [S('diameter'), 0], [S('color'), 0, 0, 0, 0], [S('uuid'), uid()]]
                for x, y in self.junctions()]
        body += [[S('wire'), [S('pts'), [S('xy'), a[0], a[1]], [S('xy'), b[0], b[1]]],
                  [S('stroke'), [S('width'), 0], [S('type'), S('default')]], [S('uuid'), uid()]]
                 for a, b in self.wires]
        doc = [S('kicad_sch'), [S('version'), 20250114], [S('generator'), 'eeschema'],
               [S('generator_version'), '9.0'], [S('uuid'), ROOT_UUID], [S('paper'), 'A3'],
               [S('title_block'),
                [S('title'), 'Entrenador de microcontroladores ATmega328P (DIP)'],
                [S('date'), '2026-10-30'], [S('rev'), '3'],
                [S('company'), 'Universidad de la Costa (CUC) — Sistemas Embebidos 1'],
                [S('comment'), 1, 'David Orozco · Jose Torres · Leo Rojas'],
                [S('comment'), 2, 'Actividad 10.1.12 · PCB de una cara (tóner o CNC)']],
               [S('lib_symbols')] + list(self.lib.values())] + body + self.items + [
            [S('sheet_instances'), [S('path'), '/', [S('page'), '1']]],
            [S('embedded_fonts'), S('no')]]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(dump(doc) + '\n')


# --------------------------------------------------------------------------
# Circuito
# --------------------------------------------------------------------------
FP_R = 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal'
FP_C = 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm'
FP_LED5 = 'LED_THT:LED_D5.0mm'
FP_Q = 'Package_TO_SOT_THT:TO-92_Inline_Wide'

HORIZ = {'Reference': (0, -2.54, None), 'Value': (0, 2.54, None)}
VLED = {'Reference': (3.81, -1.27, None), 'Value': (3.81, 1.27, None)}
VLED_L = {'Reference': (-3.81, -1.27, None), 'Value': (-6.35, 1.27, None)}

SEG = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']
# Linea del bus (SEG_A..SEG_DP = salida de R3..R10 = bit 0..7) que va a cada segmento a..dp de
# los displays y a cada LED0..LED7. Es el cableado de la placa armada a mano, medido con
# firmware/prueba-mapeo (PCB 2 en el firmware). La PCB de kicad/ (tools/generar_pcb.py) se
# ruteo con otro orden ('12034567' / '43716502', PCB 1) y no se actualizo.
SEG_PERM = '64072531'
LED_PERM = '01234567'
DISP_PIN = {'A': '7', 'B': '6', 'C': '4', 'D': '2', 'E': '1', 'F': '9', 'G': '10', 'DP': '5'}
# bit del bus -> pin del MCU (PD0/PD1 quedan libres para el FTDI)
BUS_PINS = ['PD2', 'PD3', 'PD4', 'PD5', 'PD6', 'PD7', 'PB0', 'PB1']


def build():
    sh = Sheet()

    # ---------------- Fuente ------------------------------------------------
    # J1 -> D1 -> C1/C2 -> 7805 -> C3/C4 -> LED de encendido, todo en una sola linea
    sh.box(12.7, 15.24, 152.4, 96.52, 'FUENTE: entrada hasta 12 V, protección de polaridad y regulador 5 V')
    yr = 43.18
    j1 = sh.part('Connector:Barrel_Jack', 'J1', '9-12 V DC', 22.86, yr + 2.54,
                 footprint='Connector_BarrelJack:BarrelJack_Horizontal')
    d1 = sh.part('Diode:1N4007', 'D1', '1N4007', 50.8, yr, r=180,
                 footprint='Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal')
    sh.cable(j1['1'], (33.02, yr), (38.1, yr), d1['2'])
    sh.label('VIN_RAW', 33.02, yr, 'R')
    sh.net('VIN_RAW', ('J1', '1'), ('D1', '2'))
    xg = j1['2'][0] + 5.08
    yf = j1['2'][1] + 5.08
    sh.cable(j1['2'], (xg, j1['2'][1]), (xg, yf), (xg, yf + 5.08))
    sh.power('GND', xg, yf + 5.08, 'D')
    sh.cable((xg, yf), (xg + 5.08, yf))
    sh.flag(xg + 5.08, yf, 'U')
    sh.net('GND', ('J1', '2'))
    # bornera en paralelo con el jack (antes de D1: la proteccion de polaridad cubre las dos)
    j4 = sh.part('Connector:Screw_Terminal_01x02', 'J4', 'Bornera 9-12 V', 22.86, 66.04, mirror=True,
                 footprint='TerminalBlock_Phoenix:TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal',
                 fields={'Reference': (0, -5.08, None), 'Value': (-5.08, 7.62, 'right')})
    xv = 38.1
    sh.cable(j4['1'], (xv, j4['1'][1]), (xv, yr))
    sh.cable(j4['2'], (30.48, j4['2'][1]), (30.48, j4['2'][1] + 5.08))
    sh.power('GND', 30.48, j4['2'][1] + 5.08, 'D')
    sh.net('VIN_RAW', ('J4', '1'))
    sh.net('GND', ('J4', '2'))

    u2 = sh.part('Regulator_Linear:L7805', 'U2', 'LM7805', 99.06, yr,
                 footprint='Package_TO_SOT_THT:TO-220-3_Vertical')
    sh.power('GND', *u2['2'], 'D')
    sh.net('GND', ('U2', '2'))
    caps_in = []
    for ref, val, x, fp, pol in (('C1', '100uF/25V', 66.04, 'Capacitor_THT:CP_Radial_D8.0mm_P3.50mm', True),
                                 ('C2', '0.33uF', 78.74, FP_C, False)):
        c = sh.part('Device:C_Polarized' if pol else 'Device:C', ref, val, x, yr + 10.16, footprint=fp)
        sh.cable((x, yr), c['1'])
        sh.power('GND', *c['2'], 'D')
        sh.net('VIN', (ref, '1'))
        sh.net('GND', (ref, '2'))
        caps_in.append((x, yr))
    sh.cable(d1['1'], (58.42, yr), caps_in[0], caps_in[1], (83.82, yr), u2['1'])
    sh.flag(58.42, yr, 'U')
    sh.label('VIN', 83.82, yr, 'R')
    sh.net('VIN', ('D1', '1'), ('U2', '1'))

    rail = [u2['3']]
    for ref, val, x, fp, pol in (('C3', '0.1uF', 114.3, FP_C, False),
                                 ('C4', '100uF/16V', 124.46, 'Capacitor_THT:CP_Radial_D6.3mm_P2.50mm', True)):
        c = sh.part('Device:C_Polarized' if pol else 'Device:C', ref, val, x, yr + 10.16, footprint=fp)
        sh.cable((x, yr), c['1'])
        sh.power('GND', *c['2'], 'D')
        sh.net('+5V', (ref, '1'))
        sh.net('GND', (ref, '2'))
        rail.append((x, yr))
    xl = 137.16
    r1 = sh.part('Device:R', 'R1', '1k', xl, yr + 8.89, footprint=FP_R)
    d2 = sh.part('Device:LED', 'D2', 'LED ON', xl, yr + 22.86, r=90, footprint='LED_THT:LED_D3.0mm',
                 fields=VLED_L)
    sh.cable(*rail, (xl, yr), (146.05, yr))
    sh.cable((xl, yr), r1['1'])
    sh.cable(r1['2'], d2['2'])
    sh.power('+5V', 146.05, yr, 'U')
    sh.power('GND', *d2['1'], 'D')
    sh.net('+5V', ('U2', '3'), ('R1', '1'))
    sh.net('LED_PWR', ('R1', '2'), ('D2', '2'))
    sh.net('GND', ('D2', '1'))
    sh.text('D1 en serie: si el jack se conecta al revés no circula corriente.\n'
            'Entrada mínima ≈ 7,7 V (2 V del 7805 + 0,7 V del diodo).\n'
            'Con 12 V usar disipador en U2.\n'
            'C2, C3 y C4 junto al 7805: sin ellos el micro se congelaba\n'
            'al multiplexar los displays (picos de ≈ 100 mA).\n'
            'J1 (jack) y J4 (bornera) van en paralelo: conectar solo una fuente.', 17.78, 80.01)

    # ---------------- Reloj -------------------------------------------------
    sh.box(157.48, 15.24, 213.36, 96.52, 'RELOJ 16 MHz')
    yx = 40.64
    y1 = sh.part('Device:Crystal', 'Y1', '16MHz', 185.42, yx, footprint='Crystal:Crystal_HC49-4H_Vertical')
    for ref, xc, pin, name, xe, d in (('C8', 175.26, '1', 'XTAL1', 165.1, 'L'),
                                      ('C9', 195.58, '2', 'XTAL2', 205.74, 'R')):
        c = sh.part('Device:C', ref, '22pF', xc, yx + 12.7, footprint=FP_C)
        sh.cable(y1[pin], (xc, yx), (xe, yx))
        sh.cable((xc, yx), c['1'])
        sh.power('GND', *c['2'], 'D')
        sh.label(name, xe, yx, d)
        sh.net(name, ('Y1', pin), (ref, '1'))
        sh.net('GND', (ref, '2'))
    sh.text('Cristal y capacitores de 22 pF\nlo más cerca posible de los\npines 9 y 10 del micro.', 162.56, 73.66)

    # ---------------- Reset -------------------------------------------------
    sh.box(218.44, 15.24, 274.32, 96.52, 'RESET')
    xr, yn = 238.76, 50.8
    r2 = sh.part('Device:R', 'R2', '10k', xr, 38.1, footprint=FP_R)
    sw1 = sh.part('Switch:SW_Push', 'SW1', 'Pulsador', 256.54, yn + 7.62, r=90,
                  footprint='Button_Switch_THT:SW_PUSH_6mm', fields=VLED)
    top, bot = sorted(('1', '2'), key=lambda k: sw1[k][1])
    sh.power('+5V', *r2['1'], 'U')
    sh.cable(r2['2'], (xr, yn))
    sh.cable((226.06, yn), (xr, yn), (sw1[top][0], yn), sw1[top])
    sh.power('GND', *sw1[bot], 'D')
    sh.label('RESET', 226.06, yn, 'L')
    sh.net('+5V', ('R2', '1'))
    sh.net('RESET', ('R2', '2'), ('SW1', top))
    sh.net('GND', ('SW1', bot))
    # C11 filtra el ruido de la pista de RESET; D11 recorta el pico que deja C10 (DTR) por encima de 5 V
    xc11 = 246.38
    c11 = sh.part('Device:C', 'C11', '10nF', xc11, yn + 7.62, footprint=FP_C,
                  fields={'Reference': (-2.54, -1.27, 'right'), 'Value': (-2.54, 1.27, 'right')})
    sh.cable((xc11, yn), c11['1'])
    sh.power('GND', *c11['2'], 'D')
    xd = 231.14
    d11 = sh.part('Diode:1N4148', 'D11', '1N4148', xd, yn - 7.62, r=270,
                  footprint='Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
                  fields={'Reference': (-2.54, -1.27, 'right'), 'Value': (-2.54, 1.27, 'right')})
    k, a = d11['1'], d11['2']
    assert k[1] < a[1], 'D11: el catodo debe quedar arriba (hacia +5V)'
    sh.cable(a, (xd, yn))
    sh.cable(k, (xd, k[1] - 2.54))
    sh.power('+5V', xd, k[1] - 2.54, 'U')
    sh.net('RESET', ('C11', '1'), ('D11', '2'))
    sh.net('GND', ('C11', '2'))
    sh.net('+5V', ('D11', '1'))
    sh.text('Pull-up de 10 kΩ: RESET en alto.\nAl pulsar SW1 el pin 1 va a GND\ny el micro se reinicia.\n'
            'C11 filtra el ruido de la pista;\nD11 recorta el pico de C10 (DTR).', 223.52, 73.66)

    # ---------------- Programacion -----------------------------------------
    sh.box(279.4, 15.24, 406.4, 96.52, 'PROGRAMACIÓN Y SERIE: Arduino Uno por ICSP (J3) y por serie (J2)')
    j2 = sh.part('Connector_Generic:Conn_01x06', 'J2', 'FTDI', 307.34, 45.72, r=180,
                 footprint='Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical',
                 conns={'3': '+5V', '4': 'RXD', '5': 'TXD'}, stub=5.08)
    # GND y CTS del modulo FTDI unidos
    xg = j2['1'][0] + 7.62
    sh.cable(j2['2'], (xg, j2['2'][1]), (xg, j2['1'][1]), (xg, j2['1'][1] + 2.54))
    sh.cable(j2['1'], (xg, j2['1'][1]))
    sh.power('GND', xg, j2['1'][1] + 2.54, 'D')
    sh.net('GND', ('J2', '1'), ('J2', '2'))
    # DTR -> C10 -> RESET (auto-reset al subir el programa)
    yd = j2['6'][1]
    c10 = sh.part('Device:C', 'C10', '0.1uF', 330.2, yd, r=90, footprint=FP_C, fields=HORIZ)
    sh.cable(j2['6'], (316.23, yd), c10['1'])
    sh.label('DTR', 316.23, yd, 'R')
    sh.cable(c10['2'], (345.44, yd))
    sh.label('RESET', 345.44, yd, 'R')
    sh.net('DTR', ('J2', '6'), ('C10', '1'))
    sh.net('RESET', ('C10', '2'))
    sh.text('J2 (mismo orden que el módulo FTDI):\n'
            '1 GND   ← GND del Uno\n2 CTS (a GND)\n3 VCC 5 V (no unir el 5 V del Uno)\n'
            '4 RXI   ← D3 del Uno (o TX del FTDI)\n5 TXO   → D2 del Uno (o RX del FTDI)\n6 DTR  (auto-reset, solo FTDI)\n'
            'Serie de la app: Uno con firmware/puente-uno, 19200 baud.',
            284.48, 58.42)
    sh.text('C10: el pulso de DTR reinicia el micro\nal subir el programa (auto-reset).', 327.66, 45.72)
    sh.part('Connector:AVR-ISP-6', 'J3', 'ICSP', 378.46, 60.96,
            footprint='Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical',
            conns={'1': 'SEL_UNI', '2': '+5V', '3': 'SCK', '4': 'SEL_DEC', '5': 'RESET', '6': 'GND'}, stub=5.08)
    sh.text('J3 con Arduino Uno + sketch ArduinoISP:\n'
            'D10→RST  D11→MOSI (PB3)  D12→MISO (PB4)  D13→SCK (PB5)  GND→GND\n'
            '10 µF entre RESET y GND del Uno. No unir el 5 V del Uno si hay 7805.', 322.58, 81.28)

    # ---------------- Microcontrolador --------------------------------------
    sh.box(12.7, 101.6, 132.08, 248.92, 'MICROCONTROLADOR')
    mcu = {'1': 'RESET', '2': 'RXD', '3': 'TXD', '9': 'XTAL1', '10': 'XTAL2', '7': '+5V', '20': '+5V',
           '8': 'GND', '22': 'GND', '21': 'AREF', '23': 'POT', '24': 'DIP1', '25': 'DIP2', '26': 'DIP3',
           '27': 'DIP4', '28': 'BOTONES', '16': 'SEL_LED', '17': 'SEL_DEC', '18': 'SEL_UNI', '19': 'SCK'}
    pinnum = {'PD2': '4', 'PD3': '5', 'PD4': '6', 'PD5': '11', 'PD6': '12', 'PD7': '13', 'PB0': '14', 'PB1': '15'}
    for bit, p in enumerate(BUS_PINS):
        mcu[pinnum[p]] = 'BUS%d' % bit
    sh.part('MCU_Microchip_ATmega:ATmega328P-P', 'U1', 'ATmega328P-PU', 68.58, 176.53,
            footprint='Package_DIP:DIP-28_W7.62mm_Socket', conns=mcu, stub=5.08, stubs={'20': 7.62, '8': 2.54})
    sh.part('Device:C', 'C5', '0.1uF', 22.86, 223.52, footprint=FP_C, conns={'1': '+5V', '2': 'GND'})
    sh.part('Device:C', 'C6', '0.1uF', 33.02, 223.52, footprint=FP_C, conns={'1': '+5V', '2': 'GND'})
    sh.part('Device:C', 'C7', '0.1uF', 43.18, 223.52, footprint=FP_C, conns={'1': 'AREF', '2': 'GND'})
    sh.text('C5 junto a VCC (7), C6 junto a AVCC (20),\nC7 en AREF (21). Los dos GND (8 y 22) a tierra.\n'
            'C5/C6 pegados al chip y cristal junto a los pines 9–10:\nreducen el ruido del multiplexado.',
            17.78, 236.22)
    sh.text('Equivalencias Arduino:\nPD2..PD7 = D2..D7    PB0..PB5 = D8..D13\n'
            'PC0..PC5 = A0..A5    PD0/PD1 = RX/TX (FTDI)', 17.78, 106.68)

    # ---------------- Salidas -----------------------------------------------
    sh.box(137.16, 101.6, 406.4, 205.74, 'SALIDAS: bus de 8 bits compartido por 8 LED y 2 displays (multiplexado)')
    for i in range(8):
        y = 116.84 + i * 7.62
        sh.part('Device:R', 'R%d' % (3 + i), '220', 157.48, y, r=90, footprint=FP_R,
                conns={'1': 'BUS%d' % i, '2': 'SEG_' + SEG[i]}, stub=5.08, fields=HORIZ)
    # LEDs con los catodos unidos por cable
    kx = []
    for i in range(8):
        x = 190.5 + i * 7.62
        pos = sh.part('Device:LED', 'D%d' % (3 + i), 'LED%d' % i, x, 125.73, r=90, footprint=FP_LED5,
                      conns={'2': 'SEG_' + SEG[int(LED_PERM[i])]}, stub=5.08,
                      fields=VLED, hide_value=True)
        kx.append(pos['1'])
        sh.net('K_LEDS', ('D%d' % (3 + i), '1'))
    yb = kx[0][1] + 7.62
    for (x, y) in kx:
        sh.wire(x, y, x, yb)
    for i in range(7):
        sh.wire(kx[i][0], yb, kx[i + 1][0], yb)
    sh.wire(kx[-1][0], yb, kx[-1][0] + 7.62, yb)
    sh.label('K_LEDS', kx[-1][0] + 7.62, yb, 'R')
    sh.text('SEG_A..SEG_DP = líneas del bus que salen de R3..R10 (bit 0..7).\n'
            'Cableado de la placa armada (medido con firmware/prueba-mapeo):\n'
            'LEDi = bit i (LED0 abajo). Segmentos a=6 b=4 c=0 d=7 e=2 f=5 g=3 dp=1.\n'
            'dp en bit 1 sin confirmar. El firmware lo compensa (BIT_SEG/BIT_LED, PCB 2).', 187.96, 149.86)

    for ref, name, x, k in (('U3', 'DECENAS', 294.64, 'K_DEC'), ('U4', 'UNIDADES', 355.6, 'K_UNI')):
        pos = sh.part('Display_Character:KCSC02-105', ref, '5161AS ' + name, x, 124.46,
                      footprint='entrenador:Display_5161AS',
                      conns=dict({DISP_PIN[sg]: 'SEG_' + SEG[int(SEG_PERM[s])] for s, sg in enumerate(SEG)},
                                 **{'3': None, '8': None}), stub=5.08,
                      fields={'Reference': (0, -17.78, None), 'Value': (0, -15.24, None)})
        (x3, y3), (x8, y8) = pos['3'], pos['8']
        sh.wire(x3, y3, x8, y8)
        sh.wire(x8, y8, x8 + 5.08, y8)
        sh.label(k, x8 + 5.08, y8, 'R')
        sh.nets[(ref, '3')] = sh.nets[(ref, '8')] = k
    sh.text('Displays de cátodo común (pines 3 y 8 = CC).\nPinout 5161AS = KCSC02-105.', 287.02, 142.24)

    # transistores de selección
    for i, (sel, k, x) in enumerate((('SEL_LED', 'K_LEDS', 218.44), ('SEL_DEC', 'K_DEC', 284.48),
                                     ('SEL_UNI', 'K_UNI', 350.52))):
        rpos = sh.part('Device:R', 'R%d' % (11 + i), '1k', x - 15.24, 180.34, r=90, footprint=FP_R,
                       conns={'1': sel}, stub=5.08, fields=HORIZ)
        qpos = sh.part('Transistor_BJT:PN2222A', 'Q%d' % (1 + i), '2N2222', x, 180.34, footprint=FP_Q,
                       conns={'3': k, '1': 'GND'}, stub=5.08)
        sh.wire(rpos['2'][0], rpos['2'][1], qpos['2'][0], qpos['2'][1])
        sh.nets[('R%d' % (11 + i), '2')] = sh.nets[('Q%d' % (1 + i), '2')] = 'BASE_Q%d' % (1 + i)
    sh.text('Q1 enciende los LED, Q2 el display de decenas y Q3 el de unidades.\n'
            'Solo un grupo activo a la vez (cada 2 ms). OJO: verificar el pinout E-B-C del 2N2222 comprado.',
            142.24, 194.31)

    # ---------------- Entradas ----------------------------------------------
    sh.box(137.16, 210.82, 297.18, 278.13, 'ENTRADAS')
    sh.part('Device:R_Potentiometer', 'RV1', '10k', 152.4, 241.3,
            footprint='entrenador:Pot_3pin_P5.00mm',
            conns={'1': '+5V', '3': 'GND', '2': 'POT'}, stub=5.08)
    sh.text('Potenciómetro → ADC0 (A0)', 142.24, 266.7)
    dip = sh.part('Switch:SW_DIP_x04', 'SW2', 'DIP x4', 190.5, 241.3,
                  footprint='Button_Switch_THT:SW_DIP_SPSTx04_Slide_9.78x12.34mm_W7.62mm_P2.54mm',
                  conns={'8': 'DIP1', '7': 'DIP2', '6': 'DIP3', '5': 'DIP4',
                         '1': None, '2': None, '3': None, '4': None}, stub=5.08)
    col = sorted((dip[p] for p in '1234'), key=lambda t: t[1])
    for a, b in zip(col, col[1:]):
        sh.wire(a[0], a[1], b[0], b[1])
    sh.wire(col[-1][0], col[-1][1], col[-1][0] - 5.08, col[-1][1])
    sh.power('GND', col[-1][0] - 5.08, col[-1][1], 'L')
    for p in '1234':
        sh.nets[('SW2', p)] = 'GND'
    sh.text('Pull-up interna (INPUT_PULLUP):\ninterruptor cerrado = 0, abierto = 1.\nDIP1..DIP4 → PC1..PC4 (A1..A4)',
            172.72, 256.54)

    # Botones en escalera: una sola entrada analogica (PC5) para B1..B5. R14..R18 en serie
    # desde +5V; cada boton une su punto de la cadena con BOTONES, que R19 baja a GND.
    ych, yc = 228.6, 248.92
    xs = 218.44
    sh.power('+5V', xs, ych - 5.08, 'U')
    sh.cable((xs, ych - 5.08), (xs, ych))
    prev = (xs, ych)
    taps = []
    for i in range(5):
        c = xs + 5.08 + i * 10.16
        rpos = sh.part('Device:R', 'R%d' % (14 + i), '2.2k', c, ych, r=90, footprint=FP_R, fields=HORIZ)
        izq, der = sorted(('1', '2'), key=lambda k: rpos[k][0])
        tap = (c + 5.08, ych)
        sh.cable(prev, rpos[izq])
        sh.cable(rpos[der], tap)
        sh.nets[('R%d' % (14 + i), izq)] = '+5V' if i == 0 else 'ESCALERA%d' % i
        sh.nets[('R%d' % (14 + i), der)] = 'ESCALERA%d' % (i + 1)
        prev = tap
        taps.append(tap)
    for i, (tx, ty) in enumerate(taps):
        ref = 'SW%d' % (3 + i)
        spos = sh.part('Switch:SW_Push', ref, 'B%d' % (i + 1), tx, ych + 10.16, r=90,
                       footprint='Button_Switch_THT:SW_PUSH_6mm', fields=VLED)
        arriba, abajo = sorted(('1', '2'), key=lambda k: spos[k][1])
        sh.cable((tx, ty), spos[arriba])
        sh.cable(spos[abajo], (tx, yc))
        sh.nets[(ref, arriba)] = 'ESCALERA%d' % (i + 1)
        sh.nets[(ref, abajo)] = 'BOTONES'
    xr = taps[-1][0] + 7.62
    xcap = xr + 10.16
    sh.wire(xs + 2.54, yc, xcap, yc)
    sh.label('BOTONES', xs + 2.54, yc, 'L')
    r19 = sh.part('Device:R', 'R19', '10k', xr, yc + 7.62, footprint=FP_R, fields=VLED)
    sh.cable((xr, yc), r19['1'])
    sh.power('GND', *r19['2'], 'D')
    c12 = sh.part('Device:C', 'C12', '0.1uF', xcap, yc + 7.62, footprint=FP_C, fields=VLED)
    sh.cable((xcap, yc), c12['1'])
    sh.power('GND', *c12['2'], 'D')
    sh.nets[('R19', '1')] = sh.nets[('C12', '1')] = 'BOTONES'
    sh.nets[('R19', '2')] = sh.nets[('C12', '2')] = 'GND'
    sh.text('Botones B1..B5 en escalera → PC5 (A5, pin 28).\n'
            'Sin pulsar: 0 V (R19). Bn: 5 V × 10k / (10k + n × 2,2k).\n'
            'Lecturas: B1 838, B2 710, B3 616, B4 544, B5 487.\n'
            'Dos a la vez: gana el menor. PC5 sin pull-up interna.',
            218.44, 266.7)

    # ---------------- Puntos de prueba ---------------------------------------
    sh.box(302.26, 210.82, 406.4, 250.19, 'PUNTOS DE PRUEBA (lazos de alambre para el multímetro)')
    for i, (net, label) in enumerate((('GND', 'GND'), ('GND', 'GND'), ('VIN', 'VIN'), ('+5V', '+5V'),
                                      ('POT', 'POT'), ('RESET', 'RESET'))):
        sh.part('Connector:TestPoint', 'TP%d' % (i + 1), label, 314.96 + i * 15.24, 226.06,
                footprint='TestPoint:TestPoint_Loop_D2.50mm_Drill1.0mm', conns={'1': net}, stub=5.08)
    sh.text('VIN ≈ entrada − 0,7 V; +5V entre 4,8 y 5,2 V; POT de 0 a 5 V al girar;\n'
            'RESET en 5 V (0 V al pulsar).', 307.34, 240.03)

    # ---------------- Notas -------------------------------------------------
    sh.text('NOTAS\n'
            '1. Alimentación de 9 a 12 V CC por J1 (jack) o J4 (bornera). D1 bloquea la polaridad invertida.\n'
            '2. Se programa por J3 con un Arduino Uno como ISP. Fusibles grabados: L 0xFF, H 0xDE, E 0xFD\n'
            '    (cristal de 16 MHz, Optiboot de 512 B, brown-out en 2,7 V). J2 lleva el serie de la app.\n'
            '3. Bus de 8 bits compartido: Q1, Q2 y Q3 encienden un solo grupo a la vez (multiplexado).\n'
            '4. Entradas: potenciómetro en ADC0; DIP en PC1–PC4 con pull-up interna (cerrado = 0);\n'
            '    botones B1–B5 en escalera en ADC5 (PC5).\n'
            '5. PCB de una cara: el DIP lleva las señales en los pines 8–5 y GND en 1–4 para no cruzar\n'
            '    pistas. Puentes de alambre en kicad/fabricacion/PUENTES.md.\n'
            '6. La placa armada se cableó a mano; el orden del bus es el de SALIDAS, no el de la PCB de kicad/.\n'
            '7. Revisar al armar: emisor de Q1 a GND; SEL_LED, SEL_DEC y SEL_UNI a los pines 16, 17 y 18;\n'
            '    GND del Uno unido al de la placa (sin él el ISP lee la firma 00 00 00).',
            17.78, 252.73, size=1.4)

    sh.save(OUT)
    return sh


if __name__ == '__main__':
    s = build()
    print('Esquematico generado:', os.path.abspath(OUT))
