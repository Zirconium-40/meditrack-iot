const express = require('express');
const { atrapar } = require('./middlewares/seguridad');

/**
 * Rutas de la API REST (todas empiezan con /api)
 *
 *  GET  /api/salud                               estado de la API
 *  POST /api/acceso                              comprueba el PIN
 *  GET  /api/dispositivos/:id/estado             ultima lectura y si esta en linea
 *  GET  /api/dispositivos/:id/telemetria?horas=  temperatura y humedad (promedios)
 *  GET  /api/dispositivos/:id/eventos?limite=&tipos=&desde=&hasta=
 *  GET  /api/dispositivos/:id/resumen?dias=      tomas confirmadas y sin confirmar
 *  GET  /api/dispositivos/:id/plan               horarios vigentes
 *  POST /api/plan/vista-previa                   calcula las entregas sin guardar
 *  PUT  /api/dispositivos/:id/plan       (PIN)   guarda y manda los horarios
 *  POST /api/dispositivos/:id/comandos   (PIN)   entregar_ahora | silenciar | buscar_origen
 */
function crearRutas({ controlador, guardiaPin, salud }) {
  const r = express.Router();

  r.get('/salud', (_req, res) => res.json(salud()));
  r.post('/acceso', guardiaPin.middleware, (_req, res) => res.json({ valido: true }));

  r.get('/dispositivos/:id/estado', atrapar(controlador.estado));
  r.get('/dispositivos/:id/telemetria', atrapar(controlador.telemetria));
  r.get('/dispositivos/:id/eventos', atrapar(controlador.eventos));
  r.get('/dispositivos/:id/resumen', atrapar(controlador.resumen));
  r.get('/dispositivos/:id/plan', atrapar(controlador.plan));

  r.post('/plan/vista-previa', atrapar(controlador.vistaPrevia));
  r.put('/dispositivos/:id/plan', guardiaPin.middleware, atrapar(controlador.programar));
  r.post('/dispositivos/:id/comandos', guardiaPin.middleware, atrapar(controlador.comando));

  return r;
}

module.exports = crearRutas;
