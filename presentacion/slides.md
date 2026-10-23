---
theme: default
title: Entrenador de microcontroladores · ATmega328P
author: ""
info: Exposición final · Sistemas Embebidos 1 · Actividad 10.1.12
aspectRatio: 16/9
canvasWidth: 1200
colorSchema: light
fonts:
  sans: DejaVu Sans
  mono: DejaVu Sans Mono
  provider: none
htmlAttrs:
  lang: es
drawings:
  enabled: false
transition: none
duration: 17min
exportFilename: presentacion-final
---

<div class="eyebrow">SISTEMAS EMBEBIDOS 1 / ACTIVIDAD 10.1.12</div>
<div class="cover-grid">
<div>
<h1>Entradas, lógica<br>y tiempo real.</h1>
<p class="lead">Hardware y firmware del entrenador<br><strong>ATmega328P · DIP-28</strong></p>
<div class="tag">EXPOSICIÓN FINAL · OCTUBRE 2026</div>
</div>
<div class="chip-visual"><div class="chip-label">ENTRENADOR AUTÓNOMO</div><div class="chip-body"><span>AVR</span><b>ATmega<br>328P</b><small>DIP-28 · 16 MHz</small></div><div class="chip-io"><span>ENTRADAS<br><b>ADC + DIP</b></span><span>SALIDAS<br><b>LEDs + displays</b></span></div></div>
</div>

<!--
35 s. Presentar al equipo y el enfoque: cómo el software convierte las entradas en respuestas y mantiene el refresco de las salidas. El entrenador funciona por sí mismo: el Arduino Uno se usa como herramienta de programación, mientras que el ATmega del entrenador ejecuta el programa. El hardware está terminado, según la confirmación del equipo del 23 de octubre. La portada es una representación conceptual del microcontrolador. Llevar la placa terminada a la exposición.
-->

---

<div class="eyebrow">01 / ARQUITECTURA DEL HARDWARE</div>

# El hardware que controla el programa

<div class="three"><section><span class="big">Entradas</span><h3>Leer</h3><p>Potenciómetro → ADC0.<br>DIP de 4 posiciones → PC1…PC4.</p></section><section><span class="big">Ejecución</span><h3>Procesar</h3><p>ATmega328P a 16 MHz.<br>Alimentación de 5 V, RESET e ICSP.</p></section><section><span class="big">Salidas</span><h3>Mostrar</h3><p>8 LEDs y 2 displays.<br>Bus compartido con 3 selecciones.</p></section></div><div class="callout">Hardware terminado: las entradas y salidas se coordinan mediante <strong>un firmware con cuatro modos</strong>.</div>

<!--
40 s. Presentar entradas, microcontrolador y salidas. Las siguientes dos diapositivas explican las decisiones de hardware que permiten ejecutar el programa; después se desarrolla el firmware. El esquema completo queda como anexo para preguntas. El equipo confirmó que el hardware funciona.
-->

---

<div class="eyebrow">02 / ALIMENTACIÓN Y CIRCUITO MÍNIMO</div>

# Energía estable, reloj y reinicio

<div class="power-path"><b>9–12 V CC<br><small>Entrada</small></b><span>→</span><b>1N4007<br><small>Protección de polaridad</small></b><span>→</span><b>LM7805<br><small>Regulación lineal</small></b><span>→</span><b>5 V<br><small>Micro y periféricos</small></b></div>
<div class="three"><section><h3>Filtrado y desacoplo</h3><p>Entrada: 100 µF + 330 nF.<br>Salida: 100 µF + 100 nF.<br>100 nF junto a VCC y AVCC.</p></section><section><h3>Reloj de 16 MHz</h3><p>Cristal externo y dos capacitores de 22 pF.</p><p>La frecuencia coincide con la configuración del firmware.</p></section><section><h3>RESET</h3><p>Pull-up de 10 kΩ y pulsador a GND.</p><p>Permite reiniciar el programa sin desconectar la fuente.</p></section></div>
<div class="callout">Alimentación y reloj estables permiten que el ADC, la temporización y el multiplexado funcionen correctamente.</div>

<!--
55 s. Recorrer la fuente en una frase: entrada, diodo, regulador y 5 V. El LM7805 es lineal y disipa energía como calor; 9 V reduce su disipación frente a 12 V. Los valores mostrados son los del diseño, no mediciones nuevas. Diferenciar los electrolíticos de filtrado de los cerámicos de desacoplo. Recordar que el reloj real y la frecuencia de compilación deben coincidir. RESET devuelve el programa a su estado inicial. El esquema incluye además filtro de RESET y auto-reset opcional, que solo se explican si preguntan. No conectar simultáneamente dos fuentes de 5 V.
-->

