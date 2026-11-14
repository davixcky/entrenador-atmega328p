// Tablero de la nube (Supabase, carpeta nube/): lecturas que sube el ESP32 y las
// entradas que el tablero le manda al entrenador. Esquema en INTEGRADOR.md.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { textoLcd } from './texto-lcd'
export { textoLcd, MAX_TEXTO_LCD } from './texto-lcd'

export interface ConfigNube {
  url: string
  llave: string
  dispositivo: string
}

export interface Lectura {
  id: number
  salidas: number[]
  entradas: number[]
  creado_en: string
  telemetria?: string | null
  pantalla?: string | null
}

export const CAMBIO_NUBE = 'entrenador:cambio-nube'

const CLAVE_LOCAL = 'entrenador.nube'
// Clave anon de cada URL: al pasar de local a alojado y volver no hay que pegarla otra vez
const CLAVE_LLAVES = 'entrenador.nube.llaves'

export const URL_LOCAL = 'http://127.0.0.1:54321'
export const URL_ALOJADO = import.meta.env.VITE_SUPABASE_URL_ALOJADO ?? ''

function llavesGuardadas(): Record<string, string> {
  try {
    const l = JSON.parse(localStorage.getItem(CLAVE_LLAVES) ?? '{}')
    return l && typeof l === 'object' ? l : {}
  } catch {
    return {}
  }
}

// Configuracion para otra URL, con la clave que se uso la ultima vez con ella
export function configPara(actual: ConfigNube, url: string): ConfigNube {
  const deEnv =
    url === URL_ALOJADO
      ? import.meta.env.VITE_SUPABASE_ANON_KEY_ALOJADO ?? ''
      : url === (import.meta.env.VITE_SUPABASE_URL ?? URL_LOCAL)
        ? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
        : ''
  const llave = llavesGuardadas()[url] || deEnv
  return { ...actual, url, llave }
}

// Valores de nube/.env.local (vite.config.ts lee esa carpeta) o los guardados en el navegador
export function configGuardada(): ConfigNube {
  const base: ConfigNube = {
    url: import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    llave: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    dispositivo: import.meta.env.VITE_DISPOSITIVO ?? 'entrenador-1',
  }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? '{}') }
  } catch {
    return base
  }
}

export function guardarConfig(c: ConfigNube) {
  try {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(c))
    if (c.url && c.llave) localStorage.setItem(CLAVE_LLAVES, JSON.stringify({ ...llavesGuardadas(), [c.url]: c.llave }))
  } catch {
    // sin almacenamiento: vale para esta sesion
  }
  window.dispatchEvent(new Event(CAMBIO_NUBE))
}

let cliente: { clave: string; sb: SupabaseClient } | null = null

function supabase(c: ConfigNube) {
  const clave = c.url + '|' + c.llave
  if (cliente?.clave !== clave) {
    void cliente?.sb.removeAllChannels()
    cliente = { clave, sb: createClient(c.url, c.llave, { auth: { persistSession: false } }) }
  }
  return cliente.sb
}

function comprobar<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export async function ultimasLecturas(c: ConfigNube, cuantas = 120): Promise<Lectura[]> {
  const datos = comprobar(
    await supabase(c)
      .from('lecturas')
      .select('id, salidas, entradas, creado_en, telemetria, pantalla')
      .eq('dispositivo', c.dispositivo)
      .order('creado_en', { ascending: false })
      .limit(cuantas)
      .abortSignal(AbortSignal.timeout(10000)),
  )
  return (datos as Lectura[]).reverse()
}

export async function leerEntradas(c: ConfigNube): Promise<number[]> {
  const fila = comprobar(await supabase(c).from('controles').select('entradas').eq('dispositivo', c.dispositivo).maybeSingle())
  if (!fila) throw new Error(`No existe el dispositivo "${c.dispositivo}" en la nube`)
  return (fila as { entradas: number[] }).entradas
}

export interface FilaLcd { texto: string; desplazar: boolean; pasoMs: number }

