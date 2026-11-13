// La misma interfaz corre como app de escritorio (Wails inyecta window.go) o en el
// navegador (Web Serial).
import { escritorio } from './escritorio'
import { web } from './web'
import type { Backend } from './tipos'

export const backend: Backend = 'go' in window ? escritorio : web
export type { Backend, EstadoConexion, Puerto } from './tipos'
