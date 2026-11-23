const { Schema, model } = require('mongoose');

// Horarios programados por el cuidador. Se guarda un historial de planes.
const esquemaPlan = new Schema(
  {
    dispositivo: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    medicamentos: [
      {
        _id: false,
        nombre: String,
        primeraToma: Number, // segundos desde 1970
        cadaHoras: Number,
        horas: [Number],
      },
    ],
    entregas: [
      {
        _id: false,
        t: Number,
        etiqueta: String,
        compartimento: Number,
      },
    ],
  },
  { timestamps: { createdAt: 'creado', updatedAt: false }, versionKey: false },
);

esquemaPlan.index({ dispositivo: 1, version: -1 });

module.exports = model('Plan', esquemaPlan);
