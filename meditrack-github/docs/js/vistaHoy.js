// =====================================================================
//  Vista "Hoy": hora, siguiente toma, dibujo del carrusel y estado
// =====================================================================
import { aSegundos, ahoraSeg, hora, fechaLarga, cuandoCompleto, faltan, haceCuanto, icono, escapar } from './util.js';

const COMPARTIMENTOS = 9;     // servo de 180 grados: 0 a 8
const GRADOS = 22.5;          // cada compartimento

export class VistaHoy {
  constructor() {
    this.el = {
      hora: document.getElementById('hora-actual'),
      fecha: document.getElementById('fecha-actual'),
      carrusel: document.getElementById('carrusel'),
      sigHora: document.getElementById('siguiente-hora'),
      sigDetalle: document.getElementById('siguiente-detalle'),
      estado: document.getElementById('estado-lista'),
      alerta: document.getElementById('alerta-toma'),
      alertaDetalle: document.getElementById('alerta-detalle'),
      revision: document.getElementById('alerta-revision'),
      revisionTitulo: document.getElementById('revision-titulo'),
      revisionDetalle: document.getElementById('revision-detalle'),
    };
    this.datos = { telemetria: null, plan: null, enLinea: false, vistoEn: null };
    this.relojear();
    setInterval(() => this.relojear(), 1000);
    setInterval(() => this.dibujar(), 15000); // "en 20 minutos" se actualiza solo
  }

  actualizar(cambios) {
    Object.assign(this.datos, cambios);
    this.dibujar();
  }

  relojear() {
    const s = ahoraSeg();
    this.el.hora.textContent = hora(s);
    this.el.fecha.textContent = fechaLarga(s);
  }

  // Que compartimento sigue: sale de la telemetria, o del plan si no hay
  calcular() {
    const { telemetria: t, plan } = this.datos;
    const entregas = plan?.entregas || [];
    const cantidad = entregas.length;
    let siguienteComp = null;
    if (t && Number.isFinite(t.restantes) && cantidad) {
      siguienteComp = t.restantes > 0 ? cantidad - t.restantes + 1 : null;
    } else if (cantidad) {
      const prox = entregas.find((e) => e.t >= ahoraSeg() - 600);
      siguienteComp = prox ? prox.compartimento : null;
    }
    let restantes = t?.restantes ?? (siguienteComp ? cantidad - siguienteComp + 1 : 0);
    // Mientras se espera la confirmacion, esa toma ya esta en el vasito:
    // la "siguiente" es la que viene despues.
    const enVasito = t?.estado === 'esperando_confirmacion' && siguienteComp && t.compartimento === siguienteComp;
    if (enVasito) {
      siguienteComp = siguienteComp < cantidad ? siguienteComp + 1 : null;
      restantes = Math.max(0, restantes - 1);
    }
    const entrega = entregas.find((e) => e.compartimento === siguienteComp);
    const sigT = enVasito ? entrega?.t ?? null : aSegundos(t?.siguiente) ?? entrega?.t ?? null;
    const sigEtiqueta = enVasito ? entrega?.etiqueta || '' : t?.siguienteEtiqueta || entrega?.etiqueta || '';
    return { cantidad, siguienteComp, sigT, sigEtiqueta, restantes, enVasito: enVasito ? t.compartimento : null };
  }

  dibujar() {
    const c = this.calcular();
    const t = this.datos.telemetria;
    this.dibujarCarrusel(c);
    this.dibujarSiguiente(c);
    this.dibujarAlertas(t, c);
    this.dibujarEstado(t, c);
  }

