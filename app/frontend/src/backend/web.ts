// Backend del navegador: Web Serial (Chrome / Edge). Hace lo mismo que app.go y
// conexion.go en la app de escritorio: abre el puerto, activa el puente con "!",
// saluda al entrenador y pide telemetria cada 150 ms.
import { zipSync, strToU8 } from 'fflate'
import type { Telemetria } from '../componentes/Placa'
import { BAUDIOS, esRespuesta, Lineas, lineasPrograma, parsearPantalla, parsearTelemetria } from './protocolo'
import type { Backend, EstadoConexion, Oyentes, Puerto } from './tipos'

const PERIODO_TELEMETRIA = 150
const FALLOS_PERMITIDOS = 5
// La pantalla (LCD y brillo, comando P) se pide cada tantas vueltas de telemetria
const VUELTAS_PANTALLA = 3
// Uno (2341, 2a03) o el conversor USB-serie de la placa ESP32 (CP210x 10c4, CH340 1a86)
const VIDS_PUENTE = [0x2341, 0x2a03, 0x10c4, 0x1a86]

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

class SinRespuesta extends Error {
  constructor(que: string) {
    super(`${que}: sin respuesta`)
  }
}

// Conexion con el puente por un puerto del navegador. Las transacciones van una por
// una (cola): la telemetria y los comandos de la interfaz no se mezclan.
class ConexionSerie {
  private lineas = new Lineas()
  private recibidas: string[] = []
  private espera: (() => void) | null = null
  private cola: Promise<unknown> = Promise.resolve()
  private lector: ReadableStreamDefaultReader<Uint8Array> | null = null
  private ocupado = false
  private abierta = false
  private leyendo: Promise<void> = Promise.resolve()

  constructor(
    readonly puerto: SerialPort,
    readonly nombre: string,
    private registrar: (l: string) => void,
  ) {}

  async abrir() {
    await this.puerto.open({ baudRate: BAUDIOS })
    this.abierta = true
    this.leyendo = this.leer()
    // Abrir el puerto puede reiniciar la placa (DTR/RTS): esperar a que arranque
    await esperar(1000)
    this.recibidas = []
  }

  private async leer() {
    const decodificador = new TextDecoder()
    while (this.abierta && this.puerto.readable) {
      this.lector = this.puerto.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await this.lector.read()
          if (done) break
          for (const l of this.lineas.agregar(decodificador.decode(value, { stream: true }))) this.recibir(l)
        }
      } catch {
        // error de lectura (placa desconectada): sale del bucle si se cerro
      } finally {
        this.lector.releaseLock()
        this.lector = null
      }
    }
  }

  private recibir(l: string) {
    // Fuera de una transaccion, lo que llega es un mensaje del puente o del entrenador
    if (!this.ocupado) {
      if (l.trim()) this.registrar('< ' + l)
      return
    }
    this.recibidas.push(l)
    this.espera?.()
  }

  private async escribir(texto: string) {
    const escritor = this.puerto.writable!.getWriter()
    try {
      await escritor.write(new TextEncoder().encode(texto))
    } finally {
      escritor.releaseLock()
    }
  }

  private async siguienteLinea(ms: number, que: string): Promise<string> {
    const limite = Date.now() + ms
    while (this.recibidas.length === 0) {
      const falta = limite - Date.now()
      if (falta <= 0) throw new SinRespuesta(que)
      await new Promise<void>((listo) => {
        const t = setTimeout(() => {
          this.espera = null
          listo()
        }, falta)
        this.espera = () => {
          clearTimeout(t)
          this.espera = null
          listo()
        }
      })
    }
    return this.recibidas.shift()!
  }

  // Ejecuta f con el puerto para el solo, despues de lo que ya estaba en la cola
  private enCola<T>(f: () => Promise<T>): Promise<T> {
    const turno = this.cola.then(async () => {
      this.ocupado = true
      this.recibidas = []
      try {
        return await f()
      } finally {
        this.ocupado = false
      }
    })
    this.cola = turno.catch(() => undefined)
    return turno
  }

  // "!" hasta que el puente responda; como en conexion.go, se repite cada medio segundo
  activarPuente() {
    return this.enCola(async () => {
      const limite = Date.now() + 5000
      while (Date.now() < limite) {
        await this.escribir('!')
        try {
          let l = await this.siguienteLinea(500, '!')
          while (l !== 'PUENTE OK') {
            if (l.trim()) this.registrar('< ' + l)
            l = await this.siguienteLinea(500, '!')
          }
        } catch (e) {
          if (e instanceof SinRespuesta) continue
          throw e
        }
        // Los "!" de mas pasaron al entrenador: terminar esa linea y descartar su ERR
        await this.escribir('\n')
        await esperar(300)
        this.recibidas = []
        return
      }
      throw new Error('La placa no respondió como puente: ¿tiene el firmware esp32-puente (o puente-uno en el Uno)?')
    })
  }

  transaccion(cmd: string, ms = 1000): Promise<string> {
    return this.enCola(async () => {
      await this.escribir(cmd + '\n')
      for (;;) {
        const l = await this.siguienteLinea(ms, cmd)
        if (l.startsWith('ERR')) throw new Error(`El puente respondió "${l}" a "${cmd}"`)
        if (esRespuesta(l)) return l
        if (l.trim()) this.registrar('< ' + l)
      }
    })
  }

  async cerrar() {
    this.abierta = false
    try {
      await this.lector?.cancel()
    } catch {
      // ya estaba cerrado
    }
    await this.leyendo
    try {
      await this.puerto.close()
    } catch {
      // la placa ya no esta
    }
  }
}

