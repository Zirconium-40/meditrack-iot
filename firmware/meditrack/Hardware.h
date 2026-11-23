// =====================================================================
//  MediTrack IoT - Clases para cada pieza del hardware
//  Cada clase se encarga de UNA pieza: asi el programa principal solo
//  da ordenes sencillas ("enciende la alarma", "lee la temperatura").
// =====================================================================
#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <RTClib.h>
#include <DHT.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>   // ESP32PWM: tono del buzzer sin chocar con el servo
#include <time.h>
#include <sys/time.h>
#include "config.h"

// ---------------------------------------------------------------------
// Boton: detecta una pulsacion limpia (sin rebotes).
// Funciona con resistencia pull-up: suelto = 1, apretado = 0.
// ---------------------------------------------------------------------
class Boton {
 public:
  Boton(uint8_t pin, bool pullupInterno) : pin_(pin), pullup_(pullupInterno) {}

  void iniciar() {
    pinMode(pin_, pullup_ ? INPUT_PULLUP : INPUT);
    ultimoEstable_ = digitalRead(pin_);
    ultimaLectura_ = ultimoEstable_;
  }

  // Devuelve true UNA sola vez cada vez que se aprieta el boton.
  bool fuePresionado() {
    bool lectura = digitalRead(pin_);
    if (lectura != ultimaLectura_) {
      ultimaLectura_ = lectura;
      cambio_ = millis();
    }
    if (millis() - cambio_ > 40 && lectura != ultimoEstable_) {
      ultimoEstable_ = lectura;
      return ultimoEstable_ == LOW;
    }
    return false;
  }

 private:
  uint8_t pin_;
  bool pullup_;
  bool ultimoEstable_ = HIGH;
  bool ultimaLectura_ = HIGH;
  unsigned long cambio_ = 0;
};

// ---------------------------------------------------------------------
// SensorTapa: el reed se cierra cuando el iman de la tapa esta cerca.
// ---------------------------------------------------------------------
class SensorTapa {
 public:
  explicit SensorTapa(uint8_t pin) : pin_(pin) {}
  void iniciar() { pinMode(pin_, INPUT_PULLUP); }
  bool estaCerrada() const { return digitalRead(pin_) == LOW; }
 private:
  uint8_t pin_;
};

// ---------------------------------------------------------------------
// Led: encendido, apagado o parpadeando.
// ---------------------------------------------------------------------
class Led {
 public:
  explicit Led(uint8_t pin) : pin_(pin) {}
  void iniciar() { pinMode(pin_, OUTPUT); apagar(); }
  void encender() { modo_ = 1; digitalWrite(pin_, HIGH); }
  void apagar()   { modo_ = 0; digitalWrite(pin_, LOW); }
  void parpadear() { modo_ = 2; }
  void actualizar() {
    if (modo_ == 2) digitalWrite(pin_, (millis() / 400) % 2);
  }
 private:
  uint8_t pin_;
  uint8_t modo_ = 0;
};

// ---------------------------------------------------------------------
// Alarma: zumbador con pitidos intermitentes + LED verde parpadeando.
// ---------------------------------------------------------------------
class Alarma {
 public:
  Alarma(uint8_t pinZumbador, Led& ledVerde) : pin_(pinZumbador), led_(ledVerde) {}

  void iniciar() {
#if ZUMBADOR_PASIVO
    // Temporizador propio para el tono (el servo usa otro).
    // tone() chocaba con el servo: lo hacia moverse raro.
    pwm_.attachPin(pin_, 2000, 10);
    pwm_.writeScaled(0.0);
#else
    pinMode(pin_, OUTPUT);
#endif
    silenciar();
  }

  void sonar() { activa_ = true; led_.parpadear(); }

  void silenciar() {
    activa_ = false;
    sonando_ = false;
    escribir(false);
    led_.apagar();
  }

  bool estaActiva() const { return activa_; }

  void actualizar() {
    led_.actualizar();
    if (!activa_) return;
    // 0.5 s sonando, 0.5 s en silencio
    bool debeSonar = (millis() / 500) % 2 == 0;
    if (debeSonar != sonando_) {
      sonando_ = debeSonar;
      escribir(sonando_);
    }
  }

 private:
  void escribir(bool encendido) {
#if ZUMBADOR_PASIVO
    pwm_.writeScaled(encendido ? 0.5 : 0.0);
#else
    digitalWrite(pin_, (encendido != ZUMBADOR_INVERTIDO) ? HIGH : LOW);
#endif
  }
  uint8_t pin_;
  Led& led_;
#if ZUMBADOR_PASIVO
  ESP32PWM pwm_;
#endif
  bool activa_ = false;
  bool sonando_ = false;
};

// ---------------------------------------------------------------------
// SensorAmbiente: temperatura y humedad (DHT11).
// El DHT necesita al menos 2 segundos entre lecturas.
// ---------------------------------------------------------------------
class SensorAmbiente {
 public:
  SensorAmbiente() : dht_(PIN_DHT, TIPO_DHT) {}
  void iniciar() { dht_.begin(); }

