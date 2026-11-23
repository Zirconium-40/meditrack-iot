// =====================================================================
//  MediTrack IoT - Dispensador programable de 12 compartimentos
//
//  Archivos del programa:
//    config.h     ajustes (Wi-Fi, ID, clave, pines, simulacion o real)
//    Hardware.h   botones, tapa, LEDs, alarma, sensor, reloj, pantalla
//    Carrusel.h   servo de 180 grados (9 compartimentos)
//    Datos.h      plan de tomas, firma de seguridad, registro microSD
//    Conexion.h   Wi-Fi y MQTT con HiveMQ
//    MediTrack.h  el controlador que junta todo (maquina de estados)
//
//  Librerias: PubSubClient, ArduinoJson (v7), RTClib, Adafruit SSD1306, ESP32Servo,
//             Adafruit GFX Library, DHT sensor library,
//             Adafruit Unified Sensor
// =====================================================================
#include "MediTrack.h"

MediTrack pastillero;

void setup() {
  pastillero.iniciar();
}

void loop() {
  pastillero.actualizar();
  delay(5);
}
