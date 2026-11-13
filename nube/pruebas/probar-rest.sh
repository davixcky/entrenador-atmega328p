#!/usr/bin/env bash
# Prueba de punta a punta de la API REST, tal como la usan el ESP32 y el tablero
# (INTEGRADOR.md, "Ciclo del ESP32"). Lee la URL y la clave anon de
# `supabase status -o env`. Sale con código distinto de 0 si algo falla.
#
# Uso (desde nube/):  npm run probar     o     bash pruebas/probar-rest.sh
# Variables opcionales: DISPOSITIVO (por defecto entrenador-1), URL, LLAVE.
#
# Nota: deja controles.entradas como estaba al empezar y agrega 1 lectura.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

SUPABASE="npx --no-install supabase"
if command -v supabase >/dev/null 2>&1; then SUPABASE="supabase"; fi

if [[ -z "${URL:-}" || -z "${LLAVE:-}" ]]; then
  ENV_TXT="$($SUPABASE status -o env 2>/dev/null)" || { echo "FALLA: supabase no está corriendo (npm run start)"; exit 1; }
  valor() { printf '%s\n' "$ENV_TXT" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -n1; }
  URL="${URL:-$(valor API_URL)}"
  LLAVE="${LLAVE:-$(valor ANON_KEY)}"
  [[ -z "$LLAVE" ]] && LLAVE="$(valor PUBLISHABLE_KEY)"
  DB_URL="$(valor DB_URL)"
fi
DISPOSITIVO="${DISPOSITIVO:-entrenador-1}"

[[ -n "$URL" && -n "$LLAVE" ]] || { echo "FALLA: no se obtuvo API_URL / ANON_KEY"; exit 1; }
echo "API: $URL   dispositivo: $DISPOSITIVO"
echo

FALLAS=0
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
ok()    { echo "  OK    $*"; }
falla() { echo "  FALLA $*"; FALLAS=$((FALLAS + 1)); }

# pedir METODO RUTA [CUERPO] [CABECERA_EXTRA] -> deja CODIGO y CUERPO
pedir() {
  local metodo="$1" ruta="$2" datos="${3:-}" extra="${4:-}"
  local args=(-sS -o "$TMP" -w '%{http_code}' -X "$metodo"
              -H "apikey: $LLAVE" -H "Authorization: Bearer $LLAVE"
              -H "Content-Type: application/json")
  [[ -n "$extra" ]] && args+=(-H "$extra")
  [[ -n "$datos" ]] && args+=(--data "$datos")
  CODIGO="$(curl "${args[@]}" "$URL$ruta")" || CODIGO="000"
  CUERPO="$(cat "$TMP")"
}

