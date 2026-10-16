"""Genera CONEXIONES.md (red por red, pin por pin) a partir del netlist de KiCad."""
import sys
from sexpr import parse, find, first

root = parse(open(sys.argv[1], encoding='utf-8').read())
comps = {}
for c in find(first(root, 'components'), 'comp'):
    comps[first(c, 'ref')[1]] = first(c, 'value')[1]

ORDER = ['+5V', 'GND', 'VIN_RAW', 'VIN', 'LED_PWR', 'RESET', 'XTAL1', 'XTAL2', 'AREF', 'RXD', 'TXD', 'DTR',
         'SCK', 'POT', 'DIP1', 'DIP2', 'DIP3', 'DIP4'] + ['BUS%d' % i for i in range(8)] + \
        ['SEG_' + s for s in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']] + \
        ['SEL_LED', 'SEL_DEC', 'SEL_UNI', 'BASE_Q1', 'BASE_Q2', 'BASE_Q3', 'K_LEDS', 'K_DEC', 'K_UNI']


def key(ref):
    import re
    m = re.match(r'([A-Z]+)(\d+)', ref)
    return (m.group(1), int(m.group(2))) if m else (ref, 0)


EXTRA = {('J2', '1'): 'GND', ('J2', '2'): 'CTS', ('J2', '3'): 'VCC', ('J2', '4'): 'RXI (va al TX del FTDI)',
         ('J2', '5'): 'TXO (va al RX del FTDI)', ('J2', '6'): 'DTR', ('C1', '1'): '+ (positivo)',
         ('C1', '2'): '- (negativo)', ('C4', '1'): '+ (positivo)', ('C4', '2'): '- (negativo)'}

nets = {}
for net in find(first(root, 'nets'), 'net'):
    name = first(net, 'name')[1].lstrip('/')
    nodes = []
    for n in find(net, 'node'):
        ref, pin = first(n, 'ref')[1], first(n, 'pin')[1]
        fn = first(n, 'pinfunction')
        fn = fn[1] if fn else ''
        if fn.endswith('_' + pin):
            fn = fn[:-len(pin) - 1]
        fn = EXTRA.get((ref, pin), EXTRA.get((ref[:1], pin), fn)) if ref in ('J2', 'C1', 'C4') else fn
        nodes.append((ref, pin, fn))
    if name.startswith('Net-('):
        # redes sin etiqueta (resistencia -> base, R1 -> LED)
        refs = {r for r, _, _ in nodes}
        name = {frozenset({'R11', 'Q1'}): 'BASE_Q1', frozenset({'R12', 'Q2'}): 'BASE_Q2',
                frozenset({'R13', 'Q3'}): 'BASE_Q3', frozenset({'R1', 'D2'}): 'LED_PWR'}.get(frozenset(refs), name)
    if name.startswith('unconnected-'):
        continue
    nets[name] = sorted(nodes, key=lambda t: (key(t[0]), int(t[1]) if t[1].isdigit() else 0))

out = ['# Lista de conexiones del entrenador ATMega328P', '',
       'Generada automaticamente desde el netlist de KiCad (`tools/lista_conexiones.py`).',
       'Cada tabla es un **nodo**: todos los pines de la tabla van unidos entre si.',
       'En la protoboard, marcar cada conexion a medida que se hace.', '']
for name in [n for n in ORDER if n in nets] + sorted(n for n in nets if n not in ORDER):
    out += ['## ' + name, '', '| Hecho | Componente | Valor | Pin | Funcion del pin |', '|:-:|---|---|---:|---|']
    for ref, pin, fn in nets[name]:
        out.append('| [ ] | %s | %s | %s | %s |' % (ref, comps.get(ref, ''), pin, fn.replace('~{RESET}', '/RESET')))
    out.append('')
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(out))
print('redes:', len(nets))
