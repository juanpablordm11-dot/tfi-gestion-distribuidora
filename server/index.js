// Punto de entrada: arranca la base de datos, la API y la interfaz web.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrar, DB_PATH, BASE_REEMPLAZADA, run, auditar } from './db.js';
import { crearApp } from './http.js';
import { registrarRutas } from './routes.js';
import { programarBackups, copiaAlCerrar } from './backup.js';
import { canalRecuperacion } from './auth.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
migrar();
// Después de una restauración: las sesiones de la base anterior no sirven y queda registrado en la actividad.
if (BASE_REEMPLAZADA) { run('DELETE FROM sesiones'); auditar(null, 'restauracion_aplicada', 'sistema', null, { base_anterior: path.basename(BASE_REEMPLAZADA) }); }

const PUERTO = Number(process.env.PORT || 3000);
// Por seguridad escucha solo en esta computadora. En un servidor publicado se usa HOST=0.0.0.0 detrás de HTTPS.
const HOST = process.env.HOST || '127.0.0.1';
const app = crearApp({ publicDir: path.join(raiz, 'public'), confiarProxy: process.env.TRUST_PROXY === '1' });
registrarRutas(app);
programarBackups();

app.server.listen(PUERTO, HOST, () => {
  console.log('────────────────────────────────────────────');
  console.log(' Sistema de gestión iniciado');
  console.log(` Abrilo en tu navegador: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PUERTO}`);
  console.log(` Base de datos: ${DB_PATH}`);
  console.log(` Códigos de recuperación de contraseña: canal "${canalRecuperacion().nombre}"`);
  console.log('────────────────────────────────────────────');
});

let cerrando = false;
// Ctrl + C (SIGINT), cierre pedido (SIGTERM), Ctrl + Pausa (SIGBREAK) y cerrar la ventana (SIGHUP: Windows da unos segundos):
// en todos los casos se hace la copia de seguridad antes de terminar.
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(s, () => {
  if (cerrando) return;
  cerrando = true;
  console.log('\nCerrando...');
  copiaAlCerrar();
  app.server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref();
});
