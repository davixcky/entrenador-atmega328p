// Lo que la interfaz necesita del "otro lado": la app de escritorio (Go, wailsjs) o el
// navegador (Web Serial). Las dos hablan el mismo protocolo por lineas con el puente
// (ESP32 o Uno) y el entrenador; ver INTEGRADOR.md y firmware/bloques/bloques.ino.
import type { Telemetria } from '../componentes/Placa'

export interface Puerto {
  nombre: string
  descripcion: string
  esArduino: boolean
}

export interface EstadoConexion {
  conectado: boolean
  puerto?: string
  entrenador?: boolean
  mensaje?: string
}

export interface Oyentes {
  telemetria: (t: Telemetria) => void
  registro: (linea: string) => void
  conexion: (e: EstadoConexion) => void
}

export interface Backend {
  tipo: 'escritorio' | 'web'
  listarPuertos(): Promise<Puerto[]>
  // Solo en la web: el navegador pide permiso para un puerto nuevo
  pedirPuerto?(): Promise<Puerto | null>
  conectar(puerto: string): Promise<EstadoConexion>
  desconectar(): Promise<void>
  escuchar(oyentes: Oyentes): () => void

  ponerLeds(valor: number): Promise<void>
  ponerNumero(valor: number): Promise<void>
  apagarDisplays(): Promise<void>
  cargarPrograma(bytes: number[], guardar: boolean): Promise<void>
  detenerPrograma(): Promise<void>
  borrarGuardado(): Promise<void>

  // Deja de pedir telemetria (al grabar por ISP el ATmega queda en reset y no contesta)
  pausarTelemetria(pausa: boolean): Promise<void>
  // Una linea tal cual al puente y su respuesta (OK...). Para los comandos @ del ESP32.
  comandoPuente(linea: string, esperaMs?: number): Promise<string>

  // Guarda un archivo de texto: dialogo en el escritorio, descarga en la web.
  // Devuelve donde quedo (o null si se cancelo).
  guardarArchivo(nombre: string, contenido: string): Promise<string | null>
  // Escritorio: copia la biblioteca a ~/Arduino/libraries. Web: descarga un .zip.
  instalarBiblioteca(): Promise<string>

  // Grabacion con el Uno y avrdude (solo escritorio)
  avrdude?: {
    ruta(): Promise<string>
    grabarPuente(puerto: string): Promise<string>
    grabarEntrenador(puerto: string): Promise<string>
  }
  // Puerto del navegador, para grabar el ESP32 con esptool-js (solo web; hay que desconectar antes)
  puertoSerie?(nombre: string): SerialPort | undefined
}
