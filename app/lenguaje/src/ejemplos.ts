// Programas de ejemplo, en el lenguaje de texto.
export const ejemplos: { nombre: string; codigo: string }[] = [
  {
    nombre: 'Contador 00 a 99',
    codigo: `// Cuenta de 00 a 99 en los displays y en binario en los LEDs
cuenta = 0
siempre {
  mostrar(cuenta)
  leds(cuenta)
  esperar(300)
  cuenta += 1
  si cuenta > 99 {
    cuenta = 0
  }
}
`,
  },
  {
    nombre: 'Auto fantástico',
    codigo: `// Un LED recorre la barra de ida y vuelta
posicion = 0
siempre {
  repetir 7 {
    led(posicion, encendido)
    mostrar(posicion + 1)
    esperar(90)
    led(posicion, apagado)
    posicion += 1
  }
  repetir 7 {
    led(posicion, encendido)
    mostrar(posicion + 1)
    esperar(90)
    led(posicion, apagado)
    posicion -= 1
  }
}
`,
  },
  {
    nombre: 'Barra con el potenciómetro',
    codigo: `// El potenciómetro llena la barra de LEDs desde abajo
siempre {
  mostrar(pot99())
  // nivel 0 a 8; barra = 2^nivel - 1
  nivel = pot99() * 9 / 100
  barra = 0
  repetir nivel {
    barra = barra * 2 + 1
  }
  leds(barra)
  esperar(50)
}
`,
  },
  {
    nombre: 'Números al azar',
    codigo: `siempre {
  mostrar(aleatorio(0, 99))
  leds(aleatorio(0, 255))
  esperar(700)
}
`,
  },
  {
    nombre: 'Modos con el DIP',
    codigo: `// SW1 elige qué se muestra; SW2 congela la pantalla
siempre {
  si interruptor(2) {
    continuar
  }
  si interruptor(1) {
    mostrar(pot99())
    leds(0b11110000)
  } sino {
    mostrar(dip())
    leds(dip())
  }
  esperar(100)
}
`,
  },
]
