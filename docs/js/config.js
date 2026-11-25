// =====================================================================
//  Configuracion de la pagina. Cambien SOLO estos valores.
// =====================================================================
export const CONFIG = {
  // Direccion de su API en Render (sin "/" al final).
  // Si la dejan vacia, la pagina muestra datos de ejemplo (modo demo).
  API_URL: 'https://meditrack-iot.onrender.com',

  // Igual que ID_DISPOSITIVO en config.h y DISPOSITIVOS en Render
  ID_DISPOSITIVO: 'meditrack-demo-01',

  // Broker publico de HiveMQ por WebSocket seguro (tiempo real)
  MQTT_WS: 'wss://broker.hivemq.com:8884/mqtt',
  PREFIJO: 'meditrack/v1',

  ZONA: 'America/Mexico_City',
};

// Agregar ?demo=1 a la direccion siempre muestra datos de ejemplo
export const MODO_DEMO = !CONFIG.API_URL || new URLSearchParams(location.search).has('demo');
