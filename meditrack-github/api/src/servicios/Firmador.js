const crypto = require('crypto');

/**
 * Firma los planes y comandos con HMAC-SHA256.
 * El ESP32 calcula la misma firma con la misma clave; si no coincide,
 * ignora el mensaje. Asi nadie mas puede programar el pastillero
 * aunque el broker de HiveMQ sea publico.
 */
class Firmador {
  constructor(clave) {
    if (!clave) throw new Error('Firmador necesita una clave');
    this.clave = clave;
  }

  firmar(texto) {
    return crypto.createHmac('sha256', this.clave).update(texto, 'utf8').digest('hex');
  }

  // Texto que se firma: version|hora:etiqueta;hora:etiqueta;...
  // Tiene que ser IDENTICO al que arma Datos.h en el ESP32.
  textoPlan(version, entregas) {
    return `${version}|${entregas.map((e) => `${e.t}:${e.etiqueta}`).join(';')}`;
  }

  textoComando(version, accion) {
    return `${version}|${accion}`;
  }

  mensajePlan(version, entregas) {
    const lista = entregas.map((e) => ({ t: e.t, etiqueta: e.etiqueta }));
    return { version, entregas: lista, firma: this.firmar(this.textoPlan(version, lista)) };
  }

  mensajeComando(version, accion) {
    return { version, accion, firma: this.firmar(this.textoComando(version, accion)) };
  }
}

module.exports = Firmador;
