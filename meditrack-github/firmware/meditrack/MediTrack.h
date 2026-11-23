// =====================================================================
//  MediTrack IoT - Controlador principal (el "cerebro")
//
//  Junta todas las piezas y decide que hacer en cada momento.
//  Funciona como una maquina de estados:
//
//    ESPERANDO ──(llega la hora)──> ENTREGANDO ──> ESPERANDO_CONFIRMACION
//        ^          │ tapa abierta                     │         │
//        │          v                          (boton) │         │ (10 min)
//        │     TAPA_ABIERTA ──(se cierra)──> ...       v         v
//        └──────────────────────────────────────── ESPERANDO   REVISION
//                                                     ^            │
//                                                     └──(boton)───┘
// =====================================================================
#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "Hardware.h"
#include "Carrusel.h"
#include "Datos.h"
#include "Conexion.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

enum class Estado { ESPERANDO, TAPA_ABIERTA, ESPERANDO_CONFIRMACION, REVISION };

class MediTrack {
 public:
  MediTrack()
      : botonConfirmar_(PIN_BOTON_CONFIRMA, true),
        botonDemo_(PIN_BOTON_DEMO, false),  // el GPIO 34 no tiene pull-up interno
        tapa_(PIN_REED),
        ledVerde_(PIN_LED_VERDE),
        ledRojo_(PIN_LED_ROJO),
        alarma_(PIN_ZUMBADOR, ledVerde_) {}

