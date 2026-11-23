// =====================================================================
//  Fuentes de datos de la pagina
//   - ClienteApi:        API REST en Render (historial, horarios)
//   - ClienteTiempoReal: HiveMQ por WebSocket (panel en vivo)
// =====================================================================

export class ClienteApi {
  constructor(base, dispositivo) {
    this.base = base.replace(/\/$/, '');
    this.dispositivo = dispositivo;
  }

  async pedir(ruta, { metodo = 'GET', cuerpo, pin } = {}) {
    const control = new AbortController();
    const espera = setTimeout(() => control.abort(), 60000); // Render gratis tarda en despertar
    let respuesta;
    try {
      respuesta = await fetch(`${this.base}/api${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(pin ? { 'x-pin': pin } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: control.signal,
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor. Revise el internet o intente de nuevo en un minuto.');
    } finally {
      clearTimeout(espera);
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || 'El servidor respondió con un error.');
    return datos;
  }

  ruta(r) { return `/dispositivos/${encodeURIComponent(this.dispositivo)}${r}`; }

  estado() { return this.pedir(this.ruta('/estado')); }
  telemetria(horas = 24) { return this.pedir(this.ruta(`/telemetria?horas=${horas}`)); }
  eventos(limite = 30) { return this.pedir(this.ruta(`/eventos?limite=${limite}`)); }
  resumen(dias = 7) { return this.pedir(this.ruta(`/resumen?dias=${dias}`)); }
  plan() { return this.pedir(this.ruta('/plan')); }
  vistaPrevia(medicamentos) { return this.pedir('/plan/vista-previa', { metodo: 'POST', cuerpo: { medicamentos } }); }
  verificarPin(pin) { return this.pedir('/acceso', { metodo: 'POST', pin }); }
  programar(medicamentos, pin) { return this.pedir(this.ruta('/plan'), { metodo: 'PUT', cuerpo: { medicamentos }, pin }); }
  comando(accion, pin) { return this.pedir(this.ruta('/comandos'), { metodo: 'POST', cuerpo: { accion }, pin }); }
}

export class ClienteTiempoReal extends EventTarget {
  constructor({ url, prefijo, dispositivo }) {
    super();
    this.url = url;
    this.base = `${prefijo}/${dispositivo}`;
  }

  conectar() {
    if (!window.mqtt) {
      this.avisar('conexion', { conectado: false });
      return;
    }
    const cliente = window.mqtt.connect(this.url, {
      clientId: `meditrack-web-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 4000,
      clean: true,
    });
    cliente.on('connect', () => {
      cliente.subscribe([`${this.base}/telemetria`, `${this.base}/evento`, `${this.base}/estado`]);
      this.avisar('conexion', { conectado: true });
    });
    cliente.on('close', () => this.avisar('conexion', { conectado: false }));
    cliente.on('message', (tema, mensaje) => {
      const tipo = tema.split('/').pop();
      const texto = mensaje.toString();
      if (tipo === 'estado') return this.avisar('estado', { enLinea: texto === 'en_linea' });
      try {
        this.avisar(tipo, JSON.parse(texto));
      } catch {
        /* mensaje que no es JSON: se ignora */
      }
    });
    this.cliente = cliente;
  }

  avisar(tipo, detalle) {
    this.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));
  }
}
