# Puentes de alambre (lado de componentes)

La PCB es de **una sola cara** (cobre abajo). Las conexiones que no caben en el cobre se hacen
con **alambre aislado** (por ejemplo cable UTP pelado en las puntas) del lado de los componentes.
Cada puente esta dibujado en la serigrafia con su nombre `JPn`.

- **Ningun agujero de puente queda debajo de una pieza**: todos se pueden soldar en cualquier momento.
- Algunos alambres pasan por debajo de piezas (columna *Pasa bajo*): **instalar todos los puentes
  antes que los componentes**, bien pegados a la placa.
- GND, la entrada (VIN) y el cristal nunca van por un puente. Los puentes de `+5V` llevan la
  corriente de los displays: hacerlos con **alambre rigido de 0.5 mm o mas** (el de UTP sirve).
- Cortar el alambre ~6 mm mas largo que la medida, doblar las puntas y soldar por el lado del cobre.
- Si un puente tiene mas de 2 agujeros, se hace con varios tramos (todos son la misma red).
- *Dobleces* > 0: el alambre no va recto, se dobla siguiendo el dibujo de la serigrafia.

Coordenadas en mm desde la esquina superior izquierda de la placa (vista desde los componentes).

Total: **15 puentes, 20 alambres**.

| Puente | Red | Alambres | Dobleces | Largo aprox. | Pasa bajo | Agujeros |
|---|---|---|---|---|---|---|
| JP1 | `+5V` | 2 | 0 | 32 mm | - | (4.0, 67.6) junto a Q1.1<br>(8.4, 67.8) junto a Q1.1<br>(33.8, 58.1) junto a J3.2 |
| JP2 | `Net-(Q1-B)` | 1 | 0 | 24 mm | Q2, Q3 | (15.0, 80.1) junto a Q1.2<br>(37.7, 73.2) junto a R11.2 |
| JP3 | `K_DEC` | 1 | 0 | 5 mm | - | (18.1, 33.0) junto a U3.3<br>(18.1, 38.1) junto a R10.1 |
| JP4 | `SEG_F` | 1 | 0 | 24 mm | U4 | (19.5, 6.2) junto a U3.7<br>(42.1, 14.4) junto a U4.6 |
| JP5 | `RESET` | 1 | 0 | 40 mm | C5, J3, U1, Y1 | (26.3, 67.8) junto a J3.5<br>(58.7, 44.6) junto a C5.1 |
| JP6 | `SCK` | 1 | 0 | 8 mm | - | (28.8, 56.1) junto a J3.1<br>(34.5, 50.4) junto a U1.14 |
| JP7 | `SEG_DP` | 2 | 0 | 20 mm | - | (29.4, 29.8) junto a R9.2<br>(42.1, 27.9) junto a U4.5<br>(42.2, 20.6) junto a U4.5 |
| JP8 | `SEG_C` | 1 | 0 | 32 mm | D10 | (38.9, 6.2) junto a U4.6<br>(63.6, 25.9) junto a R5.2 |
| JP9 | `K_UNI` | 1 | 1 | 44 mm | R11, U1 | (38.9, 29.9) junto a R7.2<br>(40.4, 73.3) junto a R11.2 |
| JP10 | `SEG_A` | 3 | 0 | 18 mm | - | (43.8, 25.2) junto a U4.5<br>(44.8, 19.0) junto a U4.5<br>(47.8, 25.2) junto a U4.5<br>(50.5, 14.3) junto a D9.1 |
| JP11 | `SEG_B` | 1 | 0 | 18 mm | - | (47.6, 14.6) junto a D10.2<br>(60.2, 27.2) junto a R5.2 |
| JP12 | `+5V` | 2 | 1 | 57 mm | J4, RV1, SW2, TP5 | (56.0, 68.9) junto a C6.2<br>(86.3, 55.9) junto a R2.2<br>(90.7, 36.3) junto a SW1.1 |
| JP13 | `RXD` | 1 | 0 | 13 mm | - | (71.4, 47.8) junto a C11.2<br>(76.2, 36.0) junto a R3.2 |
| JP14 | `TXD` | 1 | 0 | 21 mm | C10 | (71.4, 45.0) junto a C11.2<br>(86.2, 29.9) junto a C10.2 |
| JP15 | `RESET` | 1 | 0 | 14 mm | C10, SW1 | (78.4, 40.4) junto a SW1.1<br>(90.1, 32.9) junto a C10.2 |
