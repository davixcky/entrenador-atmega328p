# Nube del circuito integrador (Supabase)

Backend del tablero de la actividad 15.3 (ver `../INTEGRADOR.md`): el ESP32 consulta
`controles` y sube `lecturas` por la API REST; la app web muestra `lecturas` en tiempo
real y fija `controles.entradas[1]` (VALOR1, 0 a 100).

Se desarrolla con Supabase local (CLI + Docker) y el mismo esquema se sube al Supabase
alojado con `supabase db push`.

```text
nube/
├── package.json              CLI de Supabase fijada (devDependency) y scripts
├── .env.example              variables de la app web
├── supabase/
│   ├── config.toml           project_id = entrenador-iot
│   ├── migrations/20261112000000_esquema_entrenador.sql
│   └── seed.sql              dispositivo entrenador-1
└── pruebas/probar-rest.sh    prueba REST de punta a punta (como el ESP32)
```

## Arrancar, parar, reiniciar

Requisitos: Docker y Node.js. La primera vez `npm install` (instala la CLI) y la
primera arrancada descarga imágenes de Docker (tarda unos minutos).

| Comando | Qué hace |
|---|---|
| `npm run start` | levanta la pila local (aplica migraciones y semilla si la base es nueva) |
| `npm run stop` | la detiene (los datos se conservan en un volumen de Docker) |
| `npm run reset` | borra la base, vuelve a aplicar migraciones y `seed.sql` |
| `npm run estado` | URLs y claves |
| `npm run llaves` | lo mismo en formato `CLAVE=valor` |
| `npm run probar` | corre `pruebas/probar-rest.sh` |

Servicios activos: base de datos (Postgres 17), API REST (PostgREST), Realtime, Auth
(necesario para las claves JWT), Kong (pasarela en el puerto 54321) y Studio. Se
apagaron storage, edge runtime, analytics y el servidor de correo de prueba para que
arranque más rápido (`supabase/config.toml`).

| Servicio | URL local |
|---|---|
| API (REST, Realtime, Auth) | `http://127.0.0.1:54321` |
| Studio | `http://127.0.0.1:54323` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Claves

```bash
npm run llaves        # o: npx supabase status -o env
```

- `ANON_KEY` (o `PUBLISHABLE_KEY`): la que usan el ESP32 y la app web.
- `SERVICE_ROLE_KEY` / `SECRET_KEY`: salta RLS; **nunca** va en el ESP32 ni en la app.

En local son las claves de demostración fijas de Supabase; en el proyecto alojado
están en Dashboard > Project Settings > API.

## Tablas

| Tabla | Columnas | Notas |
|---|---|---|
| `dispositivos` | `id text pk`, `nombre text`, `creado_en` | se registran por SQL/Studio, no por la API |
| `lecturas` | `id bigint identity`, `dispositivo → dispositivos`, `salidas smallint[4]`, `entradas smallint[4]`, `creado_en` | índice `(dispositivo, creado_en desc)` |
| `controles` | `dispositivo pk → dispositivos`, `entradas smallint[4]` (por defecto `{0,0,0,0}`), `actualizado_en` | un disparador actualiza `actualizado_en` |

- Los arreglos deben tener exactamente 4 elementos, sin nulos. `smallint` impone el
  rango -32768..32767 de la máquina virtual. El rango de VALOR1 (0..100) lo valida la app.
- Al insertar un dispositivo, un disparador le crea su fila en `controles`, así el GET
  del ESP32 nunca vuelve vacío.
- `lecturas` y `controles` están en la publicación `supabase_realtime`.
- Retención: `public.limpiar_lecturas(dias)` borra lecturas más viejas que `dias` y
  devuelve cuántas borró. pg_cron la corre cada día a las 03:00 UTC con 7 días (tarea
  `limpiar-lecturas`). Si pg_cron no estuviera disponible, correr a mano en el editor
  SQL: `select public.limpiar_lecturas(7);`. A 1 lectura por segundo son unas 86 400
  filas por día.

## Políticas (RLS) y advertencia de seguridad

RLS está activo en las tres tablas. Además los permisos (GRANT) son explícitos y por
columna:

| Rol | dispositivos | lecturas | controles |
|---|---|---|---|
| anon, authenticated | leer | leer; insertar `dispositivo, salidas, entradas` solo si el dispositivo existe | leer; cambiar solo `entradas` |
| borrar | nadie | nadie (solo `limpiar_lecturas`, no expuesta por la API) | nadie |

