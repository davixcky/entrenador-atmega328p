-- Base de prueba con todas las migraciones; sin cambios persistentes.
begin;
insert into public.dispositivos(id) values ('prueba-scroll');
set local role anon;
do $$ begin
  if not exists(select 1 from public.controles where dispositivo='prueba-scroll'
    and lcd1_scroll and lcd2_scroll and lcd1_ms=400 and lcd2_ms=400) then
    raise exception 'Los valores iniciales cambiaron el desplazamiento anterior'; end if;
end $$;
update public.controles set lcd1='Mensaje largo con opciones', lcd1_scroll=false, lcd1_ms=800,
  lcd2_scroll=true,lcd2_ms=200 where dispositivo='prueba-scroll';
do $$ begin
  if not exists(select 1 from public.controles where dispositivo='prueba-scroll'
    and not lcd1_scroll and lcd1_ms=800 and lcd2_scroll and lcd2_ms=200) then
    raise exception 'Las opciones por fila no se guardaron'; end if;
  begin
    update public.controles set lcd1_ms=0 where dispositivo='prueba-scroll';
    raise exception 'Acepto velocidad cero';
  exception when check_violation then null; end;
  begin
    update public.controles set lcd2_ms=123 where dispositivo='prueba-scroll';
    raise exception 'Acepto una velocidad no soportada';
  exception when check_violation then null; end;
end $$;
rollback;
