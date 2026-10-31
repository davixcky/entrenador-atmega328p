// Dialogo para grabar el puente en el Uno y el firmware "bloques" en el entrenador.
import { useEffect, useState } from 'react'
import { GrabarEntrenador, GrabarPuente, RutaAvrdude } from '../../wailsjs/go/main/App'

interface Props {
  puerto: string
  onCerrar: () => void
  onGrabado: () => void
}

export function Firmware({ puerto, onCerrar, onGrabado }: Props) {
  const [avrdude, setAvrdude] = useState('Buscando avrdude...')
  const [ocupado, setOcupado] = useState(false)
  const [salida, setSalida] = useState('')
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  useEffect(() => {
    RutaAvrdude()
      .then(setAvrdude)
      .catch((e) => setAvrdude(String(e)))
  }, [])

  const grabar = async (que: 'puente' | 'entrenador') => {
    setOcupado(true)
    setSalida('')
    setResultado(null)
    try {
      const texto = que === 'puente' ? await GrabarPuente(puerto) : await GrabarEntrenador(puerto)
      setSalida(texto)
      setResultado({ ok: true, texto: que === 'puente' ? 'Puente instalado en el Uno.' : 'Firmware grabado en el entrenador.' })
      onGrabado()
    } catch (e) {
      setResultado({ ok: false, texto: String(e) })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="modal-fondo" role="presentation" onClick={() => !ocupado && onCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-firmware" onClick={(e) => e.stopPropagation()}>
        <header className="panel-titulo">
          <h2 id="titulo-firmware">Firmware</h2>
          <button type="button" className="boton-icono" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar">
            ×
          </button>
        </header>

        <p>
          Puerto: <span className="mono">{puerto || 'ninguno seleccionado'}</span>
          <br />
          avrdude: <span className="mono">{avrdude}</span>
        </p>

        <ol className="pasos">
          <li>
            <strong>Instalar el puente en el Uno</strong> (una sola vez). El Uno sigue siendo programador ISP y
            además reenvía el puerto serie al entrenador.
            <button type="button" onClick={() => grabar('puente')} disabled={ocupado || !puerto}>
              Grabar puente en el Uno
            </button>
          </li>
          <li>
            <strong>Grabar el firmware “bloques” en el entrenador</strong> por ISP (D10–D13 del Uno). Configura los
            fusibles de 16 MHz e incluye el bootloader.
            <button type="button" onClick={() => grabar('entrenador')} disabled={ocupado || !puerto}>
              Grabar firmware en el entrenador
            </button>
          </li>
          <li>
            <strong>Cablear el serie</strong> y conectar desde la barra superior:
            <table className="tabla">
              <tbody>
                <tr><td>Uno D2</td><td>←</td><td>ATmega pin 3 (TX)</td></tr>
                <tr><td>Uno D3</td><td>→</td><td>ATmega pin 2 (RX)</td></tr>
                <tr><td>Uno GND</td><td>—</td><td>GND del entrenador</td></tr>
              </tbody>
            </table>
          </li>
        </ol>

        {ocupado && <p className="chip">Grabando... no desconectes el Uno.</p>}
        {resultado && <p className={resultado.ok ? 'chip chip-ok' : 'chip chip-error'}>{resultado.texto}</p>}
        {salida && <pre className="salida">{salida}</pre>}
      </div>
    </div>
  )
}
