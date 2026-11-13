// Backend de la app de escritorio: llama a los metodos de Go (app.go) por wailsjs.
import * as Go from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import type { Backend } from './tipos'

export const escritorio: Backend = {
  tipo: 'escritorio',
  listarPuertos: () => Go.ListarPuertos(),
  conectar: (puerto) => Go.Conectar(puerto),
  desconectar: () => Go.Desconectar(),
  escuchar(oyentes) {
    const quitar = [
      EventsOn('telemetria', oyentes.telemetria),
      EventsOn('registro', oyentes.registro),
      EventsOn('conexion', oyentes.conexion),
    ]
    return () => quitar.forEach((q) => q())
  },
  ponerLeds: (v) => Go.PonerLeds(v),
  ponerNumero: (n) => Go.PonerNumero(n),
  apagarDisplays: () => Go.ApagarDisplays(),
  cargarPrograma: (bytes, guardar) => Go.CargarPrograma(bytes, guardar),
  detenerPrograma: () => Go.DetenerPrograma(),
  borrarGuardado: () => Go.BorrarGuardado(),
  pausarTelemetria: (pausa) => Go.PausarTelemetria(pausa),
  comandoPuente: (linea, esperaMs = 1000) => Go.ComandoPuente(linea, esperaMs),
  async guardarArchivo(nombre, contenido) {
    const ruta = await Go.GuardarSketch(nombre, contenido)
    return ruta || null
  },
  instalarBiblioteca: () => Go.InstalarBiblioteca(),
  avrdude: {
    ruta: () => Go.RutaAvrdude(),
    grabarPuente: (p) => Go.GrabarPuente(p),
    grabarEntrenador: (p) => Go.GrabarEntrenador(p),
  },
}
