-- Estado real del entrenador, independiente de nube_enviar() en el programa.
-- Nullable: las lecturas historicas y los ESP32 anteriores siguen siendo validos.
alter table public.lecturas
  add column telemetria text check (length(telemetria) <= 96 and telemetria like 'T %'),
  add column pantalla text check (length(pantalla) <= 128 and pantalla like 'OK %');
grant insert (telemetria, pantalla) on public.lecturas to anon, authenticated;
comment on column public.lecturas.telemetria is 'Respuesta T: pot, DIP, LEDs, displays, ejecucion y error.';
comment on column public.lecturas.pantalla is 'Respuesta P: LCD, brillo, texto visible, luz y cursor.';
