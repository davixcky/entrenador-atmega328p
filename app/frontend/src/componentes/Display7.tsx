// Display de 7 segmentos catodo comun dibujado en SVG (segmentos a..g en bits 0..6).
const DIGITO = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]
const GUION = 0x40

// Mismo criterio que el firmware: fuera de 0..99 muestra "--"
export function segmentosDe(numero: number | null): [number, number] {
  if (numero === null) return [0, 0]
  if (numero < 0 || numero > 99) return [GUION, GUION]
  return [DIGITO[Math.floor(numero / 10)], DIGITO[numero % 10]]
}

const SEGMENTOS: [string, string][] = [
  ['a', 'M14 6 L46 6 L40 12 L20 12 Z'],
  ['b', 'M48 8 L48 46 L42 41 L42 14 Z'],
  ['c', 'M48 54 L48 92 L42 86 L42 59 Z'],
  ['d', 'M14 94 L46 94 L40 88 L20 88 Z'],
  ['e', 'M12 54 L12 92 L18 86 L18 59 Z'],
  ['f', 'M12 8 L12 46 L18 41 L18 14 Z'],
  ['g', 'M14 50 L20 45 L40 45 L46 50 L40 55 L20 55 Z'],
]

export function Display7({ segmentos, titulo }: { segmentos: number; titulo: string }) {
  return (
    <figure className="display7">
      <svg viewBox="0 0 60 100" role="img" aria-label={titulo}>
        <rect x="0" y="0" width="60" height="100" rx="6" className="display7-fondo" />
        {SEGMENTOS.map(([nombre, d], i) => (
          <path key={nombre} d={d} className={segmentos & (1 << i) ? 'seg on' : 'seg'} />
        ))}
        <circle cx="54" cy="93" r="3" className={segmentos & 0x80 ? 'seg on' : 'seg'} />
      </svg>
      <figcaption>{titulo}</figcaption>
    </figure>
  )
}
