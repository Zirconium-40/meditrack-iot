// =====================================================================
//  MediTrack IoT - PROGRAMA COMPLETO EN UN SOLO ARCHIVO
//  Pegar en un sketch nuevo de Arduino IDE y subir al ESP32.
//  Librerias: PubSubClient, ArduinoJson (v7), RTClib, Adafruit SSD1306,
//  Adafruit GFX Library, DHT sensor library, Adafruit Unified Sensor,
//  ESP32Servo
// =====================================================================


// ##################### config.h #####################

// =====================================================================
//  MediTrack IoT - Configuracion
//  Aqui se cambia TODO lo que depende de su equipo. El resto de los
//  archivos normalmente no se tiene que tocar.
// =====================================================================
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


// ##################### Hardware.h #####################

// =====================================================================
//  MediTrack IoT - Clases para cada pieza del hardware
//  Cada clase se encarga de UNA pieza: asi el programa principal solo
//  da ordenes sencillas ("enciende la alarma", "lee la temperatura").
// =====================================================================
#include <Arduino.h>
#include <Wire.h>
#include <RTClib.h>
#include <DHT.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>   // ESP32PWM: tono del buzzer sin chocar con el servo
#include <time.h>
#include <sys/time.h>
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


// ##################### Carrusel.h #####################

// =====================================================================
//  MediTrack IoT - Carrusel con SERVO de 180 grados
//
//  - 9 compartimentos de 22.5 grados: el 0 (vacio, sobre el agujero)
//    queda en 0 grados y el 8 en 180 grados.
//  - El servo sabe en que angulo esta, asi que no necesita sensor
//    optico. La ultima posicion se guarda en la memoria interna para que
//    al encender no de un brinco.
//  - Se mueve grado por grado para que el disco gire suave y las
//    pastillas no salten.
//
//  Libreria: ESP32Servo (de Kevin Harrington / madhephaestus)
// =====================================================================
#include <Arduino.h>
#include <ESP32Servo.h>
#include <Preferences.h>
class Carrusel {
 public:
  void iniciar() {
    memoria_.begin("carrusel", false);
    compartimento_ = memoria_.getUChar("comp", 0);
    if (compartimento_ >= COMPARTIMENTOS) compartimento_ = 0;
    angulo_ = anguloDe(compartimento_);
    servo_.setPeriodHertz(50);
    // Al arrancar NO se mueve el servo: el Wi-Fi y el servo juntos piden
    // mas corriente de la que da el USB y el ESP32 se reiniciaria.
    // Solo se recuerda donde quedo; se mueve hasta la primera entrega.
  }

  // Con el servo no hay que buscar el origen: siempre sabe donde esta.
  bool buscarOrigen() { return true; }
  bool tieneOrigen() const { return true; }

  // Lleva el compartimento n (0..8) sobre el agujero de salida.
  void irACompartimento(uint8_t n) {
    if (n >= COMPARTIMENTOS) n = COMPARTIMENTOS - 1;
    float objetivo = anguloDe(n);
    conectar();
    float paso = (objetivo > angulo_) ? 1.0f : -1.0f;
    while (fabsf(objetivo - angulo_) > 1.0f) {
      angulo_ += paso;
      escribir(angulo_);
      delay(SERVO_MS_POR_GRADO);
    }
    angulo_ = objetivo;
    escribir(angulo_);
    delay(300);
    desconectar();  // sin senal no zumba ni se calienta
    compartimento_ = n;
    memoria_.putUChar("comp", n);
  }

  uint8_t compartimento() const { return compartimento_; }

 private:
  static float anguloDe(uint8_t n) { return n * GRADOS_POR_COMPARTIMENTO; }

  void conectar() {
    if (!servo_.attached()) servo_.attach(PIN_SERVO, SERVO_PULSO_MIN, SERVO_PULSO_MAX);
  }
  void desconectar() {
    if (servo_.attached()) servo_.detach();
  }

  // Angulo con decimales (22.5) convertido a microsegundos
  void escribir(float grados) {
    if (grados < 0) grados = 0;
    if (grados > 180) grados = 180;
    int us = SERVO_PULSO_MIN + (int)((SERVO_PULSO_MAX - SERVO_PULSO_MIN) * grados / 180.0f);
    servo_.writeMicroseconds(us);
  }

  Servo servo_;
  Preferences memoria_;
  uint8_t compartimento_ = 0;
  float angulo_ = 0;
};


// ##################### Datos.h #####################

// =====================================================================
//  MediTrack IoT - Datos: plan de tomas, firma de seguridad y registro
// =====================================================================
#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <SD.h>
#include "mbedtls/md.h"
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


// ##################### Conexion.h #####################

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
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <functional>
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


// ##################### MediTrack.h #####################

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
#include <Arduino.h>
#include <ArduinoJson.h>
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


// ##################### Programa principal #####################

MediTrack pastillero;

void setup() {
  pastillero.iniciar();
}

void loop() {
  pastillero.actualizar();
  delay(5);
}
