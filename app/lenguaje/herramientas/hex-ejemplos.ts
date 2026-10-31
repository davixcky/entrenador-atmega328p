// Compila los ejemplos e imprime "nombre<TAB>hex" por linea.
// Lo usa app/pruebas/correr.sh para ejecutarlos en la maquina virtual del firmware.
import { compilarTexto, ejemplos } from '../src/index.ts'

for (const { nombre, codigo } of ejemplos) {
  const hex = compilarTexto(codigo)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  console.log(`${nombre}\t${hex}`)
}
