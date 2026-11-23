// =====================================================================
//  MediTrack IoT - Conexion Wi-Fi + MQTT (HiveMQ)
//
//  Temas (todos empiezan con meditrack/v1/<ID_DISPOSITIVO>/):
//    telemetria  ESP32 -> nube   temperatura, humedad, tapa, etc.
//    evento      ESP32 -> nube   entrega, confirmada, sin_confirmar...
//    estado      ESP32 -> nube   "en_linea" / "desconectado" (retenido)
//    plan        nube  -> ESP32  horarios firmados (retenido)
//    comando     nube  -> ESP32  ordenes firmadas (entregar ahora, etc.)
//
//  Si se cae el internet, el pastillero sigue funcionando solo y guarda
//  hasta 20 eventos para mandarlos cuando vuelva la conexion.
// =====================================================================
#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <functional>
#include "config.h"

class Conexion {
 public:
  using AlRecibir = std::function<void(const String& tema, const String& mensaje)>;

  Conexion() : mqtt_(wifi_) {}

  void iniciar(AlRecibir alRecibir) {
    alRecibir_ = alRecibir;
    base_ = String("meditrack/v1/") + ID_DISPOSITIVO + "/";
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_NOMBRE, WIFI_CONTRASENA);
    mqtt_.setServer(MQTT_SERVIDOR, MQTT_PUERTO);
    mqtt_.setBufferSize(2048);  // el plan puede medir hasta ~1.5 KB
    mqtt_.setCallback([this](char* tema, byte* datos, unsigned int largo) {
      String mensaje;
      mensaje.reserve(largo);
      for (unsigned int i = 0; i < largo; i++) mensaje += (char)datos[i];
      if (alRecibir_) alRecibir_(String(tema), mensaje);
    });
  }

  // Se llama en cada vuelta del loop. Reconecta sin trabar el programa.
  void actualizar() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (!mqtt_.connected()) {
      if (millis() - ultimoIntento_ < 5000) return;
      ultimoIntento_ = millis();
      String id = String(ID_DISPOSITIVO) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
      String temaEstado = base_ + "estado";
      if (mqtt_.connect(id.c_str(), temaEstado.c_str(), 1, true, "desconectado")) {
        mqtt_.publish(temaEstado.c_str(), "en_linea", true);
        mqtt_.subscribe((base_ + "plan").c_str(), 1);
        mqtt_.subscribe((base_ + "comando").c_str(), 1);
        enviarPendientes();
      }
      return;
    }
    mqtt_.loop();
  }

  bool wifiListo() const { return WiFi.status() == WL_CONNECTED; }
  bool enLinea() { return mqtt_.connected(); }
  const String& base() const { return base_; }

  void publicarTelemetria(const String& json) {
    if (mqtt_.connected()) mqtt_.publish((base_ + "telemetria").c_str(), json.c_str());
  }

  // Los eventos no se pierden: si no hay conexion se guardan en la cola
  void publicarEvento(const String& json) {
    if (mqtt_.connected() && mqtt_.publish((base_ + "evento").c_str(), json.c_str())) return;
    if (pendientes_ < 20) cola_[pendientes_++] = json;
  }

 private:
  void enviarPendientes() {
    for (uint8_t i = 0; i < pendientes_; i++) {
      mqtt_.publish((base_ + "evento").c_str(), cola_[i].c_str());
      mqtt_.loop();
    }
    pendientes_ = 0;
  }

  WiFiClient wifi_;
  PubSubClient mqtt_;
  AlRecibir alRecibir_;
  String base_;
  String cola_[20];
  uint8_t pendientes_ = 0;
  unsigned long ultimoIntento_ = 0;
};
