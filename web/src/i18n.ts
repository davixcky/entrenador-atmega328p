// Textos del sitio y rutas equivalentes en cada idioma.
export const IDIOMAS = ['es', 'en'] as const
export type Idioma = (typeof IDIOMAS)[number]

export const REPO = 'https://github.com/davixcky/entrenador-atmega328p'

// Paginas con documento: la ruta cambia con el idioma; el id es el .md del repositorio
export type Pagina = 'guia' | 'esquematico' | 'lenguaje' | 'biblioteca'
export const PAGINAS: Record<Pagina, { ruta: Record<Idioma, string>; doc?: Record<Idioma, string> }> = {
  guia: { ruta: { es: 'guia', en: 'guide' }, doc: { es: 'GUIA-USO', en: 'USER-GUIDE' } },
  esquematico: { ruta: { es: 'esquematico', en: 'schematic' } },
  lenguaje: { ruta: { es: 'lenguaje', en: 'language' }, doc: { es: 'app/lenguaje/README', en: 'app/lenguaje/README.en' } },
  // La biblioteca solo esta documentada en español
  biblioteca: { ruta: { es: 'biblioteca', en: 'library' }, doc: { es: 'firmware/libraries/Entrenador/README', en: 'firmware/libraries/Entrenador/README' } },
}

export const base = import.meta.env.BASE_URL.replace(/\/$/, '')
export const url = (idioma: Idioma, pagina?: Pagina) => `${base}/${idioma}/${pagina ? PAGINAS[pagina].ruta[idioma] + '/' : ''}`
export const archivo = (nombre: string) => `${base}/archivos/${nombre}`

