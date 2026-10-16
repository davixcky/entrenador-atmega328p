"""Parser y serializador minimo de S-expressions de KiCad."""
import re

_TOKEN = re.compile(r'\s*(?:(\()|(\))|("(?:[^"\\]|\\.)*")|([^\s()"]+))')


class Sym(str):
    """Atomo sin comillas (keyword o numero)."""


def parse(text):
    stack, cur, pos = [], [], 0
    while True:
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            break
        pos = m.end()
        if m.group(1):
            stack.append(cur)
            cur = []
        elif m.group(2):
            done = cur
            cur = stack.pop()
            cur.append(done)
        elif m.group(3):
            cur.append(bytes(m.group(3)[1:-1], 'utf-8').decode('unicode_escape')
                       if '\\' in m.group(3) else m.group(3)[1:-1])
        else:
            cur.append(Sym(m.group(4)))
    return cur[0]


def dump(node, indent=0):
    if isinstance(node, list):
        if all(not isinstance(x, list) for x in node):
            return '(' + ' '.join(dump(x) for x in node) + ')'
        pad = '\t' * (indent + 1)
        parts, inline = [], []
        for x in node:
            if isinstance(x, list):
                parts.append(dump(x, indent + 1))
            elif parts:
                parts.append(dump(x))
            else:
                inline.append(dump(x))
        return '(' + ' '.join(inline) + '\n' + '\n'.join(pad + p for p in parts) + '\n' + '\t' * indent + ')'
    if isinstance(node, Sym):
        return str(node)
    if isinstance(node, bool):
        return 'yes' if node else 'no'
    if isinstance(node, (int, float)):
        return fmt(node)
    return '"' + str(node).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'


def fmt(v):
    s = ('%.4f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def find(node, key):
    return [x for x in node if isinstance(x, list) and x and x[0] == key]


def first(node, key):
    r = find(node, key)
    return r[0] if r else None
