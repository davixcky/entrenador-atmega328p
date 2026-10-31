package main

import "testing"

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
