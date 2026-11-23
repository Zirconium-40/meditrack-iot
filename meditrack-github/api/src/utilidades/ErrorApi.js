// Error con codigo HTTP y un mensaje que la pagina puede mostrar tal cual.
class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

module.exports = ErrorApi;
