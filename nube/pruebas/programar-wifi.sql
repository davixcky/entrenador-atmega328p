-- Ejecutar en una base de prueba con las migraciones aplicadas (psql -v ON_ERROR_STOP=1).
-- Todo se revierte al terminar; comprueba los permisos reales de anon.
begin;
insert into public.dispositivos(id) values ('prueba-wifi');
set local role anon;
update public.controles set lcd1=repeat('A',160), lcd2='Corto' where dispositivo='prueba-wifi';
do $$ begin
  begin
    update public.controles set lcd1=repeat('A',161) where dispositivo='prueba-wifi';
    raise exception 'Acepto mas de 160 caracteres';
  exception when check_violation then null; end;
  begin
    update public.controles set lcd2=E'linea\nnueva' where dispositivo='prueba-wifi';
    raise exception 'Acepto caracteres de control';
  exception when check_violation then null; end;
  begin
    perform public.enviar_programa('prueba-wifi', '0Z');
    raise exception 'Acepto bytecode invalido';
  exception when check_violation then null; end;
  begin
    perform public.enviar_programa('prueba-wifi', repeat('FF',769));
    raise exception 'Acepto mas de 768 bytes';
  exception when check_violation then null; end;
end $$;
select public.enviar_programa('prueba-wifi', '00FF01');
do $$ begin
  begin
    perform public.enviar_programa('prueba-wifi','00');
    raise exception 'Acepto dos cargas activas';
  exception when unique_violation then null; end;
  if (select count(*) from public.reclamar_programa('prueba-wifi')) <> 1 then
    raise exception 'No reclamo la carga'; end if;
  if (select count(*) from public.reclamar_programa('prueba-wifi')) <> 0 then
    raise exception 'Reclamo la carga mas de una vez'; end if;
end $$;
update public.programas set estado='ejecutado',detalle='OK' where dispositivo='prueba-wifi';
do $$ begin
  if (select estado from public.programas where dispositivo='prueba-wifi') <> 'ejecutado' then
    raise exception 'No confirmo el programa'; end if;
  if (select count(*) from public.reclamar_programa('prueba-wifi')) <> 0 then
    raise exception 'Volvio a ejecutar una carga finalizada'; end if;
end $$;
reset role;
insert into public.programas(dispositivo,codigo,creado_en) values ('prueba-wifi','00',now()-interval '61 seconds');
set local role anon;
do $$ begin
  if (select count(*) from public.reclamar_programa('prueba-wifi')) <> 0 then
    raise exception 'Ejecuto una carga expirada'; end if;
  if not exists(select 1 from public.programas where dispositivo='prueba-wifi' and estado='error') then
    raise exception 'No marco la expiracion'; end if;
end $$;
reset role;
insert into public.programas(dispositivo,codigo,estado,actualizado_en)
  values ('prueba-wifi','00','enviando',now()-interval '91 seconds');
set local role anon;
do $$ begin
  if (select count(*) from public.reclamar_programa('prueba-wifi')) <> 0 then
    raise exception 'Repitio la carga tras un reinicio'; end if;
end $$;
select public.enviar_programa('prueba-wifi',repeat('FF',768));
do $$ begin
  if (select length(codigo) from public.reclamar_programa('prueba-wifi')) <> 1536 then
    raise exception 'Trunco una carga completa'; end if;
end $$;
rollback;
