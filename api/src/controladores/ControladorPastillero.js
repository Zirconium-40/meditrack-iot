/**
 * Traduce las peticiones HTTP a llamadas del ServicioPastillero.
 * Cada metodo responde JSON. Los errores los atiende el middleware de errores.
 */
class ControladorPastillero {
  constructor(servicio) {
    this.servicio = servicio;
    // "bind" para poder pasar los metodos directo a las rutas
    for (const nombre of Object.getOwnPropertyNames(ControladorPastillero.prototype)) {
      if (nombre !== 'constructor') this[nombre] = this[nombre].bind(this);
    }
  }

  estado(req, res) {
    res.json(this.servicio.estado(req.params.id));
  }

  async telemetria(req, res) {
    res.json(await this.servicio.telemetria(req.params.id, req.query.horas));
  }

  async eventos(req, res) {
    const { limite, tipos, desde, hasta } = req.query;
    res.json(await this.servicio.eventos(req.params.id, { limite, tipos, desde, hasta }));
  }

  async resumen(req, res) {
    res.json(await this.servicio.resumen(req.params.id, req.query.dias));
  }

  async plan(req, res) {
    const plan = await this.servicio.planActual(req.params.id);
    res.json(plan || { entregas: [], medicamentos: [] });
  }

  vistaPrevia(req, res) {
    res.json(this.servicio.vistaPrevia(req.body?.medicamentos));
  }

  async programar(req, res) {
    res.status(201).json(await this.servicio.programarPlan(req.params.id, req.body?.medicamentos));
  }

  async comando(req, res) {
    res.json(await this.servicio.enviarComando(req.params.id, req.body?.accion));
  }
}

module.exports = ControladorPastillero;
