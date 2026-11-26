// Restaura una copia: npm run restore -- ruta/al/archivo.db
// Con el sistema DETENIDO. Antes de reemplazar, guarda la base actual como data/antes-de-restaurar-FECHA.db
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../server/db.js';

const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) { console.error('Uso: npm run restore -- ruta/al/archivo.db (el archivo no existe o no se indicó)'); process.exit(1); }
const probe = new DatabaseSync(origen, { readOnly: true });
try {
  const ok = probe.prepare('PRAGMA integrity_check').get();
  const tabla = probe.prepare("SELECT name FROM sqlite_master WHERE name = 'ventas'").get();
  if (Object.values(ok)[0] !== 'ok' || !tabla) throw new Error('El archivo no es una copia válida de este sistema.');
} catch (e) { console.error('ERROR:', e.message); process.exit(1); } finally { probe.close(); }

if (fs.existsSync(DB_PATH)) {
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const guardado = path.join(path.dirname(DB_PATH), `antes-de-restaurar-${sello}.db`);
  fs.copyFileSync(DB_PATH, guardado);
  console.log('Base actual guardada en:', guardado);
}
for (const ext of ['-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.copyFileSync(origen, DB_PATH);
console.log('Restauración lista. Ya podés iniciar el sistema con npm start.');
