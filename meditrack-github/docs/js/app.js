// =====================================================================
//  MediTrack IoT - Pagina principal
//  Junta las fuentes de datos con las vistas y maneja las secciones.
// =====================================================================
import { CONFIG, MODO_DEMO } from './config.js';
import { ClienteApi, ClienteTiempoReal } from './fuentes.js';
import { FuenteDemo } from './demo.js';
import { VistaHoy } from './vistaHoy.js';
import { VistaHistorial } from './vistaHistorial.js';
import { VistaHorarios } from './vistaHorarios.js';

class Aplicacion {
  constructor() {
    if (MODO_DEMO) {
      const demo = new FuenteDemo();
      this.api = demo;
      this.vivo = demo;
      document.getElementById('aviso-demo').hidden = false;
    } else {
      this.api = new ClienteApi(CONFIG.API_URL, CONFIG.ID_DISPOSITIVO);
      this.vivo = new ClienteTiempoReal({ url: CONFIG.MQTT_WS, prefijo: CONFIG.PREFIJO, dispositivo: CONFIG.ID_DISPOSITIVO });
    }
    this.hoy = new VistaHoy();
    this.historial = new VistaHistorial(this.api);
    this.horarios = new VistaHorarios(this.api);
    this.conexion = document.getElementById('conexion');
    this.brokerConectado = false;
    this.ultimaNoticia = 0;
  }

  iniciar() {
    this.prepararLetra();
    this.escucharTiempoReal();
    this.horarios.addEventListener('plan-guardado', (e) => this.hoy.actualizar({ plan: e.detail }));
    window.addEventListener('hashchange', () => this.mostrarVista());
    this.mostrarVista();
    this.cargarInicio();
    setInterval(() => this.revisarSiSigueConectado(), 15000);
  }

  async cargarInicio() {
    try {
      const [estado, plan] = await Promise.all([this.api.estado(), this.api.plan()]);
      this.hoy.actualizar({ plan, telemetria: estado.telemetria, enLinea: estado.enLinea, vistoEn: estado.vistoEn });
      if (estado.enLinea) this.ultimaNoticia = Date.now();
      this.pintarConexion();
    } catch (error) {
      this.conexion.textContent = 'No se pudo consultar el servidor';
      this.conexion.className = 'conexion sin-conexion';
      console.warn(error.message);
    }
  }

  escucharTiempoReal() {
    this.vivo.addEventListener('conexion', (e) => { this.brokerConectado = e.detail.conectado; this.brokerIntentado = true; this.pintarConexion(); });
    this.vivo.addEventListener('estado', (e) => {
      this.hoy.actualizar({ enLinea: e.detail.enLinea });
      if (!e.detail.enLinea) this.ultimaNoticia = 0;
      this.pintarConexion();
    });
    this.vivo.addEventListener('telemetria', (e) => {
      this.ultimaNoticia = Date.now();
      this.hoy.actualizar({ telemetria: e.detail, enLinea: true, vistoEn: new Date().toISOString() });
      this.pintarConexion();
    });
    this.vivo.addEventListener('evento', (e) => {
      if (e.detail.tipo === 'plan_recibido') this.api.plan().then((plan) => this.hoy.actualizar({ plan })).catch(() => {});
      if (this.vistaActual === 'historial') {
        clearTimeout(this.recargaHistorial);
        this.recargaHistorial = setTimeout(() => this.historial.cargar(), 1500);
      }
    });
    this.vivo.conectar();
  }

  revisarSiSigueConectado() {
    if (this.ultimaNoticia && Date.now() - this.ultimaNoticia > 45000) {
      this.ultimaNoticia = 0;
      this.hoy.actualizar({ enLinea: false });
    }
    this.pintarConexion();
  }

  pintarConexion() {
    let texto = 'Conectando…';
    let clase = 'conexion';
    if (this.brokerConectado || MODO_DEMO) {
      if (this.ultimaNoticia) { texto = 'Pastillero conectado'; clase += ' en-linea'; }
      else { texto = 'Pastillero sin conexión'; clase += ' sin-conexion'; }
    }
    else if (this.brokerIntentado) { texto = 'Sin conexión en vivo. Revise el internet'; clase += ' sin-conexion'; }
    this.conexion.textContent = texto;
    this.conexion.className = clase;
  }

  mostrarVista() {
    const vistas = ['hoy', 'historial', 'horarios', 'ayuda'];
    const nombre = vistas.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'hoy';
    const cambio = this.vistaActual && this.vistaActual !== nombre;
    this.vistaActual = nombre;
    for (const v of vistas) document.getElementById(`vista-${v}`).hidden = v !== nombre;
    document.querySelectorAll('.pestana').forEach((p) => {
      if (p.dataset.vista === nombre) p.setAttribute('aria-current', 'page');
      else p.removeAttribute('aria-current');
    });
    if (nombre === 'historial') this.historial.cargar();
    if (nombre === 'horarios') this.horarios.cargar();
    if (cambio) { document.getElementById('contenido').focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }

  // Botones A− y A+ : tres tamanos de letra, se recuerdan en el navegador
  prepararLetra() {
    let nivel = 0;
    try { nivel = Number(localStorage.getItem('meditrack-letra')) || 0; } catch { /* sin almacenamiento */ }
    const aplicar = () => {
      document.documentElement.classList.remove('letra-1', 'letra-2');
      if (nivel) document.documentElement.classList.add(`letra-${nivel}`);
      try { localStorage.setItem('meditrack-letra', String(nivel)); } catch { /* sin almacenamiento */ }
    };
    aplicar();
    document.querySelectorAll('.boton-letra').forEach((b) =>
      b.addEventListener('click', () => {
        nivel = Math.min(2, Math.max(0, nivel + Number(b.dataset.letra)));
        aplicar();
      }),
    );
  }
}

new Aplicacion().iniciar();
