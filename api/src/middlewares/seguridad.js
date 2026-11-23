const crypto = require('crypto');
const ErrorApi = require('../utilidades/ErrorApi');

/**
 * Protege las acciones que cambian el pastillero (programar, comandos).
 * La pagina manda el PIN del cuidador en el encabezado "x-pin".
 * Tras 5 intentos fallidos desde la misma conexion se bloquea 5 minutos.
 */
class GuardiaPin {
  constructor(pinCorrecto, { intentos = 5, minutosBloqueo = 5 } = {}) {
    this.pin = Buffer.from(String(pinCorrecto));
    this.intentos = intentos;
    this.bloqueoMs = minutosBloqueo * 60 * 1000;
    this.fallos = new Map(); // ip -> { n, hasta }
    this.middleware = this.middleware.bind(this);
  }

  esCorrecto(pin) {
    const recibido = Buffer.from(String(pin ?? ''));
    return recibido.length === this.pin.length && crypto.timingSafeEqual(recibido, this.pin);
  }

  middleware(req, _res, siguiente) {
    const ip = req.ip;
    const registro = this.fallos.get(ip);
    if (registro?.hasta && registro.hasta > Date.now()) {
      return siguiente(new ErrorApi(429, 'Demasiados intentos. Espere 5 minutos y vuelva a intentar.'));
    }
    if (this.esCorrecto(req.get('x-pin'))) {
      this.fallos.delete(ip);
      return siguiente();
    }
    const n = (registro?.n || 0) + 1;
    this.fallos.set(ip, { n, hasta: n >= this.intentos ? Date.now() + this.bloqueoMs : null });
    return siguiente(new ErrorApi(401, 'El PIN no es correcto.'));
  }
}

// Envuelve funciones async para que sus errores lleguen al middleware de errores
const atrapar = (fn) => (req, res, siguiente) => Promise.resolve(fn(req, res, siguiente)).catch(siguiente);

// Respuesta de error con un mensaje claro para mostrar en la pagina
function manejarErrores(error, _req, res, _siguiente) {
  const estado = error.estado || (error.type === 'entity.parse.failed' ? 400 : 500);
  if (estado >= 500) console.error(error);
  res.status(estado).json({
    error: estado >= 500 ? 'Ocurrio un problema en el servidor. Intente de nuevo en un momento.' : error.message,
  });
}

module.exports = { GuardiaPin, atrapar, manejarErrores };
