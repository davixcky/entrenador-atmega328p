// Editor de texto del lenguaje (CodeMirror): resaltado, autocompletado con plantillas,
// ayuda de funciones, plegado de bloques, busqueda y errores en linea.
import { useEffect, useRef } from 'react'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippetCompletion,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  foldService,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState, StateField } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  showTooltip,
  type Tooltip,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { CONSTANTES, FUNCIONES, PALABRAS_CLAVE, type ErrorLenguaje } from '@entrenador/lenguaje'

const PALABRAS = new Set<string>(PALABRAS_CLAVE)

const lenguaje = StreamLanguage.define<{ nivel: number }>({
  name: 'entrenador',
  startState: () => ({ nivel: 0 }),
  token(flujo, estado) {
    if (flujo.eatSpace()) return null
    if (flujo.match('//')) {
      flujo.skipToEnd()
      return 'comment'
    }
    if (flujo.match(/^0[xX][0-9a-fA-F_]+/) || flujo.match(/^0[bB][01_]+/) || flujo.match(/^[0-9][0-9_]*/)) return 'number'
    const palabra = flujo.match(/^[\p{L}_][\p{L}\p{N}_]*/u) as RegExpMatchArray | null
    if (palabra) {
      const p = palabra[0]
      if (PALABRAS.has(p)) return 'keyword'
      if (p in CONSTANTES) return 'atom'
      if (p in FUNCIONES) return 'function'
      return 'variableName'
    }
    if (flujo.match(/^(==|!=|<=|>=|\+=|-=|[-+*/%<>=])/)) return 'operator'
    const c = flujo.next()
    if (c === '{') estado.nivel++
    else if (c === '}') estado.nivel = Math.max(0, estado.nivel - 1)
    return null
  },
  // Sangria segun las llaves abiertas (el estado las cuenta al leer los tokens)
  indent(estado, despues, contexto) {
    return Math.max(0, estado.nivel - (/^\s*}/.test(despues) ? 1 : 0)) * contexto.unit
  },
  languageData: { commentTokens: { line: '//' }, indentOnInput: /^\s*}$/ },
})

const resaltado = HighlightStyle.define([
  { tag: tags.keyword, color: '#c792ea', fontWeight: '600' },
  { tag: tags.comment, color: '#6b7386', fontStyle: 'italic' },
  { tag: tags.number, color: '#f78c6c' },
  { tag: tags.atom, color: '#ffcb6b' },
  { tag: tags.function(tags.variableName), color: '#82aaff' },
  { tag: tags.variableName, color: '#e6e8ee' },
  { tag: tags.operator, color: '#89ddff' },
])

const tema = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--fondo)', color: 'var(--texto)', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: 'var(--acento)', padding: '10px 0' },
    '.cm-cursor': { borderLeftColor: 'var(--acento)', borderLeftWidth: '2px' },
    '.cm-gutters': { backgroundColor: 'var(--fondo)', color: '#596075', border: 'none' },
    '.cm-activeLine': { backgroundColor: '#ffffff08' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--texto-suave)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#4c9aff40 !important' },
    '.cm-matchingBracket': { backgroundColor: '#4c9aff30', outline: 'none' },
    '.cm-tooltip': { backgroundColor: 'var(--superficie-2)', border: '1px solid var(--borde)', color: 'var(--texto)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--acento)', color: 'var(--acento-texto)' },
    '.cm-completionInfo': { padding: '6px 10px', maxWidth: '280px' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--error)' },
    '.cm-ayuda': { padding: '6px 10px', maxWidth: '340px', lineHeight: '1.5' },
    '.cm-ayuda code': { fontFamily: 'var(--mono)', color: '#82aaff', display: 'block', marginBottom: '2px' },
    '.cm-ayuda-activo': { color: 'var(--texto)', fontWeight: '700', textDecoration: 'underline' },
    '.cm-ayuda div': { color: 'var(--texto-suave)', fontSize: '12px' },
    '.cm-foldGutter .cm-gutterElement': { color: '#596075', cursor: 'pointer', padding: '0 4px' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--superficie-2)', border: '1px solid var(--borde)', color: 'var(--texto-suave)' },
    '.cm-searchMatch': { backgroundColor: '#ffcb6b33', outline: '1px solid #ffcb6b66' },
    '.cm-searchMatch-selected': { backgroundColor: '#ffcb6b66' },
    '.cm-selectionMatch': { backgroundColor: '#4c9aff26' },
    '.cm-panels': { backgroundColor: 'var(--superficie)', color: 'var(--texto)', borderColor: 'var(--borde)' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '12px' },
  },
  { dark: true },
)

