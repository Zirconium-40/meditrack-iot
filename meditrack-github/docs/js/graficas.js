// =====================================================================
//  Graficas sencillas en SVG (sin librerias)
//  - Una medida por grafica (nunca dos ejes)
//  - Al pasar el dedo o el raton se ve el valor exacto
//  - Boton para ver los mismos datos como tabla
// =====================================================================
import { aSegundos, hora, horaCorta, escapar, claveDia } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const COLOR_BIEN = '#0ca30c';
const COLOR_MAL = '#d03b3b';

// La grafica se dibuja al ancho real para que la letra no se haga chiquita
function anchoDe(contenedor) {
  return Math.round(Math.min(640, Math.max(280, (contenedor.clientWidth || 640) - 36)));
}

function pasoBonito(rango, cuantos) {
  const crudo = rango / cuantos;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * potencia >= crudo) return m * potencia;
  return 10 * potencia;
}

function armarCaja(contenedor, titulo, filasTabla, columnas) {
  contenedor.innerHTML = `
    <p class="grafica-titulo">${escapar(titulo)}</p>
    <div class="lienzo"></div>
    <button type="button" class="tabla-alternar" aria-expanded="false">Ver los datos como tabla</button>
    <div class="tabla-envoltura" hidden>
      <table><thead><tr>${columnas.map((c) => `<th scope="col">${escapar(c)}</th>`).join('')}</tr></thead>
      <tbody>${filasTabla.map((f) => `<tr>${f.map((c) => `<td>${escapar(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>`;
  const boton = contenedor.querySelector('.tabla-alternar');
  const tabla = contenedor.querySelector('.tabla-envoltura');
  boton.addEventListener('click', () => {
    const abrir = tabla.hidden;
    tabla.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    boton.textContent = abrir ? 'Ocultar la tabla' : 'Ver los datos como tabla';
  });
  return contenedor.querySelector('.lienzo');
}

function globo(contenedor) {
  let g = contenedor.querySelector('.globo');
  if (!g) {
    g = document.createElement('div');
    g.className = 'globo';
    g.hidden = true;
    contenedor.appendChild(g);
  }
  return g;
}

// ----------------------------------------------------------------------
// Linea de una sola medida a lo largo del tiempo
// ----------------------------------------------------------------------
export function graficaLinea(contenedor, { titulo, puntos, campo, unidad, color, decimales = 0 }) {
  const datos = puntos
    .map((p) => ({ t: aSegundos(p.t), v: p[campo] }))
    .filter((p) => p.t && Number.isFinite(p.v));

  if (datos.length < 2) {
    contenedor.innerHTML = `<p class="grafica-titulo">${escapar(titulo)}</p><p class="vacio">Todavía no hay suficientes lecturas para dibujar esta gráfica.</p>`;
    return;
  }

  const filas = datos.map((p) => [`${claveDia(p.t)} ${hora(p.t)}`, `${p.v.toFixed(decimales)} ${unidad}`]);
  const lienzo = armarCaja(contenedor, titulo, filas.slice().reverse(), ['Hora', titulo]);

  const W = anchoDe(contenedor), H = 220, ml = 48, mr = 16, mt = 14, mb = 34;
  const t0 = datos[0].t, t1 = datos.at(-1).t;
  let vMin = Math.min(...datos.map((p) => p.v));
  let vMax = Math.max(...datos.map((p) => p.v));
  if (vMax - vMin < 2) { vMin -= 1; vMax += 1; }
  const paso = pasoBonito(vMax - vMin, 4);
  const yMin = Math.floor(vMin / paso) * paso;
  const yMax = Math.ceil(vMax / paso) * paso;
  const X = (t) => ml + ((t - t0) / (t1 - t0 || 1)) * (W - ml - mr);
  const Y = (v) => mt + (1 - (v - yMin) / (yMax - yMin)) * (H - mt - mb);

  let marcas = '';
  for (let v = yMin; v <= yMax + 1e-9; v += paso) {
    marcas += `<line class="reja" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/>`;
    marcas += `<text class="eje" x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${Number(v.toFixed(1))}</text>`;
  }
  // Marcas de hora cada 6 horas
  const cadaSeg = (t1 - t0) > 2 * 86400 ? 86400 : W < 420 ? 12 * 3600 : 6 * 3600;
  for (let t = Math.ceil(t0 / 3600) * 3600; t <= t1; t += 3600) {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(new Date(t * 1000))) % 24;
    if (cadaSeg < 86400 ? h % (cadaSeg / 3600) !== 0 : h !== 0) continue;
    marcas += `<text class="eje" x="${X(t)}" y="${H - 10}" text-anchor="middle">${escapar(horaCorta(t))}</text>`;
  }

  const trazo = datos.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
  lienzo.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapar(titulo)}: de ${Math.min(...datos.map((p) => p.v)).toFixed(decimales)} a ${Math.max(...datos.map((p) => p.v)).toFixed(decimales)} ${escapar(unidad)}">
      ${marcas}
      <line class="linea-base" x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}"/>
      <path d="${trazo}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <g class="cursor" visibility="hidden">
        <line y1="${mt}" y2="${H - mb}" stroke="#3c4d5c" stroke-width="1" stroke-dasharray="3 3"/>
        <circle r="6" fill="${color}" stroke="#fff" stroke-width="2"/>
      </g>
      <rect x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>
    </svg>`;

  const svg = lienzo.querySelector('svg');
  const cursor = svg.querySelector('.cursor');
  const g = globo(contenedor);
  const mover = (ev) => {
    const caja = svg.getBoundingClientRect();
    const x = ((ev.clientX - caja.left) / caja.width) * W;
    const t = t0 + ((x - ml) / (W - ml - mr)) * (t1 - t0);
    let cerca = datos[0];
    for (const p of datos) if (Math.abs(p.t - t) < Math.abs(cerca.t - t)) cerca = p;
    const cx = X(cerca.t), cy = Y(cerca.v);
    cursor.setAttribute('visibility', 'visible');
    cursor.querySelector('line').setAttribute('x1', cx);
    cursor.querySelector('line').setAttribute('x2', cx);
    cursor.querySelector('circle').setAttribute('cx', cx);
    cursor.querySelector('circle').setAttribute('cy', cy);
    const cajaPadre = contenedor.getBoundingClientRect();
    g.hidden = false;
    g.textContent = `${hora(cerca.t)}: ${cerca.v.toFixed(decimales)} ${unidad}`;
    g.style.left = `${caja.left - cajaPadre.left + (cx / W) * caja.width}px`;
    g.style.top = `${caja.top - cajaPadre.top + (cy / H) * caja.height}px`;
  };
  const salir = () => { cursor.setAttribute('visibility', 'hidden'); g.hidden = true; };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerdown', mover);
  svg.addEventListener('pointerleave', salir);
}

// ----------------------------------------------------------------------
// Barras por dia: tomas confirmadas (abajo) y sin confirmar (arriba)
// ----------------------------------------------------------------------
export function graficaTomasPorDia(contenedor, porDia, dias) {
  // Rellena los dias sin tomas para que se vean como huecos reales
  const hoy = Math.floor(Date.now() / 1000);
  const mapa = new Map(porDia.map((d) => [d.fecha, d]));
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const t = hoy - i * 86400;
    const clave = claveDia(t);
    const d = mapa.get(clave) || { confirmadas: 0, sinConfirmar: 0 };
    serie.push({ t, clave, confirmadas: d.confirmadas, sinConfirmar: d.sinConfirmar });
  }
  if (!serie.some((d) => d.confirmadas + d.sinConfirmar)) {
    contenedor.innerHTML = '<p class="vacio">Todavía no hay tomas registradas en este periodo.</p>';
    return;
  }

  const nombreDia = (t) => new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', timeZone: 'America/Mexico_City' }).format(new Date(t * 1000));
  const filas = serie.map((d) => [nombreDia(d.t), String(d.confirmadas), String(d.sinConfirmar)]);
  const lienzo = armarCaja(contenedor, 'Tomas por día', filas.slice().reverse(), ['Día', 'Confirmadas', 'Sin confirmar']);
  lienzo.insertAdjacentHTML('beforebegin', `
    <ul class="leyenda-grafica">
      <li><span class="muestra" style="background:${COLOR_BIEN}"></span>✓ Confirmadas</li>
      <li><span class="muestra" style="background:${COLOR_MAL}"></span>✗ Sin confirmar</li>
    </ul>`);

  const W = anchoDe(contenedor), H = 220, ml = 36, mr = 8, mt = 12, mb = 34;
  const maximo = Math.max(1, ...serie.map((d) => d.confirmadas + d.sinConfirmar));
  const paso = Math.max(1, pasoBonito(maximo, 4));
  const yMax = Math.ceil(maximo / paso) * paso;
  const banda = (W - ml - mr) / serie.length;
  const ancho = Math.min(46, banda * 0.62);
  const Y = (v) => mt + (1 - v / yMax) * (H - mt - mb);
  const cadaEtiqueta = Math.ceil(serie.length / Math.max(3, Math.floor(W / 72)));

  let marcas = '';
  for (let v = 0; v <= yMax; v += paso) {
    marcas += `<line class="reja" x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="eje" x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  }

  // Rectangulo con las esquinas de arriba redondeadas (4 px)
  const barra = (x, y0, y1, color, redondear) => {
    const r = redondear ? Math.min(4, (y0 - y1) / 2) : 0;
    return `<path fill="${color}" d="M${x} ${y0}V${y1 + r}${r ? `Q${x} ${y1} ${x + r} ${y1}` : ''}H${x + ancho - r}${r ? `Q${x + ancho} ${y1} ${x + ancho} ${y1 + r}` : ''}V${y0}Z"/>`;
  };

  let barras = '';
  serie.forEach((d, i) => {
    const x = ml + i * banda + (banda - ancho) / 2;
    const base = Y(0);
    const yConf = Y(d.confirmadas);
    if (d.confirmadas) barras += barra(x, base, yConf, COLOR_BIEN, !d.sinConfirmar);
    if (d.sinConfirmar) {
      const y0 = d.confirmadas ? yConf - 2 : base; // 2 px de separacion
      barras += barra(x, y0, y0 - (base - Y(d.sinConfirmar)), COLOR_MAL, true);
    }
    if (i % cadaEtiqueta === 0 || i === serie.length - 1) {
      const ultima = i === serie.length - 1;
      barras += `<text class="eje" x="${ultima ? Math.min(x + ancho / 2, W - mr) : x + ancho / 2}" y="${H - 10}" text-anchor="${ultima && x + ancho / 2 > W - mr - 24 ? 'end' : 'middle'}">${escapar(nombreDia(d.t))}</text>`;
    }
    barras += `<rect class="zona" data-i="${i}" x="${ml + i * banda}" y="${mt}" width="${banda}" height="${H - mt - mb}" fill="transparent"/>`;
  });

  lienzo.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tomas por día">${marcas}<line class="linea-base" x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}"/>${barras}</svg>`;

  const svg = lienzo.querySelector('svg');
  const g = globo(contenedor);
  svg.addEventListener('pointermove', (ev) => {
    const zona = ev.target.closest('.zona');
    if (!zona) return;
    const d = serie[Number(zona.dataset.i)];
    const caja = svg.getBoundingClientRect();
    const cajaPadre = contenedor.getBoundingClientRect();
    const cx = ml + (Number(zona.dataset.i) + 0.5) * banda;
    g.hidden = false;
    g.textContent = `${nombreDia(d.t)}: ${d.confirmadas} confirmadas, ${d.sinConfirmar} sin confirmar`;
    g.style.left = `${caja.left - cajaPadre.left + (cx / W) * caja.width}px`;
    g.style.top = `${caja.top - cajaPadre.top + (Y(d.confirmadas + d.sinConfirmar) / H) * caja.height}px`;
  });
  svg.addEventListener('pointerleave', () => { g.hidden = true; });
}
