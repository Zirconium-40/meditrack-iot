// =====================================================================
//  Vista "Horarios": ver los horarios y un asistente de 3 pasos
//  1) PIN del cuidador  2) medicamentos  3) revisar y guardar
//  Las horas se eligen con botones + y −, sin tener que teclear.
// =====================================================================
import { ahoraSeg, claveDia, cuandoCompleto, hora, escapar, mayuscula } from './util.js';

const FRECUENCIAS = [4, 6, 8, 12, 24];
const TOTAL_PASOS = 3;

export class VistaHorarios extends EventTarget {
  constructor(fuente) {
    super();
    this.fuente = fuente;
    this.actuales = document.getElementById('horarios-actuales');
    this.asistente = document.getElementById('asistente');
    this.pin = null;
    this.medicamentos = [];
    this.plan = null;
  }

  async cargar() {
    this.asistente.innerHTML = '';
    this.actuales.innerHTML = '<p>Cargando los horarios…</p>';
    try {
      this.plan = await this.fuente.plan();
      this.mostrarActuales();
    } catch (error) {
      this.actuales.innerHTML = `<p class="error">${escapar(error.message)}</p>`;
    }
  }

  // ------------------------- Horarios vigentes -----------------------
  mostrarActuales() {
    const entregas = this.plan?.entregas || [];
    const lista = entregas.length
      ? `<p>Estas son las tomas que tiene cargadas el pastillero:</p>${this.listaEntregas(entregas, true)}`
      : '<p>Todavía no hay horarios. Para empezar, apriete el botón de abajo.</p>';
    this.actuales.innerHTML = `
      <div class="tarjeta">${lista}
        <div class="botones"><button type="button" class="boton" id="cambiar-horarios">${entregas.length ? 'Cambiar los horarios' : 'Programar los horarios'}</button></div>
      </div>
      <div class="tarjeta">
        <h2>Acciones del cuidador</h2>
        <p>Piden el PIN del cuidador.</p>
        <div class="botones">
          <button type="button" class="boton boton-secundario" data-accion="entregar_ahora">Entregar la siguiente toma ahora</button>
          <button type="button" class="boton boton-secundario" data-accion="silenciar">Apagar la alarma</button>
          <button type="button" class="boton boton-secundario" data-accion="buscar_origen">Acomodar el disco</button>
        </div>
        <p id="resultado-accion" role="status"></p>
      </div>`;
    document.getElementById('cambiar-horarios').addEventListener('click', () => this.pasoPin(() => this.pasoMedicamento()));
    this.actuales.querySelectorAll('[data-accion]').forEach((b) =>
      b.addEventListener('click', () => this.pasoPin(() => this.ejecutar(b.dataset.accion, b.textContent))),
    );
  }

  listaEntregas(entregas, marcarPasadas = false) {
    return `<ul class="lista-entregas">${entregas.map((e) => {
      const pasada = marcarPasadas && e.t < ahoraSeg() - 600;
      return `<li><span class="numero-compartimento" aria-label="Compartimento ${e.compartimento}">${e.compartimento}</span>
        <span><span class="cuando-entrega">${escapar(mayuscula(cuandoCompleto(e.t)))}${pasada ? ' (ya pasó)' : ''}</span>${escapar(e.etiqueta)}</span></li>`;
    }).join('')}</ul>`;
  }

  async ejecutar(accion, nombre) {
    this.asistente.innerHTML = '';
    this.mostrarActuales();
    const salida = document.getElementById('resultado-accion');
    salida.className = '';
    salida.textContent = 'Enviando…';
    try {
      await this.fuente.comando(accion, this.pin);
      salida.textContent = `Listo: "${nombre}" se envió al pastillero.`;
    } catch (error) {
      salida.className = 'error';
      salida.textContent = error.message;
    }
  }

  pantalla(html) {
    this.actuales.innerHTML = '';
    this.asistente.innerHTML = `<div class="tarjeta">${html}</div>`;
    const titulo = this.asistente.querySelector('h2');
    if (titulo) { titulo.tabIndex = -1; titulo.focus(); }
  }

