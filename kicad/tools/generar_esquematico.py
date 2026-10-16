"""Genera el esquematico de KiCad del entrenador ATMega328P.

Uso: python3 generar_esquematico.py  ->  ../entrenador-atmega328p.kicad_sch

Cada pin se conecta con un tramo corto de cable y una etiqueta de red (o un
simbolo de alimentacion). Dos etiquetas con el mismo nombre son la misma red.
"""
import math
import os
import uuid as uuidlib

from sexpr import Sym, dump, find, first, parse

LIBDIR = '/usr/share/kicad/symbols/'
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
        self.pwr_n = 0
        self.nets = {}  # (ref, pin) -> red (para la verificacion)

    def libsym(self, libid):
        if libid not in self.lib:
            self.lib[libid] = flatten(libid)
        return self.lib[libid]

    # -- primitivas -------------------------------------------------------
    def wire(self, x1, y1, x2, y2):
        self.items.append([S('wire'), [S('pts'), [S('xy'), x1, y1], [S('xy'), x2, y2]],
                           [S('stroke'), [S('width'), 0], [S('type'), S('default')]],
                           [S('uuid'), uid()]])

    def junction(self, x, y):
        self.items.append([S('junction'), [S('at'), x, y], [S('diameter'), 0],
                           [S('color'), 0, 0, 0, 0], [S('uuid'), uid()]])

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
    def symbol(self, libid, ref, value, x, y, r=0, footprint='', fields=None, hide_value=False):
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
        node = [S('symbol'), [S('lib_id'), libid], [S('at'), x, y, r], [S('unit'), 1],
                [S('exclude_from_sim'), S('no')], [S('in_bom'), S('no') if is_power else S('yes')],
                [S('on_board'), S('no') if is_power else S('yes')], [S('dnp'), S('no')],
                [S('uuid'), uid()]] + props
        for num in lib_pins(flat):
            node.append([S('pin'), num, [S('uuid'), uid()]])
        node.append([S('instances'), [S('project'), PROJECT,
                                      [S('path'), '/' + ROOT_UUID, [S('reference'), ref], [S('unit'), 1]]]])
        self.items.append(node)
        return flat

    def power(self, kind, x, y, d):
        """Simbolo de alimentacion cuyo pin queda en (x, y), apuntando hacia d."""
        self.pwr_n += 1
        if kind == 'GND':
            r = {'D': 0, 'U': 180, 'R': 90, 'L': 270}[d]
        else:
            r = {'U': 0, 'D': 180, 'L': 90, 'R': 270}[d]
        self.symbol('power:' + kind, '#PWR%02d' % self.pwr_n, kind, x, y, r)

    def part(self, libid, ref, value, x, y, r=0, footprint='', conns=None, stub=2.54, stubs=None,
             fields=None, hide_value=False):
        """Coloca un componente y conecta cada pin segun conns {pin: red}.

        red puede ser: 'GND', '+5V' (simbolo de alimentacion), 'NC' (sin conexion),
        None (el pin se conecta a mano con wire()) o un nombre de etiqueta.
        Devuelve {pin: (x, y)} con la posicion de cada pin.
        """
        flat = self.symbol(libid, ref, value, x, y, r, footprint, fields, hide_value)
        pos, done = {}, set()
        for num, (lx, ly, la) in lib_pins(flat).items():
            px, py = rot(lx, -ly, r)
            px, py = round(x + px, 4), round(y + py, 4)
            pos[num] = (px, py)
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
            ox, oy = rot(math.cos(math.radians(la + 180)), -math.sin(math.radians(la + 180)), r)
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
        doc = [S('kicad_sch'), [S('version'), 20250114], [S('generator'), 'eeschema'],
               [S('generator_version'), '9.0'], [S('uuid'), ROOT_UUID], [S('paper'), 'A3'],
               [S('title_block'),
                [S('title'), 'Entrenador de microcontroladores ATMega328P (DIP)'],
                [S('date'), '2026-10-16'], [S('rev'), '1'],
                [S('company'), 'Sistemas Embebidos 1 - Actividad 10.1.12'],
                [S('comment'), 1, 'David Orozco, Jose Torres, Leo Rojas'],
                [S('comment'), 2, 'Programacion: Arduino Uno como ISP por J3 (probado) - FTDI por J2 (opcional)']],
               [S('lib_symbols')] + list(self.lib.values())] + self.items + [
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
FP_Q = 'Package_TO_SOT_THT:TO-92_Inline'

HORIZ = {'Reference': (0, -2.54, None), 'Value': (0, 2.54, None)}
VLED = {'Reference': (3.81, -1.27, None), 'Value': (3.81, 1.27, None)}
VLED_L = {'Reference': (-3.81, -1.27, None), 'Value': (-6.35, 1.27, None)}

SEG = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']
# bit del bus -> pin del MCU (PD0/PD1 quedan libres para el FTDI)
BUS_PINS = ['PD2', 'PD3', 'PD4', 'PD5', 'PD6', 'PD7', 'PB0', 'PB1']


def build():
    sh = Sheet()

    # ---------------- Fuente ------------------------------------------------
    sh.box(12.7, 15.24, 152.4, 96.52, 'FUENTE: entrada hasta 12 V, proteccion de polaridad y regulador 5 V')
    sh.part('Connector:Barrel_Jack', 'J1', '9-12 V DC', 25.4, 50.8, footprint='Connector_BarrelJack:BarrelJack_Horizontal',
            conns={'1': 'VIN_RAW', '2': 'GND'}, stubs={'1': 5.08, '2': 5.08})
    sh.part('Diode:1N4007', 'D1', '1N4007', 50.8, 43.18, r=180,
            footprint='Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal', conns={'2': 'VIN_RAW', '1': 'VIN'})
    sh.part('Device:C_Polarized', 'C1', '100uF/25V', 66.04, 53.34, footprint='Capacitor_THT:CP_Radial_D8.0mm_P3.50mm',
            conns={'1': 'VIN', '2': 'GND'})
    sh.part('Device:C', 'C2', '0.33uF', 81.28, 53.34, footprint=FP_C, conns={'1': 'VIN', '2': 'GND'})
    sh.part('Regulator_Linear:L7805', 'U2', 'LM7805', 104.14, 43.18,
            footprint='Package_TO_SOT_THT:TO-220-3_Vertical', conns={'1': 'VIN', '2': 'GND', '3': '+5V'})
    sh.part('Device:C', 'C3', '0.1uF', 124.46, 53.34, footprint=FP_C, conns={'1': '+5V', '2': 'GND'})
    sh.part('Device:C_Polarized', 'C4', '100uF/16V', 132.08, 53.34, footprint='Capacitor_THT:CP_Radial_D6.3mm_P2.50mm',
            conns={'1': '+5V', '2': 'GND'})
    r1 = sh.part('Device:R', 'R1', '1k', 146.05, 43.18, footprint=FP_R, conns={'1': '+5V', '2': None})
    d2 = sh.part('Device:LED', 'D2', 'LED ON', 146.05, 58.42, r=90, footprint='LED_THT:LED_D3.0mm',
                 conns={'2': None, '1': 'GND'}, fields=VLED_L)
    sh.wire(*r1['2'], *d2['2'])
    sh.nets[('R1', '2')] = sh.nets[('D2', '2')] = 'LED_PWR'
    sh.part('power:PWR_FLAG', '#FLG01', 'PWR_FLAG', 25.4, 73.66, conns={'1': 'VIN'}, stub=5.08)
    sh.part('power:PWR_FLAG', '#FLG02', 'PWR_FLAG', 43.18, 73.66, conns={'1': 'GND'}, stub=5.08)
    sh.text('D1 en serie: si el jack se conecta al reves no circula corriente.\n'
            'Entrada minima ~7.7 V (2 V del 7805 + 0.7 V del diodo).\n'
            'Con 12 V usar disipador en U2.\n'
            'C2, C3 y C4 junto al 7805: sin ellos el micro se congelaba\n'
            'al multiplexar los displays (picos de ~100 mA).', 55.88, 73.66)

    # ---------------- Reloj -------------------------------------------------
    sh.box(157.48, 15.24, 213.36, 96.52, 'RELOJ 16 MHz')
    sh.part('Device:Crystal', 'Y1', '16MHz', 185.42, 38.1, footprint='Crystal:Crystal_HC49-4H_Vertical',
            conns={'1': 'XTAL1', '2': 'XTAL2'}, stub=5.08)
    sh.part('Device:C', 'C8', '22pF', 172.72, 63.5, footprint=FP_C, conns={'1': 'XTAL1', '2': 'GND'})
    sh.part('Device:C', 'C9', '22pF', 198.12, 63.5, footprint=FP_C, conns={'1': 'XTAL2', '2': 'GND'})

    # ---------------- Reset -------------------------------------------------
    sh.box(218.44, 15.24, 274.32, 96.52, 'RESET')
    sh.part('Device:R', 'R2', '10k', 233.68, 43.18, footprint=FP_R, conns={'1': '+5V', '2': 'RESET'})
    sh.part('Switch:SW_Push', 'SW1', 'Pulsador', 254.0, 60.96, r=90, footprint='Button_Switch_THT:SW_PUSH_6mm',
            conns={'2': 'RESET', '1': 'GND'}, fields=VLED)
    sh.text('Pull-up de 10k: RESET en alto.\nAl pulsar SW1 el pin 1 va a GND\ny el micro se reinicia.', 223.52, 76.2)

    # ---------------- Programacion -----------------------------------------
    sh.box(279.4, 15.24, 406.4, 96.52, 'PROGRAMACION: ICSP con Arduino Uno (principal) y FTDI (opcional)')
    sh.part('Connector_Generic:Conn_01x06', 'J2', 'FTDI', 307.34, 45.72, r=180,
            footprint='Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical',
            conns={'1': 'GND', '2': 'GND', '3': '+5V', '4': 'RXD', '5': 'TXD', '6': 'DTR'}, stub=5.08,
            stubs={'2': 12.7})
    sh.text('J2 (mismo orden que el modulo FTDI):\n'
            '1 GND\n2 CTS (a GND)\n3 VCC 5V\n4 RXI  <- TX del FTDI\n5 TXO  -> RX del FTDI\n6 DTR  (auto-reset)',
            284.48, 58.42)
    sh.part('Device:C', 'C10', '0.1uF', 340.36, 33.02, r=90, footprint=FP_C, conns={'1': 'DTR', '2': 'RESET'},
            stub=5.08, fields=HORIZ)
    sh.text('C10: el pulso de DTR reinicia el micro\nal subir el programa (auto-reset).', 325.12, 40.64)
    sh.part('Connector:AVR-ISP-6', 'J3', 'ICSP', 378.46, 60.96,
            footprint='Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical',
            conns={'1': 'SEL_UNI', '2': '+5V', '3': 'SCK', '4': 'SEL_DEC', '5': 'RESET', '6': 'GND'}, stub=5.08)
    sh.text('J3 con Arduino Uno + sketch ArduinoISP:\n'
            'D10->RST  D11->MOSI(PB3)  D12->MISO(PB4)  D13->SCK(PB5)  GND->GND\n'
            '10uF entre RESET y GND del Uno. No unir el 5V del Uno si hay 7805.', 325.12, 81.28)

    # ---------------- Microcontrolador --------------------------------------
    sh.box(12.7, 101.6, 132.08, 248.92, 'MICROCONTROLADOR')
    mcu = {'1': 'RESET', '2': 'RXD', '3': 'TXD', '9': 'XTAL1', '10': 'XTAL2', '7': '+5V', '20': '+5V',
           '8': 'GND', '22': 'GND', '21': 'AREF', '23': 'POT', '24': 'DIP1', '25': 'DIP2', '26': 'DIP3',
           '27': 'DIP4', '28': 'NC', '16': 'SEL_LED', '17': 'SEL_DEC', '18': 'SEL_UNI', '19': 'SCK'}
    pinnum = {'PD2': '4', 'PD3': '5', 'PD4': '6', 'PD5': '11', 'PD6': '12', 'PD7': '13', 'PB0': '14', 'PB1': '15'}
    for bit, p in enumerate(BUS_PINS):
        mcu[pinnum[p]] = 'BUS%d' % bit
    sh.part('MCU_Microchip_ATmega:ATmega328P-P', 'U1', 'ATmega328P-PU', 68.58, 176.53,
            footprint='Package_DIP:DIP-28_W7.62mm_Socket', conns=mcu, stub=5.08, stubs={'20': 7.62, '8': 2.54})
    sh.part('Device:C', 'C5', '0.1uF', 22.86, 223.52, footprint=FP_C, conns={'1': '+5V', '2': 'GND'})
    sh.part('Device:C', 'C6', '0.1uF', 33.02, 223.52, footprint=FP_C, conns={'1': '+5V', '2': 'GND'})
    sh.part('Device:C', 'C7', '0.1uF', 43.18, 223.52, footprint=FP_C, conns={'1': 'AREF', '2': 'GND'})
    sh.text('C5 junto a VCC (7), C6 junto a AVCC (20),\nC7 en AREF (21). Los dos GND (8 y 22) a tierra.\n'
            'C5/C6 pegados al chip y cristal junto a pines 9-10:\nreducen el ruido del multiplexado.',
            17.78, 236.22)
    sh.text('Equivalencias Arduino:\nPD2..PD7 = D2..D7    PB0..PB5 = D8..D13\n'
            'PC0..PC4 = A0..A4    PD0/PD1 = RX/TX (FTDI)', 17.78, 106.68)

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
                      conns={'2': 'SEG_' + SEG[i]}, stub=5.08,
                      fields=VLED, hide_value=True)
        kx.append(pos['1'])
    yb = kx[0][1] + 7.62
    for (x, y) in kx:
        sh.wire(x, y, x, yb)
    for i in range(7):
        sh.wire(kx[i][0], yb, kx[i + 1][0], yb)
    for (x, y) in kx[1:-1]:
        sh.junction(x, yb)
    sh.wire(kx[-1][0], yb, kx[-1][0] + 7.62, yb)
    sh.junction(kx[-1][0], yb)
    sh.label('K_LEDS', kx[-1][0] + 7.62, yb, 'R')
    sh.text('LED0..LED7 = bits 0..7 del bus', 187.96, 149.86)

    for ref, name, x, k in (('U3', 'DECENAS', 294.64, 'K_DEC'), ('U4', 'UNIDADES', 355.6, 'K_UNI')):
        pos = sh.part('Display_Character:KCSC02-105', ref, '5161AS ' + name, x, 124.46,
                      footprint='Display_7Segment:KCSC02-105',
                      conns={'7': 'SEG_A', '6': 'SEG_B', '4': 'SEG_C', '2': 'SEG_D', '1': 'SEG_E',
                             '9': 'SEG_F', '10': 'SEG_G', '5': 'SEG_DP', '3': None, '8': None}, stub=5.08,
                      fields={'Reference': (0, -17.78, None), 'Value': (0, -15.24, None)})
        (x3, y3), (x8, y8) = pos['3'], pos['8']
        sh.wire(x3, y3, x8, y8)
        sh.wire(x8, y8, x8 + 5.08, y8)
        sh.label(k, x8 + 5.08, y8, 'R')
        sh.nets[(ref, '3')] = sh.nets[(ref, '8')] = k
    sh.text('Displays de catodo comun (pines 3 y 8 = CC).\nPinout 5161AS = KCSC02-105.', 287.02, 142.24)

    # transistores de seleccion
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
    sh.box(137.16, 210.82, 287.02, 278.13, 'ENTRADAS')
    sh.part('Device:R_Potentiometer', 'RV1', '10k', 157.48, 241.3,
            footprint='Potentiometer_THT:Potentiometer_Piher_PT-10-V10_Vertical',
            conns={'1': '+5V', '3': 'GND', '2': 'POT'}, stub=5.08)
    sh.text('Potenciometro -> ADC0 (A0)', 142.24, 261.62)
    dip = sh.part('Switch:SW_DIP_x04', 'SW2', 'DIP x4', 218.44, 241.3,
                  footprint='Button_Switch_THT:SW_DIP_SPSTx04_Slide_9.78x12.34mm_W7.62mm_P2.54mm',
                  conns={'1': 'DIP1', '2': 'DIP2', '3': 'DIP3', '4': 'DIP4',
                         '5': None, '6': None, '7': None, '8': None}, stub=5.08)
    col = sorted((dip[p] for p in '5678'), key=lambda t: t[1])
    for a, b in zip(col, col[1:]):
        sh.wire(a[0], a[1], b[0], b[1])
    for p in col[1:-1]:
        sh.junction(*p)
    sh.wire(col[-1][0], col[-1][1], col[-1][0] + 5.08, col[-1][1])
    sh.junction(*col[-1])
    sh.power('GND', col[-1][0] + 5.08, col[-1][1], 'R')
    for p in '5678':
        sh.nets[('SW2', p)] = 'GND'
    sh.text('Pull-up interna (INPUT_PULLUP):\ninterruptor cerrado = 0, abierto = 1.\nDIP1..DIP4 -> PC1..PC4 (A1..A4)',
            200.66, 256.54)

    sh.save(OUT)
    return sh


if __name__ == '__main__':
    s = build()
    print('Esquematico generado:', os.path.abspath(OUT))
