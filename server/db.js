// Acceso a la base de datos SQLite (módulo integrado de Node, sin dependencias externas).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setZona, ahora as ahoraLocal } from './util.js';
import { aplicarRestauracionPendiente } from './restaurar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// En producción (el Dockerfile pone NODE_ENV=production) la base TIENE que estar en el disco persistente:
// el disco del contenedor se borra en cada deploy. El disco persistente se monta en /data (o en
// RAILWAY_VOLUME_MOUNT_PATH / DATA_DIR). La imagen no trae esa carpeta: si no existe, el disco no está conectado
// y el sistema NO arranca, para no perder datos sin darse cuenta. Vale para Railway, Render, Fly.io o un VPS.
const produccion = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const volumen = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || (produccion ? '/data' : null);
if (produccion) {
  const error = !fs.existsSync(volumen)
    ? `no existe ${volumen}: falta conectar el disco persistente (volumen) montado en ${volumen}.`
    : process.env.DB_PATH && !path.resolve(process.env.DB_PATH).startsWith(path.resolve(volumen))
      ? `DB_PATH (${process.env.DB_PATH}) está fuera del disco persistente (${volumen}).`
      : null;
  if (error) {
    console.error(`ERROR: ${error} Sin disco persistente los datos se perderían en la próxima actualización.`);
    process.exit(1);
  }
}
export const DB_PATH = path.resolve(raiz, process.env.DB_PATH || (volumen ? path.join(volumen, 'negocio.db') : 'data/negocio.db'));
// true si la base no está en el lugar por defecto (data/negocio.db): las copias automáticas van al lado de la base.
export const DB_PERSONALIZADA = !!(process.env.DB_PATH || volumen);
export const RAIZ = raiz;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Restauración pendiente (subida con npm run subir-copia): se aplica antes de abrir la base.
export const BASE_REEMPLAZADA = aplicarRestauracionPendiente(DB_PATH);
if (BASE_REEMPLAZADA) console.log(`Copia restaurada. La base anterior quedó guardada en: ${BASE_REEMPLAZADA}`);

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA synchronous = FULL'); // prioriza no perder datos ante un corte de luz

// ---- Helpers con caché de sentencias
const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}
export const all = (sql, ...p) => stmt(sql).all(...p);
export const get = (sql, ...p) => stmt(sql).get(...p);
export const run = (sql, ...p) => {
  const r = stmt(sql).run(...p);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};

// ---- Transacciones. BEGIN IMMEDIATE toma el bloqueo de escritura desde el principio:
// dos operaciones simultáneas se ejecutan una después de la otra y nunca venden dos veces el mismo stock.
let profundidad = 0;
export function tx(fn) {
  if (profundidad > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  profundidad++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ya se revirtió */ }
    throw e;
  } finally {
    profundidad--;
  }
}

// ---- Migraciones: archivos migrations/NNN_nombre.sql aplicados en orden, una sola vez cada uno.
export function migrar() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada TEXT NOT NULL)');
  const dir = path.join(raiz, 'migrations');
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const hechas = new Set(all('SELECT nombre FROM schema_migrations').map((r) => r.nombre));
  for (const f of archivos) {
    if (hechas.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (nombre, aplicada) VALUES (?, ?)').run(f, new Date().toISOString());
      db.exec('COMMIT');
      console.log(`Migración aplicada: ${f}`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Falló la migración ${f}: ${e.message}`);
    }
  }
  const z = get("SELECT valor FROM config WHERE clave = 'zona_horaria'");
  if (z) setZona(z.valor);
}

export const config = {
  get: (k) => get('SELECT valor FROM config WHERE clave = ?', k)?.valor ?? null,
  set: (k, v) => run('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', k, String(v)),
};

export function auditar(usuarioId, accion, entidad, entidadId = null, detalle = null) {
  run('INSERT INTO auditoria (fecha, usuario_id, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?, ?)',
    ahoraLocal(), usuarioId ?? null, accion, entidad, entidadId, detalle == null ? null : JSON.stringify(detalle));
}
