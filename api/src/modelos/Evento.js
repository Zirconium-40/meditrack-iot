const { Schema, model } = require('mongoose');

// Cada cosa que pasa en el pastillero: entrega, confirmada, tapa abierta...
const esquemaEvento = new Schema(
  {
    dispositivo: { type: String, required: true, index: true },
    idEvento: { type: String, required: true, unique: true }, // evita guardar dos veces el mismo
    t: { type: Date, required: true },
    tipo: { type: String, required: true },
    compartimento: { type: Number, default: 0 },
    etiqueta: { type: String, default: '' },
    programada: { type: Date },
  },
  { timestamps: { createdAt: 'recibido', updatedAt: false }, versionKey: false },
);

esquemaEvento.index({ dispositivo: 1, t: -1 });

module.exports = model('Evento', esquemaEvento);
