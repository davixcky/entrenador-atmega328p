package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.bug.st/serial"
)

// Velocidad del puente del Uno y del entrenador (firmware/puente-uno, firmware/bloques).
const baudios = 19200

// Bytes por linea "D" al cargar un programa: cabe en el buffer de linea del entrenador.
const bytesPorLinea = 32

var errSinRespuesta = errors.New("sin respuesta")

// Telemetria es la respuesta al comando T del entrenador.
type Telemetria struct {
	Pot       int  `json:"pot"`
	Dip       int  `json:"dip"`
	Leds      int  `json:"leds"`
	Numero    *int `json:"numero"` // nil = displays apagados
	Corriendo bool `json:"corriendo"`
	Error     int  `json:"error"`
}

// conexion habla con el entrenador a traves del Uno en modo puente.
// El protocolo es pregunta-respuesta (SoftwareSerial del Uno no es full duplex),
// asi que todas las transacciones pasan por mu.
type conexion struct {
	puerto    serial.Port
	nombre    string
	pendiente []byte
	mu        sync.Mutex
	registrar func(string)
}

func abrirConexion(nombre string, registrar func(string)) (*conexion, error) {
	puerto, err := serial.Open(nombre, &serial.Mode{BaudRate: baudios})
	if err != nil {
		return nil, fmt.Errorf("no se pudo abrir %s: %w", nombre, err)
	}
	c := &conexion{puerto: puerto, nombre: nombre, registrar: registrar}

	// Abrir el puerto reinicia el Uno (DTR): esperar a que salga de su bootloader.
	// activarPuente repite el '!' porque el tiempo de arranque varia.
	time.Sleep(time.Second)
	if err := puerto.SetReadTimeout(50 * time.Millisecond); err != nil {
		puerto.Close()
		return nil, err
	}
	_ = puerto.ResetInputBuffer()
	return c, nil
}

func (c *conexion) cerrar() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.puerto.Close()
}

// activarPuente envia '!' para que el Uno deje el modo ISP y reenvie al entrenador.
// Lo repite cada medio segundo: un '!' que llega mientras el Uno arranca se pierde.
func (c *conexion) activarPuente() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	limite := time.Now().Add(5 * time.Second)
	for time.Now().Before(limite) {
		if _, err := c.puerto.Write([]byte("!")); err != nil {
			return err
		}
		l, err := c.leerLinea(500 * time.Millisecond)
		for err == nil && l != "PUENTE OK" {
			c.registrar("< " + l)
			l, err = c.leerLinea(500 * time.Millisecond)
		}
		if err != nil {
			continue
		}
		// Los '!' de mas pasaron al entrenador: terminar esa linea y descartar su ERR
		if _, err := c.puerto.Write([]byte("\n")); err != nil {
			return err
		}
		time.Sleep(300 * time.Millisecond)
		_ = c.puerto.ResetInputBuffer()
		c.pendiente = nil
		return nil
	}
	return fmt.Errorf("el Uno no respondio como puente (¿tiene instalado puente-uno?)")
}

// leerLinea devuelve la siguiente linea completa sin \r\n. Llamar con mu tomado.
func (c *conexion) leerLinea(espera time.Duration) (string, error) {
	limite := time.Now().Add(espera)
	buf := make([]byte, 64)
	for {
		if i := indiceSalto(c.pendiente); i >= 0 {
			l := strings.TrimRight(string(c.pendiente[:i]), "\r")
			c.pendiente = c.pendiente[i+1:]
			return l, nil
		}
		if time.Now().After(limite) {
			return "", errSinRespuesta
		}
		n, err := c.puerto.Read(buf)
		if err != nil {
			return "", err
		}
		c.pendiente = append(c.pendiente, buf[:n]...)
	}
}

func indiceSalto(b []byte) int {
	for i, x := range b {
		if x == '\n' {
			return i
		}
	}
	return -1
}

// transaccion envia un comando y espera su respuesta (OK..., T ... o ERR ...).
func (c *conexion) transaccion(cmd string, espera time.Duration) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, err := c.puerto.Write([]byte(cmd + "\n")); err != nil {
		return "", err
	}
	for {
		l, err := c.leerLinea(espera)
		if err != nil {
			return "", fmt.Errorf("%s: %w", cmd, err)
		}
		switch {
		case strings.HasPrefix(l, "ERR"):
			return "", fmt.Errorf("el entrenador respondio %q a %q", l, cmd)
		case strings.HasPrefix(l, "OK"), strings.HasPrefix(l, "T "):
			return l, nil
		case l != "":
			c.registrar("< " + l)
		}
	}
}

func (c *conexion) comando(cmd string) error {
	_, err := c.transaccion(cmd, time.Second)
	return err
}

func (c *conexion) saludar() error {
	l, err := c.transaccion("?", time.Second)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(l, "OK ENTRENADOR") {
		return fmt.Errorf("respuesta inesperada %q", l)
	}
	return nil
}

func (c *conexion) telemetria() (Telemetria, error) {
	l, err := c.transaccion("T", 500*time.Millisecond)
	if err != nil {
		return Telemetria{}, err
	}
	return parsearTelemetria(l)
}

func parsearTelemetria(l string) (Telemetria, error) {
	campos := strings.Fields(l)
	if len(campos) != 7 || campos[0] != "T" {
		return Telemetria{}, fmt.Errorf("telemetria invalida %q", l)
	}
	var v [6]int
	for i, campo := range campos[1:] {
		if i == 3 && campo == "-" {
			continue
		}
		n, err := strconv.Atoi(campo)
		if err != nil {
			return Telemetria{}, fmt.Errorf("telemetria invalida %q", l)
		}
		v[i] = n
	}
	t := Telemetria{Pot: v[0], Dip: v[1], Leds: v[2], Corriendo: v[4] == 1, Error: v[5]}
	if campos[4] != "-" {
		n := v[3]
		t.Numero = &n
	}
	return t, nil
}

func (c *conexion) cargarPrograma(programa []byte) error {
	if err := c.comando("B"); err != nil {
		return err
	}
	suma := 0
	for pos := 0; pos < len(programa); pos += bytesPorLinea {
		fin := min(pos+bytesPorLinea, len(programa))
		if err := c.comando(fmt.Sprintf("D %d %X", pos, programa[pos:fin])); err != nil {
			return err
		}
	}
	for _, b := range programa {
		suma += int(b)
	}
	return c.comando(fmt.Sprintf("E %d %d", len(programa), suma%65536))
}