---

<div class="eyebrow">03 / INTERFAZ DE ENTRADA Y SALIDA</div>

# El circuito prepara las señales para el firmware

<div class="two"><section><h3>Entradas</h3><p><strong>Potenciómetro de 10 kΩ</strong><br>Entre 5 V y GND; cursor a PC0 / ADC0.</p><p><strong>DIP de 4 posiciones</strong><br>PC1…PC4 con pull-up internas.<br>Cerrado: nivel eléctrico bajo.</p></section><section><h3>Salidas compartidas</h3><p><strong>8 LEDs + 2 displays 5161AS</strong><br>Bus de 8 bits con resistencias de 220 Ω.</p><p><strong>3 transistores NPN</strong><br>Un grupo por transistor; base con 1 kΩ.<br>El firmware activa solo uno a la vez.</p></section></div>
<div class="callout">Programación por ICSP: RESET · MOSI · MISO · SCK · alimentación y GND común.</div>

<!--
55 s. Explicar por qué el cursor del potenciómetro proporciona una tensión variable y por qué las pull-up evitan dejar flotantes las entradas abiertas. El firmware invierte la lectura del DIP para representar cerrado como 1 lógico. Los displays son de cátodo común; los transistores conmutan el retorno de cada grupo. Las resistencias limitan la corriente y el programa impide encender los tres grupos simultáneamente en operación normal. El bus usa PD2…PD7 y PB0/PB1; PB2…PB4 seleccionan los grupos. ICSP permite reprogramar sin retirar el micro. No profundizar en fabricación: pasar a cómo el software controla este circuito.
-->

---

<div class="eyebrow">04 / ARQUITECTURA DEL SOFTWARE</div>

# Tres responsabilidades bien separadas

<div class="three"><section><span class="metric">setup()</span><h3>Configurar una vez</h3><p>Dirección de los puertos.<br>Pull-up de las entradas.<br>Timer2 e interrupciones.</p></section><section><span class="metric">loop()</span><h3>Calcular la respuesta</h3><p>Leer potenciómetro y DIP.<br>Elegir el modo.<br>Preparar los patrones.</p></section><section><span class="metric">ISR</span><h3>Refrescar cada 2 ms</h3><p>Leer el patrón preparado.<br>Actualizar el bus.<br>Seleccionar un grupo.</p></section></div><div class="callout"><code>loop()</code> escribe <code>pantalla[3]</code>; la interrupción utiliza ese búfer para actualizar las salidas.</div>

<!--
55 s. El programa está escrito en C++ para AVR con el entorno Arduino. Combina analogRead y millis con acceso directo a registros. setup se ejecuta una vez y loop se repite. ISR significa rutina de servicio de interrupción: interrumpe brevemente la ejecución normal. No hay hilos ejecutándose simultáneamente; el micro atiende la interrupción y vuelve al punto donde estaba. La división separa el cálculo del contenido de su refresco.
-->

---

<div class="eyebrow">05 / INICIALIZACIÓN</div>

# setup(): configurar los puertos con máscaras

<div class="two firmware">
<section><pre class="firmware-code"><code>DDRD |= 0xFC;
DDRB |= 0x1F;
DDRC &amp;= ~0x1E;
PORTC |= 0x1E;</code></pre></section>
<section><h3>Qué cambia cada instrucción</h3><p><code>DDRD</code>: PD2…PD7 como salidas.<br><code>DDRB</code>: PB0…PB4 como salidas.<br><code>DDRC</code>: PC1…PC4 como entradas.<br><code>PORTC</code>: activa sus pull-up.</p><h3>Operadores de bits</h3><p><code>|=</code> activa bits seleccionados.<br><code>&amp;= ~</code> los borra conservando los demás.</p></section>
</div><div class="callout"><strong>DDR</strong> define entrada/salida; <strong>PORT</strong> escribe salidas o habilita pull-up; <strong>PIN</strong> lee niveles.</div>

<!--
60 s. Fragmento exacto de setup, sin sus comentarios. 0xFC equivale a 11111100: selecciona seis bits y preserva PD0/PD1. 0x1F selecciona los cinco bits inferiores de B. 0x1E selecciona PC1 a PC4. Una pull-up mantiene una entrada alta cuando el interruptor está abierto. El archivo también activa pull-up en pines sin uso y configura Timer2; no presentar el fragmento como la función completa.
-->

