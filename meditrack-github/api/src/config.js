// Lee la configuracion de las variables de entorno (.env o Render).
require('dotenv').config();

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Revisen el archivo .env o Render > Environment.`);
  }
  return valor;
}

const config = {
  puerto: Number(process.env.PORT) || 3000,
  mongoUri: requerida('MONGODB_URI'),
  mqttUrl: process.env.MQTT_URL || 'mqtt://broker.hivemq.com:1883',
  dispositivos: (process.env.DISPOSITIVOS || 'meditrack-demo-01')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean),
  claveFirma: requerida('CLAVE_FIRMA'),
  pinCuidador: requerida('PIN_CUIDADOR'),
  corsOrigen: (process.env.CORS_ORIGEN || '*').split(',').map((o) => o.trim()),
  prefijoTemas: 'meditrack/v1',
  maxEntregas: Number(process.env.MAX_ENTREGAS) || 8, // servo: 9 compartimentos, el 0 vacio
  diasTelemetria: 30,
};

module.exports = config;
