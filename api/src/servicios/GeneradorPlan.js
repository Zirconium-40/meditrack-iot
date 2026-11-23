const ErrorApi = require('../utilidades/ErrorApi');

/**
 * Convierte lo que captura el cuidador (medicamentos con su primera toma
 * y cada cuantas horas) en la lista de las proximas entregas.
 *
 * Si dos medicamentos coinciden en la misma hora, van JUNTOS en un solo
 * compartimento ("Medicamento A + Medicamento B"), como dice la propuesta.
 */
class GeneradorPlan {
  constructor({ maxEntregas = 8, diasMaximos = 14 } = {}) {
    this.maxEntregas = maxEntregas;
    this.diasMaximos = diasMaximos;
  }

  generar(medicamentos, ahora = Math.floor(Date.now() / 1000)) {
    const limpios = this.validar(medicamentos);
    const limite = ahora + this.diasMaximos * 24 * 3600;
    const porHora = new Map(); // hora -> [nombres]

    for (const med of limpios) {
      const horas = med.horas.length ? med.horas : this.repetir(med, ahora, limite);
      for (const h of horas) {
        const minuto = h - (h % 60);
        if (minuto < ahora - 60 || minuto > limite) continue;
        if (!porHora.has(minuto)) porHora.set(minuto, []);
        const nombres = porHora.get(minuto);
        if (!nombres.includes(med.nombre)) nombres.push(med.nombre);
      }
    }

    const entregas = [...porHora.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, this.maxEntregas)
      .map(([t, nombres], i) => ({ t, etiqueta: nombres.join(' + '), compartimento: i + 1 }));

    if (entregas.length === 0) {
      throw new ErrorApi(400, 'No quedo ninguna toma en el futuro. Revise la hora de la primera toma.');
    }
    return { medicamentos: limpios, entregas };
  }

  repetir(med, ahora, limite) {
    const paso = med.cadaHoras * 3600;
    let t = med.primeraToma;
    // Si la primera toma ya paso, se brinca a la siguiente que toque
    if (t < ahora - 60) t += Math.ceil((ahora - 60 - t) / paso) * paso;
    const horas = [];
    while (t <= limite && horas.length < this.maxEntregas) {
      horas.push(t);
      t += paso;
    }
    return horas;
  }

  validar(medicamentos) {
    if (!Array.isArray(medicamentos) || medicamentos.length === 0) {
      throw new ErrorApi(400, 'Agregue al menos un medicamento.');
    }
    if (medicamentos.length > 5) {
      throw new ErrorApi(400, 'Se pueden programar hasta 5 medicamentos.');
    }
    return medicamentos.map((m, i) => {
      const numero = i + 1;
      const nombre = String(m?.nombre ?? '')
        .replace(/[,;|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20);
      if (!nombre) throw new ErrorApi(400, `Escriba el nombre del medicamento ${numero}.`);

      const horas = Array.isArray(m.horas) ? m.horas.map(Number).filter(Number.isFinite) : [];
      if (horas.length) return { nombre, horas, primeraToma: horas[0], cadaHoras: 0 };

      const primeraToma = Number(m.primeraToma);
      const cadaHoras = Number(m.cadaHoras);
      if (!Number.isFinite(primeraToma) || primeraToma < 1700000000) {
        throw new ErrorApi(400, `Elija la hora de la primera toma de ${nombre}.`);
      }
      if (!Number.isInteger(cadaHoras) || cadaHoras < 1 || cadaHoras > 72) {
        throw new ErrorApi(400, `Elija cada cuantas horas se toma ${nombre} (de 1 a 72).`);
      }
      return { nombre, horas: [], primeraToma: Math.floor(primeraToma), cadaHoras };
    });
  }
}

module.exports = GeneradorPlan;
