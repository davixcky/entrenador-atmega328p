// Estado del programa: el texto y el diagrama son dos vistas del mismo programa.
// Lo que se edita en una se refleja en la otra cuando es valido. Se compila desde la
// ultima vista editada.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  analizar,
  compilar,
  ejemplos,
  ErrorLenguaje,
  formatear,
  grafoAPrograma,
  programaAGrafo,
  type Grafo,
  type Programa,
} from '@entrenador/lenguaje'

const CLAVE_GUARDADO = 'entrenador.proyecto'

export type Vista = 'codigo' | 'diagrama'

export interface Resultado {
  bytes: number[] | null
  // Lo que se compilo, para ver el codigo generado
  programa: Programa | null
  variables: Map<string, number> | null
  error: ErrorLenguaje | null
  // Nodos del diagrama que no se ejecutan
  sueltos: string[]
}

interface Estado {
  codigo: string
  grafo: Grafo
  editado: Vista
  // Cambia cuando el diagrama se reemplaza desde fuera (texto, ejemplo)
  versionGrafo: number
}

function comoError(e: unknown): ErrorLenguaje {
  return e instanceof ErrorLenguaje ? e : new ErrorLenguaje(e instanceof Error ? e.message : String(e))
}

function desdeCodigo(codigo: string, versionGrafo: number, grafoActual?: Grafo): Estado {
  let grafo = grafoActual
  try {
    grafo = programaAGrafo(analizar(codigo))
  } catch {
    // texto con errores: el diagrama se queda como estaba
  }
  return { codigo, grafo: grafo ?? programaAGrafo({ cuerpo: [] }), editado: 'codigo', versionGrafo: versionGrafo + 1 }
}

function cargar(): Estado {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_GUARDADO) ?? 'null')
    if (guardado && typeof guardado.codigo === 'string' && Array.isArray(guardado.grafo?.nodos)) {
      return { codigo: guardado.codigo, grafo: guardado.grafo, editado: guardado.editado === 'diagrama' ? 'diagrama' : 'codigo', versionGrafo: 0 }
    }
  } catch {
    // almacenamiento no disponible o dañado: empezar con el primer ejemplo
  }
  return desdeCodigo(ejemplos[0].codigo, 0)
}

export function useProyecto() {
  const [estado, setEstado] = useState<Estado>(cargar)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE_GUARDADO, JSON.stringify({ codigo: estado.codigo, grafo: estado.grafo, editado: estado.editado }))
      } catch {
        // sin almacenamiento: el programa solo vive en esta sesion
      }
    }, 300)
    return () => clearTimeout(t)
  }, [estado.codigo, estado.grafo, estado.editado])

  const cambiarCodigo = useCallback((codigo: string) => {
    setEstado((e) => (codigo === e.codigo ? e : desdeCodigo(codigo, e.versionGrafo, e.grafo)))
  }, [])

  // estructural = false para movimientos de nodos: no reescribe el texto
  const cambiarGrafo = useCallback((grafo: Grafo, estructural: boolean) => {
    setEstado((e) => {
      if (!estructural) return { ...e, grafo }
      let codigo = e.codigo
      try {
        codigo = formatear(grafoAPrograma(grafo).programa)
      } catch {
        // diagrama con errores: el texto se queda con la ultima version valida
      }
      return { ...e, grafo, codigo, editado: 'diagrama' }
    })
  }, [])

  const cargarCodigo = useCallback((codigo: string) => {
    setEstado((e) => desdeCodigo(codigo, e.versionGrafo))
  }, [])

  const resultado = useMemo<Resultado>(() => {
    let sueltos: string[] = []
    try {
      let programa
      if (estado.editado === 'diagrama') {
        const r = grafoAPrograma(estado.grafo)
        programa = r.programa
        sueltos = r.sueltos
      } else {
        programa = analizar(estado.codigo)
      }
      const { bytes, variables } = compilar(programa)
      return { bytes, programa, variables, error: null, sueltos }
    } catch (e) {
      return { bytes: null, programa: null, variables: null, error: comoError(e), sueltos }
    }
  }, [estado.codigo, estado.grafo, estado.editado])

  // Reescribe el texto con el formato estandar; con errores no hace nada y devuelve false
  const formatearCodigo = useCallback(() => {
    try {
      const texto = formatear(analizar(estado.codigo))
      cambiarCodigo(texto)
      return true
    } catch {
      return false
    }
  }, [estado.codigo, cambiarCodigo])

  return { ...estado, resultado, cambiarCodigo, cambiarGrafo, cargarCodigo, formatearCodigo }
}
