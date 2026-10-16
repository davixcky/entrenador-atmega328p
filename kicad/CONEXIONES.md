# Lista de conexiones del entrenador ATMega328P

Generada automaticamente desde el netlist de KiCad (`tools/lista_conexiones.py`).
Cada tabla es un **nodo**: todos los pines de la tabla van unidos entre si.
En la protoboard, marcar cada conexion a medida que se hace.

## +5V

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C3 | 0.1uF | 1 |  |
| [ ] | C4 | 100uF/16V | 1 | + (positivo) |
| [ ] | C5 | 0.1uF | 1 |  |
| [ ] | C6 | 0.1uF | 1 |  |
| [ ] | J2 | FTDI | 3 | VCC |
| [ ] | J3 | ICSP | 2 | VCC |
| [ ] | R1 | 1k | 1 |  |
| [ ] | R2 | 10k | 1 |  |
| [ ] | RV1 | 10k | 1 | 1 |
| [ ] | U1 | ATmega328P-PU | 7 | VCC |
| [ ] | U1 | ATmega328P-PU | 20 | AVCC |
| [ ] | U2 | LM7805 | 3 | OUT |

## GND

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C1 | 100uF/25V | 2 | - (negativo) |
| [ ] | C2 | 0.33uF | 2 |  |
| [ ] | C3 | 0.1uF | 2 |  |
| [ ] | C4 | 100uF/16V | 2 | - (negativo) |
| [ ] | C5 | 0.1uF | 2 |  |
| [ ] | C6 | 0.1uF | 2 |  |
| [ ] | C7 | 0.1uF | 2 |  |
| [ ] | C8 | 22pF | 2 |  |
| [ ] | C9 | 22pF | 2 |  |
| [ ] | D2 | LED ON | 1 | K |
| [ ] | J1 | 9-12 V DC | 2 |  |
| [ ] | J2 | FTDI | 1 | GND |
| [ ] | J2 | FTDI | 2 | CTS |
| [ ] | J3 | ICSP | 6 | GND |
| [ ] | Q1 | 2N2222 | 1 | E |
| [ ] | Q2 | 2N2222 | 1 | E |
| [ ] | Q3 | 2N2222 | 1 | E |
| [ ] | RV1 | 10k | 3 | 3 |
| [ ] | SW1 | Pulsador | 1 | 1 |
| [ ] | SW2 | DIP x4 | 5 |  |
| [ ] | SW2 | DIP x4 | 6 |  |
| [ ] | SW2 | DIP x4 | 7 |  |
| [ ] | SW2 | DIP x4 | 8 |  |
| [ ] | U1 | ATmega328P-PU | 8 | GND |
| [ ] | U1 | ATmega328P-PU | 22 | GND |
| [ ] | U2 | LM7805 | 2 | GND |

## VIN_RAW

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D1 | 1N4007 | 2 | A |
| [ ] | J1 | 9-12 V DC | 1 |  |

## VIN

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C1 | 100uF/25V | 1 | + (positivo) |
| [ ] | C2 | 0.33uF | 1 |  |
| [ ] | D1 | 1N4007 | 1 | K |
| [ ] | U2 | LM7805 | 1 | IN |

## LED_PWR

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D2 | LED ON | 2 | A |
| [ ] | R1 | 1k | 2 |  |

## RESET

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C10 | 0.1uF | 2 |  |
| [ ] | J3 | ICSP | 5 | ~{RST} |
| [ ] | R2 | 10k | 2 |  |
| [ ] | SW1 | Pulsador | 2 | 2 |
| [ ] | U1 | ATmega328P-PU | 1 | /RESET/PC6 |

## XTAL1

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C8 | 22pF | 1 |  |
| [ ] | U1 | ATmega328P-PU | 9 | XTAL1/PB6 |
| [ ] | Y1 | 16MHz | 1 | 1 |

## XTAL2

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C9 | 22pF | 1 |  |
| [ ] | U1 | ATmega328P-PU | 10 | XTAL2/PB7 |
| [ ] | Y1 | 16MHz | 2 | 2 |

## AREF

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C7 | 0.1uF | 1 |  |
| [ ] | U1 | ATmega328P-PU | 21 | AREF |

## RXD

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | J2 | FTDI | 4 | RXI (va al TX del FTDI) |
| [ ] | U1 | ATmega328P-PU | 2 | PD0 |

## TXD

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | J2 | FTDI | 5 | TXO (va al RX del FTDI) |
| [ ] | U1 | ATmega328P-PU | 3 | PD1 |

## DTR

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | C10 | 0.1uF | 1 |  |
| [ ] | J2 | FTDI | 6 | DTR |

