package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.bug.st/serial/enumerator"
)

// Cada cuanto se pide telemetria al entrenador mientras hay conexion.
const periodoTelemetria = 150 * time.Millisecond

// Fallos seguidos de telemetria antes de avisar que el entrenador no responde.
const fallosPermitidos = 5

var errDesconectado = errors.New("no hay conexion con el entrenador")

// App expone al frontend (wailsjs/go/main/App) la conexion serie y la grabacion.
type App struct {
	ctx context.Context

	mu         sync.Mutex
	con        *conexion
	entrenador bool // el entrenador respondio al saludo
	detener    chan struct{}
}

type Puerto struct {
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
	EsArduino   bool   `json:"esArduino"`
}

type EstadoConexion struct {
	Conectado  bool   `json:"conectado"`
	Puerto     string `json:"puerto"`
	Entrenador bool   `json:"entrenador"`
	Mensaje    string `json:"mensaje"`
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	a.Desconectar()
}

func (a *App) registrar(linea string) {
	runtime.EventsEmit(a.ctx, "registro", linea)
}

func (a *App) ListarPuertos() ([]Puerto, error) {
	detalles, err := enumerator.GetDetailedPortsList()
	if err != nil {
		return nil, err
	}
	puertos := []Puerto{}
	for _, d := range detalles {
		if !d.IsUSB && !strings.Contains(d.Name, "ACM") && !strings.Contains(d.Name, "USB") {
			continue
		}
		desc := d.Product
		if desc == "" && d.IsUSB {
			desc = fmt.Sprintf("USB %s:%s", d.VID, d.PID)
		}
		puertos = append(puertos, Puerto{
			Nombre:      d.Name,
			Descripcion: desc,
			EsArduino:   strings.EqualFold(d.VID, "2341") || strings.EqualFold(d.VID, "2a03"),
		})
	}
	return puertos, nil
}

// Conectar abre el puerto del Uno, activa el modo puente y saluda al entrenador.
// Si el entrenador no responde, la conexion queda abierta para poder grabarle firmware.
func (a *App) Conectar(nombre string) (EstadoConexion, error) {
	a.Desconectar()

	a.registrar("Abriendo " + nombre + "...")
	con, err := abrirConexion(nombre, a.registrar)
	if err != nil {
		return EstadoConexion{}, err
	}
	if err := con.activarPuente(); err != nil {
		con.cerrar()
		return EstadoConexion{}, err
	}
	a.registrar("Puente activo")

	entrenador := false
	for intento := 0; intento < 3 && !entrenador; intento++ {
		entrenador = con.saludar() == nil
	}

	a.mu.Lock()
	a.con = con
	a.entrenador = entrenador
	a.detener = make(chan struct{})
	go a.sondear(con, a.detener)
	a.mu.Unlock()

	estado := a.Estado()
	if entrenador {
		a.registrar("Entrenador conectado")
	} else {
		estado.Mensaje = "El puente funciona pero el entrenador no responde. Revisa D2/D3 y GND, o graba el firmware \"bloques\"."
		a.registrar(estado.Mensaje)
	}
	return estado, nil
}

func (a *App) Desconectar() {
	a.mu.Lock()
	con, detener := a.con, a.detener
	a.con, a.detener, a.entrenador = nil, nil, false
	a.mu.Unlock()

	if detener != nil {
		close(detener)
	}
	if con != nil {
		con.cerrar()
		a.registrar("Desconectado")
		runtime.EventsEmit(a.ctx, "conexion", EstadoConexion{})
	}
}

func (a *App) Estado() EstadoConexion {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.con == nil {
		return EstadoConexion{}
	}
	return EstadoConexion{Conectado: true, Puerto: a.con.nombre, Entrenador: a.entrenador}
}

