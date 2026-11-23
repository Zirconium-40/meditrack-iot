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
#pragma once
#include <Arduino.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include "config.h"

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
