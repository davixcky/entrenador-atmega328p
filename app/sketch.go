package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Copia de firmware/libraries/Entrenador; compilar-firmware.sh la actualiza.
//
//go:embed all:firmware/Entrenador
var bibliotecaEntrenador embed.FS

// GuardarSketch pide donde guardar el sketch generado y lo escribe. El IDE de Arduino
// exige que el .ino este en una carpeta con su mismo nombre: si no lo esta, la crea.
// Devuelve la ruta del .ino, o "" si se cancelo.
func (a *App) GuardarSketch(nombre, contenido string) (string, error) {
	ruta, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Guardar sketch de Arduino",
		DefaultFilename: nombre + ".ino",
		Filters:         []runtime.FileFilter{{DisplayName: "Sketch de Arduino (*.ino)", Pattern: "*.ino"}},
	})
	if err != nil || ruta == "" {
		return "", err
	}
	if !strings.HasSuffix(ruta, ".ino") {
		ruta += ".ino"
	}
	base := strings.TrimSuffix(filepath.Base(ruta), ".ino")
	if filepath.Base(filepath.Dir(ruta)) != base {
		ruta = filepath.Join(filepath.Dir(ruta), base, base+".ino")
	}
	if err := os.MkdirAll(filepath.Dir(ruta), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(ruta, []byte(contenido), 0o644); err != nil {
		return "", err
	}
	a.registrar("Sketch guardado en " + ruta)
	return ruta, nil
}

// InstalarBiblioteca copia la biblioteca Entrenador en ~/Arduino/libraries, donde la
// buscan el IDE de Arduino y arduino-cli. Reemplaza una version anterior.
func (a *App) InstalarBiblioteca() (string, error) {
	inicio, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	destino := filepath.Join(inicio, "Arduino", "libraries", "Entrenador")
	if err := os.RemoveAll(destino); err != nil {
		return "", err
	}
	origen, err := fs.Sub(bibliotecaEntrenador, "firmware/Entrenador")
	if err != nil {
		return "", err
	}
	if err := os.CopyFS(destino, origen); err != nil {
		return "", fmt.Errorf("no se pudo copiar la biblioteca: %w", err)
	}
	a.registrar("Biblioteca Entrenador instalada en " + destino)
	return destino, nil
}