class BackendWeb implements Backend {
  tipo = 'web' as const
  private puertos = new Map<string, SerialPort>()
  private oyentes = new Set<Oyentes>()
  private con: ConexionSerie | null = null
  private entrenador = false
  private sondeo: ReturnType<typeof setInterval> | null = null
  private pausada = false

  private emitir<K extends keyof Oyentes>(evento: K, dato: Parameters<Oyentes[K]>[0]) {
    for (const o of this.oyentes) (o[evento] as (d: typeof dato) => void)(dato)
  }

  private registrar = (l: string) => this.emitir('registro', l)

  private describir(p: SerialPort): Puerto {
    const info = p.getInfo()
    let nombre = [...this.puertos].find(([, x]) => x === p)?.[0]
    if (!nombre) {
      nombre = `Puerto ${this.puertos.size + 1}`
      this.puertos.set(nombre, p)
    }
    const vid = info.usbVendorId
    const hex = (n?: number) => (n ?? 0).toString(16).padStart(4, '0')
    return {
      nombre,
      descripcion: vid === undefined ? '' : `USB ${hex(vid)}:${hex(info.usbProductId)}`,
      esArduino: vid !== undefined && VIDS_PUENTE.includes(vid),
    }
  }

  async listarPuertos() {
    if (!window.isSecureContext) {
      throw new Error('El puerto serie del navegador solo funciona en https o en localhost: abre la app con una de esas direcciones.')
    }
    if (!('serial' in navigator)) throw new Error('Este navegador no tiene Web Serial: usa Chrome o Edge.')
    return (await navigator.serial.getPorts()).map((p) => this.describir(p))
  }

  async pedirPuerto() {
    try {
      return this.describir(await navigator.serial.requestPort())
    } catch {
      return null // el usuario cerro el dialogo
    }
  }

  puertoSerie(nombre: string) {
    return this.puertos.get(nombre)
  }

  escuchar(oyentes: Oyentes) {
    this.oyentes.add(oyentes)
    return () => {
      this.oyentes.delete(oyentes)
    }
  }

  private estado(): EstadoConexion {
    return this.con ? { conectado: true, puerto: this.con.nombre, entrenador: this.entrenador } : { conectado: false }
  }

  async conectar(nombre: string) {
    await this.desconectar()
    const puerto = this.puertos.get(nombre)
    if (!puerto) throw new Error('Elige el puerto otra vez (el navegador pide permiso).')
    this.registrar(`Abriendo ${nombre}...`)
    const con = new ConexionSerie(puerto, nombre, this.registrar)
    await con.abrir()
    try {
      await con.activarPuente()
    } catch (e) {
      await con.cerrar()
      throw e
    }
    this.registrar('Puente activo')

    let entrenador = false
    for (let i = 0; i < 3 && !entrenador; i++) {
      entrenador = await con
        .transaccion('?')
        .then((l) => l.startsWith('OK ENTRENADOR'))
        .catch(() => false)
    }
    this.con = con
    this.entrenador = entrenador
    this.sondear(con)

    const estado = this.estado()
    if (entrenador) {
      this.registrar('Entrenador conectado')
    } else {
      estado.mensaje = 'El puente funciona pero el entrenador no responde. Revisa el cableado del serie y GND, o graba el firmware "bloques".'
      this.registrar(estado.mensaje)
    }
    return estado
  }