  // -------------------------------------------------------------------
  void iniciar() {
#if IGNORAR_BAJONES_VOLTAJE
    WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);  // no reiniciar por bajones del servo
#endif
    Serial.begin(115200);
    // Reparte los temporizadores PWM: uno para el servo (50 Hz) y otro
    // para el buzzer (2000 Hz), para que no se estorben.
    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);
    ESP32PWM::allocateTimer(2);
    ESP32PWM::allocateTimer(3);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    pantalla_.iniciar();
    reloj_.iniciar();
    ambiente_.iniciar();
    botonConfirmar_.iniciar();
    botonDemo_.iniciar();
    tapa_.iniciar();
    ledVerde_.iniciar();
    ledRojo_.iniciar();
    alarma_.iniciar();
    carrusel_.iniciar();
    plan_.iniciar();
    Serial.println(registro_.iniciar() ? "microSD lista" : "Sin microSD (se sigue sin ella)");

    conexion_.iniciar([this](const String& tema, const String& msg) { alRecibirMensaje(tema, msg); });
    tapaCerradaAntes_ = tapa_.estaCerrada();

    evento("reinicio", 0, "");

    // Si se fue la luz a mitad de un giro, se pide revisar el vasito
    if (plan_.seCortoGirando()) {
      plan_.marcarGirando(false);
      evento("energia_interrumpida", plan_.compartimentoSiguiente(), "");
      if (!MODO_FERIA) entrarARevision("Corte de luz");  // en la feria solo se anota
    }

    // Con el servo no hace falta buscar origen ni moverse al arrancar
    carrusel_.buscarOrigen();
  }

  // -------------------------------------------------------------------
  void actualizar() {
    conexion_.actualizar();
    if (conexion_.wifiListo() && !pidioHora_) { reloj_.sincronizarConInternet(); pidioHora_ = true; }
    reloj_.actualizar();
    ambiente_.actualizar();
    alarma_.actualizar();
    ledRojo_.actualizar();

    revisarTapa();
    revisarBotones();
    revisarHorario();
    publicarTelemetria();
    dibujarPantalla();
  }

 private:
  // ---------------------------- Reglas -------------------------------
  void revisarBotones() {
    if (botonConfirmar_.fuePresionado()) {
      if (estado_ == Estado::ESPERANDO_CONFIRMACION) confirmar();
      else if (estado_ == Estado::REVISION) salirDeRevision();
    }
    if (botonDemo_.fuePresionado() && estado_ == Estado::ESPERANDO) {
      intentarEntrega(true);
    }
  }

  void revisarHorario() {
    if (estado_ == Estado::TAPA_ABIERTA && tapa_.estaCerrada()) {
      ledRojo_.apagar();
      estado_ = Estado::ESPERANDO;
      intentarEntrega(adelantada_);
      return;
    }
#if MODO_FERIA
    if (estado_ == Estado::ESPERANDO && millis() - ultimaFeria_ > (unsigned long)MINUTOS_FERIA * 60000UL) {
      ultimaFeria_ = millis();
      intentarEntrega(true);
    }
    if (estado_ == Estado::ESPERANDO_CONFIRMACION &&
        millis() - inicioAlarma_ > (unsigned long)SEGUNDOS_FERIA_CONFIRMAR * 1000UL) {
      alarma_.silenciar();
      evento("sin_confirmar", compartimentoEnCurso_, etiquetaEnCurso_);
      estado_ = Estado::ESPERANDO;  // en la feria no se queda en revision
      ultimaFeria_ = millis();
    }
    return;
#endif
    if (estado_ == Estado::ESPERANDO && plan_.hayPendientes() && reloj_.horaValida() &&
        reloj_.ahora() >= plan_.siguiente()->hora) {
      intentarEntrega(false);
    }
    if (estado_ == Estado::ESPERANDO_CONFIRMACION &&
        millis() - inicioAlarma_ > (unsigned long)MINUTOS_PARA_CONFIRMAR * 60000UL) {
      alarma_.silenciar();
      evento("sin_confirmar", compartimentoEnCurso_, etiquetaEnCurso_);
      if (!entregaLibre_) plan_.marcarEntregada();
      entrarARevision("Sin confirmar");
    }
  }

  void revisarTapa() {
    bool cerrada = tapa_.estaCerrada();
    if (cerrada == tapaCerradaAntes_) return;
    tapaCerradaAntes_ = cerrada;
    evento(cerrada ? "tapa_cerrada" : "tapa_abierta", carrusel_.compartimento(), "");
  }

  // ------------------------- Acciones --------------------------------
  // adelantada = true cuando viene del boton demo o de la pagina web
  void intentarEntrega(bool adelantada) {
    adelantada_ = adelantada;
    if (!tapa_.estaCerrada()) {
      if (estado_ != Estado::TAPA_ABIERTA) {
        evento("bloqueo_tapa", plan_.compartimentoSiguiente(), "");
        estado_ = Estado::TAPA_ABIERTA;
        ledRojo_.parpadear();
      }
      return;
    }

    if (MODO_FERIA) {
      entregaLibre_ = true;
      compartimentoEnCurso_ = (carrusel_.compartimento() + 1) % COMPARTIMENTOS;
      if (compartimentoEnCurso_ == 0) compartimentoEnCurso_ = 1;  // regresa y entrega el 1
      etiquetaEnCurso_ = "Demo";
    } else if (plan_.hayPendientes()) {
      entregaLibre_ = false;
      compartimentoEnCurso_ = plan_.compartimentoSiguiente();
      etiquetaEnCurso_ = plan_.siguiente()->etiqueta;
    } else if (adelantada && plan_.cantidad() == 0) {
      // Sin plan cargado: el boton demo gira al siguiente compartimento
      entregaLibre_ = true;
      compartimentoEnCurso_ = (carrusel_.compartimento() + 1) % COMPARTIMENTOS;
      etiquetaEnCurso_ = "Demo";
    } else {
      evento("sin_tomas", 0, "");
      return;
    }

    plan_.marcarGirando(true);
    carrusel_.irACompartimento(compartimentoEnCurso_);
    plan_.marcarGirando(false);

    evento("entrega", compartimentoEnCurso_, etiquetaEnCurso_);
    alarma_.sonar();
    inicioAlarma_ = millis();
    estado_ = Estado::ESPERANDO_CONFIRMACION;
  }

  void confirmar() {
    ultimaFeria_ = millis();
    alarma_.silenciar();
    evento("confirmada", compartimentoEnCurso_, etiquetaEnCurso_);
    if (!entregaLibre_) {
      plan_.marcarEntregada();
      if (!plan_.hayPendientes()) evento("sin_tomas", 0, "");
    }
    estado_ = Estado::ESPERANDO;
  }

  void entrarARevision(const String& motivo) {
    motivoRevision_ = motivo;
    estado_ = Estado::REVISION;
    ledRojo_.encender();
  }

  void salirDeRevision() {
    ledRojo_.apagar();
    evento("revisado", carrusel_.compartimento(), motivoRevision_);
    if (!carrusel_.tieneOrigen() && carrusel_.buscarOrigen()) {
      carrusel_.irACompartimento(plan_.compartimentoSiguiente() - 1);
    }
    estado_ = Estado::ESPERANDO;
  }

  // --------------------- Mensajes desde la nube ----------------------
  void alRecibirMensaje(const String& tema, const String& mensaje) {
    if (tema.endsWith("/plan")) {
      String error;
      if (plan_.aplicarNuevo(mensaje, error)) {
        alarma_.silenciar();
        ledRojo_.apagar();
        estado_ = Estado::ESPERANDO;
        carrusel_.irACompartimento(0);  // listo para cargar las pastillas
        evento("plan_recibido", 0, String(plan_.cantidad()) + " entregas");
        avisoHasta_ = millis() + 8000;
      } else if (error != "Plan viejo") {
        evento("plan_rechazado", 0, error);
      }
    } else if (tema.endsWith("/comando")) {
      JsonDocument doc;
      if (deserializeJson(doc, mensaje)) return;
      uint64_t version = doc["version"] | 0ULL;
      String accion = doc["accion"] | "";
      String texto = numeroATexto(version) + "|" + accion;
      if (version <= ultimoComando_ || !Firma::esValida(texto, doc["firma"] | (const char*)nullptr)) {
        evento("comando_rechazado", 0, accion);
        return;
      }
      ultimoComando_ = version;
      if (accion == "entregar_ahora" && estado_ == Estado::ESPERANDO) intentarEntrega(true);
      else if (accion == "silenciar" && estado_ == Estado::ESPERANDO_CONFIRMACION) confirmar();
      else if (accion == "buscar_origen" && estado_ == Estado::ESPERANDO) {
        carrusel_.buscarOrigen();
        carrusel_.irACompartimento(plan_.compartimentoSiguiente() - 1);
      }
    }
  }

  // ---------------------- Avisos a la nube ---------------------------
  void evento(const String& tipo, int compartimento, const String& etiqueta) {
    uint32_t ahora = reloj_.ahora();
    JsonDocument doc;
    doc["id"] = String(ID_DISPOSITIVO) + "-" + String(ahora) + "-" + String(contador_++);
    doc["t"] = ahora;
    doc["tipo"] = tipo;
    doc["compartimento"] = compartimento;
    doc["etiqueta"] = etiqueta;
    if (tipo == "entrega" || tipo == "confirmada" || tipo == "sin_confirmar") {
      if (!entregaLibre_ && plan_.siguiente()) doc["programada"] = plan_.siguiente()->hora;
    }
    String json;
    serializeJson(doc, json);
    conexion_.publicarEvento(json);
    ultimaTelemetria_ = millis() - (unsigned long)SEGUNDOS_TELEMETRIA * 1000UL;  // la pagina se entera al instante
    registro_.anotar(reloj_.fechaHoraTexto(ahora), tipo, compartimento, etiqueta);
    Serial.println("Evento: " + json);
  }

  void publicarTelemetria() {
    if (millis() - ultimaTelemetria_ < (unsigned long)SEGUNDOS_TELEMETRIA * 1000UL) return;
    ultimaTelemetria_ = millis();
    JsonDocument doc;
    doc["t"] = reloj_.ahora();
    if (ambiente_.tieneDatos()) {
      doc["temp"] = round(ambiente_.temperatura() * 10) / 10.0;
      doc["hum"] = round(ambiente_.humedad());
    }
    doc["tapa"] = tapa_.estaCerrada() ? "cerrada" : "abierta";
    doc["estado"] = nombreEstado();
    doc["compartimento"] = carrusel_.compartimento();
    doc["restantes"] = plan_.restantes();
    doc["planVersion"] = plan_.version();
    doc["sd"] = registro_.disponible();
    if (plan_.siguiente()) {
      doc["siguiente"] = plan_.siguiente()->hora;
      doc["siguienteEtiqueta"] = plan_.siguiente()->etiqueta;
    }
    String json;
    serializeJson(doc, json);
    conexion_.publicarTelemetria(json);
  }

  const char* nombreEstado() const {
    switch (estado_) {
      case Estado::TAPA_ABIERTA: return "tapa_abierta";
      case Estado::ESPERANDO_CONFIRMACION: return "esperando_confirmacion";
      case Estado::REVISION: return "revision";
      default: return "esperando";
    }
  }

  // ---------------------------- Pantalla -----------------------------
  void dibujarPantalla() {
    if (millis() - ultimaPantalla_ < 500) return;
    ultimaPantalla_ = millis();

    if (millis() < avisoHasta_) {
      pantalla_.mensaje("Plan nuevo", String(plan_.cantidad()) + " entregas", "Cargue las pastillas", "y cierre la tapa");
      return;
    }
    switch (estado_) {
      case Estado::ESPERANDO_CONFIRMACION:
        pantalla_.mensaje("Hora de", "tomar su medicina", "Compartimento " + String(compartimentoEnCurso_),
                          "Apriete CONFIRMAR");
        return;
      case Estado::TAPA_ABIERTA:
        pantalla_.mensaje("Cierre", "la tapa para", "entregar su toma");
        return;
      case Estado::REVISION:
        pantalla_.mensaje("Revisar", motivoRevision_, "Vea el vasito y", "apriete CONFIRMAR");
        return;
      default:
        break;
    }
    if (!reloj_.horaValida()) {
      pantalla_.mensaje("MediTrack", "Esperando la hora", conexion_.wifiListo() ? "Wi-Fi conectado" : "Conectando Wi-Fi");
      return;
    }
    String siguiente;
    if (plan_.cantidad() == 0) siguiente = "sin plan";
    else if (!plan_.hayPendientes()) siguiente = "RECARGAR";
    else siguiente = reloj_.horaTexto(plan_.siguiente()->hora) + " (C" + String(plan_.compartimentoSiguiente()) + ")";
    pantalla_.normal(reloj_.horaTexto(reloj_.ahora()), siguiente, plan_.restantes(), ambiente_.tieneDatos(),
                     ambiente_.temperatura(), ambiente_.humedad(), conexion_.enLinea());
  }

  // ---------------------------- Piezas -------------------------------
  Pantalla pantalla_;
  RelojRTC reloj_;
  SensorAmbiente ambiente_;
  Boton botonConfirmar_;
  Boton botonDemo_;
  SensorTapa tapa_;
  Led ledVerde_;
  Led ledRojo_;
  Alarma alarma_;
  Carrusel carrusel_;
  PlanTomas plan_;
  Registro registro_;
  Conexion conexion_;

  // ---------------------------- Estado -------------------------------
  Estado estado_ = Estado::ESPERANDO;
  bool tapaCerradaAntes_ = true;
  bool pidioHora_ = false;
  bool entregaLibre_ = false;
  bool adelantada_ = false;
  uint8_t compartimentoEnCurso_ = 0;
  String etiquetaEnCurso_;
  String motivoRevision_;
  unsigned long inicioAlarma_ = 0;
  unsigned long ultimaTelemetria_ = 0;
  unsigned long ultimaPantalla_ = 0;
  unsigned long avisoHasta_ = 0;
  unsigned long ultimaFeria_ = 0;
  uint64_t ultimoComando_ = 0;
  uint32_t contador_ = 0;
};
