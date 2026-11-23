const ErrorApi = require('../utilidades/ErrorApi');

const ACCIONES = ['entregar_ahora', 'silenciar', 'buscar_origen'];
const ZONA = 'America/Mexico_City';

// Si el ESP32 todavia no tiene hora valida, se usa la hora del servidor
function fechaDe(segundos) {
  const s = Number(segundos);
  return s > 1700000000 ? new Date(s * 1000) : new Date();
}

/**
 * Logica principal de la API: guarda lo que llega del pastillero,
 * responde consultas del dashboard y programa horarios.
 */
class ServicioPastillero {
  constructor({ modelos, mqtt, firmador, generador, dispositivos }) {
    this.modelos = modelos;
    this.mqtt = mqtt;
    this.firmador = firmador;
    this.generador = generador;
    this.dispositivos = new Set(dispositivos);
    this.estados = new Map(); // dispositivo -> { enLinea, vistoEn, telemetria }
  }

  iniciar() {
    this.mqtt.on('telemetria', (d, datos) => this.guardarTelemetria(d, datos).catch(this.avisar));
    this.mqtt.on('evento', (d, datos) => this.guardarEvento(d, datos).catch(this.avisar));
    this.mqtt.on('estado', (d, texto) => this.actualizarEstado(d, { enLinea: texto === 'en_linea' }));
  }

  avisar(error) {
    console.error('Error al guardar datos del pastillero:', error.message);
  }

  validarDispositivo(dispositivo) {
    if (!this.dispositivos.has(dispositivo)) {
      throw new ErrorApi(404, `No hay ningun pastillero llamado "${dispositivo}".`);
    }
  }

  actualizarEstado(dispositivo, cambios) {
    const anterior = this.estados.get(dispositivo) || { enLinea: false, vistoEn: null, telemetria: null };
    this.estados.set(dispositivo, { ...anterior, ...cambios });
  }

  // ------------------------- Desde el ESP32 -------------------------
  async guardarTelemetria(dispositivo, d) {
    const registro = {
      dispositivo,
      t: fechaDe(d.t),
      temp: d.temp,
      hum: d.hum,
      tapa: d.tapa,
      estado: d.estado,
      compartimento: d.compartimento,
      restantes: d.restantes,
      siguiente: d.siguiente ? new Date(d.siguiente * 1000) : undefined,
      siguienteEtiqueta: d.siguienteEtiqueta,
    };
    this.actualizarEstado(dispositivo, { enLinea: true, vistoEn: new Date(), telemetria: registro });
    await this.modelos.Telemetria.create(registro);
  }

  async guardarEvento(dispositivo, d) {
    if (!d.id || !d.tipo) return;
    await this.modelos.Evento.updateOne(
      { idEvento: d.id },
      {
        $setOnInsert: {
          dispositivo,
          idEvento: d.id,
          t: fechaDe(d.t),
          tipo: d.tipo,
          compartimento: d.compartimento || 0,
          etiqueta: d.etiqueta || '',
          programada: d.programada ? new Date(d.programada * 1000) : undefined,
        },
      },
      { upsert: true },
    );
  }

  // --------------------------- Consultas ----------------------------
  estado(dispositivo) {
    this.validarDispositivo(dispositivo);
    const e = this.estados.get(dispositivo);
    // Si no se ha sabido nada en 1 minuto se considera desconectado
    const reciente = e?.vistoEn && Date.now() - e.vistoEn.getTime() < 60000;
    return {
      dispositivo,
      enLinea: Boolean(e?.enLinea && reciente),
      vistoEn: e?.vistoEn || null,
      telemetria: e?.telemetria || null,
    };
  }

