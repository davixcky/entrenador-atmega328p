#!/usr/bin/env python3
"""Deja todo listo para usar el Supabase alojado, con un solo comando:

  1. Pide la clave anon del proyecto a la CLI de Supabase (con tu `supabase login`)
     y la guarda en nube/.env.local (VITE_SUPABASE_URL_ALOJADO / _ANON_KEY_ALOJADO).
  2. Recompila la app de escritorio para que "Nube > Conexion > Alojado" ya traiga la clave.
  3. Configura el ESP32 por USB: red Wi-Fi, clave Wi-Fi (la escribes tu, no se guarda
     en ningun archivo), URL, clave anon y dispositivo; activa la nube y espera a que conecte.

Uso (en una terminal, con la app desconectada del ESP32):
  python3 nube/configurar.py [--ref <ref>] [--puerto /dev/ttyUSB0] [--red FLIA_OROZCO]
  python3 nube/configurar.py --sin-esp32      # solo los pasos 1 y 2
"""
import argparse
import getpass
import json
import os
import subprocess
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ENV = os.path.join(AQUI, '.env.local')


def paso(t):
    print(f'\n== {t}')


def ref_enlazado():
    try:
        with open(os.path.join(AQUI, 'supabase', '.temp', 'project-ref')) as f:
            return f.read().strip()
    except OSError:
        return ''


def clave_anon(ref):
    r = subprocess.run(['npx', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '-o', 'json'],
                       cwd=AQUI, capture_output=True, text=True, stdin=subprocess.DEVNULL)
    try:
        datos = json.loads(r.stdout[r.stdout.index('['):] if '[' in r.stdout else r.stdout)
    except ValueError:
        sys.exit('No se pudieron leer las claves. ¿Hiciste `npx supabase login`?\n' + r.stderr[-500:])
    if isinstance(datos, dict):
        datos = datos.get('keys', [])
    for k in datos:
        if k.get('name') == 'anon' or k.get('type') == 'publishable':
            return k['api_key']
    sys.exit('El proyecto no tiene clave anon/publishable.')


def escribir_env(valores):
    lineas = []
    if os.path.exists(ENV):
        with open(ENV) as f:
            lineas = [l for l in f.read().splitlines() if l.split('=', 1)[0] not in valores]
    lineas += [f'{k}={v}' for k, v in valores.items()]
    with open(ENV, 'w') as f:
        f.write('\n'.join(lineas) + '\n')
    os.chmod(ENV, 0o600)


def recompilar_app():
    wails = os.path.expanduser('~/go/bin/wails')
    if not os.path.exists(wails):
        print('  (no está wails: la app web toma la clave al correr `npm run dev`)')
        return
    r = subprocess.run([wails, 'build', '-tags', 'webkit2_41'], cwd=os.path.join(RAIZ, 'app'),
                       capture_output=True, text=True)
    print('  app recompilada' if r.returncode == 0 else '  fallo la compilacion:\n' + r.stdout[-800:])


def configurar_esp32(puerto, red, url, llave, dispositivo):
    import serial  # pyserial

    s = serial.Serial()
    s.port, s.baudrate, s.timeout, s.dtr, s.rts = puerto, 19200, 0.2, False, False
    try:
        s.open()
    except serial.SerialException as e:
        sys.exit(f'No se pudo abrir {puerto} ({e}). ¿La app está conectada? Desconéctala y repite.')

    def linea(cmd, espera=3.0):
        s.reset_input_buffer()
        s.write((cmd + '\n').encode())
        fin = time.time() + espera
        buf = b''
        while time.time() < fin:
            buf += s.read(256)
            for l in buf.decode(errors='replace').splitlines():
                if l.startswith(('OK', 'ERR')):
                    return l
        return ''

    time.sleep(2)  # abrir el puerto puede reiniciar el ESP32
    for _ in range(10):
        s.write(b'!')
        time.sleep(0.4)
        if b'PUENTE OK' in s.read(512):
            break
    else:
        sys.exit('El ESP32 no contesta "PUENTE OK". ¿Tiene el firmware esp32-puente?')
    s.write(b'\n')
    time.sleep(0.3)

    clave = getpass.getpass(f'  Clave del Wi-Fi "{red}" (no se muestra ni se guarda en archivos): ')
    conf = {'ssid': red, 'url': url, 'llave': llave, 'dispositivo': dispositivo}
    if clave:
        conf['clave'] = clave
    r = linea('@CONF ' + json.dumps(conf, separators=(',', ':')))
    if not r.startswith('OK'):
        sys.exit(f'El ESP32 rechazó la configuración: {r or "sin respuesta"}')
    linea('@NUBE 1')
    print('  configuración guardada; esperando el Wi-Fi y la nube...')
    for _ in range(30):
        time.sleep(1)
        estado = linea('@?')
        print('  ' + estado, end='\r')
        if 'wifi=conectado' in estado and 'nube=ok' in estado:
            print('\n  ESP32 conectado y sincronizando con la nube.')
            return True
    print(f'\n  No llegó a "nube=ok" en 30 s. Último estado: {estado}')
    if 'wifi=conectando' in estado:
        print('  El Wi-Fi no conecta: revisa el nombre de la red (2.4 GHz) y la clave.')
    return False


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('--ref', default=ref_enlazado(), help='project ref (por defecto el de `supabase link`)')
    a.add_argument('--puerto', default='/dev/ttyUSB0')
    a.add_argument('--red', default='FLIA_OROZCO')
    a.add_argument('--dispositivo', default='entrenador-1')
    a.add_argument('--sin-esp32', action='store_true')
    o = a.parse_args()
    if not o.ref:
        sys.exit('Falta el project ref: --ref <ref> o `npx supabase link --project-ref <ref>` en nube/.')
    url = f'https://{o.ref}.supabase.co'

    paso(f'1. Clave anon de {url}')
    llave = clave_anon(o.ref)
    escribir_env({'VITE_SUPABASE_URL_ALOJADO': url, 'VITE_SUPABASE_ANON_KEY_ALOJADO': llave})
    print(f'  guardada en {os.path.relpath(ENV, RAIZ)} (no va a git)')

    paso('2. App de escritorio')
    recompilar_app()

    if not o.sin_esp32:
        paso(f'3. ESP32 en {o.puerto}')
        configurar_esp32(o.puerto, o.red, url, llave, o.dispositivo)

    print('\nListo. En la app: Nube > Conexión > Alojado > Guardar y reconectar (la clave ya viene puesta).')


if __name__ == '__main__':
    main()
