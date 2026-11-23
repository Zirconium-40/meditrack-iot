// Pruebas sin internet ni base de datos:  npm test
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const Firmador = require('../src/servicios/Firmador');
const GeneradorPlan = require('../src/servicios/GeneradorPlan');
const ServicioMqtt = require('../src/servicios/ServicioMqtt');
const { GuardiaPin } = require('../src/middlewares/seguridad');

const AHORA = 1794999960; // fecha fija (minuto exacto) para que las pruebas no cambien

test('la firma del plan coincide con el texto que arma el ESP32', () => {
  const f = new Firmador('clave-de-prueba');
  const entregas = [
    { t: 1795003600, etiqueta: 'Medicamento A' },
    { t: 1795010800, etiqueta: 'Medicamento A + B' },
  ];
  const msg = f.mensajePlan(1795000000123, entregas);
  const texto = '1795000000123|1795003600:Medicamento A;1795010800:Medicamento A + B';
  const esperada = crypto.createHmac('sha256', 'clave-de-prueba').update(texto).digest('hex');
  assert.strictEqual(msg.firma, esperada);
  assert.deepStrictEqual(Object.keys(msg), ['version', 'entregas', 'firma']);
});

test('la firma del comando usa version|accion', () => {
  const f = new Firmador('k');
  const msg = f.mensajeComando(5, 'entregar_ahora');
  assert.strictEqual(msg.firma, crypto.createHmac('sha256', 'k').update('5|entregar_ahora').digest('hex'));
});

test('dos medicamentos a la misma hora van en un solo compartimento', () => {
  const g = new GeneradorPlan();
  const inicio = AHORA + 3600;
  const { entregas } = g.generar(
    [
      { nombre: 'Medicamento A', primeraToma: inicio, cadaHoras: 8 },
      { nombre: 'Medicamento B', primeraToma: inicio, cadaHoras: 12 },
    ],
    AHORA,
  );
  assert.strictEqual(entregas[0].etiqueta, 'Medicamento A + Medicamento B');
  assert.strictEqual(entregas[0].compartimento, 1);
  assert.ok(entregas.length <= 8);
  const horas = entregas.map((e) => e.t);
  assert.deepStrictEqual(horas, [...horas].sort((a, b) => a - b));
});

test('si la primera toma ya paso, empieza en la siguiente que toque', () => {
  const g = new GeneradorPlan();
  const { entregas } = g.generar([{ nombre: 'A', primeraToma: AHORA - 2 * 3600, cadaHoras: 6 }], AHORA);
  assert.strictEqual(entregas[0].t, AHORA + 4 * 3600);
});

test('nunca pasa de 8 entregas (servo de 9 compartimentos)', () => {
  const g = new GeneradorPlan();
  const { entregas } = g.generar([{ nombre: 'A', primeraToma: AHORA + 60, cadaHoras: 1 }], AHORA);
  assert.strictEqual(entregas.length, 8);
  assert.strictEqual(entregas[7].compartimento, 8);
});

test('los mensajes de error se entienden', () => {
  const g = new GeneradorPlan();
  assert.throws(() => g.generar([], AHORA), /al menos un medicamento/);
  assert.throws(() => g.generar([{ nombre: '', primeraToma: AHORA, cadaHoras: 8 }], AHORA), /nombre/);
  assert.throws(() => g.generar([{ nombre: 'A', primeraToma: AHORA, cadaHoras: 0 }], AHORA), /cada cuantas horas/);
});

test('el nombre se limpia de comas y separadores', () => {
  const g = new GeneradorPlan();
  const { entregas } = g.generar([{ nombre: 'Para,ce;ta|mol', primeraToma: AHORA + 60, cadaHoras: 24 }], AHORA);
  assert.strictEqual(entregas[0].etiqueta, 'Para ce ta mol');
});

test('el servicio MQTT ignora pastilleros ajenos y reparte por tipo', () => {
  const s = new ServicioMqtt({ url: 'x', prefijo: 'meditrack/v1', dispositivos: ['mio'], libreria: {} });
  const recibidos = [];
  s.on('telemetria', (d, datos) => recibidos.push(['telemetria', d, datos.temp]));
  s.on('estado', (d, texto) => recibidos.push(['estado', d, texto]));
  s.alRecibir('meditrack/v1/mio/telemetria', '{"temp":24.5}');
  s.alRecibir('meditrack/v1/ajeno/telemetria', '{"temp":99}');
  s.alRecibir('meditrack/v1/mio/estado', 'en_linea');
  s.alRecibir('meditrack/v1/mio/evento', 'no es json');
  assert.deepStrictEqual(recibidos, [
    ['telemetria', 'mio', 24.5],
    ['estado', 'mio', 'en_linea'],
  ]);
});

test('el PIN incorrecto se bloquea tras 5 intentos', () => {
  const g = new GuardiaPin('2468');
  const pedir = (pin) => {
    let resultado;
    g.middleware({ ip: '1.1.1.1', get: () => pin }, null, (e) => (resultado = e));
    return resultado;
  };
  assert.strictEqual(pedir('2468'), undefined);
  for (let i = 0; i < 5; i++) assert.strictEqual(pedir('0000').estado, 401);
  assert.strictEqual(pedir('2468').estado, 429);
});
