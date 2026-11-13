// Ajustes del entrenador: se agregan solos al inicio del programa (ver ajustes.ts).
// El contraste del LCD no está aquí: es el potenciómetro azul del módulo I2C.
import { useRef, useState } from 'react'
import type { Ajustes as ValoresAjustes } from '../ajustes'
import { lineasAjustes } from '../ajustes'
import { backend } from '../backend'
import { exportarConfiguracion, importarConfiguracion } from '../configuracion'

interface Props {
  ajustes: ValoresAjustes
  usaLcd: boolean
  puedeAplicar: boolean
  onCambiar: (cambios: Partial<ValoresAjustes>) => void
  onAplicar: () => void
  onCerrar: () => void
}

const CURSORES: { valor: 0 | 1 | 2; texto: string }[] = [
  { valor: 0, texto: 'Sin cursor' },
  { valor: 1, texto: 'Raya fija' },
  { valor: 2, texto: 'Bloque que parpadea' },
]

export function Ajustes({ ajustes, usaLcd, puedeAplicar, onCambiar, onAplicar, onCerrar }: Props) {
  const lineas = lineasAjustes(ajustes, usaLcd)
  const archivo = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const exportar = async () => {
    try {
      const donde = await backend.guardarArchivo('entrenador-configuracion.json', exportarConfiguracion(ajustes))
      if (donde) setMensaje({ ok: true, texto: `Exportado en ${donde}` })
    } catch (e) {
      setMensaje({ ok: false, texto: String(e instanceof Error ? e.message : e) })
    }
  }

  const importar = async (f: File | undefined) => {
    if (!f) return
    try {
      const resumen = importarConfiguracion(await f.text())
      setMensaje({ ok: true, texto: `Importado. ${resumen}. Recargando...` })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setMensaje({ ok: false, texto: String(e instanceof Error ? e.message : e) })
    }
  }
  return (
    <div className="modal-fondo" role="presentation" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-ajustes" onClick={(e) => e.stopPropagation()}>
        <header className="panel-titulo">
          <h2 id="titulo-ajustes">Ajustes</h2>
          <button type="button" className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <h3>LCD</h3>
        <div className="formulario">
          <label className="campo campo-fila">
            <input type="checkbox" checked={ajustes.lcdLuz} onChange={(e) => onCambiar({ lcdLuz: e.target.checked })} />
            <span>Luz de fondo encendida</span>
          </label>
          <label className="campo">
            <span>Cursor</span>
            <select value={ajustes.lcdCursor} onChange={(e) => onCambiar({ lcdCursor: Number(e.target.value) as 0 | 1 | 2 })}>
              {CURSORES.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.texto}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="nota">
          El contraste no se puede ajustar desde el programa: es el potenciómetro azul del módulo I2C.
        </p>

        <h3>LEDs</h3>
        <div className="formulario">
          <label className="campo">
            <span>Brillo inicial: {ajustes.brillo} %</span>
            <input type="range" min={0} max={100} step={5} value={ajustes.brillo} onChange={(e) => onCambiar({ brillo: Number(e.target.value) })} />
          </label>
        </div>

        <h3>Potenciómetro</h3>
        <div className="formulario">
          <label className="campo campo-fila">
            <input type="checkbox" checked={ajustes.potInvertido} onChange={(e) => onCambiar({ potInvertido: e.target.checked })} />
            <span>Invertir (pot() da 1023 con el potenciómetro al mínimo)</span>
          </label>
        </div>

        <h3>Código que se agrega al inicio</h3>
        {lineas.length ? (
          <pre className="ajustes-codigo mono">{['// Ajustes de la app (botón Ajustes)', ...lineas].join('\n')}</pre>
        ) : (
          <p className="nota">Nada: el programa no usa el LCD, el brillo está en 100 % y el potenciómetro va normal.</p>
        )}
        {!usaLcd && <p className="nota">Las líneas del LCD se agregan solo si el programa usa alguna función lcd_.</p>}
        <p className="nota">Se ven en Generado (sketch de Arduino y bytecode). Los nodos “Luz del LCD” y “Cursor del LCD” cambian lo mismo durante el programa.</p>

        <button type="button" className="primario" onClick={onAplicar} disabled={!puedeAplicar}>
          Aplicar en la placa (▶ Ejecutar)
        </button>

        <h3>Exportar / importar</h3>
        <p className="nota">
          Un archivo JSON con la conexión a la nube (URL, clave anon y dispositivo), estos ajustes y el nombre de la red
          Wi-Fi del ESP32. La clave del Wi-Fi no se guarda. Sirve para pasar la configuración a otra PC o al navegador.
        </p>
        <button type="button" onClick={exportar}>
          Exportar configuración
        </button>
        <button type="button" onClick={() => archivo.current?.click()}>
          Importar configuración...
        </button>
        <input
          ref={archivo}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void importar(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {mensaje && <p className={mensaje.ok ? 'chip chip-ok' : 'chip chip-error'}>{mensaje.texto}</p>}
      </div>
    </div>
  )
}
