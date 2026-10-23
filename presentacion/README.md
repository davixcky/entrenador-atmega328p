# Exposición final — Entrenador ATmega328P

Presentación en español: **17 diapositivas principales + 2 anexos**, aproximadamente **16–18 minutos** incluida la demostración. El enfoque principal es el firmware: estructura, registros, entradas, modos, temporización, interrupciones y programación. El hardware se explica en tres diapositivas breves: arquitectura, alimentación/reloj/RESET e interfaz de entradas y salidas. El esquema queda como anexo opcional. Incluye un reparto sugerido entre David Orozco, Jose Torres y Leo Rojas y notas para cada diapositiva.

## Archivos para presentar

- [presentacion-final.pdf](presentacion-final.pdf): versión lista para proyectar o entregar.
- [presentacion-final.pptx](presentacion-final.pptx): copia para PowerPoint; las diapositivas se exportan como imágenes, no como objetos editables.
- [guion.pdf](guion.pdf): notas y secuencia de demostración para ensayar.
- [slides.md](slides.md): fuente editable del contenido y las notas.
- [style.css](style.css): diseño visual.

## Presentar desde el navegador

Requiere Node.js y pnpm. Desde esta carpeta:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abrir la dirección indicada por Slidev. Usar las flechas para avanzar y la vista de presentador para consultar las notas. Las fuentes son locales; no se necesitan Google Fonts ni imágenes remotas.

## Generar entregables

```bash
pnpm build
pnpm export
pnpm run export:pptx
```

Para exportar con Chrome instalado en este equipo:

```bash
pnpm exec slidev export --executable-path /usr/bin/google-chrome-stable --output presentacion-final.pdf
pnpm exec slidev export --executable-path /usr/bin/google-chrome-stable --format pptx --output presentacion-final.pptx
```

El PDF del guion se genera desde la raíz del repositorio con `python3 tools/md_a_pdf.py presentacion/guion.md presentacion/guion.pdf`.

La versión 14.1.0 de markdown-it está fijada mediante un override porque @comark/markdown-it 0.3.4 importa una ruta interna no exportada por markdown-it 15. El lockfile fija las dependencias.

## Evidencia y alcance

El equipo confirmó el **23 de octubre de 2026** que el hardware funcional está terminado. La presentación incorpora esa actualización. La presentación utiliza diagramas funcionales y el esquemático; la demostración final usa la placa física. Las vistas de montaje y ruteo se omiten por preferencia del equipo. No se atribuyen nuevas mediciones o fotografías al montaje final.

Los fragmentos de código provienen de `firmware/entrenador/entrenador.ino`, con comentarios omitidos y saltos de línea adaptados cuando ayuda a leerlos. No se modificó el firmware. Los fusibles 0xF7 / 0xDE / 0xFC se presentan como configuración recomendada en el diseño, no como una lectura nueva del chip. Los detalles de fabricación y el informe DRC se consultan en el repositorio; no forman parte de la explicación principal.

En modo DIP, SW2/SW1 deben permanecer en 10: variar SW3/SW4 permite mostrar 02, 06, 10 y 14. El firmware incluido no permite recorrer los 16 valores sin cambiar también de modo.

Fuente del enunciado: [material del curso, sección 10.1.12](https://nemog3762.gitlab.io/material/compiled/Sistemas%20embebidos%201.html#org72dbe7e). El resto del contenido se basa en el esquema, firmware, reportes y documentación de este repositorio.