// Ayuda de cada palabra clave, para el autocompletado y al pasar el raton
const AYUDA_PALABRAS: Record<string, string> = {
  si: 'si condición { ... } sino { ... }: ejecuta un bloque solo si se cumple la condición',
  sino: 'Bloque que se ejecuta cuando la condición del "si" no se cumple. "sino si" encadena otra condición',
  mientras: 'mientras condición { ... }: repite el bloque mientras se cumpla la condición',
  repetir: 'repetir n { ... }: repite el bloque n veces',
  siempre: 'siempre { ... }: repite el bloque sin fin',
  romper: 'Sale del bucle en el que está',
  continuar: 'Salta a la siguiente vuelta del bucle',
  detener: 'Termina el programa; las salidas quedan como están',
  y: 'a y b: verdadero si se cumplen las dos',
  o: 'a o b: verdadero si se cumple alguna',
  no: 'no a: verdadero si a es falso',
}

// Plantillas: Tab salta entre los huecos
const PLANTILLAS: Record<string, string> = {
  si: 'si ${condición} {\n\t${}\n}',
  mientras: 'mientras ${condición} {\n\t${}\n}',
  repetir: 'repetir ${veces} {\n\t${}\n}',
  siempre: 'siempre {\n\t${}\n}',
}

const firma = (nombre: string) => `${nombre}(${FUNCIONES[nombre].parametros.join(', ')})`

const opcionesFijas: Completion[] = [
  ...PALABRAS_CLAVE.map((p) =>
    PLANTILLAS[p]
      ? snippetCompletion(PLANTILLAS[p], { label: p, type: 'keyword', detail: 'bloque', info: AYUDA_PALABRAS[p], boost: 1 })
      : { label: p, type: 'keyword', info: AYUDA_PALABRAS[p] },
  ),
  snippetCompletion('si ${condición} {\n\t${}\n} sino {\n\t${}\n}', { label: 'si sino', type: 'keyword', detail: 'bloque', info: AYUDA_PALABRAS.si }),
  ...Object.keys(CONSTANTES).map((c) => ({ label: c, type: 'constant', detail: `= ${CONSTANTES[c]}` })),
  ...Object.entries(FUNCIONES).map(([nombre, f]) =>
    snippetCompletion(`${nombre}(${f.parametros.map((p) => '${' + p + '}').join(', ')})`, {
      label: nombre,
      type: 'function',
      detail: `(${f.parametros.join(', ')})${f.devuelve ? ' → valor' : ''}`,
      info: f.descripcion,
    }),
  ),
]

// Al pasar el raton sobre una funcion, constante o palabra clave
const ayudaAlPasar = hoverTooltip((vista, pos) => {
  const linea = vista.state.doc.lineAt(pos)
  let desde = pos - linea.from
  let hasta = desde
  const texto = linea.text
  while (desde > 0 && /[\p{L}\p{N}_]/u.test(texto[desde - 1])) desde--
  while (hasta < texto.length && /[\p{L}\p{N}_]/u.test(texto[hasta])) hasta++
  const palabra = texto.slice(desde, hasta)
  let titulo: string
  let descripcion: string
  if (FUNCIONES[palabra]) {
    titulo = firma(palabra)
    descripcion = FUNCIONES[palabra].descripcion + (FUNCIONES[palabra].devuelve ? ' (devuelve un valor)' : '')
  } else if (palabra in CONSTANTES) {
    titulo = `${palabra} = ${CONSTANTES[palabra]}`
    descripcion = 'Constante'
  } else if (AYUDA_PALABRAS[palabra]) {
    titulo = palabra
    descripcion = AYUDA_PALABRAS[palabra]
  } else {
    return null
  }
  return {
    pos: linea.from + desde,
    end: linea.from + hasta,
    above: true,
    create: () => ({ dom: ayudaDom(titulo, descripcion) }),
  }
})

function ayudaDom(titulo: string, descripcion: string, activo?: number) {
  const dom = document.createElement('div')
  dom.className = 'cm-ayuda'
  const t = document.createElement('code')
  if (activo === undefined) {
    t.textContent = titulo
  } else {
    // Resalta el parametro que se esta escribiendo
    const [nombre, resto] = [titulo.slice(0, titulo.indexOf('(') + 1), titulo.slice(titulo.indexOf('(') + 1, -1)]
    t.append(nombre)
    resto.split(', ').forEach((p, i) => {
      if (i > 0) t.append(', ')
      const span = document.createElement('span')
      span.textContent = p
      if (i === activo) span.className = 'cm-ayuda-activo'
      t.append(span)
    })
    t.append(')')
  }
  const d = document.createElement('div')
  d.textContent = descripcion
  dom.append(t, d)
  return dom
}