  dibujarSiguiente(c) {
    if (!c.cantidad) {
      this.el.sigHora.textContent = 'Sin horarios';
      this.el.sigDetalle.textContent = 'Pida a su cuidador que programe los horarios en la sección Horarios.';
    } else if (!c.siguienteComp || !c.sigT) {
      this.el.sigHora.textContent = 'Ya no quedan tomas';
      this.el.sigDetalle.textContent = 'Hay que recargar el pastillero y programar los horarios nuevos.';
    } else {
      this.el.sigHora.textContent = hora(c.sigT);
      const cuando = cuandoCompleto(c.sigT).split(' a las ')[0];
      this.el.sigDetalle.innerHTML = `${escapar(cuando.charAt(0).toUpperCase() + cuando.slice(1))}, ${escapar(faltan(c.sigT))}.<br>${c.sigEtiqueta ? `${escapar(c.sigEtiqueta)}, ` : ''}compartimento ${c.siguienteComp}.`;
    }
  }

  dibujarAlertas(t, c) {
    const estado = t?.estado;
    this.el.alerta.hidden = estado !== 'esperando_confirmacion';
    if (estado === 'esperando_confirmacion') {
      const comp = t.compartimento ? ` del compartimento ${t.compartimento}` : '';
      this.el.alertaDetalle.textContent = `Ya cayeron las pastillas${comp} en el vasito. Tómelas y apriete el botón verde del pastillero.`;
    }
    const revisar = estado === 'revision' || estado === 'tapa_abierta';
    this.el.revision.hidden = !revisar;
    if (estado === 'tapa_abierta') {
      this.el.revisionTitulo.textContent = 'Cierre la tapa';
      this.el.revisionDetalle.textContent = 'Es hora de una toma, pero la tapa está abierta. Al cerrarla, el pastillero entrega sus pastillas.';
    } else if (estado === 'revision') {
      this.el.revisionTitulo.textContent = 'Revise el pastillero';
      this.el.revisionDetalle.textContent = 'Hay una toma sin confirmar o se fue la luz. Revise el vasito y apriete el botón verde para seguir.';
    }
  }

  dibujarEstado(t, c) {
    const items = [];
    const { enLinea, vistoEn } = this.datos;
    const visto = aSegundos(vistoEn) ?? aSegundos(t?.t);

    items.push(enLinea
      ? { icono: 'senal', titulo: 'El pastillero está conectado', detalle: visto ? `Última noticia ${haceCuanto(visto)}.` : '' }
      : { icono: 'mal', titulo: 'El pastillero no está conectado', detalle: visto ? `Última noticia ${haceCuanto(visto)}. Sigue entregando sus tomas aunque no tenga internet.` : 'Revise que esté encendido y con internet.', atencion: true });

    if (t?.tapa) {
      items.push(t.tapa === 'cerrada'
        ? { icono: 'bien', titulo: 'La tapa está cerrada', detalle: 'Puede girar cuando sea la hora.' }
        : { icono: 'tapa', titulo: 'La tapa está abierta', detalle: 'Ciérrela para que el pastillero pueda girar.', atencion: true });
    }
    if (Number.isFinite(t?.temp)) {
      const calor = t.temp > 30;
      items.push({ icono: 'termometro', titulo: `Temperatura: ${t.temp.toFixed(1)} °C`, detalle: calor ? 'Hace calor para sus medicinas. Ponga el pastillero en un lugar más fresco.' : 'Buena para guardar sus medicinas.', atencion: calor });
    }
    if (Number.isFinite(t?.hum)) {
      const humedo = t.hum > 65;
      items.push({ icono: 'gota', titulo: `Humedad: ${Math.round(t.hum)} %`, detalle: humedo ? 'Hay mucha humedad. Aleje el pastillero del baño o la cocina.' : 'Buena para guardar sus medicinas.', atencion: humedo });
    }
    if (c.cantidad) {
      items.push(c.restantes > 0
        ? { icono: 'pastilla', titulo: `Quedan ${c.restantes} ${c.restantes === 1 ? 'toma' : 'tomas'}`, detalle: `De ${c.cantidad} que se cargaron.` }
        : { icono: 'mal', titulo: 'Ya no quedan tomas', detalle: 'Hay que recargar el pastillero.', atencion: true });
    }

    this.el.estado.innerHTML = items.map((i) => `
      <li class="${i.atencion ? 'atencion' : ''}">${icono(i.icono)}
        <div><strong>${escapar(i.titulo)}</strong>${i.detalle ? `<span class="detalle">${escapar(i.detalle)}</span>` : ''}</div>
      </li>`).join('');
  }

