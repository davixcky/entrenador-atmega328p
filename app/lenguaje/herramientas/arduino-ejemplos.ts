// Genera el sketch de Arduino de cada ejemplo en <carpeta>/<n>/<n>.ino e imprime
// "n<TAB>nombre<TAB>hex del bytecode" por linea. Lo usa app/pruebas/comparar.sh.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analizar, compilar, ejemplos, generarArduino } from '../src/index.ts'

const carpeta = process.argv[2]
if (!carpeta) throw new Error('uso: arduino-ejemplos.ts <carpeta>')

// Usa todo el lenguaje: nombres con tilde o reservados en C, division entre 0,
// precedencia, sino si, romper/continuar, hexadecimales negativos y detener.
const completo = {
  nombre: 'Prueba de todo el lenguaje',
  codigo: `año = 2
int = 3
total = 0
repetir 3 {
  repetir 2 {
    total += 1
  }
}
cero = 0
x = 7 / cero + 7 % cero
si no total == 6 {
  mostrar(1)
} sino si total > 5 y x == 0 o falso {
  mostrar(2)
} sino {
  mostrar(3)
}
esperar(10)
n = 0
mientras verdadero {
  n += 1
  si n % 2 == 0 {
    continuar
  }
  si n > 9 {
    romper
  }
  leds(n)
  mostrar(-(-n) * 10 / 3)
  esperar(10)
}
leds(0xFF00 / 256)
mostrar(int * 20 - año + (total < 7) - (x != 0))
esperar(10)
led(0, apagado)
led(9, encendido)
led(3, interruptor(1) == 0)
esperar(10)
r = aleatorio(9, 3)
mostrar(r)
esperar(10)
detener
mostrar(99)
`,
}

;[...ejemplos, completo].forEach(({ nombre, codigo }, i) => {
  const programa = analizar(codigo)
  const sketch = `ejemplo${i + 1}`
  mkdirSync(join(carpeta, sketch), { recursive: true })
  writeFileSync(join(carpeta, sketch, `${sketch}.ino`), generarArduino(programa, { nombre }))
  const hex = compilar(programa).bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  console.log(`${sketch}\t${nombre}\t${hex}`)
})
