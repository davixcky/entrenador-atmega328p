// Grabar el ATmega328P por ISP a traves del ESP32 (comandos @ISP, INTEGRADOR.md).
// Reemplaza a avrdude + Uno: la app manda las paginas de flash y el ESP32 hace el
// protocolo de programacion serie del ATmega con sus pines GPIO4/18/19/23.

export const PAGINA = 128 // bytes por pagina de flash del ATmega328P
// ATmega328P y ATmega328 (sin P)
const FIRMAS = ['1E950F', '1E9514']
// Fusibles recomendados (REGISTRO-TECNICO.md): cristal full swing, bootloader de 512 palabras,
// brown-out en 4.3 V
export const FUSIBLES = { L: 0xf7, H: 0xde, E: 0xfc }

// Intel HEX -> paginas (direccion de byte -> 128 bytes, lo que falta queda en 0xFF)
export function paginasHex(texto: string): Map<number, number[]> {
  const paginas = new Map<number, number[]>()
  let base = 0
  for (const [n, crudo] of texto.split(/\r?\n/).entries()) {
    const l = crudo.trim()
    if (!l) continue
    if (!l.startsWith(':') || l.length < 11) throw new Error(`HEX: línea ${n + 1} inválida`)
    const b = l
      .slice(1)
      .match(/../g)!
      .map((x) => parseInt(x, 16))
    if (b.some(Number.isNaN)) throw new Error(`HEX: línea ${n + 1} inválida`)
    const [largo, alto, bajo, tipo] = b
    if (b.length !== largo + 5) throw new Error(`HEX: línea ${n + 1} con largo incorrecto`)
    if (b.reduce((s, x) => s + x, 0) % 256 !== 0) throw new Error(`HEX: suma de verificación incorrecta en la línea ${n + 1}`)
    const datos = b.slice(4, 4 + largo)
    if (tipo === 0x01) break
    if (tipo === 0x02) base = ((datos[0] << 8) | datos[1]) << 4
    else if (tipo === 0x04) base = ((datos[0] << 8) | datos[1]) << 16
    else if (tipo === 0x00) {
      const inicio = base + ((alto << 8) | bajo)
      datos.forEach((d, i) => {
        const dir = inicio + i
        const pag = dir - (dir % PAGINA)
        if (!paginas.has(pag)) paginas.set(pag, new Array(PAGINA).fill(0xff))
        paginas.get(pag)![dir - pag] = d
      })
    }
  }
  if (paginas.size === 0) throw new Error('HEX vacío')
  if (Math.max(...paginas.keys()) >= 32768) throw new Error('El HEX no cabe en la flash de 32 KB del ATmega328P')
  return new Map([...paginas].sort((a, b) => a[0] - b[0]))
}

const hex = (bytes: number[]) => bytes.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join('')

type Comando = (linea: string, esperaMs?: number) => Promise<string>

export interface Avance {
  etapa: 'iniciando' | 'borrando' | 'grabando' | 'verificando' | 'fusibles' | 'listo'
  hecho: number
  total: number
}

// Graba y verifica. comando = backend.comandoPuente (conexion activa con el ESP32).
export async function grabarAtmega(comando: Comando, textoHex: string, avance: (a: Avance) => void, registrar: (l: string) => void) {
  const paginas = paginasHex(textoHex)
  const total = paginas.size
  avance({ etapa: 'iniciando', hecho: 0, total })
  const inicio = await comando('@ISP INICIO', 3000)
  const firma = inicio.split(/\s+/)[1] ?? ''
  try {
    if (!FIRMAS.includes(firma.toUpperCase())) {
      throw new Error(`Firma ${firma || 'vacía'}: no es un ATmega328P. Revisa el cableado del ISP (J3) y la alimentación del entrenador.`)
    }
    registrar(`ISP: firma ${firma} (ATmega328P)`)

    avance({ etapa: 'borrando', hecho: 0, total })
    await comando('@ISP BORRAR', 3000)

    let hecho = 0
    for (const [dir, datos] of paginas) {
      await comando(`@ISP PAGINA ${dir} ${hex(datos)}`, 3000)
      avance({ etapa: 'grabando', hecho: ++hecho, total })
    }

    hecho = 0
    for (const [dir, datos] of paginas) {
      const leido = (await comando(`@ISP LEER ${dir} ${PAGINA}`, 3000)).split(/\s+/)[1] ?? ''
      if (leido.toUpperCase() !== hex(datos)) throw new Error(`La página 0x${dir.toString(16)} no se grabó bien (verificación)`)
      avance({ etapa: 'verificando', hecho: ++hecho, total })
    }
    registrar(`ISP: ${total} páginas grabadas y verificadas`)

    avance({ etapa: 'fusibles', hecho: 0, total: 3 })
    for (const [cual, valor] of Object.entries(FUSIBLES)) {
      await comando(`@ISP FUSIBLE ${cual} ${valor.toString(16).toUpperCase()}`, 3000)
    }
    const [, l, h, e] = (await comando('@ISP FUSIBLES', 3000)).split(/\s+/).map((x) => parseInt(x, 16))
    // del efuse solo existen los 3 bits de abajo; los demas se leen en 1
    if (l !== FUSIBLES.L || h !== FUSIBLES.H || (e & 0x07) !== (FUSIBLES.E & 0x07)) {
      throw new Error(`Fusibles leídos ${[l, h, e].map((x) => x.toString(16)).join(' ')}: no coinciden con los esperados`)
    }
    registrar('ISP: fusibles L F7, H DE, E FC')
    avance({ etapa: 'listo', hecho: total, total })
  } finally {
    // Siempre soltar el reset y los pines del ISP: el ATmega los usa como salidas
    await comando('@ISP FIN', 3000).catch(() => undefined)
  }
}