  // Dibujo del disco: el compartimento 0 (salida) va arriba
  dibujarCarrusel(c) {
    const cx = 160, cy = 160, rExt = 146, rInt = 54;
    const punto = (r, grados) => {
      const a = (grados * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    let sectores = '';
    const descripcion = [];
    for (let n = 0; n < COMPARTIMENTOS; n++) {
      const medio = -90 + n * GRADOS;
      const a0 = medio - GRADOS / 2 + 1, a1 = medio + GRADOS / 2 - 1; // pequena separacion entre sectores
      const [x0, y0] = punto(rExt, a0), [x1, y1] = punto(rExt, a1);
      const [x2, y2] = punto(rInt, a1), [x3, y3] = punto(rInt, a0);
      let clase = 'vacio';
      if (n === 0) clase = 'salida';
      else if (!c.cantidad || n > c.cantidad) clase = 'vacio';
      else if (c.siguienteComp && n === c.siguienteComp) clase = 'siguiente';
      else if (!c.siguienteComp || n < c.siguienteComp) clase = 'entregado';
      else clase = 'cargado';
      const estilos = {
        salida: 'fill="url(#rayado)" stroke="#3c4d5c"',
        vacio: 'fill="#ffffff" stroke="#b9c6d1"',
        entregado: 'fill="#d6dde3" stroke="#b9c6d1"',
        cargado: 'fill="#dcefe8" stroke="#0b6b53"',
        siguiente: 'fill="#f2c14e" stroke="#0f1f2e" stroke-width="4"',
      };
      sectores += `<path d="M${x0} ${y0}A${rExt} ${rExt} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${rInt} ${rInt} 0 0 0 ${x3} ${y3}Z" ${estilos[clase]} stroke-width="${clase === 'siguiente' ? 4 : 2}"/>`;
      const [tx, ty] = punto((rExt + rInt) / 2, medio);
      const texto = n === 0 ? '' : clase === 'entregado' ? '✓' : String(n);
      const colorTexto = clase === 'entregado' ? '#3c4d5c' : '#0f1f2e';
      sectores += `<text x="${tx}" y="${ty + 8}" text-anchor="middle" font-size="${clase === 'siguiente' ? 26 : 22}" font-weight="700" fill="${colorTexto}" font-family="inherit">${texto}</text>`;
      if (clase === 'siguiente') descripcion.push(`el compartimento ${n} es la siguiente toma`);
    }
    const centro = c.cantidad && c.restantes > 0
      ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="34" font-weight="700" fill="#0f1f2e" font-family="inherit">${c.restantes}</text><text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="15" fill="#3c4d5c" font-family="inherit">por tomar</text>`
      : `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="16" fill="#3c4d5c" font-family="inherit">vacío</text>`;

    this.el.carrusel.setAttribute('aria-label',
      `Dibujo del pastillero con 9 compartimentos. ${c.cantidad ? `Quedan ${c.restantes} tomas` : 'No tiene horarios'}${descripcion.length ? `; ${descripcion[0]}` : ''}.`);
    this.el.carrusel.innerHTML = `
      <svg viewBox="0 0 320 336" aria-hidden="true">
        <defs><pattern id="rayado" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#b9c6d1" stroke-width="4"/></pattern></defs>
        ${sectores}
        <circle cx="${cx}" cy="${cy}" r="${rInt - 6}" fill="#ffffff" stroke="#b9c6d1" stroke-width="2"/>
        ${centro}
        <text x="${cx}" y="332" text-anchor="middle" font-size="15" fill="#3c4d5c" font-family="inherit">Arriba: salida al vasito</text>
      </svg>`;
  }
}