func (a *App) sondear(con *conexion, detener chan struct{}) {
	ticker := time.NewTicker(periodoTelemetria)
	defer ticker.Stop()
	fallos := 0
	for {
		select {
		case <-detener:
			return
		case <-ticker.C:
		}
		t, err := con.telemetria()
		if err != nil {
			fallos++
			if fallos == fallosPermitidos {
				a.cambiarEntrenador(con, false)
				a.registrar("El entrenador dejo de responder: " + err.Error())
			}
			continue
		}
		if fallos >= fallosPermitidos || !a.Estado().Entrenador {
			a.cambiarEntrenador(con, true)
			a.registrar("Entrenador conectado")
		}
		fallos = 0
		runtime.EventsEmit(a.ctx, "telemetria", t)
	}
}

func (a *App) cambiarEntrenador(con *conexion, responde bool) {
	a.mu.Lock()
	if a.con != con {
		a.mu.Unlock()
		return
	}
	a.entrenador = responde
	a.mu.Unlock()
	runtime.EventsEmit(a.ctx, "conexion", a.Estado())
}

func (a *App) conexionActual() (*conexion, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.con == nil {
		return nil, errDesconectado
	}
	return a.con, nil
}

func (a *App) PonerLeds(valor int) error {
	con, err := a.conexionActual()
	if err != nil {
		return err
	}
	return con.comando(fmt.Sprintf("L %d", valor&0xFF))
}

func (a *App) PonerNumero(valor int) error {
	con, err := a.conexionActual()
	if err != nil {
		return err
	}
	return con.comando(fmt.Sprintf("N %d", valor))
}

func (a *App) ApagarDisplays() error {
	con, err := a.conexionActual()
	if err != nil {
		return err
	}
	return con.comando("N -")
}

// CargarPrograma envia el bytecode, opcionalmente lo guarda en la EEPROM y lo ejecuta.
func (a *App) CargarPrograma(programa []int, guardar bool) error {
	con, err := a.conexionActual()
	if err != nil {
		return err
	}
	bytes := make([]byte, len(programa))
	for i, b := range programa {
		if b < 0 || b > 255 {
			return fmt.Errorf("byte %d fuera de rango: %d", i, b)
		}
		bytes[i] = byte(b)
	}
	if err := con.cargarPrograma(bytes); err != nil {
		return err
	}
	a.registrar(fmt.Sprintf("Programa cargado (%d bytes)", len(bytes)))
	if guardar {
		// La EEPROM tarda ~3.3 ms por byte
		if _, err := con.transaccion("W", 5*time.Second); err != nil {
			return err
		}
		a.registrar("Programa guardado: corre al encender el entrenador")
	}
	return con.comando("R")
}

func (a *App) DetenerPrograma() error {
	con, err := a.conexionActual()
	if err != nil {
		return err
	}
	return con.comando("S")
}

func (a *App) BorrarGuardado() error {
	con, err := a.conexionActual()
	if err != nil {
		return err
	}
	if err := con.comando("X"); err != nil {
		return err
	}
	a.registrar("Programa guardado borrado")
	return nil
}

func (a *App) RutaAvrdude() (string, error) {
	ad, err := buscarAvrdude()
	return ad.bin, err
}

// GrabarEntrenador cierra la conexion y graba el firmware bloques por ISP.
func (a *App) GrabarEntrenador(puerto string) (string, error) {
	return a.grabar(puerto, "firmware bloques en el entrenador", avrdude.grabarEntrenador)
}

// GrabarPuente cierra la conexion y graba puente-uno en el Uno.
func (a *App) GrabarPuente(puerto string) (string, error) {
	return a.grabar(puerto, "puente en el Uno", avrdude.grabarPuente)
}

func (a *App) grabar(puerto, que string, f func(avrdude, string) (string, error)) (string, error) {
	ad, err := buscarAvrdude()
	if err != nil {
		return "", err
	}
	a.Desconectar()
	a.registrar("Grabando " + que + "...")
	salida, err := f(ad, puerto)
	if err != nil {
		a.registrar("Fallo la grabacion: " + err.Error())
		return salida, fmt.Errorf("avrdude fallo: %w", err)
	}
	a.registrar("Grabacion terminada")
	return salida, nil
}