// Mientras se escriben los argumentos de una funcion, muestra sus parametros
function firmaEnCursor(state: EditorState): Tooltip | null {
  const sel = state.selection.main
  if (!sel.empty) return null
  const linea = state.doc.lineAt(sel.head)
  const antes = linea.text.slice(0, sel.head - linea.from)
  let nivel = 0
  let comas = 0
  for (let i = antes.length - 1; i >= 0; i--) {
    const c = antes[i]
    if (c === ')') nivel++
    else if (c === '(') {
      if (nivel > 0) {
        nivel--
        continue
      }
      const nombre = /([\p{L}_][\p{L}\p{N}_]*)\s*$/u.exec(antes.slice(0, i))?.[1]
      if (!nombre || !FUNCIONES[nombre] || FUNCIONES[nombre].parametros.length === 0) return null
      return {
        pos: linea.from + i - nombre.length,
        above: true,
        create: () => ({ dom: ayudaDom(firma(nombre), FUNCIONES[nombre].descripcion, comas) }),
      }
    } else if (c === ',' && nivel === 0) comas++
  }
  return null
}

const ayudaFirma = StateField.define<Tooltip | null>({
  create: firmaEnCursor,
  update: (actual, tr) => (tr.docChanged || tr.selection ? firmaEnCursor(tr.state) : actual),
  provide: (f) => showTooltip.from(f),
})

// Plegado: de la llave que abre al final de una linea hasta su llave de cierre
const plegarLlaves = foldService.of((state, desde, hasta) => {
  const texto = state.doc.sliceString(desde, hasta)
  if (!/\{\s*(\/\/.*)?$/.test(texto)) return null
  const abre = desde + texto.lastIndexOf('{')
  let nivel = 0
  for (let n = state.doc.lineAt(desde).number; n <= state.doc.lines; n++) {
    const l = state.doc.line(n)
    const inicio = n === state.doc.lineAt(desde).number ? abre - l.from : 0
    for (let i = inicio; i < l.text.length; i++) {
      if (l.text.startsWith('//', i)) break
      if (l.text[i] === '{') nivel++
      else if (l.text[i] === '}' && --nivel === 0) {
        const cierre = l.from + i
        return cierre > hasta ? { from: abre + 1, to: cierre } : null
      }
    }
  }
  return null
})

function completar(contexto: CompletionContext) {
  const palabra = contexto.matchBefore(/[\p{L}_][\p{L}\p{N}_]*/u)
  if (!palabra || (palabra.from === palabra.to && !contexto.explicit)) return null
  // Variables: nombres que reciben un valor en el programa
  const variables = new Set<string>()
  for (const m of contexto.state.doc.toString().matchAll(/^\s*([\p{L}_][\p{L}\p{N}_]*)\s*[+-]?=(?!=)/gmu)) variables.add(m[1])
  return {
    from: palabra.from,
    options: [...opcionesFijas, ...[...variables].map((v) => ({ label: v, type: 'variable' }))],
    validFor: /^[\p{L}\p{N}_]*$/u,
  }
}

interface Props {
  valor: string
  onCambio: (texto: string) => void
  error: ErrorLenguaje | null
  // Ctrl+Enter
  onEjecutar?: () => void
  // Shift+Alt+F
  onFormatear?: () => void
}

export function EditorCodigo({ valor, onCambio, error, onEjecutar, onFormatear }: Props) {
  const contenedor = useRef<HTMLDivElement>(null)
  const vista = useRef<EditorView | null>(null)
  const alCambiar = useRef(onCambio)
  alCambiar.current = onCambio
  const atajos = useRef({ onEjecutar, onFormatear })
  atajos.current = { onEjecutar, onFormatear }

  useEffect(() => {
    const v = new EditorView({
      parent: contenedor.current!,
      state: EditorState.create({
        doc: valor,
        extensions: [
          lineNumbers(),
          codeFolding(),
          foldGutter({ openText: '▾', closedText: '▸' }),
          plegarLlaves,
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          indentUnit.of('  '),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ override: [completar], icons: false }),
          ayudaAlPasar,
          ayudaFirma,
          search({ top: true }),
          highlightSelectionMatches(),
          lintGutter(),
          lenguaje,
          syntaxHighlighting(resaltado),
          tema,
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                atajos.current.onEjecutar?.()
                return true
              },
            },
            {
              key: 'Shift-Alt-f',
              run: () => {
                atajos.current.onFormatear?.()
                return true
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) alCambiar.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    vista.current = v
    return () => v.destroy()
    // El texto inicial solo se usa al crear el editor; los cambios llegan por el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cambios que vienen de fuera (diagrama, ejemplos)
  useEffect(() => {
    const v = vista.current
    if (v && v.state.doc.toString() !== valor) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: valor } })
    }
  }, [valor])

  useEffect(() => {
    const v = vista.current
    if (!v) return
    const largo = v.state.doc.length
    const diagnosticos =
      error?.rango && !error.origen
        ? [
            {
              from: Math.min(error.rango.desde, largo),
              to: Math.min(Math.max(error.rango.hasta, error.rango.desde), largo),
              severity: 'error' as const,
              message: error.message,
            },
          ]
        : []
    v.dispatch(setDiagnostics(v.state, diagnosticos))
  }, [error, valor])

  return <div ref={contenedor} className="editor-codigo" />
}
