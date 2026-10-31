// Ejecuta en el PC un sketch generado por la app con la biblioteca simulada
// (entrenador-pc/Entrenador.h). Se compila con -DSKETCH='"ruta/al/sketch.ino"'.
//
//   sketch_prueba <ms a simular> [pot 0..1023]

#include <Entrenador.h>  // la simulada: se compila con -I entrenador-pc
#include SKETCH

int main(int argc, char **argv) {
  if (argc > 1) simulado::duracion = strtoul(argv[1], NULL, 10);
  if (argc > 2) simulado::pot = (int16_t)atoi(argv[2]);
  setup();
  simulado::observar();
  simulado::terminar("detenido");
}