  // ------------------------------ Paso 1 -----------------------------
  pasoPin(despues) {
    if (this.pin) { despues(); return; }
    this.pantalla(`
      <p class="pasos-indicador">Paso 1 de ${TOTAL_PASOS}</p>
      <h2>Escriba el PIN del cuidador</h2>
      <p>Así nadie más puede cambiar los horarios.</p>
      <form id="form-pin" novalidate>
        <div class="campo">
          <label for="pin">PIN</label>
          <input class="entrada entrada-pin" id="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8">
          <p class="error" id="error-pin" hidden></p>
        </div>
        <div class="botones">
          <button type="button" class="boton boton-secundario" id="cancelar">Cancelar</button>
          <button type="submit" class="boton">Continuar</button>
        </div>
      </form>`);
    const entrada = document.getElementById('pin');
    const error = document.getElementById('error-pin');
    entrada.addEventListener('input', () => { error.hidden = true; });
    document.getElementById('cancelar').addEventListener('click', () => this.cargar());
    document.getElementById('form-pin').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const pin = entrada.value.trim();
      if (!/^\d{4,8}$/.test(pin)) {
        error.textContent = 'Escriba el PIN de 4 a 8 números.';
        error.hidden = false;
        return;
      }
      const boton = ev.submitter;
      boton.disabled = true;
      boton.textContent = 'Revisando…';
      try {
        await this.fuente.verificarPin(pin);
        this.pin = pin;
        despues();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        boton.disabled = false;
        boton.textContent = 'Continuar';
      }
    });
  }

  // ------------------------------ Paso 2 -----------------------------
  nuevoBorrador() {
    // Propone la siguiente hora en punto
    const ahora = new Date(Date.now() + 3600 * 1000);
    const h24 = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(ahora)) % 24;
    return { nombre: '', dia: 0, hora: h24 % 12 || 12, pm: h24 >= 12, minuto: 0, cadaHoras: 8 };
  }

  aSegundosLocales(b) {
    // Mexico centro: UTC-6 todo el ano
    const base = claveDia(ahoraSeg() + b.dia * 86400);
    const h24 = (b.hora % 12) + (b.pm ? 12 : 0);
    return Math.floor(Date.parse(`${base}T${String(h24).padStart(2, '0')}:${String(b.minuto).padStart(2, '0')}:00-06:00`) / 1000);
  }

  pasoMedicamento(borrador = this.nuevoBorrador()) {
    const b = borrador;
    const capturados = this.medicamentos.length
      ? `<p class="etiqueta">Ya agregó:</p><ul class="medicamentos-capturados">${this.medicamentos.map((m, i) =>
          `<li><span><strong>${escapar(m.nombre)}</strong>, primera toma ${escapar(cuandoCompleto(m.primeraToma))}, cada ${m.cadaHoras} horas</span>
           <button type="button" class="enlace-boton" data-quitar="${i}">Quitar</button></li>`).join('')}</ul>`
      : '';
    this.pantalla(`
      <p class="pasos-indicador">Paso 2 de ${TOTAL_PASOS}</p>
      <h2>${this.medicamentos.length ? 'Agregue otro medicamento' : '¿Qué medicamento va a tomar?'}</h2>
      ${capturados}
      <form id="form-med" novalidate>
        <div class="campo">
          <label for="nombre">Nombre del medicamento</label>
          <p class="ayuda-campo">Para la escuela usen nombres de ejemplo, como "Medicamento A".</p>
          <input class="entrada" id="nombre" maxlength="20" autocomplete="off" value="${escapar(b.nombre)}">
        </div>

        <div class="campo">
          <span class="etiqueta" id="et-dia">¿Cuándo es la primera toma?</span>
          <div class="opciones" role="group" aria-labelledby="et-dia">
            <button type="button" class="opcion" data-dia="0" aria-pressed="${b.dia === 0}">Hoy</button>
            <button type="button" class="opcion" data-dia="1" aria-pressed="${b.dia === 1}">Mañana</button>
          </div>
        </div>

        <div class="campo">
          <span class="etiqueta" id="et-hora">¿A qué hora?</span>
          <div class="selector-hora" role="group" aria-labelledby="et-hora">
            <div>
              <div class="contador">
                <button type="button" class="opcion" data-cambiar="hora" data-paso="-1" aria-label="Una hora menos">−</button>
                <span class="valor" id="valor-hora" aria-live="polite">${b.hora}</span>
                <button type="button" class="opcion" data-cambiar="hora" data-paso="1" aria-label="Una hora más">+</button>
              </div>
              <span class="contador-etiqueta">hora</span>
            </div>
            <div>
              <div class="contador">
                <button type="button" class="opcion" data-cambiar="minuto" data-paso="-5" aria-label="5 minutos menos">−</button>
                <span class="valor" id="valor-minuto" aria-live="polite">${String(b.minuto).padStart(2, '0')}</span>
                <button type="button" class="opcion" data-cambiar="minuto" data-paso="5" aria-label="5 minutos más">+</button>
              </div>
              <span class="contador-etiqueta">minutos</span>
            </div>
            <div class="opciones" role="group" aria-label="Mañana o tarde">
              <button type="button" class="opcion" data-pm="0" aria-pressed="${!b.pm}">a. m.</button>
              <button type="button" class="opcion" data-pm="1" aria-pressed="${b.pm}">p. m.</button>
            </div>
          </div>
          <p class="ayuda-campo" id="hora-elegida" style="margin-top:0.6rem"></p>
        </div>

        <div class="campo">
          <span class="etiqueta" id="et-cada">¿Cada cuántas horas se toma?</span>
          <div class="opciones" role="group" aria-labelledby="et-cada">
            ${FRECUENCIAS.map((f) => `<button type="button" class="opcion" data-cada="${f}" aria-pressed="${b.cadaHoras === f}">${f === 24 ? 'Una vez al día' : `Cada ${f} horas`}</button>`).join('')}
          </div>
        </div>

        <p class="error" id="error-med" hidden></p>
        <div class="botones">
          <button type="button" class="boton boton-secundario" id="agregar-otro">Agregar y capturar otro</button>
          <button type="submit" class="boton">Siguiente: revisar</button>
        </div>
        <div class="botones"><button type="button" class="boton boton-peligro" id="cancelar">Cancelar sin guardar</button></div>
      </form>`);

    const form = document.getElementById('form-med');
    const error = document.getElementById('error-med');
    const leerNombre = () => { b.nombre = document.getElementById('nombre').value.trim(); };
    const mostrarHora = () => {
      document.getElementById('valor-hora').textContent = b.hora;
      document.getElementById('valor-minuto').textContent = String(b.minuto).padStart(2, '0');
      document.getElementById('hora-elegida').textContent = `Eligió: ${b.dia ? 'mañana' : 'hoy'} a las ${hora(this.aSegundosLocales(b))}`;
    };
    const presionar = (grupo, boton) => form.querySelectorAll(grupo).forEach((o) => o.setAttribute('aria-pressed', String(o === boton)));
    mostrarHora();

    form.addEventListener('click', (ev) => {
      const boton = ev.target.closest('button');
      if (!boton) return;
      error.hidden = true;
      if (boton.dataset.dia) { b.dia = Number(boton.dataset.dia); presionar('[data-dia]', boton); }
      if (boton.dataset.pm) { b.pm = boton.dataset.pm === '1'; presionar('[data-pm]', boton); }
      if (boton.dataset.cada) { b.cadaHoras = Number(boton.dataset.cada); presionar('[data-cada]', boton); }
      if (boton.dataset.cambiar === 'hora') b.hora = ((b.hora - 1 + Number(boton.dataset.paso) + 12) % 12) + 1;
      if (boton.dataset.cambiar === 'minuto') b.minuto = (b.minuto + Number(boton.dataset.paso) + 60) % 60;
      mostrarHora();
    });
    form.querySelectorAll('[data-quitar]').forEach((q) => q.addEventListener('click', () => {
      leerNombre();
      this.medicamentos.splice(Number(q.dataset.quitar), 1);
      this.pasoMedicamento(b);
    }));
    document.getElementById('cancelar').addEventListener('click', () => { this.medicamentos = []; this.cargar(); });

    const guardarBorrador = () => {
      leerNombre();
      if (!b.nombre && this.medicamentos.length) return 'vacio';
      if (!b.nombre) return this.fallar(error, 'Escriba el nombre del medicamento.');
      const primeraToma = this.aSegundosLocales(b);
      if (primeraToma < ahoraSeg()) return this.fallar(error, 'Esa hora ya pasó hoy. Elija una hora más tarde o "Mañana".');
      if (this.medicamentos.length >= 5) return this.fallar(error, 'Se pueden programar hasta 5 medicamentos.');
      this.medicamentos.push({ nombre: b.nombre, primeraToma, cadaHoras: b.cadaHoras });
      return 'ok';
    };
    document.getElementById('agregar-otro').addEventListener('click', () => {
      if (guardarBorrador() === 'ok') this.pasoMedicamento();
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const r = guardarBorrador();
      if (r === 'ok' || r === 'vacio') this.pasoRevisar();
    });
  }

  fallar(elemento, mensaje) {
    elemento.textContent = mensaje;
    elemento.hidden = false;
    return 'error';
  }

  // ------------------------------ Paso 3 -----------------------------
  async pasoRevisar() {
    this.pantalla('<p class="pasos-indicador">Paso 3 de 3</p><h2>Revise los horarios</h2><p>Calculando las tomas…</p>');
    let entregas;
    try {
      ({ entregas } = await this.fuente.vistaPrevia(this.medicamentos));
    } catch (error) {
      this.pantalla(`<p class="pasos-indicador">Paso 3 de ${TOTAL_PASOS}</p><h2>Revise los horarios</h2><p class="error">${escapar(error.message)}</p>
        <div class="botones"><button type="button" class="boton boton-secundario" id="regresar">Regresar a cambiar</button></div>`);
      document.getElementById('regresar').addEventListener('click', () => { this.medicamentos.pop(); this.pasoMedicamento(); });
      return;
    }
    const juntas = entregas.some((e) => e.etiqueta.includes(' + '));
    this.pantalla(`
      <p class="pasos-indicador">Paso 3 de ${TOTAL_PASOS}</p>
      <h2>Revise los horarios</h2>
      <p>Se van a programar <strong>${entregas.length} tomas</strong>. El pastillero tiene lugar para 8.${juntas ? ' Las medicinas que coinciden en la hora van juntas en el mismo compartimento.' : ''}</p>
      ${this.listaEntregas(entregas)}
      <p class="error" id="error-guardar" hidden></p>
      <div class="botones">
        <button type="button" class="boton boton-secundario" id="regresar">Regresar a cambiar</button>
        <button type="button" class="boton" id="guardar">Guardar horarios</button>
      </div>`);
    document.getElementById('regresar').addEventListener('click', () => {
      const ultimo = this.medicamentos.pop();
      this.pasoMedicamento(ultimo ? this.aBorrador(ultimo) : undefined);
    });
    document.getElementById('guardar').addEventListener('click', async (ev) => {
      const boton = ev.currentTarget;
      const error = document.getElementById('error-guardar');
      boton.disabled = true;
      boton.textContent = 'Guardando…';
      try {
        const plan = await this.fuente.programar(this.medicamentos, this.pin);
        this.medicamentos = [];
        this.plan = plan;
        this.dispatchEvent(new CustomEvent('plan-guardado', { detail: plan }));
        this.pasoListo(plan.entregas);
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        boton.disabled = false;
        boton.textContent = 'Guardar horarios';
      }
    });
  }

  aBorrador(m) {
    const h24 = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(new Date(m.primeraToma * 1000))) % 24;
    const minuto = Number(new Intl.DateTimeFormat('en-US', { minute: 'numeric', timeZone: 'America/Mexico_City' }).format(new Date(m.primeraToma * 1000)));
    const dia = claveDia(m.primeraToma) === claveDia(ahoraSeg()) ? 0 : 1;
    return { nombre: m.nombre, dia, hora: h24 % 12 || 12, pm: h24 >= 12, minuto: minuto - (minuto % 5), cadaHoras: m.cadaHoras };
  }

  pasoListo(entregas) {
    this.pantalla(`
      <div class="exito" role="status">
        <p class="alerta-titulo">Horarios guardados</p>
        <p>Se enviaron al pastillero. Si está conectado, en unos segundos gira a la posición de carga. Si no, los recibe en cuanto se conecte.</p>
      </div>
      <h2>Ahora cargue el pastillero</h2>
      <ol>
        <li>Abra la tapa.</li>
        <li>Ponga las pastillas en cada compartimento como dice la lista.</li>
        <li>Deje vacío el compartimento 0, que está sobre la salida.</li>
        <li>Cierre la tapa.</li>
      </ol>
      ${this.listaEntregas(entregas)}
      <div class="botones"><button type="button" class="boton" id="listo">Listo, ya lo cargué</button></div>`);
    document.getElementById('listo').addEventListener('click', () => { location.hash = '#hoy'; });
  }
}