---

<div class="eyebrow">06 / ENTRADA ANALÓGICA</div>

# De 0…1023 a una lectura estable

<div class="two firmware">
<section><pre class="firmware-code"><code>uint16_t suma = 0;
for (uint8_t i = 0; i &lt; 8; i++)
  suma += analogRead(A0);
uint16_t nuevo = suma / 8;</code></pre></section>
<section><h3>1. Promediar</h3><p>El ADC convierte la entrada analógica en un valor de 10 bits. Se promedian <strong>8 muestras</strong>.</p><h3>2. Aplicar histéresis</h3><p>Actualizar si cambia más de 2 cuentas respecto al valor estable, o si llega a 0 / 1023.</p><h3>3. Escalar</h3><p><code>(uint32_t)pot * 100 / 1024</code><br>Produce el número <strong>00…99</strong>.</p></section>
</div><div class="callout">La barra usa un nivel de 0…8: <code>(1u &lt;&lt; nivel) - 1</code> enciende los LEDs inferiores.</div>

<!--
60 s. El fragmento de leerPot solo adapta el salto de línea para legibilidad. ADC significa convertidor analógico-digital. El promedio reduce variaciones y la histéresis evita actualizar por cambios pequeños; no es una garantía contra cualquier ruido. estable es static: conserva el último valor entre llamadas. La suma máxima es 8184 y cabe en uint16_t. El escalado usa uint32_t para evitar desbordamiento intermedio al multiplicar en AVR. Con pot=512 el display marca 50 y nivel=4 genera 00001111. Las llamadas analogRead son síncronas; no decir que todo el firmware es completamente no bloqueante.
-->

---

<div class="eyebrow">07 / ENTRADAS DIGITALES</div>

# El DIP selecciona el modo con dos bits

<pre class="firmware-code"><code>return (uint8_t)(~PINC &gt;&gt; 1) &amp; 0x0F;</code></pre><div class="three"><section><span class="metric">~PINC</span><h3>Invertir</h3><p>Con pull-up, cerrado = 0 eléctrico.<br>Tras invertir, cerrado = 1 lógico.</p></section><section><span class="metric">&gt;&gt; 1</span><h3>Alinear</h3><p>PC1…PC4 se desplazan a las posiciones 0…3 del resultado.</p></section><section><span class="metric">&amp; 0x0F</span><h3>Filtrar</h3><p>Conservar solo los cuatro bits de los interruptores.</p></section></div><div class="callout"><code>switch (dip &amp; 0x03)</code> utiliza SW2/SW1 para elegir uno de cuatro modos.</div>

<!--
55 s. Línea de retorno de leerDip. Separar nivel eléctrico de significado lógico. La máscara 0x0F elimina los bits ajenos al DIP y 0x03 elige el modo con los dos inferiores. Ejemplo: dip=1010 binario equivale a 10 decimal, pero dip & 3 equivale a 2, por lo que activa la lectura del DIP. No hay rutina explícita de antirrebote digital en este firmware; el filtro descrito antes corresponde al potenciómetro.
-->

---

<div class="eyebrow">08 / LÓGICA DE APLICACIÓN</div>

# Cuatro modos, una misma estructura


| SW2 SW1 | Rama del switch | Respuesta del firmware |
|---|---|---|
| 00 | ADC | Escala el potenciómetro a 00…99 y genera una barra de LEDs. |
| 01 | Contador | Incrementa con módulo 100; muestra decimal y binario. |
| 10 | DIP | Muestra el valor del DIP y repite sus cuatro bits en los LEDs. |
| 11 | Secuencia | Desplaza un bit y cambia de sentido en los extremos. |

<div class="callout">Las variables <code>static</code> conservan <code>cuenta</code>, <code>posicion</code>, <code>sentido</code> y <code>ultimo</code> entre llamadas a <code>loop()</code>.</div>

<!--
60 s. Explicar el estado de cada modo. El contador usa (cuenta+1)%100. La secuencia cambia sentido en 0 y 7 y luego actualiza la posición. El estado se conserva al cambiar de modo porque no existe una rutina de reinicio por transición; RESET sí reinicia el programa. El modo DIP comparte los dos bits inferiores con la selección del modo, por eso sus valores observables son 02, 06, 10 y 14. No prometer que puede mostrar los 16 valores sin cambiar de modo.
-->

---

<div class="eyebrow">09 / TIEMPOS DE LA APLICACIÓN</div>

