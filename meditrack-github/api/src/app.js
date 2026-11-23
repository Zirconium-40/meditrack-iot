const express = require('express');
const cors = require('cors');
const crearRutas = require('./rutas');
const { manejarErrores } = require('./middlewares/seguridad');

// Arma la aplicacion Express. Recibe sus piezas ya creadas (facil de probar).
function crearApp({ controlador, guardiaPin, salud, corsOrigen = ['*'] }) {
  const app = express();
  app.set('trust proxy', 1); // Render pasa la IP real en un encabezado
  app.use(cors({ origin: corsOrigen.includes('*') ? true : corsOrigen }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/', (_req, res) =>
    res.json({ nombre: 'MediTrack IoT API', documentacion: 'Vea /api/salud y el manual del proyecto.' }),
  );
  app.use('/api', crearRutas({ controlador, guardiaPin, salud }));
  app.use((_req, res) => res.status(404).json({ error: 'Esa ruta no existe en la API.' }));
  app.use(manejarErrores);
  return app;
}

module.exports = crearApp;
