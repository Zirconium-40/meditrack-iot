// Misma regla que la API (GeneradorPlan.js) para el modo demo:
// junta en un compartimento los medicamentos que coinciden en la hora.
export function generarEntregas(medicamentos, ahora = Math.floor(Date.now() / 1000), max = 8) {
  const limite = ahora + 14 * 86400;
  const porHora = new Map();
  for (const med of medicamentos) {
    const paso = med.cadaHoras * 3600;
    let t = med.primeraToma;
    if (t < ahora - 60) t += Math.ceil((ahora - 60 - t) / paso) * paso;
    for (let n = 0; t <= limite && n < max; n++, t += paso) {
      const minuto = t - (t % 60);
      if (!porHora.has(minuto)) porHora.set(minuto, []);
      if (!porHora.get(minuto).includes(med.nombre)) porHora.get(minuto).push(med.nombre);
    }
  }
  return [...porHora.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, max)
    .map(([t, nombres], i) => ({ t, etiqueta: nombres.join(' + '), compartimento: i + 1 }));
}
