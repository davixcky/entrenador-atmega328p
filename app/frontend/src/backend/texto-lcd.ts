// El ESP32 desplaza los mensajes largos sobre las 16 columnas del LCD.
export const MAX_TEXTO_LCD = 160

export function textoLcd(t: string) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^ -~]/g, '?').slice(0, MAX_TEXTO_LCD)
}