// Texto y desplazamiento independientes para cada fila.
export async function leerLcd(c: ConfigNube): Promise<[FilaLcd, FilaLcd]> {
  const f = comprobar(await supabase(c).from('controles').select('lcd1, lcd2, lcd1_scroll, lcd2_scroll, lcd1_ms, lcd2_ms').eq('dispositivo', c.dispositivo).maybeSingle()) as {
    lcd1: string; lcd2: string; lcd1_scroll: boolean; lcd2_scroll: boolean; lcd1_ms: number; lcd2_ms: number
  } | null
  return [
    { texto: f?.lcd1 ?? '', desplazar: f?.lcd1_scroll ?? true, pasoMs: f?.lcd1_ms ?? 400 },
    { texto: f?.lcd2 ?? '', desplazar: f?.lcd2_scroll ?? true, pasoMs: f?.lcd2_ms ?? 400 },
  ]
}

export async function fijarLcd(c: ConfigNube, fila: 0 | 1, valor: FilaLcd) {
  const cambio = fila === 0
    ? { lcd1: textoLcd(valor.texto), lcd1_scroll: valor.desplazar, lcd1_ms: valor.pasoMs }
    : { lcd2: textoLcd(valor.texto), lcd2_scroll: valor.desplazar, lcd2_ms: valor.pasoMs }
  comprobar(await supabase(c).from('controles').update(cambio).eq('dispositivo', c.dispositivo).select('dispositivo'))
}

export async function ejecutarPorWifi(c: ConfigNube, bytes: number[], informar: (estado: string) => void) {
  if (!c.url || !c.llave || !c.dispositivo) throw new Error('Configura la conexión en Nube antes de ejecutar por Wi-Fi.')
  if (!bytes.length || bytes.length > 768 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new Error('El programa no es válido para el entrenador.')
  }
  const sb = supabase(c)
  const codigo = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('')
  informar('Enviando programa a la nube…')
  const envio = await sb.rpc('enviar_programa', { p_dispositivo: c.dispositivo, p_codigo: codigo }).abortSignal(AbortSignal.timeout(10000))
  if (envio.error?.code === '23505') throw new Error('Ya hay una carga pendiente para este entrenador. Espera a que termine o expire.')
  const id = comprobar(envio) as string
  if (!id) throw new Error('La nube no confirmó la recepción del programa. Revisa Nube antes de volver a enviarlo.')
  let anterior = ''
  const limite = Date.now() + 120000
  while (Date.now() < limite) {
    const fila = comprobar(await sb.from('programas').select('estado, detalle').eq('id', id).abortSignal(AbortSignal.timeout(10000)).single()) as {
      estado: string; detalle: string
    }
    if (fila.estado === 'error') throw new Error(fila.detalle)
    if (fila.estado === 'ejecutado') return
    if (fila.estado !== anterior) {
      informar(fila.estado === 'pendiente' ? 'Esperando al ESP32 por Wi-Fi…' : 'ESP32 cargando el programa en el entrenador…')
      anterior = fila.estado
    }
    // Si el ESP32 esta apagado, el servidor no lo ejecutara al reaparecer despues de 60 s.
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('No llegó la confirmación del ESP32. Revisa Wi-Fi y Nube; no se reenviará el programa automáticamente.')
}

// Cambia una entrada (1..4) sin tocar las demas
export async function fijarEntrada(c: ConfigNube, n: number, valor: number) {
  const entradas = [...(await leerEntradas(c))]
  entradas[n - 1] = valor
  comprobar(await supabase(c).from('controles').update({ entradas }).eq('dispositivo', c.dispositivo).select('dispositivo'))
}

// Avisa cada lectura nueva y cada cambio de controles. Devuelve la funcion para dejar de escuchar.
let siguienteSuscripcion = 0

export function escucharNube(
  c: ConfigNube,
  alLeer: (l: Lectura) => void,
  alControlar: (entradas: number[]) => void,
  alEstado: (conectado: boolean) => void,
) {
  const sb = supabase(c)
  const filtro = `dispositivo=eq.${c.dispositivo}`
  const canal = sb
    .channel(`entrenador-${c.dispositivo}-${++siguienteSuscripcion}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lecturas', filter: filtro }, (p) => alLeer(p.new as Lectura))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'controles', filter: filtro }, (p) =>
      alControlar((p.new as { entradas: number[] }).entradas),
    )
    .subscribe((estado) => alEstado(estado === 'SUBSCRIBED'))
  return () => {
    void sb.removeChannel(canal)
  }
}
