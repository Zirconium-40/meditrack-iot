// =====================================================================
//  MediTrack IoT - Configuracion
//  Aqui se cambia TODO lo que depende de su equipo. El resto de los
//  archivos normalmente no se tiene que tocar.
// =====================================================================
#pragma once

// ---------------------------------------------------------------------
// 1) MODO DE FUNCIONAMIENTO
//    true  = MODO FERIA: entrega solo cada MINUTOS_FERIA minutos, sin
//            horarios ni internet. Si nadie aprieta el boton verde en
//            SEGUNDOS_FERIA_CONFIRMAR segundos, anota "sin confirmar" y
//            sigue. Al llegar al compartimento 8 regresa al inicio.
//    false = MODO NORMAL: entrega segun los horarios programados en la
//            pagina web (con el PIN del cuidador).
// ---------------------------------------------------------------------
#define MODO_FERIA              true
#define MINUTOS_FERIA              1
#define SEGUNDOS_FERIA_CONFIRMAR  40

// ---------------------------------------------------------------------
// 2) WI-FI (red de 2.4 GHz; en la feria, el hotspot del celular)
//    En modo feria funciona aunque no haya Wi-Fi.
// ---------------------------------------------------------------------
#define WIFI_NOMBRE      "Galaxy A5242E4"
#define WIFI_CONTRASENA  "PONGAN_AQUI_LA_CONTRASENA"

// ---------------------------------------------------------------------
// 3) MQTT (broker publico HiveMQ)
//    ID_DISPOSITIVO tiene que ser IGUAL en la API y en la pagina web.
//    Cambienlo por algo unico de su equipo, por ejemplo
//    "meditrack-equipo3-colima". Solo letras, numeros y guiones.
// ---------------------------------------------------------------------
#define MQTT_SERVIDOR    "broker.hivemq.com"
#define MQTT_PUERTO      1883
#define ID_DISPOSITIVO   "meditrack-demo-01"

// Clave secreta para firmar los planes y comandos que manda la API.
// Tiene que ser EXACTAMENTE la misma que CLAVE_FIRMA en la API (Render).
// Nunca la pongan en la pagina web.
#define CLAVE_FIRMA      "cambien-esta-clave-por-una-larga"

// Zona horaria de Colima / Ciudad de Mexico (sin horario de verano)
#define ZONA_HORARIA     "CST6"

// ---------------------------------------------------------------------
// 4) PINES (los mismos de la propuesta y de la guia de protoboard)
// ---------------------------------------------------------------------
#define PIN_I2C_SDA        21
#define PIN_I2C_SCL        22
#define PIN_SD_SCK         18
#define PIN_SD_MISO        19
#define PIN_SD_MOSI        23
#define PIN_SD_CS          27
#define PIN_DHT             4
#define PIN_REED           32   // tapa
#define PIN_BOTON_CONFIRMA 25
#define PIN_BOTON_DEMO     34   // necesita resistencia de 10k a 3.3V
#define PIN_ZUMBADOR       26
#define PIN_LED_VERDE       2
#define PIN_LED_ROJO        5
#define PIN_SERVO          13   // cable naranja del servo (rojo a 5V, cafe a GND)

// ---------------------------------------------------------------------
// 5) AJUSTES DEL PASTILLERO
// ---------------------------------------------------------------------
// Servo de 180 grados: 9 compartimentos de 22.5 grados (0 a 8).
// El 0 va vacio sobre el agujero, asi que caben 8 tomas.
#define COMPARTIMENTOS         9
#define MAX_ENTREGAS           8
#define GRADOS_POR_COMPARTIMENTO 22.5

// Pulso del servo en microsegundos para 0 y 180 grados. Si no llega a
// recorrer los 180 grados, prueben 500 y 2500; si zumba en las orillas,
// prueben 600 y 2300.
#define SERVO_PULSO_MIN      500
#define SERVO_PULSO_MAX     2400

// Milisegundos por cada grado: mas alto = gira mas suave y lento
#define SERVO_MS_POR_GRADO    15

#define TIPO_DHT          DHT11
#define ZUMBADOR_PASIVO    true   // su buzzer KY-006 es pasivo

// El servo, al arrancar, baja el voltaje un instante y el ESP32 se
// reiniciaba ("brownout"). En true se apaga esa proteccion para que
// aguante esas bajadas cortas. Si aun asi se reinicia, usen una fuente
// de 2 A (power bank o cargador) en lugar del USB de la laptop.
#define IGNORAR_BAJONES_VOLTAJE true

// Algunos modulos de buzzer de 3 pines suenan con LOW en vez de HIGH.
// Si al encender el zumbador suena sin parar, cambien esto a true.
#define ZUMBADOR_INVERTIDO   false

// Minutos que se espera la confirmacion antes de marcar "sin confirmar"
#define MINUTOS_PARA_CONFIRMAR  10

// Cada cuantos segundos se mandan temperatura, humedad y estado
#define SEGUNDOS_TELEMETRIA     10
