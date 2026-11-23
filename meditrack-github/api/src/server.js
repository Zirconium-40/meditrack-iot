// Punto de arranque: conecta Mongo Atlas y HiveMQ, y abre la API.
const mongoose = require('mongoose');
const config = require('./config');
const crearApp = require('./app');
const Firmador = require('./servicios/Firmador');
const GeneradorPlan = require('./servicios/GeneradorPlan');
const ServicioMqtt = require('./servicios/ServicioMqtt');
const ServicioPastillero = require('./servicios/ServicioPastillero');
const ControladorPastillero = require('./controladores/ControladorPastillero');
const { GuardiaPin } = require('./middlewares/seguridad');
const modelos = {
  Evento: require('./modelos/Evento'),
  Telemetria: require('./modelos/Telemetria'),
  Plan: require('./modelos/Plan'),
};

async function arrancar() {
  await mongoose.connect(config.mongoUri);
  console.log('Mongo Atlas conectado');

  const mqtt = new ServicioMqtt({
    url: config.mqttUrl,
    prefijo: config.prefijoTemas,
    dispositivos: config.dispositivos,
  }).conectar();

  const servicio = new ServicioPastillero({
    modelos,
    mqtt,
    firmador: new Firmador(config.claveFirma),
    generador: new GeneradorPlan({ maxEntregas: config.maxEntregas }),
    dispositivos: config.dispositivos,
  });
  servicio.iniciar();

  const app = crearApp({
    controlador: new ControladorPastillero(servicio),
    guardiaPin: new GuardiaPin(config.pinCuidador),
    corsOrigen: config.corsOrigen,
    salud: () => ({
      ok: true,
      mqtt: mqtt.estaConectado() ? 'conectado' : 'desconectado',
      baseDeDatos: mongoose.connection.readyState === 1 ? 'conectada' : 'desconectada',
      dispositivos: config.dispositivos,
      hora: new Date().toISOString(),
    }),
  });

  app.listen(config.puerto, () => console.log(`API lista en el puerto ${config.puerto}`));
}

arrancar().catch((error) => {
  console.error('No se pudo arrancar la API:', error.message);
  process.exit(1);
});