  private sondear(con: ConexionSerie) {
    let fallos = 0
    let enCurso = false
    let vuelta = 0
    let pantalla: Telemetria['pantalla'] = null
    let conPantalla = true // el firmware 1 responde ERR a P: se deja de pedir
    this.sondeo = setInterval(async () => {
      if (enCurso || this.pausada || this.con !== con) return
      enCurso = true
      try {
        const t: Telemetria = parsearTelemetria(await con.transaccion('T', 500))
        if (conPantalla && vuelta++ % VUELTAS_PANTALLA === 0) {
          try {
            pantalla = parsearPantalla(await con.transaccion('P', 500))
          } catch (e) {
            if (String(e).includes('ERR')) conPantalla = false
          }
        }
        t.pantalla = pantalla
        if (fallos >= FALLOS_PERMITIDOS || !this.entrenador) {
          this.entrenador = true
          this.emitir('conexion', this.estado())
          this.registrar('Entrenador conectado')
        }
        fallos = 0
        this.emitir('telemetria', t)
      } catch (e) {
        if (++fallos === FALLOS_PERMITIDOS) {
          this.entrenador = false
          this.emitir('conexion', this.estado())
          this.registrar('El entrenador dejó de responder: ' + String(e))
        }
      } finally {
        enCurso = false
      }
    }, PERIODO_TELEMETRIA)
  }

  async desconectar() {
    if (this.sondeo) clearInterval(this.sondeo)
    this.sondeo = null
    const con = this.con
    this.con = null
    this.entrenador = false
    if (con) {
      await con.cerrar()
      this.registrar('Desconectado')
      this.emitir('conexion', { conectado: false })
    }
  }

  private conexion() {
    if (!this.con) throw new Error('No hay conexión con el entrenador')
    return this.con
  }

  async ponerLeds(valor: number) {
    await this.conexion().transaccion(`L ${valor & 0xff}`)
  }

  async ponerNumero(valor: number) {
    await this.conexion().transaccion(`N ${valor}`)
  }

  async apagarDisplays() {
    await this.conexion().transaccion('N -')
  }

  async cargarPrograma(bytes: number[], guardar: boolean) {
    const con = this.conexion()
    for (const l of lineasPrograma(bytes)) await con.transaccion(l)
    this.registrar(`Programa cargado (${bytes.length} bytes)`)
    if (guardar) {
      await con.transaccion('W', 5000) // la EEPROM tarda ~3.3 ms por byte
      this.registrar('Programa guardado: corre al encender el entrenador')
    }
    await con.transaccion('R')
  }

  async detenerPrograma() {
    await this.conexion().transaccion('S')
  }

  async borrarGuardado() {
    await this.conexion().transaccion('X')
    this.registrar('Programa guardado borrado')
  }

  async pausarTelemetria(pausa: boolean) {
    this.pausada = pausa
  }

  comandoPuente(linea: string, esperaMs = 1000) {
    return this.conexion().transaccion(linea, esperaMs)
  }

  async guardarArchivo(nombre: string, contenido: string) {
    const archivo = nombre.includes('.') ? nombre : `${nombre}.ino`
    descargar(archivo, new Blob([contenido], { type: 'text/plain' }))
    return `Descargas/${archivo}`
  }

  async instalarBiblioteca() {
    // La misma copia de la biblioteca que incrusta la app de escritorio (compilar-firmware.sh)
    const fuentes = import.meta.glob('../../../firmware/Entrenador/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const archivos: Record<string, Uint8Array> = {}
    for (const [ruta, texto] of Object.entries(fuentes)) {
      archivos[ruta.slice(ruta.indexOf('Entrenador/'))] = strToU8(texto)
    }
    descargar('Entrenador.zip', new Blob([zipSync(archivos)], { type: 'application/zip' }))
    return 'Descargas/Entrenador.zip (en el IDE de Arduino: Programa > Incluir biblioteca > Añadir biblioteca .ZIP)'
  }
}

function descargar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const web: Backend = new BackendWeb()
