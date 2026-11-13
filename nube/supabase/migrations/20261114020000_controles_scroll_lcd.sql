-- Los valores por defecto conservan el desplazamiento de la version anterior.
alter table public.controles
  add column lcd1_scroll boolean not null default true,
  add column lcd2_scroll boolean not null default true,
  add column lcd1_ms integer not null default 400 check (lcd1_ms in (200, 400, 800)),
  add column lcd2_ms integer not null default 400 check (lcd2_ms in (200, 400, 800));
grant update (lcd1_scroll, lcd2_scroll, lcd1_ms, lcd2_ms) on public.controles to anon, authenticated;
