// Utilidades de fechas, textos e iconos
import { CONFIG } from './config.js';

const fmtHora = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: CONFIG.ZONA });
const fmtHoraCorta = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hour12: true, timeZone: CONFIG.ZONA });
const fmtFechaLarga = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: CONFIG.ZONA });
const fmtDiaClave = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: CONFIG.ZONA });

// Acepta segundos, milisegundos o texto ISO y devuelve segundos
export function aSegundos(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return valor > 1e11 ? Math.floor(valor / 1000) : valor;
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

export const ahoraSeg = () => Math.floor(Date.now() / 1000);

// "2:05 p.m." -> se separa como "2:05 p. m." para leerse mejor
export function hora(seg) {
  return fmtHora.format(new Date(seg * 1000)).replace(/\s?([ap])\.\s?m\./i, ' $1. m.');
}

export function horaCorta(seg) {
  return fmtHoraCorta.format(new Date(seg * 1000)).replace(/\s?([ap])\.\s?m\./i, ' $1. m.');
}

export function fechaLarga(seg) {
  const t = fmtFechaLarga.format(new Date(seg * 1000));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function claveDia(seg) {
  return fmtDiaClave.format(new Date(seg * 1000));
}

// "hoy", "mañana", "ayer" o "sábado 21 de noviembre"
export function diaRelativo(seg) {
  const hoy = claveDia(ahoraSeg());
  const dia = claveDia(seg);
  if (dia === hoy) return 'hoy';
  if (dia === claveDia(ahoraSeg() + 86400)) return 'mañana';
  if (dia === claveDia(ahoraSeg() - 86400)) return 'ayer';
  return fmtFechaLarga.format(new Date(seg * 1000));
}

export function cuandoCompleto(seg) {
  return `${diaRelativo(seg)} a las ${hora(seg)}`;
}

export function mayuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// "en 1 hora y 20 minutos"
export function faltan(seg) {
  const min = Math.ceil((seg - ahoraSeg()) / 60);
  if (min <= 0) return 'ahora';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const partes = [];
  if (h) partes.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
  if (m) partes.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);
  return `en ${partes.join(' y ')}`;
}

export function haceCuanto(seg) {
  const s = ahoraSeg() - seg;
  if (s < 60) return 'hace unos segundos';
  const min = Math.round(s / 60);
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  return `${diaRelativo(seg)} a las ${hora(seg)}`;
}

export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Iconos simples (trazo), siempre acompanados de texto
const trazos = {
  bien: '<circle cx="12" cy="12" r="10" fill="#dcefe8" stroke="#0b6b53"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#0b6b53"/>',
  mal: '<circle cx="12" cy="12" r="10" fill="#fbe6e4" stroke="#b3261e"/><path d="M12 7v6M12 16.5v.01" stroke="#b3261e"/>',
  pastilla: '<rect x="3" y="8" width="18" height="8" rx="4" fill="#f2c14e" stroke="#4a3500"/><path d="M12 8v8" stroke="#4a3500"/>',
  tapa: '<rect x="4" y="10" width="16" height="10" rx="2" fill="#fff" stroke="#3c4d5c"/><path d="M4 10l3-5h10l3 5" stroke="#3c4d5c"/>',
  termometro: '<path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z" fill="#fff" stroke="#3c4d5c"/><circle cx="12" cy="17" r="2" fill="#eb6834"/>',
  gota: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" fill="#fff" stroke="#3c4d5c"/>',
  senal: '<path d="M4 18h.01M8 14v4M12 10v8M16 6v12M20 3v15" stroke="#3c4d5c"/>',
  reloj: '<circle cx="12" cy="12" r="9" fill="#fff" stroke="#3c4d5c"/><path d="M12 7v5l3 2" stroke="#3c4d5c"/>',
  info: '<circle cx="12" cy="12" r="10" fill="#fff" stroke="#3c4d5c"/><path d="M12 11v6M12 7.5v.01" stroke="#3c4d5c"/>',
};

export function icono(nombre) {
  return `<svg class="icono" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${trazos[nombre] || trazos.info}</svg>`;
}

// Textos de cada tipo de evento del pastillero
export const EVENTOS = {
  entrega: { icono: 'pastilla', texto: (e) => `Se entregó la toma del compartimento ${e.compartimento}${e.etiqueta ? ` (${e.etiqueta})` : ''}` },
  confirmada: { icono: 'bien', texto: (e) => `Toma confirmada${e.etiqueta ? `: ${e.etiqueta}` : ''}` },
  sin_confirmar: { icono: 'mal', texto: (e) => `Toma sin confirmar${e.etiqueta ? `: ${e.etiqueta}` : ''}` },
  tapa_abierta: { icono: 'tapa', texto: () => 'Se abrió la tapa' },
  tapa_cerrada: { icono: 'tapa', texto: () => 'Se cerró la tapa' },
  bloqueo_tapa: { icono: 'mal', texto: () => 'No pudo girar porque la tapa estaba abierta' },
  revisado: { icono: 'bien', texto: () => 'Alguien revisó el pastillero' },
  plan_recibido: { icono: 'reloj', texto: () => 'Recibió horarios nuevos' },
  plan_rechazado: { icono: 'mal', texto: (e) => `Rechazó unos horarios (${e.etiqueta || 'sin firma'})` },
  sin_tomas: { icono: 'info', texto: () => 'Ya no quedan tomas: hay que recargar' },
  energia_interrumpida: { icono: 'mal', texto: () => 'Se fue la luz mientras giraba' },
  error_origen: { icono: 'mal', texto: () => 'No encontró la posición de inicio del disco' },
  reinicio: { icono: 'info', texto: () => 'El pastillero se encendió' },
  comando_rechazado: { icono: 'mal', texto: () => 'Rechazó una orden sin firma' },
};
