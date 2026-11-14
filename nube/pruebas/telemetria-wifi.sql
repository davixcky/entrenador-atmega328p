begin;
insert into public.dispositivos(id) values ('prueba-telemetria');
set local role anon;
-- Compatibilidad con firmware anterior y nuevas lecturas, con permisos reales.
insert into public.lecturas(dispositivo,salidas,entradas)
values ('prueba-telemetria','{1,2,3,4}','{5,6,7,8}');
insert into public.lecturas(dispositivo,salidas,entradas,telemetria,pantalla)
values ('prueba-telemetria','{1,2,3,4}','{5,6,7,8}', 'T 512 3 129 42 1 0',
  'OK 1 27 ' || repeat('20',32) || ' 1 0');
do $$ begin
  if (select count(*) from public.lecturas where dispositivo='prueba-telemetria') <> 2 then
    raise exception 'Falta una lectura'; end if;
  if not exists(select 1 from public.lecturas where dispositivo='prueba-telemetria'
    and telemetria='T 512 3 129 42 1 0' and pantalla like 'OK 1 27 %') then
    raise exception 'No se guardo el estado'; end if;
  begin
    insert into public.lecturas(dispositivo,salidas,entradas,telemetria)
    values ('prueba-telemetria','{0,0,0,0}','{0,0,0,0}', 'ERR');
    raise exception 'Acepto respuesta invalida';
  exception when check_violation then null; end;
  begin
    insert into public.lecturas(dispositivo,salidas,entradas,pantalla)
    values ('prueba-telemetria','{0,0,0,0}','{0,0,0,0}', 'OK ' || repeat('x',128));
    raise exception 'Acepto respuesta demasiado larga';
  exception when check_violation then null; end;
  begin
    update public.lecturas set telemetria='T 0 0 0 - 0 0' where dispositivo='prueba-telemetria';
    raise exception 'Permite modificar historial';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
