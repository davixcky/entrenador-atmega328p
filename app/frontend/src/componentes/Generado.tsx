// Lo que sale del programa: el sketch de Arduino (C++ con la biblioteca Entrenador) y
// el bytecode que recibe la maquina virtual del entrenador. Solo lectura.
import { useEffect, useMemo, useRef, useState } from 'react'
import { cpp } from '@codemirror/lang-cpp'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { generarArduino, listado, type Programa } from '@entrenador/lenguaje'
import { GuardarSketch, InstalarBiblioteca } from '../../wailsjs/go/main/App'

type Pestana = 'arduino' | 'bytecode'

const resaltado = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.modifier], color: '#c792ea' },
  { tag: [tags.typeName, tags.standard(tags.typeName)], color: '#ffcb6b' },
  { tag: tags.comment, color: '#6b7386', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool], color: '#f78c6c' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#82aaff' },
  { tag: [tags.processingInstruction, tags.string], color: '#c3e88d' },
  { tag: tags.operator, color: '#89ddff' },
  { tag: tags.labelName, color: '#ffcb6b', fontWeight: '600' },
  { tag: tags.atom, color: '#c792ea' },
])

// Listado del bytecode: direccion, bytes, instruccion y operando
const bytecode = StreamLanguage.define<{ columna: number }>({
  name: 'bytecode',
  startState: () => ({ columna: 0 }),
  token(flujo, estado) {
    if (flujo.sol()) estado.columna = 0
    if (flujo.eatSpace()) return null
    if (flujo.sol() && flujo.match(/^[0-9A-F]{4}:/)) return 'labelName'
    estado.columna++
    if (estado.columna === 1 && flujo.match(/^[0-9A-F]{4}/)) return 'comment'
    if (flujo.match(/^[0-9A-F]{2}(?= |$)/)) return 'comment'
    if (flujo.match(/^(SALTO_SI_CERO|SALTO|FIN)\b/)) return 'keyword'
    if (flujo.match(/^[A-Z_]{2,}\b/)) return 'atom'
    if (flujo.match(/^-?[0-9]+\b/)) return 'number'
    flujo.next()
    return null
  },
})

const tema = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--fondo)', color: 'var(--texto)', fontSize: '12.5px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
    '.cm-content': { padding: '10px 0' },
    '.cm-gutters': { backgroundColor: 'var(--fondo)', color: '#596075', border: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#4c9aff40 !important' },
  },
  { dark: true },
)

function VistaSoloLectura({ texto, lenguaje }: { texto: string; lenguaje: Pestana }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const vista = useRef<EditorView | null>(null)

  useEffect(() => {
    const v = new EditorView({
      parent: contenedor.current!,
      state: EditorState.create({
        doc: texto,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          lenguaje === 'arduino' ? cpp() : bytecode,
          syntaxHighlighting(resaltado),
          tema,
        ],
      }),
    })
    vista.current = v
    return () => v.destroy()
    // El texto llega por el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lenguaje])

  useEffect(() => {
    const v = vista.current
    if (v && v.state.doc.toString() !== texto) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: texto } })
  }, [texto])

  return <div ref={contenedor} className="generado-vista" />
}

interface Props {
  programa: Programa | null
  bytes: number[] | null
  variables: Map<string, number> | null
  onAviso: (tipo: 'ok' | 'error', texto: string) => void
}

function pestanaGuardada(): Pestana {
  try {
    return localStorage.getItem('entrenador.generado') === 'bytecode' ? 'bytecode' : 'arduino'
  } catch {
    return 'arduino'
  }
}

export function Generado({ programa, bytes, variables, onAviso }: Props) {
  const [pestana, setPestana] = useState<Pestana>(pestanaGuardada)
  // Con errores se sigue mostrando lo ultimo que compilo, atenuado
  const ultimo = useRef({ arduino: '', bytecode: '' })

  const actual = useMemo(() => {
    if (!programa || !bytes) return null
    try {
      return { arduino: generarArduino(programa), bytecode: listado(bytes, variables ?? undefined) }
    } catch {
      return null
    }
  }, [programa, bytes, variables])
  if (actual) ultimo.current = actual
  const textos = actual ?? ultimo.current

  const elegir = (p: Pestana) => {
    setPestana(p)
    try {
      localStorage.setItem('entrenador.generado', p)
    } catch {
      // sin almacenamiento
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textos[pestana])
      onAviso('ok', pestana === 'arduino' ? 'Sketch copiado.' : 'Bytecode copiado.')
    } catch (e) {
      onAviso('error', 'No se pudo copiar: ' + String(e))
    }
  }

  const guardar = async () => {
    try {
      const ruta = await GuardarSketch('programa_entrenador', textos.arduino)
      if (ruta) onAviso('ok', `Sketch guardado en ${ruta}. Para compilarlo hace falta la biblioteca Entrenador.`)
    } catch (e) {
      onAviso('error', String(e))
    }
  }

  const instalar = async () => {
    try {
      const ruta = await InstalarBiblioteca()
      onAviso('ok', `Biblioteca Entrenador instalada en ${ruta}. El IDE de Arduino ya puede compilar el sketch.`)
    } catch (e) {
      onAviso('error', String(e))
    }
  }

  return (
    <section className={actual ? 'generado' : 'generado generado-viejo'} aria-label="Código generado">
      <header className="generado-barra">
        <div className="selector-vista" role="tablist" aria-label="Qué ver">
          <button type="button" role="tab" aria-selected={pestana === 'arduino'} onClick={() => elegir('arduino')}>
            Arduino
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'bytecode'} onClick={() => elegir('bytecode')}>
            Bytecode
          </button>
        </div>
        <span className="separador" />
        <button type="button" className="boton-texto" onClick={copiar} disabled={!textos[pestana]}>
          Copiar
        </button>
        {pestana === 'arduino' && (
          <>
            <button type="button" className="boton-texto" onClick={guardar} disabled={!textos.arduino} title="Guarda el sketch para abrirlo en el IDE de Arduino">
              Guardar .ino
            </button>
            <button type="button" className="boton-texto" onClick={instalar} title="Copia la biblioteca Entrenador en ~/Arduino/libraries">
              Instalar biblioteca
            </button>
          </>
        )}
      </header>
      <p className="generado-nota">
        {!actual
          ? 'El programa tiene errores: se muestra la última versión que compiló.'
          : pestana === 'arduino'
            ? 'El mismo programa en C++ para el IDE de Arduino, con la biblioteca Entrenador.'
            : `Lo que recibe la máquina virtual del entrenador: ${bytes?.length ?? 0} bytes.`}
      </p>
      <VistaSoloLectura key={pestana} texto={textos[pestana]} lenguaje={pestana} />
    </section>
  )
}