# Avanzar con millis(), sin esperar con delay()

<div class="two firmware">
<section><pre class="firmware-code"><code>uint16_t periodo = 50 + pot;
bool toca = millis() - ultimo &gt;= periodo;
if (toca) ultimo = millis();</code></pre></section>
<section><h3>Velocidad ajustable</h3><p>El potenciómetro cambia el periodo entre <strong>50 y 1073 ms</strong>.</p><h3>Actualizar cuando corresponde</h3><p><code>toca</code> habilita un paso del contador o de la secuencia.</p><h3>Seguir atendiendo entradas</h3><p>La aplicación no introduce una espera con <code>delay()</code> entre pasos.</p></section>
</div><div class="callout">Dos escalas de tiempo: <strong>millis()</strong> gobierna la animación; <strong>Timer2</strong> mantiene el refresco de los displays.</div>

<!--
55 s. ultimo es unsigned long y la diferencia unsigned permite comparar tiempos a través del desbordamiento del contador, dentro del intervalo apropiado. No afirmar que el periodo es una temporización de precisión: la lógica comprueba tiempo en cada vuelta, actualiza ultimo al momento actual y no recupera pasos atrasados. Los modos contador y secuencia comparten esta base de tiempo. millis usa la base temporal del núcleo Arduino y el multiplexado usa Timer2. Las conversiones ADC siguen consumiendo tiempo aunque no se use delay.
-->

---

<div class="eyebrow">10 / TEMPORIZADOR</div>

# Timer2 genera una interrupción cada 2 ms

<div class="two firmware">
<section><pre class="firmware-code"><code>cli();
TCCR2A = (1 &lt;&lt; WGM21);
TCCR2B = (1 &lt;&lt; CS22) | (1 &lt;&lt; CS21);
OCR2A = 124;
TIMSK2 = (1 &lt;&lt; OCIE2A);
sei();</code></pre></section>
<section><h3>CTC: comparación y reinicio</h3><p>El temporizador cuenta de 0 a 124: <strong>125 estados</strong>.</p><h3>Prescaler: 256</h3><p><strong>16 MHz / 256 / 125 = 500 Hz</strong><br>Una interrupción cada 2 ms.</p><h3>Tres grupos</h3><p>El ciclo completo dura 6 ms:<br><strong>≈167 Hz de refresco por grupo</strong>.</p></section>
</div>

<!--
65 s. Fragmento exacto de setup. CTC significa Clear Timer on Compare Match. WGM21 selecciona el modo; CS22 y CS21 seleccionan división por 256; OCR2A establece el límite; OCIE2A habilita la interrupción de comparación. cli deshabilita interrupciones durante la configuración y sei las habilita después. Las cifras suponen el reloj de 16 MHz configurado y funcionando. Separar interrupciones por segundo de refrescos de cada grupo. El temporizador marca el instante y la CPU ejecuta la rutina al atenderlo.
-->

---

<div class="eyebrow">11 / RUTINA DE INTERRUPCIÓN</div>

# La ISR actualiza un grupo y regresa

<pre class="firmware-code"><code>ISR(TIMER2_COMPA_vect) {
  static uint8_t grupo = 0;
  PORTB &amp;= ~0x1C;
  grupo = (grupo + 1) % 3;
  escribirBus(pantalla[grupo]);
  PORTB |= (uint8_t)(1 &lt;&lt; (PB2 + grupo));
}</code></pre><div class="mini-steps"><span><b>1</b> Apagar selecciones</span><span><b>2</b> Escribir el patrón</span><span><b>3</b> Activar un grupo</span></div><div class="callout"><code>volatile uint8_t pantalla[3]</code>: búfer compartido entre el programa principal y la ISR.</div>

<!--
65 s. Fragmento exacto de la ISR, sin comentarios. 0x1C selecciona PB2/PB3/PB4. El módulo 3 recorre LEDs, decenas y unidades; con grupo inicial cero, la primera interrupción selecciona decenas, pero el ciclo periódico es el mismo. Apagar antes de escribir evita mostrar el patrón del grupo anterior. La ISR hace poco trabajo: no lee el ADC ni ejecuta la lógica de los modos. volatile indica al compilador que debe efectuar los accesos a memoria porque el contenido se comparte con una interrupción; no vuelve atómica una actualización de todo el búfer. Cada byte se accede individualmente y los tres no se publican como una sola transacción.
-->

---

<div class="eyebrow">12 / REPRESENTACIÓN DE LAS SALIDAS</div>

