// MediTrack IoT - PRUEBA DEL SERVO (9 compartimentos de 22.5 grados)
// Naranja -> S de D13, Rojo -> 5V, Cafe -> GND. Libreria: ESP32Servo.
// Cada vez que se aprieta el boton amarillo (D34) avanza un compartimento.
// El Monitor Serie (115200) dice en que compartimento queda: numerenlos asi.
#include <ESP32Servo.h>

#define PIN_SERVO      13
#define PIN_BOTON_DEMO 34
#define PULSO_MIN     500
#define PULSO_MAX    2400

Servo servo;
float angulo = 0;
int compartimento = 0;

void escribir(float g) {
  servo.writeMicroseconds(PULSO_MIN + (int)((PULSO_MAX - PULSO_MIN) * g / 180.0f));
}

void moverA(float objetivo) {
  servo.attach(PIN_SERVO, PULSO_MIN, PULSO_MAX);
  while (fabsf(objetivo - angulo) > 1.0f) {
    angulo += (objetivo > angulo) ? 1.0f : -1.0f;
    escribir(angulo);
    delay(15);
  }
  angulo = objetivo;
  escribir(angulo);
  delay(300);
  servo.detach();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOTON_DEMO, INPUT);
  servo.setPeriodHertz(50);
  Serial.println("Prueba del servo: va al compartimento 0 (0 grados)");
  moverA(0);
}

void loop() {
  if (digitalRead(PIN_BOTON_DEMO) == LOW) {
    compartimento = (compartimento + 1) % 9;   // 0..8, despues regresa a 0
    moverA(compartimento * 22.5f);
    Serial.printf("Compartimento %d (%.1f grados)\n", compartimento, angulo);
    while (digitalRead(PIN_BOTON_DEMO) == LOW) delay(10);  // espera a soltar
    delay(50);
  }
}
