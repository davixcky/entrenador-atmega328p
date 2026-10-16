"""Convierte un Markdown del repo a PDF con Chrome headless.

Uso: python3 tools/md_a_pdf.py README.md README.pdf
"""
import os
import subprocess
import sys
import tempfile

import markdown

CSS = """
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; line-height: 1.45; }
h1 { font-size: 18pt; border-bottom: 2px solid #2A6099; padding-bottom: 4px; color: #1a3f66; }
h2 { font-size: 13.5pt; color: #2A6099; margin-top: 18px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
h3 { font-size: 11.5pt; color: #2A6099; }
table { border-collapse: collapse; margin: 8px 0; width: 100%; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 1px solid #c8c8c8; padding: 3px 6px; vertical-align: top; }
th { background: #eef3f9; }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 8.8pt; background: #f2f2f2; padding: 0 2px; }
pre { background: #f2f2f2; border: 1px solid #e0e0e0; padding: 6px 8px; font-size: 8.5pt; overflow: hidden; white-space: pre-wrap; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
img { max-width: 100%; max-height: 110mm; display: block; margin: 6px auto; page-break-inside: avoid; }
blockquote { border-left: 3px solid #2A6099; margin: 8px 0; padding: 2px 10px; color: #444; background: #f5f7ff; }
a { color: #2A6099; text-decoration: none; }
"""


def main(src, dst):
    src, dst = os.path.abspath(src), os.path.abspath(dst)
    text = open(src, encoding='utf-8').read()
    body = markdown.markdown(text, extensions=['tables', 'fenced_code', 'sane_lists'])
    html = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="file://%s/">'
            '<style>%s</style></head><body>%s</body></html>') % (os.path.dirname(src), CSS, body)
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html)
        tmp = f.name
    try:
        subprocess.run(['google-chrome-stable', '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                        '--allow-file-access-from-files', '--print-to-pdf=' + dst, 'file://' + tmp],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    finally:
        os.unlink(tmp)
    print('PDF:', dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
