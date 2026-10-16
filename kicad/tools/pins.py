"""Muestra los pines de un simbolo de la libreria de KiCad: python pins.py Lib:Nombre"""
import sys
from sexpr import parse, find, first

LIBDIR = '/usr/share/kicad/symbols/'


def load_symbol(libid):
    lib, name = libid.split(':')
    root = parse(open(LIBDIR + lib + '.kicad_sym', encoding='utf-8').read())
    syms = {s[1]: s for s in find(root, 'symbol')}
    sym = syms[name]
    ext = first(sym, 'extends')
    return sym, (syms[ext[1]] if ext else sym)


def pins(libid):
    _, base = load_symbol(libid)
    out = []
    for unit in find(base, 'symbol'):
        for p in find(unit, 'pin'):
            at = first(p, 'at')
            out.append((first(p, 'number')[1], first(p, 'name')[1], p[1],
                        float(at[1]), float(at[2]), float(at[3]) if len(at) > 3 else 0.0))
    return out


if __name__ == '__main__':
    for libid in sys.argv[1:]:
        print('==', libid)
        for row in sorted(pins(libid), key=lambda r: (len(r[0]), r[0])):
            print('  %-4s %-14s %-14s (%7.2f, %7.2f) %3d' % row)
