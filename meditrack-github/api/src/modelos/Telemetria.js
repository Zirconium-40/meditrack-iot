const { Schema, model } = require('mongoose');
const config = require('../config');

// Lecturas periodicas: temperatura, humedad, tapa, compartimento...
const esquemaTelemetria = new Schema(
  {
    dispositivo: { type: String, required: true },
    t: { type: Date, required: true },
    temp: Number,
    hum: Number,
    tapa: String,
    estado: String,
    compartimento: Number,
    restantes: Number,
    siguiente: Date,
    siguienteEtiqueta: String,
  },
  { versionKey: false },
);

esquemaTelemetria.index({ dispositivo: 1, t: -1 });
// Se borran solas despues de 30 dias para no llenar el plan gratis de Atlas
esquemaTelemetria.index({ t: 1 }, { expireAfterSeconds: config.diasTelemetria * 24 * 3600 });

module.exports = model('Telemetria', esquemaTelemetria, 'telemetria');