  async telemetria(dispositivo, horas = 24) {
    this.validarDispositivo(dispositivo);
    const h = Math.min(Math.max(Number(horas) || 24, 1), 24 * 7);
    const minutos = h <= 6 ? 5 : h <= 24 ? 15 : 60;
    const desde = new Date(Date.now() - h * 3600 * 1000);
    const tramo = minutos * 60 * 1000;
    const puntos = await this.modelos.Telemetria.aggregate([
      { $match: { dispositivo, t: { $gte: desde }, temp: { $ne: null } } },
      {
        $group: {
          _id: { $subtract: [{ $toLong: '$t' }, { $mod: [{ $toLong: '$t' }, tramo] }] },
          temp: { $avg: '$temp' },
          hum: { $avg: '$hum' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return {
      horas: h,
      minutosPorPunto: minutos,
      puntos: puntos.map((p) => ({
        t: new Date(p._id).toISOString(),
        temp: Math.round(p.temp * 10) / 10,
        hum: Math.round(p.hum),
      })),
    };
  }

  async eventos(dispositivo, { limite = 50, tipos, desde, hasta } = {}) {
    this.validarDispositivo(dispositivo);
    const filtro = { dispositivo };
    if (tipos) filtro.tipo = { $in: String(tipos).split(',') };
    if (desde || hasta) {
      filtro.t = {};
      if (desde) filtro.t.$gte = new Date(desde);
      if (hasta) filtro.t.$lte = new Date(hasta);
    }
    const n = Math.min(Math.max(Number(limite) || 50, 1), 500);
    return this.modelos.Evento.find(filtro, { _id: 0 }).sort({ t: -1 }).limit(n).lean();
  }

  async resumen(dispositivo, dias = 7) {
    this.validarDispositivo(dispositivo);
    const d = Math.min(Math.max(Number(dias) || 7, 1), 30);
    const desde = new Date(Date.now() - d * 24 * 3600 * 1000);
    const filas = await this.modelos.Evento.aggregate([
      { $match: { dispositivo, t: { $gte: desde }, tipo: { $in: ['confirmada', 'sin_confirmar'] } } },
      {
        $group: {
          _id: { dia: { $dateToString: { format: '%Y-%m-%d', date: '$t', timezone: ZONA } }, tipo: '$tipo' },
          n: { $sum: 1 },
        },
      },
    ]);
    const porDia = new Map();
    let confirmadas = 0;
    let sinConfirmar = 0;
    for (const f of filas) {
      const dia = porDia.get(f._id.dia) || { fecha: f._id.dia, confirmadas: 0, sinConfirmar: 0 };
      if (f._id.tipo === 'confirmada') { dia.confirmadas += f.n; confirmadas += f.n; }
      else { dia.sinConfirmar += f.n; sinConfirmar += f.n; }
      porDia.set(f._id.dia, dia);
    }
    const total = confirmadas + sinConfirmar;
    return {
      dias: d,
      confirmadas,
      sinConfirmar,
      porcentaje: total ? Math.round((confirmadas / total) * 100) : null,
      porDia: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    };
  }

  async planActual(dispositivo) {
    this.validarDispositivo(dispositivo);
    return this.modelos.Plan.findOne({ dispositivo }, { _id: 0 }).sort({ version: -1 }).lean();
  }

  // ---------------------------- Acciones ----------------------------
  vistaPrevia(medicamentos) {
    return this.generador.generar(medicamentos);
  }

  async programarPlan(dispositivo, medicamentos) {
    this.validarDispositivo(dispositivo);
    const { medicamentos: limpios, entregas } = this.generador.generar(medicamentos);
    const version = Date.now();
    const mensaje = this.firmador.mensajePlan(version, entregas);
    await this.mqtt.publicarPlan(dispositivo, mensaje);
    const plan = await this.modelos.Plan.create({ dispositivo, version, medicamentos: limpios, entregas });
    return plan.toObject({ versionKey: false });
  }

  async enviarComando(dispositivo, accion) {
    this.validarDispositivo(dispositivo);
    if (!ACCIONES.includes(accion)) {
      throw new ErrorApi(400, `Accion desconocida. Use una de: ${ACCIONES.join(', ')}.`);
    }
    const mensaje = this.firmador.mensajeComando(Date.now(), accion);
    await this.mqtt.publicarComando(dispositivo, mensaje);
    return { enviado: true, accion };
  }
}

module.exports = ServicioPastillero;
