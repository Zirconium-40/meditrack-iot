// =====================================================================
//  Vista "Historial": resumen, tomas por dia, avisos y ambiente
// =====================================================================
import { aSegundos, cuandoCompleto, icono, escapar, EVENTOS, mayuscula } from './util.js';
import { graficaLinea, graficaTomasPorDia } from './graficas.js';

// Solo se muestran los avisos que le importan a una persona
const VISIBLES = ['confirmada', 'sin_confirmar', 'bloqueo_tapa', 'plan_recibido', 'sin_tomas', 'energia_interrumpida', 'error_origen', 'revisado', 'tapa_abierta'];

export class VistaHistorial {
  constructor(fuente) {
    this.fuente = fuente;
    this.dias = 7;
    this.el = {
      resumen: document.getElementById('resumen'),
      dias: document.getElementById('grafica-dias'),
      eventos: document.getElementById('eventos'),
      temp: document.getElementById('grafica-temp'),
      hum: document.getElementById('grafica-hum'),
    };
    document.querySelectorAll('#vista-historial .opcion').forEach((b) =>
      b.addEventListener('click', () => {
        this.dias = Number(b.dataset.dias);
        document.querySelectorAll('#vista-historial .opcion').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        this.cargar();
      }),
    );
  }

  async cargar() {
    this.el.resumen.innerHTML = '<p>Cargando el historial…</p>';
    try {
      const [resumen, eventos, telemetria] = await Promise.all([
        this.fuente.resumen(this.dias),
        this.fuente.eventos(40),
        this.fuente.telemetria(24),
      ]);
      this.dibujarResumen(resumen);
      graficaTomasPorDia(this.el.dias, resumen.porDia, this.dias);
      this.dibujarEventos(eventos);
      graficaLinea(this.el.temp, { titulo: 'Temperatura', puntos: telemetria.puntos, campo: 'temp', unidad: '°C', color: '#eb6834', decimales: 1 });
      graficaLinea(this.el.hum, { titulo: 'Humedad', puntos: telemetria.puntos, campo: 'hum', unidad: '%', color: '#2a78d6' });
    } catch (error) {
      this.el.resumen.innerHTML = `<p class="error">${escapar(error.message)}</p><button type="button" class="boton boton-secundario" id="reintentar-historial">Intentar de nuevo</button>`;
      document.getElementById('reintentar-historial').addEventListener('click', () => this.cargar());
    }
  }

  dibujarResumen(r) {
    const periodo = this.dias === 1 ? 'hoy' : `en los últimos ${this.dias} días`;
    const total = r.confirmadas + r.sinConfirmar;
    if (!total) {
      this.el.resumen.innerHTML = `<p>No hay tomas registradas ${periodo}.</p>`;
      return;
    }
    const mensaje = r.porcentaje >= 90 ? 'Va muy bien.' : r.porcentaje >= 70 ? 'Va bien, pero se pasaron algunas.' : 'Se están pasando varias tomas. Platíquelo con su cuidador o su médico.';
    this.el.resumen.innerHTML = `
      <p class="resumen-numero">${r.confirmadas} de ${total}</p>
      <p>tomas confirmadas ${periodo} (${r.porcentaje} %). ${mensaje}</p>`;
  }

  dibujarEventos(eventos) {
    const lista = eventos.filter((e) => VISIBLES.includes(e.tipo)).slice(0, 12);
    if (!lista.length) {
      this.el.eventos.innerHTML = '<li class="vacio">Todavía no hay avisos.</li>';
      return;
    }
    this.el.eventos.innerHTML = lista.map((e) => {
      const def = EVENTOS[e.tipo] || { icono: 'info', texto: () => e.tipo };
      const t = aSegundos(e.t);
      return `<li>${icono(def.icono)}<span><strong>${escapar(def.texto(e))}</strong><span class="cuando">${t ? escapar(mayuscula(cuandoCompleto(t))) : ''}</span></span></li>`;
    }).join('');
  }
}
