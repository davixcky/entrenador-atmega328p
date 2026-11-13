package main

import (
	"encoding/hex"
	"strings"
	"testing"
)

func TestParsearTelemetria(t *testing.T) {
	tel, err := parsearTelemetria("T 700 5 45 42 1 0")
	if err != nil {
		t.Fatal(err)
	}
	if tel.Pot != 700 || tel.Dip != 5 || tel.Leds != 45 || !tel.Corriendo || tel.Error != 0 {
		t.Fatalf("valores incorrectos: %+v", tel)
	}
	if tel.Numero == nil || *tel.Numero != 42 {
		t.Fatalf("numero = %v, quiero 42", tel.Numero)
	}

	tel, err = parsearTelemetria("T 0 0 0 - 0 2")
	if err != nil {
		t.Fatal(err)
	}
	if tel.Numero != nil || tel.Corriendo || tel.Error != 2 {
		t.Fatalf("displays apagados mal interpretados: %+v", tel)
	}

	// Un numero fuera de 0..99 (el firmware muestra "--") se informa tal cual
	tel, err = parsearTelemetria("T 0 0 0 -5 1 0")
	if err != nil || tel.Numero == nil || *tel.Numero != -5 {
		t.Fatalf("numero negativo: %+v, %v", tel, err)
	}

	for _, malo := range []string{"", "T 1 2 3", "OK", "T a 0 0 0 0 0"} {
		if _, err := parsearTelemetria(malo); err == nil {
			t.Errorf("%q deberia fallar", malo)
		}
	}
}

func TestParsearPantalla(t *testing.T) {
	texto := "ADC:       700  VALOR1:     37  "
	p, err := parsearPantalla("OK 1 37 " + strings.ToUpper(hex.EncodeToString([]byte(texto))))
	if err != nil {
		t.Fatal(err)
	}
	if p.Lcd != 1 || p.Brillo != 37 || p.Lineas[0] != "ADC:       700  " || p.Lineas[1] != "VALOR1:     37  " {
		t.Fatalf("pantalla %+v", p)
	}
	if p.Luz != 1 || p.Cursor != 0 {
		t.Fatalf("sin luz/cursor: %+v", p)
	}
	p, err = parsearPantalla("OK 1 37 " + strings.Repeat("41", 32) + " 0 2")
	if err != nil || p.Luz != 0 || p.Cursor != 2 {
		t.Fatalf("con luz y cursor: %+v %v", p, err)
	}
	for _, malo := range []string{"OK 1 37 4142", "OK 1 37 " + strings.Repeat("41", 32) + " 0", "ERR comando", "OK x 37 " + strings.Repeat("41", 32)} {
		if _, err := parsearPantalla(malo); err == nil {
			t.Errorf("%q deberia fallar", malo)
		}
	}
}