# Del número al patrón de segmentos

<pre class="firmware-code"><code>pantalla[1] = reordenar(DIGITO[(n / 10) % 10], BIT_SEG);
pantalla[2] = reordenar(DIGITO[n % 10], BIT_SEG);</code></pre><div class="three"><section><span class="metric">42 → 4 / 2</span><h3>Separar dígitos</h3><p>División entera para decenas.<br>Módulo para unidades.</p></section><section><span class="metric">DIGITO[]</span><h3>Buscar segmentos</h3><p>Tabla de patrones de 0 a 9.<br>Ejemplo: 0 → <code>0x3F</code>.</p></section><section><span class="metric">reordenar()</span><h3>Adaptar el bus</h3><p><code>BIT_SEG</code> y <code>BIT_LED</code> relacionan bits lógicos y físicos.</p></section></div>

<!--
60 s. Líneas exactas de mostrarNumero. Los bits lógicos corresponden a a,b,c,d,e,f,g,dp. 0x3F enciende a…f para formar cero y deja apagados g y el punto decimal. reordenar recorre los bits activos y usa la tabla de correspondencia. mostrarLeds escribe pantalla[0] con BIT_LED. escribirBus coloca los seis bits inferiores en PORTD y los dos superiores en PORTB; sus máscaras preservan las líneas ajenas al bus. PCB 1 selecciona la correspondencia del diseño; PCB 0 usa orden secuencial. Es una opción de compilación, no una selección durante la ejecución.
-->

---

<div class="eyebrow">13 / COMPILACIÓN Y CARGA</div>

# Del archivo .ino al programa en Flash

<div class="timeline"><div><small>FUENTE</small><b>C++ / .ino</b><span>Lógica y configuración</span></div><div><small>COMPILACIÓN</small><b>Código AVR</b><span>Binario para el ATmega328P</span></div><div><small>PROGRAMACIÓN</small><b>Flash</b><span>Arduino Uno como ISP</span></div></div><pre class="firmware-code"><code>arduino-cli compile -b arduino:avr:uno firmware/entrenador
arduino-cli upload -b arduino:avr:uno -P arduinoasisp \
  -p &lt;puerto-del-uno&gt; firmware/entrenador</code></pre><div class="callout">Antes: cargar <code>ArduinoISP</code> en el Uno y comprobar comunicación con el ATmega. Firma esperada: <strong>1E 95 0F</strong>.</div>

<!--
65 s. Los comandos se ejecutan desde la raíz del repositorio; reemplazar el marcador de puerto por el real, sin los signos de menor y mayor. El perfil Uno selecciona el ATmega328P y 16 MHz; no significa que el entrenador necesite una placa Uno para ejecutar. Compilar traduce y enlaza el programa; programar lo escribe en Flash. El Uno ejecuta ArduinoISP y se comunica mediante ICSP. El software de la aplicación queda en el ATmega, que después funciona con alimentación autónoma. La conexión y alimentación se verifican antes de subir. No ejecutar literalmente el marcador de puerto en una terminal.
-->

---

<div class="eyebrow">14 / ARRANQUE Y CONFIGURACIÓN</div>

# Firmware, bootloader y fusibles

<div class="three"><section><h3>Firmware</h3><p>La aplicación: entradas, modos, patrones e interrupciones.</p><p>Se almacena en Flash.</p></section><section><h3>Bootloader</h3><p>Programa de arranque para cargar por serial.</p><p>ISP puede escribir directamente la aplicación.</p></section><section><h3>Fusibles</h3><p>Configuración persistente de reloj, arranque y brown-out.</p><p>No forman parte de <code>loop()</code>.</p></section></div><div class="callout">Configuración recomendada del proyecto: <strong>L 0xF7 · H 0xDE · E 0xFC</strong>.</div><p class="footnote">Reloj externo full swing · arranque para bootloader · brown-out de 4,3 V.</p>

<!--
60 s. Explicar los conceptos antes de leer hexadecimales. Los fusibles son bits de configuración, no fusibles físicos. Estos valores son los recomendados en el repositorio, no una lectura nueva del hardware. Grabar un bootloader configura fusibles; hay que comprobar su coherencia si luego se programa por ISP. La carga por ISP puede sobrescribir el bootloader: para volver a cargar por FTDI hace falta un bootloader válido. Los valores del reloj deben coincidir con la frecuencia usada al compilar, porque de ello dependen tiempos y comunicaciones. No cambiar fusibles durante la demostración sin verificar la configuración real.
-->

