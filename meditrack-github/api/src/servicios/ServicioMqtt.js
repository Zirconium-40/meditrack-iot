const EventEmitter = require('events');

/**
 * Conexion con el broker MQTT (HiveMQ).
 * Escucha lo que manda el pastillero y publica los planes y comandos.
 *
 * Emite:
 *   'telemetria' (dispositivo, datos)
 *   'evento'     (dispositivo, datos)
 *   'estado'     (dispositivo, 'en_linea' | 'desconectado')
 */
class ServicioMqtt extends EventEmitter {
  constructor({ url, prefijo, dispositivos, libreria = require('mqtt') }) {
    super();
    this.url = url;
    this.prefijo = prefijo;
    this.dispositivos = new Set(dispositivos);
    this.libreria = libreria;
    this.cliente = null;
  }

  conectar() {
    const idCliente = `meditrack-api-${Math.random().toString(16).slice(2, 10)}`;
    this.cliente = this.libreria.connect(this.url, { clientId: idCliente, clean: true, reconnectPeriod: 5000 });

    this.cliente.on('connect', () => {
      console.log('MQTT conectado a', this.url);
      for (const tipo of ['telemetria', 'evento', 'estado']) {
        this.cliente.subscribe(`${this.prefijo}/+/${tipo}`, { qos: 1 });
      }
    });
    this.cliente.on('error', (error) => console.error('MQTT error:', error.message));
    this.cliente.on('message', (tema, buffer) => this.alRecibir(tema, buffer.toString()));
    return this;
  }

  alRecibir(tema, texto) {
    // tema = meditrack/v1/<dispositivo>/<tipo>
    const partes = tema.split('/');
    const dispositivo = partes[2];
    const tipo = partes[3];
    if (!this.dispositivos.has(dispositivo)) return; // ignora pastilleros ajenos

    if (tipo === 'estado') {
      this.emit('estado', dispositivo, texto);
      return;
    }
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch {
      console.warn('Mensaje que no es JSON en', tema);
      return;
    }
    if (tipo === 'telemetria' || tipo === 'evento') this.emit(tipo, dispositivo, datos);
  }

  estaConectado() {
    return Boolean(this.cliente && this.cliente.connected);
  }

  publicar(dispositivo, tipo, mensaje, retener) {
    return new Promise((resolver, rechazar) => {
      if (!this.estaConectado()) {
        rechazar(new Error('La API no esta conectada al broker MQTT. Intente en unos segundos.'));
        return;
      }
      const tema = `${this.prefijo}/${dispositivo}/${tipo}`;
      this.cliente.publish(tema, JSON.stringify(mensaje), { qos: 1, retain: retener }, (error) =>
        error ? rechazar(error) : resolver(),
      );
    });
  }

  // El plan se RETIENE: si el pastillero estaba apagado, lo recibe al conectarse
  publicarPlan(dispositivo, mensaje) {
    return this.publicar(dispositivo, 'plan', mensaje, true);
  }

  publicarComando(dispositivo, mensaje) {
    return this.publicar(dispositivo, 'comando', mensaje, false);
  }
}

module.exports = ServicioMqtt;
