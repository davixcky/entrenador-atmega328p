-- Ampliacion compatible: conserva textos, permisos y el protocolo M de 16 columnas.
-- Desplegar primero el firmware ESP32 que desplaza el texto, despues esta migracion
-- y por ultimo la app. El firmware del ATmega no necesita cambiar.
begin;
alter table public.controles
  drop constraint if exists controles_lcd1_check,
  drop constraint if exists controles_lcd2_check;
alter table public.controles
  add constraint controles_lcd1_check check (char_length(lcd1) <= 160 and lcd1 ~ '^[ -~]*$'),
  add constraint controles_lcd2_check check (char_length(lcd2) <= 160 and lcd2 ~ '^[ -~]*$');
comment on column public.controles.lcd1 is 'Mensaje LCD fila 0: hasta 160 caracteres ASCII; el ESP32 desplaza los textos de mas de 16.';
comment on column public.controles.lcd2 is 'Mensaje LCD fila 1: hasta 160 caracteres ASCII; el ESP32 desplaza los textos de mas de 16.';
commit;
