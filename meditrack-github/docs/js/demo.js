// =====================================================================
//  Modo demo: imita la API y el tiempo real con datos de ejemplo.
//  Sirve para ver la pagina sin pastillero, o en la feria si falla
//  el internet. PIN de ejemplo: 2468
// =====================================================================
import { generarEntregas } from './generador.js';

const PIN_DEMO = '2468';

// Numeros "al azar" pero siempre iguales, para que el ejemplo no cambie
function aleatorio(semilla) {
  let s = semilla;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export class FuenteDemo extends EventTarget {
  constructor() {
    super();
    const ahora = Math.floor(Date.now() / 1000);
    const inicio = ahora + 90 - (ahora % 60); // primera toma en 1 o 2 minutos
    this.medicamentos = [
      { nombre: 'Medicamento A', primeraToma: inicio, cadaHoras: 8 },
      { nombre: 'Medicamento B', primeraToma: inicio, cadaHoras: 12 },
    ];
    this.planActual = { version: Date.now(), medicamentos: this.medicamentos, entregas: generarEntregas(this.medicamentos, ahora) };
    this.indice = 0;
    this.compartimento = 0;
    this.estadoPastillero = 'esperando';
    this.temp = 24.2;
    this.hum = 53;
    this.historial = this.crearHistorial(ahora);
  }

  // --------------------------- "Tiempo real" -------------------------
  conectar() {
    setTimeout(() => this.avisar('conexion', { conectado: true }), 300);
    setTimeout(() => this.avisar('estado', { enLinea: true }), 500);
    this.latido();
    setInterval(() => this.latido(), 3000);
  }

  latido() {
    const ahora = Math.floor(Date.now() / 1000);
    const siguiente = this.planActual.entregas[this.indice];
    if (this.estadoPastillero === 'esperando' && siguiente && ahora >= siguiente.t) this.entregar();
    this.temp = Math.round((this.temp + (Math.random() - 0.5) * 0.2) * 10) / 10;
    this.hum = Math.round(Math.min(60, Math.max(48, this.hum + (Math.random() - 0.5) * 2)));
    this.avisar('telemetria', this.telemetriaActual());
  }

  telemetriaActual() {
    const siguiente = this.planActual.entregas[this.indice];
    return {
      t: Math.floor(Date.now() / 1000),
      temp: this.temp,
      hum: this.hum,
      tapa: 'cerrada',
      estado: this.estadoPastillero,
      compartimento: this.compartimento,
      restantes: this.planActual.entregas.length - this.indice,
      siguiente: siguiente?.t ?? null,
      siguienteEtiqueta: siguiente?.etiqueta ?? '',
    };
  }

  entregar() {
    const e = this.planActual.entregas[this.indice];
    if (!e) return;
    this.compartimento = e.compartimento;
    this.estadoPastillero = 'esperando_confirmacion';
    this.evento('entrega', e);
    // En el ejemplo, la persona "aprieta el boton" a los 25 segundos
    clearTimeout(this.esperaConfirmar);
    this.esperaConfirmar = setTimeout(() => this.confirmar(), 25000);
  }

  confirmar() {
    const e = this.planActual.entregas[this.indice];
    if (this.estadoPastillero !== 'esperando_confirmacion' || !e) return;
    this.evento('confirmada', e);
    this.indice++;
    this.estadoPastillero = 'esperando';
    this.avisar('telemetria', this.telemetriaActual());
  }

  evento(tipo, e) {
    const datos = { id: `demo-${Date.now()}`, t: Math.floor(Date.now() / 1000), tipo, compartimento: e.compartimento, etiqueta: e.etiqueta };
    this.historial.eventos.unshift(datos);
    this.avisar('evento', datos);
    this.avisar('telemetria', this.telemetriaActual());
  }

  avisar(tipo, detalle) {
    this.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));
  }

  // ------------------------------ "API" ------------------------------
  async estado() {
    return { enLinea: true, vistoEn: new Date().toISOString(), telemetria: this.telemetriaActual() };
  }

  async plan() { return this.planActual; }

  async eventos(limite = 30) { return this.historial.eventos.slice(0, limite); }

  async telemetria(horas = 24) {
    const desde = Date.now() - horas * 3600 * 1000;
    return { horas, puntos: this.historial.telemetria.filter((p) => Date.parse(p.t) >= desde) };
  }

  async resumen(dias = 7) {
    const desde = Math.floor(Date.now() / 1000) - dias * 86400;
    const porDia = new Map();
    let confirmadas = 0;
    let sinConfirmar = 0;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });
    for (const e of this.historial.eventos) {
      if (e.t < desde || (e.tipo !== 'confirmada' && e.tipo !== 'sin_confirmar')) continue;
      const fecha = fmt.format(new Date(e.t * 1000));
      const d = porDia.get(fecha) || { fecha, confirmadas: 0, sinConfirmar: 0 };
      if (e.tipo === 'confirmada') { d.confirmadas++; confirmadas++; } else { d.sinConfirmar++; sinConfirmar++; }
      porDia.set(fecha, d);
    }
    const total = confirmadas + sinConfirmar;
    return {
      dias, confirmadas, sinConfirmar,
      porcentaje: total ? Math.round((confirmadas / total) * 100) : null,
      porDia: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    };
  }

  async vistaPrevia(medicamentos) {
    return { medicamentos, entregas: generarEntregas(medicamentos) };
  }

  async verificarPin(pin) {
    if (pin !== PIN_DEMO) throw new Error('El PIN no es correcto. En el modo de ejemplo el PIN es 2468.');
    return { valido: true };
  }

  async programar(medicamentos, pin) {
    await this.verificarPin(pin);
    this.medicamentos = medicamentos;
    this.planActual = { version: Date.now(), medicamentos, entregas: generarEntregas(medicamentos) };
    this.indice = 0;
    this.compartimento = 0;
    this.estadoPastillero = 'esperando';
    this.evento('plan_recibido', { compartimento: 0, etiqueta: `${this.planActual.entregas.length} entregas` });
    return this.planActual;
  }

  async comando(accion, pin) {
    await this.verificarPin(pin);
    if (accion === 'entregar_ahora' && this.estadoPastillero === 'esperando') this.entregar();
    if (accion === 'silenciar') this.confirmar();
    return { enviado: true, accion };
  }

  // Siete dias de ejemplo: 3 tomas diarias, alguna sin confirmar
  crearHistorial(ahora) {
    const azar = aleatorio(7);
    const eventos = [];
    for (let d = 7; d >= 1; d--) {
      for (const h of [8, 14, 22]) {
        const t = ahora - d * 86400 - (ahora % 86400) + (h + 6) * 3600; // hora local aprox.
        const tipo = azar() < 0.12 ? 'sin_confirmar' : 'confirmada';
        const comp = ((7 - d) * 3 + [8, 14, 22].indexOf(h)) % 8 + 1;
        eventos.push({ id: `h${t}e`, t, tipo: 'entrega', compartimento: comp, etiqueta: 'Medicamento A' });
        eventos.push({ id: `h${t}c`, t: t + (tipo === 'confirmada' ? 120 : 600), tipo, compartimento: comp, etiqueta: 'Medicamento A' });
      }
    }
    eventos.push({ id: 'h-tapa', t: ahora - 5400, tipo: 'tapa_abierta', compartimento: 0, etiqueta: '' });
    eventos.push({ id: 'h-tapa2', t: ahora - 5300, tipo: 'tapa_cerrada', compartimento: 0, etiqueta: '' });
    eventos.sort((a, b) => b.t - a.t);

    const telemetria = [];
    for (let i = 24 * 4; i >= 0; i--) {
      const t = ahora - i * 900;
      const horaDia = ((t / 3600) - 6 + 24) % 24;
      const temp = 22.5 + 2.8 * Math.sin(((horaDia - 9) / 24) * 2 * Math.PI) + (azar() - 0.5) * 0.4;
      const hum = 55 - 6 * Math.sin(((horaDia - 9) / 24) * 2 * Math.PI) + (azar() - 0.5) * 2;
      telemetria.push({ t: new Date(t * 1000).toISOString(), temp: Math.round(temp * 10) / 10, hum: Math.round(hum) });
    }
    return { eventos, telemetria };
  }
}
