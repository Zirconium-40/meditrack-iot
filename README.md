# MediTrack IoT

Pastillero programable de 12 compartimentos con ESP32. Entrega la dosis a su hora, avisa con sonido y luz, y registra si la persona confirmó la toma. Un panel web pensado para personas mayores muestra todo en vivo y permite programar los horarios.

```
Pastillero (ESP32) ──MQTT──> HiveMQ (público) ──WebSocket──> Página web (GitHub Pages)
                                   │                               │
                                   └──MQTT──> API REST (Render) <──REST┘
                                                  │
                                              Mongo Atlas
```

## Carpetas

| Carpeta | Qué tiene |
| --- | --- |
| `firmware/meditrack/` | Programa del ESP32 para Arduino IDE (orientado a objetos). En `config.h`: `MODO_FERIA true` (gira cada minuto) o `false` (horarios) |
| `prueba-protoboard/` y `prueba-servo/` | Programas cortos para probar las conexiones y el servo |
| `api/` | API REST en Node.js con Express, MQTT.js y Mongoose |
| `docs/` | Página web estática (GitHub Pages publica esta carpeta) |

## Valores que tienen que coincidir

| Valor | ESP32 (`config.h`) | API (Render) | Página (`docs/js/config.js`) |
| --- | --- | --- | --- |
| ID del pastillero | `ID_DISPOSITIVO` | `DISPOSITIVOS` | `ID_DISPOSITIVO` |
| Clave de firma | `CLAVE_FIRMA` | `CLAVE_FIRMA` | (nunca va aquí) |
| PIN del cuidador | — | `PIN_CUIDADOR` | lo escribe el cuidador |
| Dirección de la API | — | — | `API_URL` |

## Probar rápido

- Página con datos de ejemplo: abran `docs/index.html` con un servidor local y agreguen `?demo=1` a la dirección. PIN de ejemplo: `2468`.
- Pruebas de la API (sin internet): `cd api && npm install && npm test`.

El paso a paso completo está en el **Manual de usuario e instalación**.