## SCK

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | J3 | ICSP | 3 | SCK |
| [ ] | U1 | ATmega328P-PU | 19 | PB5 |

## POT

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | RV1 | 10k | 2 | 2 |
| [ ] | U1 | ATmega328P-PU | 23 | PC0 |

## DIP1

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | SW2 | DIP x4 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 24 | PC1 |

## DIP2

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | SW2 | DIP x4 | 2 |  |
| [ ] | U1 | ATmega328P-PU | 25 | PC2 |

## DIP3

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | SW2 | DIP x4 | 3 |  |
| [ ] | U1 | ATmega328P-PU | 26 | PC3 |

## DIP4

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | SW2 | DIP x4 | 4 |  |
| [ ] | U1 | ATmega328P-PU | 27 | PC4 |

## BUS0

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R3 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 4 | PD2 |

## BUS1

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R4 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 5 | PD3 |

## BUS2

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R5 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 6 | PD4 |

## BUS3

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R6 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 11 | PD5 |

## BUS4

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R7 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 12 | PD6 |

## BUS5

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R8 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 13 | PD7 |

## BUS6

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R9 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 14 | PB0 |

## BUS7

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R10 | 220 | 1 |  |
| [ ] | U1 | ATmega328P-PU | 15 | PB1 |

## SEG_A

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D3 | LED0 | 2 | A |
| [ ] | R3 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 7 | A |
| [ ] | U4 | 5161AS UNIDADES | 7 | A |

## SEG_B

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D4 | LED1 | 2 | A |
| [ ] | R4 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 6 | B |
| [ ] | U4 | 5161AS UNIDADES | 6 | B |

## SEG_C

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D5 | LED2 | 2 | A |
| [ ] | R5 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 4 | C |
| [ ] | U4 | 5161AS UNIDADES | 4 | C |

## SEG_D

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D6 | LED3 | 2 | A |
| [ ] | R6 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 2 | D |
| [ ] | U4 | 5161AS UNIDADES | 2 | D |

## SEG_E

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D7 | LED4 | 2 | A |
| [ ] | R7 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 1 | E |
| [ ] | U4 | 5161AS UNIDADES | 1 | E |

## SEG_F

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D8 | LED5 | 2 | A |
| [ ] | R8 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 9 | F |
| [ ] | U4 | 5161AS UNIDADES | 9 | F |

## SEG_G

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D9 | LED6 | 2 | A |
| [ ] | R9 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 10 | G |
| [ ] | U4 | 5161AS UNIDADES | 10 | G |

## SEG_DP

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D10 | LED7 | 2 | A |
| [ ] | R10 | 220 | 2 |  |
| [ ] | U3 | 5161AS DECENAS | 5 | DP |
| [ ] | U4 | 5161AS UNIDADES | 5 | DP |

## SEL_LED

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | R11 | 1k | 1 |  |
| [ ] | U1 | ATmega328P-PU | 16 | PB2 |

## SEL_DEC

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | J3 | ICSP | 4 | MOSI |
| [ ] | R12 | 1k | 1 |  |
| [ ] | U1 | ATmega328P-PU | 17 | PB3 |

## SEL_UNI

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | J3 | ICSP | 1 | MISO |
| [ ] | R13 | 1k | 1 |  |
| [ ] | U1 | ATmega328P-PU | 18 | PB4 |

## BASE_Q1

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | Q1 | 2N2222 | 2 | B |
| [ ] | R11 | 1k | 2 |  |

## BASE_Q2

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | Q2 | 2N2222 | 2 | B |
| [ ] | R12 | 1k | 2 |  |

## BASE_Q3

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | Q3 | 2N2222 | 2 | B |
| [ ] | R13 | 1k | 2 |  |

## K_LEDS

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | D3 | LED0 | 1 | K |
| [ ] | D4 | LED1 | 1 | K |
| [ ] | D5 | LED2 | 1 | K |
| [ ] | D6 | LED3 | 1 | K |
| [ ] | D7 | LED4 | 1 | K |
| [ ] | D8 | LED5 | 1 | K |
| [ ] | D9 | LED6 | 1 | K |
| [ ] | D10 | LED7 | 1 | K |
| [ ] | Q1 | 2N2222 | 3 | C |

## K_DEC

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | Q2 | 2N2222 | 3 | C |
| [ ] | U3 | 5161AS DECENAS | 3 | CC |
| [ ] | U3 | 5161AS DECENAS | 8 | CC |

## K_UNI

| Hecho | Componente | Valor | Pin | Funcion del pin |
|:-:|---|---|---:|---|
| [ ] | Q3 | 2N2222 | 3 | C |
| [ ] | U4 | 5161AS UNIDADES | 3 | CC |
| [ ] | U4 | 5161AS UNIDADES | 8 | CC |
