// =====================================================================
//  MediTrack IoT - Datos: plan de tomas, firma de seguridad y registro
// =====================================================================
#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <SD.h>
#include "mbedtls/md.h"
#include "config.h"

// ---------------------------------------------------------------------
// Firma: comprueba que un mensaje lo mando NUESTRA API y no un extrano.
// Usa HMAC-SHA256 con la clave secreta CLAVE_FIRMA.
// ---------------------------------------------------------------------
class Firma {
 public:
  static String calcular(const String& texto) {
    uint8_t salida[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char*)CLAVE_FIRMA, strlen(CLAVE_FIRMA));
    mbedtls_md_hmac_update(&ctx, (const unsigned char*)texto.c_str(), texto.length());
    mbedtls_md_hmac_finish(&ctx, salida);
    mbedtls_md_free(&ctx);
    char hex[65];
    for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", salida[i]);
    hex[64] = 0;
    return String(hex);
  }

  static bool esValida(const String& texto, const char* firmaRecibida) {
    if (!firmaRecibida) return false;
    return calcular(texto).equalsIgnoreCase(firmaRecibida);
  }
};

// Convierte un numero de 64 bits a texto (String no lo hace solo)
inline String numeroATexto(uint64_t n) {
  char buf[24];
  snprintf(buf, sizeof(buf), "%llu", (unsigned long long)n);
  return String(buf);
}

// ---------------------------------------------------------------------
// PlanTomas: la lista de entregas programadas y cual sigue.
// Se guarda en la memoria interna del ESP32, asi sobrevive a un apagon.
// ---------------------------------------------------------------------
struct Entrega {
  uint32_t hora;        // segundos desde 1970 (UTC)
  char etiqueta[40];    // por ejemplo "Medicamento A + B"
};

class PlanTomas {
 public:
  void iniciar() {
    memoria_.begin("meditrack", false);
    String guardado = memoria_.getString("plan", "");
    if (guardado.length() > 0) {
      String error;
      leerJson(guardado, false, error);
    }
    indice_ = memoria_.getUChar("indice", 0);
    if (indice_ > cantidad_) indice_ = cantidad_;
  }

  // Recibe un plan nuevo de la API. Devuelve true si se acepto.
  bool aplicarNuevo(const String& json, String& error) {
    if (!leerJson(json, true, error)) return false;
    memoria_.putString("plan", json);
    indice_ = 0;
    memoria_.putUChar("indice", 0);
    return true;
  }

  bool hayPendientes() const { return indice_ < cantidad_; }
  const Entrega* siguiente() const { return hayPendientes() ? &entregas_[indice_] : nullptr; }
  uint8_t compartimentoSiguiente() const { return indice_ + 1; }  // el 0 va vacio
  uint8_t restantes() const { return cantidad_ - indice_; }
  uint8_t cantidad() const { return cantidad_; }
  uint64_t version() const { return version_; }

  void marcarEntregada() {
    if (indice_ < cantidad_) indice_++;
    memoria_.putUChar("indice", indice_);
  }

  // Bandera para detectar un corte de luz a mitad de un giro
  void marcarGirando(bool girando) { memoria_.putBool("girando", girando); }
  bool seCortoGirando() { return memoria_.getBool("girando", false); }

 private:
  bool leerJson(const String& json, bool verificar, String& error) {
    JsonDocument doc;
    if (deserializeJson(doc, json)) { error = "JSON invalido"; return false; }

    uint64_t version = doc["version"] | 0ULL;
    JsonArray lista = doc["entregas"].as<JsonArray>();
    if (lista.isNull()) { error = "Falta la lista de entregas"; return false; }
    if (lista.size() > MAX_ENTREGAS) { error = "Demasiadas entregas"; return false; }

    // Texto que se firma: version|hora:etiqueta;hora:etiqueta;...
    String texto = numeroATexto(version) + "|";
    bool primera = true;
    for (JsonObject e : lista) {
      if (!primera) texto += ";";
      primera = false;
      texto += numeroATexto(e["t"] | 0UL);
      texto += ":";
      texto += (const char*)(e["etiqueta"] | "");
    }

    if (verificar) {
      if (!Firma::esValida(texto, doc["firma"] | (const char*)nullptr)) {
        error = "Firma incorrecta";
        return false;
      }
      if (version <= version_) { error = "Plan viejo"; return false; }
    }

    cantidad_ = 0;
    for (JsonObject e : lista) {
      entregas_[cantidad_].hora = e["t"] | 0UL;
      strlcpy(entregas_[cantidad_].etiqueta, e["etiqueta"] | "", sizeof(entregas_[cantidad_].etiqueta));
      cantidad_++;
    }
    version_ = version;
    return true;
  }

  Preferences memoria_;
  Entrega entregas_[MAX_ENTREGAS];
  uint8_t cantidad_ = 0;
  uint8_t indice_ = 0;
  uint64_t version_ = 0;
};

// ---------------------------------------------------------------------
// Registro: bitacora en la microSD (archivo registro.csv).
// Si no hay tarjeta, el sistema sigue funcionando sin ella.
// ---------------------------------------------------------------------
class Registro {
 public:
  bool iniciar() {
    SPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
    ok_ = SD.begin(PIN_SD_CS);
    if (ok_ && !SD.exists("/registro.csv")) {
      File f = SD.open("/registro.csv", FILE_WRITE);
      if (f) { f.println("fecha_hora,tipo,compartimento,etiqueta"); f.close(); }
    }
    return ok_;
  }

  void anotar(const String& fechaHora, const String& tipo, int compartimento, const String& etiqueta) {
    if (!ok_) return;
    File f = SD.open("/registro.csv", FILE_APPEND);
    if (!f) return;
    f.printf("%s,%s,%d,%s\n", fechaHora.c_str(), tipo.c_str(), compartimento, etiqueta.c_str());
    f.close();
  }

  bool disponible() const { return ok_; }

 private:
  bool ok_ = false;
};