echo "1. GET controles (paso 1 del ESP32)"
pedir GET "/rest/v1/controles?dispositivo=eq.$DISPOSITIVO&select=entradas"
echo "     $CODIGO $CUERPO"
if [[ "$CODIGO" == 200 && "$CUERPO" =~ ^\[\{\"entradas\":\[-?[0-9]+,-?[0-9]+,-?[0-9]+,-?[0-9]+\]\}\]$ ]]; then
  ok "controles devuelve 4 entradas"
  ORIGINAL="$(printf '%s' "$CUERPO" | sed 's/^\[{"entradas":\(\[[^]]*\]\)}\]$/\1/')"
else
  falla "GET controles"; ORIGINAL="[0,0,0,0]"
fi

echo "2. PATCH controles.entradas = [42,0,0,0] (lo que hace el tablero con VALOR1)"
pedir PATCH "/rest/v1/controles?dispositivo=eq.$DISPOSITIVO" '{"entradas":[42,0,0,0]}' "Prefer: return=representation"
echo "     $CODIGO $CUERPO"
[[ "$CODIGO" == 200 && "$CUERPO" == *'"entradas":[42,0,0,0]'* ]] && ok "PATCH aplicado" || falla "PATCH controles"

pedir GET "/rest/v1/controles?dispositivo=eq.$DISPOSITIVO&select=entradas"
[[ "$CUERPO" == '[{"entradas":[42,0,0,0]}]' ]] && ok "el ESP32 ve VALOR1=42" || falla "GET tras PATCH: $CUERPO"

echo "3. POST lecturas con Prefer: return=minimal (paso 3 del ESP32)"
pedir POST "/rest/v1/lecturas" "{\"dispositivo\":\"$DISPOSITIVO\",\"salidas\":[512,0,0,0],\"entradas\":[42,0,0,0]}" "Prefer: return=minimal"
echo "     $CODIGO $CUERPO"
[[ "$CODIGO" == 201 && -z "$CUERPO" ]] && ok "lectura insertada (201, sin cuerpo)" || falla "POST lecturas"

echo "4. GET últimas lecturas"
pedir GET "/rest/v1/lecturas?dispositivo=eq.$DISPOSITIVO&select=id,salidas,entradas,creado_en&order=creado_en.desc&limit=3"
echo "     $CODIGO $CUERPO"
[[ "$CODIGO" == 200 && "$CUERPO" == '[{'*'"salidas":[512,0,0,0],"entradas":[42,0,0,0]'* ]] && ok "la última lectura es la recién enviada" || falla "GET lecturas"

echo "5. Lo que anon NO debe poder hacer"
pedir POST "/rest/v1/lecturas" '{"dispositivo":"no-existe","salidas":[1,2,3,4],"entradas":[0,0,0,0]}' "Prefer: return=minimal"
echo "     POST lecturas de dispositivo inexistente -> $CODIGO $CUERPO"
[[ "$CODIGO" =~ ^4 ]] && ok "rechazado" || falla "se aceptó una lectura de un dispositivo inexistente"

pedir POST "/rest/v1/lecturas" "{\"dispositivo\":\"$DISPOSITIVO\",\"salidas\":[1,2,3],\"entradas\":[0,0,0,0]}" "Prefer: return=minimal"
echo "     POST lecturas con 3 salidas -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "rechazado (deben ser 4)" || falla "se aceptó un arreglo de 3"

pedir POST "/rest/v1/lecturas" "{\"dispositivo\":\"$DISPOSITIVO\",\"salidas\":[40000,0,0,0],\"entradas\":[0,0,0,0]}" "Prefer: return=minimal"
echo "     POST lecturas con 40000 (fuera de int16) -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "rechazado (fuera de rango)" || falla "se aceptó un valor fuera de int16"

ANTES_N="$(curl -sS -H "apikey: $LLAVE" -H "Authorization: Bearer $LLAVE" -H "Prefer: count=exact" -o /dev/null -D - \
  "$URL/rest/v1/lecturas?dispositivo=eq.$DISPOSITIVO&select=id&limit=1" | tr -d '\r' | sed -n 's/^[Cc]ontent-[Rr]ange: .*\///p')"
pedir DELETE "/rest/v1/lecturas?dispositivo=eq.$DISPOSITIVO" "" "Prefer: return=representation"
DESPUES_N="$(curl -sS -H "apikey: $LLAVE" -H "Authorization: Bearer $LLAVE" -H "Prefer: count=exact" -o /dev/null -D - \
  "$URL/rest/v1/lecturas?dispositivo=eq.$DISPOSITIVO&select=id&limit=1" | tr -d '\r' | sed -n 's/^[Cc]ontent-[Rr]ange: .*\///p')"
echo "     DELETE lecturas -> $CODIGO $CUERPO  (filas antes=$ANTES_N después=$DESPUES_N)"
[[ "$CODIGO" =~ ^4 && "$ANTES_N" == "$DESPUES_N" && -n "$ANTES_N" ]] && ok "DELETE lecturas rechazado" || falla "anon pudo borrar lecturas"

pedir DELETE "/rest/v1/controles?dispositivo=eq.$DISPOSITIVO"
echo "     DELETE controles -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "DELETE controles rechazado" || falla "anon pudo borrar controles"

pedir DELETE "/rest/v1/dispositivos?id=eq.$DISPOSITIVO"
echo "     DELETE dispositivos -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "DELETE dispositivos rechazado" || falla "anon pudo borrar dispositivos"

pedir POST "/rest/v1/dispositivos" '{"id":"intruso","nombre":"x"}' "Prefer: return=minimal"
echo "     POST dispositivos -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "registrar dispositivos rechazado" || falla "anon pudo registrar un dispositivo"

pedir PATCH "/rest/v1/controles?dispositivo=eq.$DISPOSITIVO" '{"actualizado_en":"2000-01-01T00:00:00Z"}'
echo "     PATCH controles.actualizado_en -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "solo se puede cambiar entradas" || falla "anon pudo cambiar actualizado_en"

pedir POST "/rest/v1/rpc/limpiar_lecturas" '{"dias":0}'
echo "     RPC limpiar_lecturas -> $CODIGO"
[[ "$CODIGO" =~ ^4 ]] && ok "limpieza no expuesta a anon" || falla "anon puede llamar limpiar_lecturas"

echo "6. Realtime (publicación supabase_realtime)"
if [[ -n "${DB_URL:-}" ]]; then
  CONTENEDOR="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -n1)"
  TABLAS="$(docker exec "$CONTENEDOR" psql -U postgres -d postgres -Atc \
    "select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'" 2>/dev/null)"
  echo "     tablas publicadas: $TABLAS"
  [[ "$TABLAS" == "controles,lecturas" ]] && ok "lecturas y controles en supabase_realtime" || falla "publicación supabase_realtime"
  CRON="$(docker exec "$CONTENEDOR" psql -U postgres -d postgres -Atc \
    "select schedule || ' ' || command from cron.job where jobname='limpiar-lecturas'" 2>/dev/null)"
  [[ -n "$CRON" ]] && ok "pg_cron: $CRON" || echo "  AVISO pg_cron sin tarea programada (correr limpiar_lecturas a mano)"
else
  echo "  AVISO sin DB_URL (URL/LLAVE dadas a mano): se omite la verificación de Realtime"
fi

# Dejar controles como estaban.
pedir PATCH "/rest/v1/controles?dispositivo=eq.$DISPOSITIVO" "{\"entradas\":$ORIGINAL}"
[[ "$CODIGO" == 204 ]] && echo "  (controles restaurados a $ORIGINAL)" || falla "no se pudo restaurar controles"

echo
if (( FALLAS > 0 )); then echo "RESULTADO: $FALLAS falla(s)"; exit 1; fi
echo "RESULTADO: todo OK"