  void actualizar() {
    if (millis() - ultima_ < 2500) return;
    ultima_ = millis();
    float t = dht_.readTemperature();
    float h = dht_.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      temperatura_ = t;
      humedad_ = h;
      valido_ = true;
    }
  }

  bool tieneDatos() const { return valido_; }
  float temperatura() const { return temperatura_; }
  float humedad() const { return humedad_; }

 private:
  DHT dht_;
  unsigned long ultima_ = 0;
  float temperatura_ = 0, humedad_ = 0;
  bool valido_ = false;
};

// ---------------------------------------------------------------------
// RelojRTC: guarda la hora en UTC. Si hay internet la corrige con NTP.
// ---------------------------------------------------------------------
class RelojRTC {
 public:
  void iniciar() {
    setenv("TZ", ZONA_HORARIA, 1);
    tzset();
    disponible_ = rtc_.begin();
    if (disponible_) {
      DateTime ahora = rtc_.now();
      if (ahora.year() >= 2024) {
        struct timeval tv = {(time_t)ahora.unixtime(), 0};
        settimeofday(&tv, nullptr);
      }
    }
  }

  // Se llama cuando ya hay Wi-Fi: pide la hora a internet.
  void sincronizarConInternet() {
    configTzTime(ZONA_HORARIA, "pool.ntp.org", "time.google.com");
    pidioNtp_ = true;
  }

  void actualizar() {
    // Cuando NTP ya dio una hora valida, se copia al RTC una vez por hora
    if (!pidioNtp_ || !disponible_) return;
    time_t t = time(nullptr);
    if (t > 1700000000 && (!copiado_ || millis() - ultimaCopia_ > 3600000UL)) {
      rtc_.adjust(DateTime((uint32_t)t));
      ultimaCopia_ = millis();
      copiado_ = true;
    }
  }

  bool horaValida() const { return time(nullptr) > 1700000000; }
  uint32_t ahora() const { return (uint32_t)time(nullptr); }

  // Texto "14:05" en hora local
  String horaTexto(uint32_t epoch) const {
    time_t t = epoch;
    struct tm local;
    localtime_r(&t, &local);
    char buf[8];
    snprintf(buf, sizeof(buf), "%02d:%02d", local.tm_hour, local.tm_min);
    return String(buf);
  }

  // Texto "2026-11-21 14:05:09" para el registro de la microSD
  String fechaHoraTexto(uint32_t epoch) const {
    time_t t = epoch;
    struct tm local;
    localtime_r(&t, &local);
    char buf[24];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &local);
    return String(buf);
  }

 private:
  RTC_DS3231 rtc_;
  bool disponible_ = false;
  bool pidioNtp_ = false;
  bool copiado_ = false;
  unsigned long ultimaCopia_ = 0;
};

// ---------------------------------------------------------------------
// Pantalla OLED 128x64. La fuente basica no tiene acentos.
// ---------------------------------------------------------------------
class Pantalla {
 public:
  Pantalla() : oled_(128, 64, &Wire, -1) {}

  bool iniciar() {
    ok_ = oled_.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    if (ok_) {
      oled_.clearDisplay();
      oled_.setTextColor(SSD1306_WHITE);
      mensaje("MediTrack IoT", "Iniciando...");
    }
    return ok_;
  }

  // Pantalla normal: hora grande, siguiente toma y ambiente
  void normal(const String& hora, const String& siguiente, int restantes,
              bool hayAmbiente, float temp, float hum, bool enLinea) {
    if (!ok_) return;
    oled_.clearDisplay();
    oled_.setTextSize(3);
    oled_.setCursor(19, 0);
    oled_.print(hora);
    oled_.setTextSize(1);
    oled_.setCursor(0, 28);
    oled_.print("Sig: ");
    oled_.print(siguiente);
    oled_.setCursor(0, 40);
    oled_.print("Quedan: ");
    oled_.print(restantes);
    oled_.setCursor(0, 54);
    if (hayAmbiente) {
      oled_.print(temp, 1);
      oled_.print("C ");
      oled_.print(hum, 0);
      oled_.print("%");
    } else {
      oled_.print("Sin sensor");
    }
    oled_.setCursor(92, 54);
    oled_.print(enLinea ? "Wi-Fi" : "Local");
    oled_.display();
  }

  void mensaje(const String& titulo, const String& linea1,
               const String& linea2 = "", const String& linea3 = "") {
    if (!ok_) return;
    oled_.clearDisplay();
    oled_.setTextSize(2);
    oled_.setCursor(0, 0);
    oled_.print(titulo);
    oled_.setTextSize(1);
    oled_.setCursor(0, 32);
    oled_.print(linea1);
    oled_.setCursor(0, 44);
    oled_.print(linea2);
    oled_.setCursor(0, 56);
    oled_.print(linea3);
    oled_.display();
  }

 private:
  Adafruit_SSD1306 oled_;
  bool ok_ = false;
};
