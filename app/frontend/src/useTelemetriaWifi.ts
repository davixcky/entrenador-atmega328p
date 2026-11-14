import { useEffect, useState } from 'react'
import { CAMBIO_NUBE, configGuardada, escucharNube, ultimasLecturas, type Lectura } from './backend/nube'
import { telemetriaWifi, wifiVigente } from './backend/telemetria-wifi'
import type { Telemetria } from './componentes/Placa'

export function useTelemetriaWifi() {
  const [config, setConfig] = useState(configGuardada)
  const [muestra, setMuestra] = useState<{ t: Telemetria; fecha: string } | null>(null)
  const [ahora, setAhora] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const actualizar = () => setConfig(configGuardada())
    const almacenado = (e: StorageEvent) => { if (e.key === 'entrenador.nube' || e.key === null) actualizar() }
    window.addEventListener(CAMBIO_NUBE, actualizar)
    window.addEventListener('storage', almacenado)
    const reloj = setInterval(() => setAhora(Date.now()), 1000)
    return () => {
      window.removeEventListener(CAMBIO_NUBE, actualizar)
      window.removeEventListener('storage', almacenado)
      clearInterval(reloj)
    }
  }, [])

  useEffect(() => {
    setMuestra(null)
    setError(null)
    if (!config.url || !config.llave || !config.dispositivo) return
    let vivo = true, consultando = false, ultimoId = -1
    const recibir = (l: Lectura) => {
      if (!vivo || l.id <= ultimoId) return
      const t = telemetriaWifi(l)
      if (!t) return
      ultimoId = l.id
      setMuestra({ t, fecha: l.creado_en })
      setAhora(Date.now())
      setError(null)
    }
    const consultar = async () => {
      if (consultando) return
      consultando = true
      try {
        const lecturas = await ultimasLecturas(config, 1)
        if (lecturas[0]) recibir(lecturas[0])
      } catch (e) {
        if (vivo) setError(String(e instanceof Error ? e.message : e))
      } finally { consultando = false }
    }
    void consultar()
    let dejar = () => {}
    try {
      dejar = escucharNube(config, recibir, () => {}, (conectado) => { if (conectado) void consultar() })
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    // Respaldo si Realtime pierde eventos o la pestaña estuvo suspendida.
    const sondeo = setInterval(() => void consultar(), 5000)
    return () => { vivo = false; clearInterval(sondeo); dejar() }
  }, [config])

  const vigente = wifiVigente(muestra?.fecha ?? null, ahora)
  return { t: vigente ? muestra?.t ?? null : null, fecha: muestra?.fecha ?? null, vigente, error,
    configurada: !!(config.url && config.llave && config.dispositivo) }
}