export const T = {
  es: {
    titulo: 'Entrenador ATmega328P',
    descripcion: 'Entrenador de microcontroladores con ATmega328P, programable con diagramas o código en español desde una app de escritorio.',
    menu: { inicio: 'Inicio', guia: 'Guía de uso', esquematico: 'Esquemático', lenguaje: 'Lenguaje', biblioteca: 'Biblioteca' },
    otroIdioma: 'English',
    soloEspanol: '',
    contenido: 'En esta página',
    verEnGithub: 'Ver en GitHub',
    pie: 'Sistemas Embebidos 1 · Universidad de la Costa (CUC) · David Orozco, Jose Torres, Leo Rojas',
    inicio: {
      etiqueta: 'Sistemas Embebidos 1 · Actividad 10.1.12',
      lema: 'Un entrenador de microcontroladores hecho a mano, que se programa con un diagrama de nodos o con código en español, y se ve en vivo desde el PC.',
      empezar: 'Cómo conectarlo',
      esquematico: 'Ver el esquemático',
      queEs: 'Qué tiene',
      piezas: [
        ['ATmega328P a 16 MHz', 'En zócalo DIP-28, con cristal, reset y fuente propia de 9–12 V a 5 V.'],
        ['8 LEDs y 2 displays', 'Un bus de 8 bits compartido, multiplexado cada 2 ms con tres transistores.'],
        ['Entradas', 'Potenciómetro, DIP switch de 4 posiciones y cinco botones en escalera en una sola entrada analógica.'],
        ['Solo un Arduino Uno', 'El mismo Uno graba el firmware por ISP y hace de puente serie con la app, sin recablear.'],
      ],
      app: 'La app',
      appTexto: 'Una app de escritorio (Go + React) para escribir el programa como diagrama o como código; las dos vistas se actualizan entre sí. Ejecutar manda el programa por serie y corre al instante en una máquina virtual dentro del firmware: no hay que recompilar ni regrabar. El monitor muestra en vivo los LEDs, los displays, el potenciómetro y el DIP.',
      generado: 'Del lenguaje a Arduino',
      generadoTexto: 'El mismo programa se traduce a un sketch de Arduino que usa la biblioteca Entrenador, con funciones que se llaman igual que en el lenguaje. Estas dos columnas las genera el sitio al publicarse, con la misma librería que usa la app:',
      programa: 'Programa',
      sketch: 'Sketch generado',
      comoFunciona: 'Cómo funciona',
      fotos: 'Fotos',
      descargas: 'Descargas',
      archivos: [
        ['esquematico.pdf', 'Esquemático (PDF, A3)'],
        ['CONEXIONES.pdf', 'Conexiones pin a pin (PDF)'],
        ['GUIA-USO.pdf', 'Guía de conexión y uso (PDF)'],
        ['presentacion-final.pdf', 'Presentación (PDF)'],
      ],
      pies: {
        '01-montaje-protoboard.jpg': 'Primer montaje en protoboard',
        '03-contador-00-a-10.jpg': 'Contador en los displays',
        '06-app-monitor-placa.png': 'Monitor de la placa en la app',
      } as Record<string, string>,
    },
    esq: {
      titulo: 'Esquemático',
      intro: 'El esquemático se genera con un script de Python (kicad/tools/generar_esquematico.py) y se verifica con el ERC de KiCad 10 y una comparación del netlist. Corresponde a la placa armada a mano.',
      abrir: 'Abrir el PDF',
      conexiones: 'Conexiones pin a pin',
      bloques: 'Bloques',
      lista: [
        ['Fuente', 'Jack o bornera de 9–12 V, diodo de protección de polaridad y regulador LM7805.'],
        ['Reloj y reset', 'Cristal de 16 MHz con capacitores de 22 pF; pull-up de 10 kΩ, pulsador, filtro y diodo de protección en RESET.'],
        ['Programación y serie', 'J3 (ICSP) para grabar con el Arduino Uno; J2 para el serie de la app.'],
        ['Salidas', 'Bus de 8 bits con resistencias de 220 Ω hacia 8 LEDs y dos displays de cátodo común; Q1–Q3 eligen el grupo.'],
        ['Entradas', 'Potenciómetro en A0, DIP en PC1–PC4 con pull-up interna y botones B1–B5 en escalera en A5.'],
      ],
      nota: 'Al armarla: AVCC (pin 20) a +5V es obligatorio para el ADC, y el cursor del potenciómetro va al pin 23.',
    },
  },
  en: {
    titulo: 'ATmega328P trainer',
    descripcion: 'A microcontroller trainer built around an ATmega328P, programmed with diagrams or Spanish code from a desktop app.',
    menu: { inicio: 'Home', guia: 'User guide', esquematico: 'Schematic', lenguaje: 'Language', biblioteca: 'Library' },
    otroIdioma: 'Español',
    soloEspanol: 'This page is only available in Spanish.',
    contenido: 'On this page',
    verEnGithub: 'View on GitHub',
    pie: 'Embedded Systems 1 · Universidad de la Costa (CUC) · David Orozco, Jose Torres, Leo Rojas',
    inicio: {
      etiqueta: 'Embedded Systems 1 · Activity 10.1.12',
      lema: 'A hand-built microcontroller trainer, programmed with a node diagram or with code in Spanish, and watched live from the PC.',
      empezar: 'How to connect it',
      esquematico: 'See the schematic',
      queEs: 'What it has',
      piezas: [
        ['ATmega328P at 16 MHz', 'In a DIP-28 socket, with crystal, reset and its own 9–12 V to 5 V supply.'],
        ['8 LEDs and 2 displays', 'One shared 8-bit bus, multiplexed every 2 ms by three transistors.'],
        ['Inputs', 'A potentiometer, a 4-way DIP switch and five buttons on a resistor ladder, on a single analog input.'],
        ['Just an Arduino Uno', 'The same Uno flashes the firmware over ISP and bridges the app’s serial link, with no rewiring.'],
      ],
      app: 'The app',
      appTexto: 'A desktop app (Go + React) to write the program as a diagram or as code; both views update each other. Run sends the program over serial and it starts at once in a virtual machine inside the firmware: no rebuild, no reflash. The monitor shows the LEDs, displays, potentiometer and DIP switch live.',
      generado: 'From the language to Arduino',
      generadoTexto: 'The same program translates to an Arduino sketch using the Entrenador library, whose functions have the same names as the language. These two columns are generated when the site is built, with the same library the app uses:',
      programa: 'Program',
      sketch: 'Generated sketch',
      comoFunciona: 'How it works',
      fotos: 'Photos',
      descargas: 'Downloads',
      archivos: [
        ['esquematico.pdf', 'Schematic (PDF, A3, Spanish)'],
        ['CONEXIONES.pdf', 'Pin-by-pin connections (PDF)'],
        ['USER-GUIDE.pdf', 'Wiring and user guide (PDF)'],
        ['presentacion-final.pdf', 'Slides (PDF, Spanish)'],
      ],
      pies: {
        '01-montaje-protoboard.jpg': 'First breadboard build',
        '03-contador-00-a-10.jpg': 'Counter on the displays',
        '06-app-monitor-placa.png': 'Board monitor in the app',
      } as Record<string, string>,
    },
    esq: {
      titulo: 'Schematic',
      intro: 'The schematic is generated by a Python script (kicad/tools/generar_esquematico.py) and checked with KiCad 10’s ERC and a netlist comparison. It matches the hand-built board. Labels are in Spanish.',
      abrir: 'Open the PDF',
      conexiones: 'Pin-by-pin connections',
      bloques: 'Blocks',
      lista: [
        ['Power (Fuente)', '9–12 V jack or terminal block, reverse-polarity diode and an LM7805 regulator.'],
        ['Clock and reset', '16 MHz crystal with 22 pF capacitors; 10 kΩ pull-up, push button, filter and clamp diode on RESET.'],
        ['Programming and serial', 'J3 (ICSP) to flash with the Arduino Uno; J2 for the app’s serial link.'],
        ['Outputs (Salidas)', '8-bit bus with 220 Ω resistors to 8 LEDs and two common-cathode displays; Q1–Q3 select the group.'],
        ['Inputs (Entradas)', 'Potentiometer on A0, DIP switch on PC1–PC4 with internal pull-ups, and buttons B1–B5 on a ladder on A5.'],
      ],
      nota: 'When building it: AVCC (pin 20) must go to +5V for the ADC to work, and the potentiometer’s wiper goes to pin 23.',
    },
  },
}

// Ruta equivalente en el otro idioma
export function rutaEquivalente(idioma: Idioma, pagina?: Pagina) {
  return url(idioma === 'es' ? 'en' : 'es', pagina)
}
