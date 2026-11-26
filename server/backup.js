// Copias de seguridad consistentes con VACUUM INTO (se pueden hacer con el sistema en uso).
import fs from 'node:fs';
import path from 'node:path';
import { db, RAIZ, DB_PATH, DB_PERSONALIZADA } from './db.js';
import { ahora } from './util.js';

export const DIR_BACKUPS = path.resolve(RAIZ, process.env.BACKUP_DIR || (DB_PERSONALIZADA ? path.join(path.dirname(DB_PATH), 'backups') : 'backups'));
const MANTENER = Number(process.env.BACKUPS_MANTENER || 30);
// Cada cuántas horas se hace la copia automática (por defecto 20). Con datos reales en una PC conviene 2.
const HORAS = Math.max(0.25, Number(process.env.BACKUP_HORAS || 20));
// Carpeta espejo opcional: cada copia automática se duplica ahí (otra carpeta, OneDrive, un pendrive…).
export const DIR_ESPEJO = process.env.BACKUP_ESPEJO ? path.resolve(process.env.BACKUP_ESPEJO) : null;

const sello = () => ahora().replace(/[-: ]/g, '').replace(/^(\d{8})(\d{6})$/, '$1-$2');

export function crearBackup(prefijo = 'negocio') {
  fs.mkdirSync(DIR_BACKUPS, { recursive: true });
  const destino = path.join(DIR_BACKUPS, `${prefijo}-${sello()}.db`);
  if (fs.existsSync(destino)) fs.unlinkSync(destino);
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  if (prefijo === 'negocio' && DIR_ESPEJO) {
    // Si el espejo falla (pendrive sacado, carpeta sin permiso) la copia principal igual queda hecha.
    try { fs.mkdirSync(DIR_ESPEJO, { recursive: true }); fs.copyFileSync(destino, path.join(DIR_ESPEJO, path.basename(destino))); podar(DIR_ESPEJO); }
    catch (e) { console.error(`No se pudo duplicar la copia en ${DIR_ESPEJO}: ${e.message}`); }
  }
  podar(DIR_BACKUPS);
  return destino;
}

const listar = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).map((f) => {
  const st = fs.statSync(path.join(dir, f));
  return { nombre: f, tamano: st.size, fecha: st.mtime.toISOString() };
}).sort((a, b) => b.nombre.localeCompare(a.nombre)) : []);

export const listarBackups = () => listar(DIR_BACKUPS);

function podar(dir) {
  const todos = listar(dir).filter((b) => b.nombre.startsWith('negocio-'));
  for (const b of todos.slice(MANTENER)) fs.unlinkSync(path.join(dir, b.nombre));
}

// Copia automática: una al arrancar (si la última tiene más de HORAS) y se revisa cada 10 minutos.
export function programarBackups() {
  const revisar = () => {
    try {
      const ult = listarBackups().find((b) => b.nombre.startsWith('negocio-'));
      if (!ult || Date.now() - Date.parse(ult.fecha) > HORAS * 3600 * 1000 * 0.97) {
        const f = crearBackup();
        console.log(`Copia de seguridad automática: ${path.basename(f)}${DIR_ESPEJO ? ' (duplicada en el espejo)' : ''}`);
      }
    } catch (e) { console.error('No se pudo hacer la copia automática:', e.message); }
  };
  setTimeout(revisar, 5000).unref();
  setInterval(revisar, 10 * 60 * 1000).unref();
}

// Copia al cerrar el sistema (Ctrl + C): lo último cargado queda respaldado aunque falten horas para la próxima.
export function copiaAlCerrar() {
  try { const f = crearBackup(); console.log(`Copia de seguridad al cerrar: ${path.basename(f)}`); }
  catch (e) { console.error('No se pudo hacer la copia al cerrar:', e.message); }
}

export function rutaBackup(nombre) {
  if (!/^[\w.-]+\.db$/.test(nombre)) return null;
  const p = path.join(DIR_BACKUPS, nombre);
  return fs.existsSync(p) ? p : null;
}
