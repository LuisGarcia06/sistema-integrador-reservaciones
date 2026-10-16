import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const pool = require('../backend/config/database.js');
const {
  ejecutarCicloSincronizacion,
} = require('../backend/integrations/getyourguide/getyourguideGmailSync.service.js');

try {
  const resultado = await ejecutarCicloSincronizacion();

  if (resultado.initialized) {
    console.log('Sincronización inicializada');
    console.log('Baseline historyId guardado');
    console.log('Eventos importados: 0');
  } else {
    console.log(`Nuevos mensajes detectados: ${resultado.messagesDetected}`);
    console.log(`Eventos registrados: ${resultado.eventsRegistered}`);
    console.log(`Duplicados: ${resultado.duplicates}`);
    console.log(`Unknown ignorados: ${resultado.unknownIgnored}`);
    console.log(`Recovery: ${Boolean(resultado.recovery)}`);
  }
} catch (error) {
  console.error('Error al ejecutar ciclo GetYourGuide Gmail Sync. Revisa logs sanitizados sin imprimir credenciales.');
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
