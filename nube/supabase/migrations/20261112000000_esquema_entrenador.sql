-- Esquema de la nube del circuito integrador (entrenador ATmega328P + ESP32).
-- Ver INTEGRADOR.md (sección "Nube") y nube/README.md.
--
-- Tres tablas:
--   dispositivos : un registro por ESP32/entrenador.
--   lecturas     : historial que sube el ESP32 (salidas s1..s4 y entradas e1..e4).
--   controles    : las entradas e1..e4 que fija el tablero y que el ESP32 consulta.
--
-- Los valores son enteros de 16 bits con signo (-32768..32767), igual que la
-- máquina virtual del entrenador; el tipo smallint ya impone ese rango. El rango
-- de VALOR1 (0..100) lo valida la app, porque las entradas son genéricas.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.dispositivos (
  id        text primary key,
  nombre    text not null default '',
  creado_en timestamptz not null default now()
);
comment on table public.dispositivos is 'Entrenadores (ATmega328P + ESP32) registrados.';

create table public.lecturas (
  id          bigint generated always as identity primary key,
  dispositivo text not null references public.dispositivos (id) on delete cascade,
  salidas     smallint[] not null
    check (cardinality(salidas) = 4 and array_ndims(salidas) = 1
           and array_position(salidas, null) is null),
  entradas    smallint[] not null
    check (cardinality(entradas) = 4 and array_ndims(entradas) = 1
           and array_position(entradas, null) is null),
  creado_en   timestamptz not null default now()
);
comment on table public.lecturas is 'Lecturas que sube el ESP32 en cada ciclo: salidas s1..s4 y entradas e1..e4 aplicadas.';

create index lecturas_dispositivo_creado_en_idx
  on public.lecturas (dispositivo, creado_en desc);

create table public.controles (
  dispositivo    text primary key references public.dispositivos (id) on delete cascade,
  entradas       smallint[] not null default '{0,0,0,0}'
    check (cardinality(entradas) = 4 and array_ndims(entradas) = 1
           and array_position(entradas, null) is null),
  actualizado_en timestamptz not null default now()
);
comment on table public.controles is 'Entradas e1..e4 que fija el tablero; el ESP32 las lee y las manda al entrenador (e1 = VALOR1).';

-- ---------------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------------

-- Marca de tiempo de la última modificación de controles.
create function public.controles_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger controles_actualizado_en
  before update on public.controles
  for each row execute function public.controles_actualizado_en();

-- Cada dispositivo nuevo recibe su fila de controles en {0,0,0,0}, así el GET
-- del ESP32 nunca vuelve vacío.
create function public.dispositivos_crear_controles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.controles (dispositivo) values (new.id)
  on conflict (dispositivo) do nothing;
  return new;
end;
$$;

create trigger dispositivos_crear_controles
  after insert on public.dispositivos
  for each row execute function public.dispositivos_crear_controles();

-- Las funciones de disparador no deben poder llamarse por RPC.
revoke execute on function public.controles_actualizado_en() from public, anon, authenticated;
revoke execute on function public.dispositivos_crear_controles() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permisos (GRANT) explícitos: no dependemos de los permisos por defecto del
-- proyecto. RLS filtra después las filas.
-- ---------------------------------------------------------------------------

revoke all on public.dispositivos, public.lecturas, public.controles from anon, authenticated;

grant select on public.dispositivos, public.lecturas, public.controles to anon, authenticated;
-- El ESP32 solo manda estas tres columnas; id y creado_en los pone la base.
grant insert (dispositivo, salidas, entradas) on public.lecturas to anon, authenticated;
-- El tablero solo puede cambiar las entradas (actualizado_en lo pone el disparador).
grant update (entradas) on public.controles to anon, authenticated;

grant all on public.dispositivos, public.lecturas, public.controles to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security (políticas de demostración para clase; ver README)
-- ---------------------------------------------------------------------------

alter table public.dispositivos enable row level security;
alter table public.lecturas     enable row level security;
alter table public.controles    enable row level security;

create policy "leer dispositivos" on public.dispositivos
  for select to anon, authenticated using (true);

create policy "leer lecturas" on public.lecturas
  for select to anon, authenticated using (true);

create policy "leer controles" on public.controles
  for select to anon, authenticated using (true);

-- Solo se aceptan lecturas de dispositivos registrados.
create policy "insertar lecturas de dispositivos registrados" on public.lecturas
  for insert to anon, authenticated
  with check (exists (select 1 from public.dispositivos d where d.id = dispositivo));

create policy "cambiar entradas de controles" on public.controles
  for update to anon, authenticated
  using (true) with check (true);

-- No hay políticas de DELETE ni de INSERT en dispositivos/controles: anon y
-- authenticated no pueden borrar nada ni registrar dispositivos.

-- ---------------------------------------------------------------------------
-- Realtime: el tablero escucha lecturas nuevas y cambios de controles.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.lecturas, public.controles;

-- ---------------------------------------------------------------------------
-- Retención: borrar lecturas viejas (a 1 lectura/s son ~86 400 filas por día).
-- ---------------------------------------------------------------------------

create function public.limpiar_lecturas(dias int default 7)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  borradas bigint;
begin
  if dias is null or dias < 0 then
    raise exception 'dias debe ser >= 0';
  end if;
  delete from public.lecturas
  where creado_en < now() - make_interval(days => dias);
  get diagnostics borradas = row_count;
  return borradas;
end;
$$;
comment on function public.limpiar_lecturas(int) is 'Borra lecturas con más de "dias" días; devuelve cuántas borró.';

-- No exponer la limpieza por la API (sería un DELETE para anon vía RPC).
revoke execute on function public.limpiar_lecturas(int) from public, anon, authenticated;
grant execute on function public.limpiar_lecturas(int) to service_role;

-- Si pg_cron está disponible (lo está en Supabase local y alojado), programar la
-- limpieza diaria a las 03:00 UTC conservando 7 días. Si no, se corre a mano:
--   select public.limpiar_lecturas(7);
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'limpiar-lecturas',
      '0 3 * * *',
      'select public.limpiar_lecturas(7)'
    );
  else
    raise notice 'pg_cron no está disponible: ejecutar public.limpiar_lecturas(7) a mano.';
  end if;
end;
$$;
