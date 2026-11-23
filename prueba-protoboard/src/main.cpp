// =====================================================================
//  MediTrack IoT - PRUEBA DE PROTOBOARD (noche del jueves)
//  Prueba botones, "tapa", LEDs, zumbador y microSD, sin el resto.
//
//  Abran el Monitor Serie a 115200 y prueben:
//   - Boton CONFIRMAR (GPIO 25): enciende el LED verde y pita.
//   - Boton DEMO (GPIO 34): prende y apaga el LED rojo.
//   - Cable GPIO 32 a GND puesto = "tapa cerrada"; quitado = "abierta".
//
//  En Arduino IDE: copien esto en un sketch nuevo (sin el #include).
// =====================================================================
#include <Arduino.h>
#include <SPI.h>
#include <SD.h>

#define PIN_BOTON_CONFIRMA 25
#define PIN_BOTON_DEMO     34   // necesita resistencia de 10k a 3.3V
#define PIN_REED           32
#define PIN_ZUMBADOR       26
#define PIN_LED_VERDE       2
#define PIN_LED_ROJO        5
#define PIN_SD_SCK         18
#define PIN_SD_MISO        19
#define PIN_SD_MOSI        23
#define PIN_SD_CS          27

// Si el zumbador suena sin parar al encender, cambien a true
#define ZUMBADOR_INVERTIDO false

void zumbador(bool encendido) {
  digitalWrite(PIN_ZUMBADOR, (encendido != ZUMBADOR_INVERTIDO) ? HIGH : LOW);
}

void probarMicroSD() {
  SPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  if (!SD.begin(PIN_SD_CS)) {
    Serial.println("microSD: NO se encontro. Revise VCC (5V si su modulo trae regulador), CS en GPIO 27 y que la tarjeta este en FAT32.");
    return;
  }
  File f = SD.open("/prueba.txt", FILE_APPEND);
  if (f) { f.println("Hola desde MediTrack"); f.close(); }
  Serial.println("microSD: OK, se escribio prueba.txt");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Prueba de protoboard MediTrack ===");
  pinMode(PIN_BOTON_CONFIRMA, INPUT_PULLUP);
  pinMode(PIN_BOTON_DEMO, INPUT);
  pinMode(PIN_REED, INPUT_PULLUP);
  pinMode(PIN_ZUMBADOR, OUTPUT);
  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_ROJO, OUTPUT);
  zumbador(false);

  // Saludo: los dos LEDs y un pitido corto
  digitalWrite(PIN_LED_VERDE, HIGH);
  digitalWrite(PIN_LED_ROJO, HIGH);
  zumbador(true);
  delay(300);
  zumbador(false);
  digitalWrite(PIN_LED_VERDE, LOW);
  digitalWrite(PIN_LED_ROJO, LOW);

  probarMicroSD();
}

void loop() {
  static bool rojo = false;
  static bool demoAntes = HIGH;
  static unsigned long ultimoReporte = 0;

  bool confirma = digitalRead(PIN_BOTON_CONFIRMA) == LOW;
  bool demo = digitalRead(PIN_BOTON_DEMO);
  bool tapaCerrada = digitalRead(PIN_REED) == LOW;

  // Mientras se aprieta CONFIRMAR: LED verde y zumbador
  digitalWrite(PIN_LED_VERDE, confirma ? HIGH : LOW);
  zumbador(confirma);

  // Cada vez que se aprieta DEMO cambia el LED rojo
  if (demoAntes == HIGH && demo == LOW) {
    rojo = !rojo;
    digitalWrite(PIN_LED_ROJO, rojo ? HIGH : LOW);
    delay(40);  // evita rebotes
  }
  demoAntes = demo;

  if (millis() - ultimoReporte > 500) {
    ultimoReporte = millis();
    Serial.printf("Confirmar: %-8s | Demo: %-8s | Tapa: %s\n",
                  confirma ? "APRETADO" : "suelto",
                  demo == LOW ? "APRETADO" : "suelto",
                  tapaCerrada ? "cerrada" : "ABIERTA");
  }
}
