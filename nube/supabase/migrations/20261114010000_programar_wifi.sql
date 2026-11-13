-- Una carga por dispositivo a la vez, reclamada antes de tocar el entrenador.
-- Un reinicio o una respuesta perdida nunca vuelve a ejecutar la misma carga.
begin;
create table public.programas (
  id uuid primary key default gen_random_uuid(),
  dispositivo text not null references public.dispositivos(id) on delete cascade,
  codigo text not null check (length(codigo) between 2 and 1536 and codigo ~ '^([0-9A-F]{2})+$'),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'ejecutado', 'error')),
  detalle text not null default '' check (length(detalle) <= 160),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index programas_uno_activo on public.programas(dispositivo)
  where estado in ('pendiente', 'enviando');
create trigger programas_actualizado_en before update on public.programas
  for each row execute function public.controles_actualizado_en();
alter table public.programas enable row level security;
grant select on public.programas to anon, authenticated;
grant update (estado, detalle) on public.programas to anon, authenticated;
grant all on public.programas to service_role;
create policy "leer cargas" on public.programas for select to anon, authenticated using (true);
create policy "confirmar cargas" on public.programas for update to anon, authenticated
  using (estado = 'enviando') with check (estado in ('ejecutado', 'error'));

create function public.enviar_programa(p_dispositivo text, p_codigo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare nueva uuid;
begin
  update public.programas set estado = 'error', detalle = 'La carga anterior expiro; no se reintentara automaticamente.'
  where dispositivo = p_dispositivo and
    ((estado = 'pendiente' and creado_en < now() - interval '60 seconds') or
     (estado = 'enviando' and actualizado_en < now() - interval '90 seconds'));
  insert into public.programas(dispositivo, codigo) values (p_dispositivo, p_codigo) returning id into nueva;
  return nueva;
end;
$$;

create function public.reclamar_programa(p_dispositivo text)
returns table (id uuid, codigo text) language plpgsql security definer set search_path = '' as $$
begin
  update public.programas p set estado = 'error', detalle = 'La carga expiro; no se reintentara automaticamente.'
  where p.dispositivo = p_dispositivo and
    ((p.estado = 'pendiente' and p.creado_en < now() - interval '60 seconds') or
     (p.estado = 'enviando' and p.actualizado_en < now() - interval '90 seconds'));
  return query update public.programas p set estado = 'enviando'
  where p.id = (select q.id from public.programas q
    where q.dispositivo = p_dispositivo and q.estado = 'pendiente'
    order by q.creado_en for update skip locked limit 1)
  returning p.id, p.codigo;
end;
$$;
revoke all on function public.enviar_programa(text, text), public.reclamar_programa(text) from public;
grant execute on function public.enviar_programa(text, text), public.reclamar_programa(text) to anon, authenticated, service_role;
commit;