**Esto es una configuración de demostración para clase.** La clave anon va grabada en
el ESP32 y en la app web, y es pública por diseño: cualquiera que la tenga puede leer
todas las lecturas, cambiar VALOR1 de cualquier dispositivo e insertar lecturas falsas
(o muchas, llenando la base) a nombre de un dispositivo registrado. No puede borrar
nada ni registrar dispositivos. Para producción:

- autenticar cada dispositivo (un usuario de Auth por ESP32, o un JWT propio con el id
  del dispositivo) y escribir políticas con `auth.uid()`/claims, o
- hacer que el ESP32 hable con una Edge Function que valide un secreto por dispositivo
  y escriba con la clave de servicio, y
- exigir inicio de sesión en el tablero para cambiar `controles`.

## ESP32 en la red local

El ESP32 no puede usar `localhost`/`127.0.0.1` (sería él mismo): debe usar la IP del PC
en la LAN, por ejemplo `http://192.168.1.50:54321`.

```bash
ip -4 addr show | grep inet        # IP del PC (Linux); en Windows: ipconfig
```

Kong publica el puerto 54321 en todas las interfaces (`0.0.0.0:54321`). Si el ESP32 no
llega, abrir el puerto en el cortafuegos del PC, por ejemplo
`sudo ufw allow 54321/tcp` o `sudo firewall-cmd --add-port=54321/tcp`; en Windows,
una regla de entrada TCP 54321. El PC y el ESP32 deben estar en la misma red (algunas
redes de invitados o de universidad aíslan clientes entre sí).

Ojo: Docker también publica en `0.0.0.0` Studio (54323) y Postgres (54322, usuario y
clave `postgres`), sin contraseña de acceso. En redes compartidas abrir en el
cortafuegos solo el 54321.

Configuración por el puerto serie (una línea, desde la app o un monitor serie):

```text
@CONF {"ssid":"MiRed","clave":"secreto","url":"http://192.168.1.50:54321","llave":"<ANON_KEY>","dispositivo":"entrenador-1"}
@NUBE 1
@?
```

Con el proyecto alojado, `url` es `https://<ref>.supabase.co` y `llave` su clave anon.

El ciclo que hace el ESP32 (y que reproduce `pruebas/probar-rest.sh`):

```bash
URL=http://127.0.0.1:54321; LLAVE=<ANON_KEY>
curl "$URL/rest/v1/controles?dispositivo=eq.entrenador-1&select=entradas" \
  -H "apikey: $LLAVE" -H "Authorization: Bearer $LLAVE"
# -> [{"entradas":[0,0,0,0]}]
curl -X POST "$URL/rest/v1/lecturas" -H "apikey: $LLAVE" -H "Authorization: Bearer $LLAVE" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"dispositivo":"entrenador-1","salidas":[512,0,0,0],"entradas":[0,0,0,0]}'
# -> 201 sin cuerpo
```

## App web

Copiar `.env.example` a `.env.local` de la app y llenar `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY`. Con `@supabase/supabase-js`:

```js
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const id = 'entrenador-1'

// Lecturas en vivo
sb.channel('lecturas')
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'lecturas', filter: `dispositivo=eq.${id}` },
      ({ new: l }) => mostrar(l.salidas[0], l.entradas[0]))
  .subscribe()

// Historial reciente
await sb.from('lecturas').select('salidas,entradas,creado_en')
  .eq('dispositivo', id).order('creado_en', { ascending: false }).limit(100)

// Fijar VALOR1 (validar 0..100 en la app); se envía el arreglo completo
await sb.from('controles').update({ entradas: [valor1, 0, 0, 0] }).eq('dispositivo', id)
```

## Pasar al Supabase alojado

```bash
npx supabase login
npx supabase link --project-ref <ref>      # pide la contraseña de la base
npx supabase db push                        # aplica supabase/migrations/
```

La semilla no se aplica con `db push`. Registrar el dispositivo en el editor SQL del
Dashboard (pegar `supabase/seed.sql`), o con `npx supabase db push --include-seed`.
Realtime y pg_cron quedan configurados por la migración. Para nuevos cambios de
esquema: `npx supabase migration new <nombre>`, probar con `npm run reset` y luego
`db push`.
