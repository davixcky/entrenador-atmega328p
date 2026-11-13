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
  {
    nombre: 'Integrador ESP32 (nube)',
    codigo: `// Actividad 15.3: el pot va a la nube y VALOR1 vuelve como brillo del LED 0
// (necesita el ESP32 con firmware/esp32-puente y el LCD por I2C)
lcd_limpiar()
lcd_texto(0, 0, "ADC:")
lcd_texto(1, 0, "VALOR1:")
leds(0b00000001)
siempre {
  adc = pot()
  nube_enviar(1, adc)
  valor1 = nube(1)
  brillo(valor1)
  lcd_numero(0, 10, adc, 4)
  lcd_numero(1, 10, valor1, 4)
  esperar(200)
}
`,
  },
  {
    nombre: 'Control desde la nube',
    codigo: `// Todo desde Supabase (tablero Nube o Studio, tabla controles):
//   lcd1 / lcd2 -> filas del LCD, canal 2 -> LEDs, canal 3 -> displays
// y el potenciómetro sube a la nube como ADC (canal 1)
lcd_limpiar()
siempre {
  lcd_nube(0)
  lcd_nube(1)
  leds(nube(2))
  mostrar(nube(3))
  nube_enviar(1, pot())
  esperar(200)
}
`,
  },
]
