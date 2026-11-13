"""Compara el netlist exportado por KiCad con las conexiones esperadas del generador.

Uso: verificar_netlist.py ../out/net.xml  (kicadxml: incluye el ESP32 y el LCD)
"""
import sys
from sexpr import parse, find, first
import generar_esquematico as gen

expected = gen.build().nets
actual = {}
if sys.argv[1].endswith('.xml'):
    # kicadxml incluye los modulos externos (ESP32, LCD: "no va en la placa"), que el
    # netlist kicadsexpr de la PCB deja fuera
    import xml.etree.ElementTree as ET
    for net in ET.parse(sys.argv[1]).getroot().iter('net'):
        for node in net.iter('node'):
            actual[(node.get('ref'), node.get('pin'))] = net.get('name').lstrip('/')
else:
    root = parse(open(sys.argv[1], encoding='utf-8').read())
    for net in find(first(root, 'nets'), 'net'):
        name = first(net, 'name')[1].lstrip('/')
        for node in find(net, 'node'):
            actual[(first(node, 'ref')[1], first(node, 'pin')[1])] = name

errors = 0
groups = {}
for key, net in expected.items():
    if net == 'NC' or key[0].startswith('#'):
        continue
    got = actual.get(key)
    if got is None:
        print('SIN RED:', key, 'esperaba', net); errors += 1; continue
    groups.setdefault(net, set()).add(got)
for net, got in groups.items():
    if len(got) != 1:
        print('RED PARTIDA:', net, '->', got); errors += 1
names = {}
for net, got in groups.items():
    names.setdefault(next(iter(got)), []).append(net)
for k, v in names.items():
    if len(v) > 1:
        print('REDES UNIDAS POR ERROR:', v, '->', k); errors += 1
print('pines verificados:', len(expected), ' redes:', len(groups), ' errores:', errors)