---

<div class="eyebrow">15 / PRUEBAS Y DEMOSTRACIÓN</div>

# Explicar el código mientras se observa su efecto

<div class="demo-list"><div><b>01</b><span><strong>ADC · 00</strong>Girar el potenciómetro: escalado a 00…99 y barra de LEDs.</span></div><div><b>02</b><span><strong>Contador · 01</strong>Cambiar el periodo y observar el paso de 99 a 00.</span></div><div><b>03</b><span><strong>DIP · 10</strong>Variar SW3/SW4: 02 → 06 → 10 → 14.</span></div><div><b>04</b><span><strong>Secuencia · 11</strong>Observar extremos, cambio de sentido y reinicio con RESET.</span></div></div><div class="callout">Pruebas previas del repositorio: <code>prueba-blink</code> → <code>prueba-displays</code> → <code>entrenador</code>.</div>

<!--
2 min. Explicar entrada y escalado, contador y refresco, selección DIP, secuencia y RESET. El reparto de intervenciones queda abierto. El hardware terminado es la evidencia en vivo. Preparar el contador cerca de 99 y el potenciómetro en velocidad alta para no gastar tiempo esperando. Para el modo DIP dejar SW2 cerrado y SW1 abierto; variar SW4/SW3 como 00,01,10,11. No prometer lectura de 0…15 en ese modo. Mostrar que cambiar la velocidad de la animación no modifica el periodo de Timer2. Las pruebas previas aislaron comunicación, reloj y segmentos antes de integrar la aplicación. No inventar mediciones ni declarar resuelto por una causa específica el antiguo salto observado en video.
-->

---

<div class="eyebrow">16 / CONCLUSIONES</div>

# El firmware coordina datos, estados y tiempo

<div class="three"><section><span class="metric">Entradas</span><p>Promedio, histéresis y máscaras convierten señales en datos útiles.</p></section><section><span class="metric">Estados</span><p>Un <code>switch</code> y variables persistentes organizan cuatro comportamientos.</p></section><section><span class="metric">Tiempo</span><p><code>millis()</code> controla los avances; Timer2 mantiene el multiplexado.</p></section></div><div class="closing">Una aplicación en C++ · cuatro modos · ejecución autónoma</div>

<!--
35 s. Una conclusión por integrante. Destacar cómo cada decisión se ve en una función del programa. El acceso a registros permite controlar bits concretos y la separación entre loop e ISR mantiene el refresco independiente de los modos. Abrir preguntas sobre máscaras, volatile, tiempo de refresco, tablas de segmentos y proceso de compilación/programación. La placa está terminada; el esquema queda para preguntas puntuales de hardware.
-->

---

<div class="eyebrow">ANEXO A / CONSULTA OPCIONAL</div>

# Esquemático de referencia

<img src="/esquematico.png" class="schematic"/>

<!--
Respaldo: no explicar durante el recorrido principal. Usar únicamente ante una pregunta de hardware. El esquema corresponde al diseño del proyecto; confirmar que la selección PCB del firmware coincide con la placa usada. La explicación principal se centra en el software.
-->

---

<div class="eyebrow">ANEXO B / MAPA DEL CÓDIGO</div>

# Dónde encontrar cada responsabilidad


| Función / elemento | Responsabilidad |
|---|---|
| setup() | Puertos, pull-up y Timer2. |
| leerPot() / leerDip() | Adquisición, filtro analógico y lectura de bits. |
| loop() | Selección de modo, estado y control del periodo. |
| mostrarNumero() / mostrarLeds() | Construcción de los patrones en pantalla[]. |
| reordenar() / escribirBus() | Traducción y escritura de los bits físicos. |
| ISR(TIMER2_COMPA_vect) | Refresco periódico de un grupo. |

<p class="footnote">Fuente: <code>firmware/entrenador/entrenador.ino</code> · documentación: <code>README.pdf</code><br><a href="https://nemog3762.gitlab.io/material/compiled/Sistemas%20embebidos%201.html#org72dbe7e">Enunciado: material del curso, sección 10.1.12</a></p>

<!--
Respaldo para preguntas de código. Abrir firmware/entrenador/entrenador.ino en el editor y localizar la función solicitada. Las diapositivas muestran fragmentos reales, en algunos casos sin comentarios o con saltos de línea adaptados. No se cambió el firmware para preparar esta exposición. Las limitaciones de lectura del DIP, falta de antirrebote explícito y publicación del búfer por bytes pertenecen al código actual.
-->
