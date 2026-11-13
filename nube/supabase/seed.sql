-- Datos iniciales: el entrenador de la actividad. El disparador
-- dispositivos_crear_controles le crea su fila de controles en {0,0,0,0}.
insert into public.dispositivos (id, nombre)
values ('entrenador-1', 'Entrenador ATmega328P + ESP32')
on conflict (id) do nothing;
