package main

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
)

// Generados por compilar-firmware.sh desde firmware/bloques y firmware/puente-uno.
var (
	//go:embed firmware/bloques.hex
	hexBloques []byte
	//go:embed firmware/puente-uno.hex
	hexPuente []byte
)

type avrdude struct {
	bin  string
	conf string // vacio = el avrdude.conf por defecto
}

// buscarAvrdude prefiere el avrdude del nucleo arduino:avr (arduino-cli / IDE) y si
// no existe usa el del PATH.
func buscarAvrdude() (avrdude, error) {
	if inicio, err := os.UserHomeDir(); err == nil {
		patron := filepath.Join(inicio, ".arduino15/packages/arduino/tools/avrdude/*/bin/avrdude")
		if encontrados, _ := filepath.Glob(patron); len(encontrados) > 0 {
			sort.Strings(encontrados)
			bin := encontrados[len(encontrados)-1]
			return avrdude{bin: bin, conf: filepath.Join(filepath.Dir(bin), "../etc/avrdude.conf")}, nil
		}
	}
	if bin, err := exec.LookPath("avrdude"); err == nil {
		return avrdude{bin: bin}, nil
	}
	return avrdude{}, fmt.Errorf("no se encontro avrdude: instala el nucleo con `arduino-cli core install arduino:avr`")
}

// ejecutar corre avrdude; en args, "%s" se reemplaza por el archivo .hex temporal.
func (a avrdude) ejecutar(hex []byte, args ...string) (string, error) {
	archivo, err := os.CreateTemp("", "entrenador-*.hex")
	if err != nil {
		return "", err
	}
	defer os.Remove(archivo.Name())
	if _, err := archivo.Write(hex); err != nil {
		archivo.Close()
		return "", err
	}
	archivo.Close()

	todos := []string{}
	if a.conf != "" {
		todos = append(todos, "-C", a.conf)
	}
	for _, arg := range args {
		if arg == "%s" {
			arg = "flash:w:" + archivo.Name() + ":i"
		}
		todos = append(todos, arg)
	}
	salida, err := exec.Command(a.bin, todos...).CombinedOutput()
	return string(salida), err
}

// grabarEntrenador programa el ATmega328P del entrenador por ISP (Uno con puente-uno
// o ArduinoISP): fusibles de 16 MHz, Optiboot + firmware bloques y bloqueo del bootloader.
func (a avrdude) grabarEntrenador(puerto string) (string, error) {
	return a.ejecutar(hexBloques,
		"-c", "stk500v1", "-P", puerto, "-b", "19200", "-p", "m328p", "-e",
		"-U", "lfuse:w:0xFF:m", "-U", "hfuse:w:0xDE:m", "-U", "efuse:w:0xFD:m",
		"-U", "%s", "-U", "lock:w:0x0F:m")
}

// grabarPuente instala puente-uno en el Uno a traves de su propio bootloader.
func (a avrdude) grabarPuente(puerto string) (string, error) {
	return a.ejecutar(hexPuente, "-c", "arduino", "-P", puerto, "-b", "115200", "-p", "m328p", "-D", "-U", "%s")
}
