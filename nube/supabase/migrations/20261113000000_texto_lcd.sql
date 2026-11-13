-- Texto del LCD desde la nube: dos filas de hasta 16 caracteres que el tablero (o
-- Supabase Studio) escribe en controles. El ESP32 las manda al entrenador con
-- "M <fila> <texto>" y el programa las muestra con lcd_nube(fila).
--
-- Solo ASCII imprimible (espacio a ~): el LCD no tiene tildes ni eñe.

alter table public.controles
  add column lcd1 text not null default ''
    check (char_length(lcd1) <= 16 and lcd1 ~ '^[ -~]*$'),
  add column lcd2 text not null default ''
    check (char_length(lcd2) <= 16 and lcd2 ~ '^[ -~]*$');

comment on column public.controles.lcd1 is 'Fila 0 del LCD (lcd_nube(0)), hasta 16 caracteres ASCII.';
comment on column public.controles.lcd2 is 'Fila 1 del LCD (lcd_nube(1)), hasta 16 caracteres ASCII.';

-- El tablero ya podía cambiar entradas; ahora también el texto
grant update (lcd1, lcd2) on public.controles to anon, authenticated;
