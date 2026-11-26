// Restaurar una copia en el servidor (mudanza de la PC a Railway, o volver atrás).
// La copia se sube con `npm run subir-copia` (scripts/subir-copia.js), autorizada con BACKUP_TOKEN.
// Flujo: se verifica la huella (sha256), se valida la copia y se deja como `<base>.restaurar`; el servidor reinicia
// y db.js la aplica ANTES de abrir la base. La base que había no se borra: queda en la carpeta `reemplazadas`.
// Este archivo no depende de db.js: también lo usa el script desde la PC para validar y resumir la copia local.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const migracionesDelSistema = () => fs.readdirSync(path.join(RAIZ, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// Resumen verificable de los datos: si dos bases dan el mismo resumen, tienen los mismos datos del negocio.
// No incluye sesiones ni auditoría (cambian solas al iniciar sesión o al restaurar).
export function resumenDatos(db) {
  const val = (sql) => { try { return Object.values(db.prepare(sql).get())[0]; } catch { return null; } };
  const cadena = (sql) => { try { return sha(db.prepare(sql).all().map((f) => Object.values(f).join(':')).join('|')); } catch { return null; } };
  return {
    migraciones: cadena('SELECT nombre FROM schema_migrations ORDER BY nombre'),
    usuarios: val('SELECT COUNT(*) FROM usuarios'),
    productos: val('SELECT COUNT(*) FROM productos'),
    clientes: val('SELECT COUNT(*) FROM clientes'),
    proveedores: val('SELECT COUNT(*) FROM proveedores'),
    ventas: val('SELECT COUNT(*) FROM ventas'),
    ventas_total_confirmadas: val("SELECT COALESCE(SUM(total), 0) FROM ventas WHERE estado = 'confirmada'"),
    lineas_de_venta: val('SELECT COUNT(*) FROM venta_lineas'),
    pagos: val('SELECT COUNT(*) FROM pagos'),
    pagos_total: val('SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE anulado = 0'),
    deuda_clientes: val("SELECT COALESCE(SUM(s.total - s.pagado), 0) FROM v_ventas_saldo s JOIN ventas v ON v.id = s.venta_id WHERE v.estado = 'confirmada'"),
    deuda_por_cliente: cadena("SELECT v.cliente_id, SUM(s.total - s.pagado) FROM v_ventas_saldo s JOIN ventas v ON v.id = s.venta_id WHERE v.estado = 'confirmada' GROUP BY v.cliente_id ORDER BY v.cliente_id"),
    compras: val('SELECT COUNT(*) FROM compras'),
    compras_total: val("SELECT COALESCE(SUM(total), 0) FROM compras WHERE estado = 'confirmada'"),
    gastos: val('SELECT COUNT(*) FROM gastos'),
    caja_movimientos: val('SELECT COUNT(*) FROM caja_mov'),
    caja_saldo_movimientos: val("SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) FROM caja_mov"),
    stock_unidades: val('SELECT COALESCE(SUM(cantidad), 0) FROM existencias'),
    stock_detalle: cadena('SELECT producto_id, deposito_id, cantidad FROM existencias ORDER BY producto_id, deposito_id'),
    movimientos_stock: val('SELECT COUNT(*) FROM mov_stock'),
    lotes: cadena('SELECT id, cantidad FROM lotes ORDER BY id'),
    valor_inventario: val('SELECT COALESCE(SUM(valor_inventario), 0) FROM productos'),
    precios_especiales: cadena('SELECT cliente_id, producto_id, precio_unidad, precio_caja FROM precios_cliente ORDER BY cliente_id, producto_id'),
    configuracion: cadena("SELECT clave, valor FROM config ORDER BY clave"),
  };
}

// Revisa que un archivo sea una copia sana de ESTE sistema y que alguien pueda entrar después de restaurarla.
export function validarCopia(ruta) {
  try { return validar(ruta); }
  catch (e) { throw e?.code === 'ERR_SQLITE_ERROR' ? new Error('La copia está dañada o incompleta.') : e; }
}

function validar(ruta) {
  const cab = Buffer.alloc(16);
  const fd = fs.openSync(ruta, 'r'); fs.readSync(fd, cab, 0, 16, 0); fs.closeSync(fd);
  if (cab.toString('latin1') !== 'SQLite format 3\0') throw new Error('El archivo no es una base de datos de este sistema.');
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const integ = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (integ !== 'ok') throw new Error(`La copia está dañada (${integ}).`);
    for (const t of ['schema_migrations', 'usuarios', 'productos', 'clientes', 'ventas', 'config']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) throw new Error(`La copia no es de este sistema (falta la tabla ${t}).`);
    }
    const suyas = db.prepare('SELECT nombre FROM schema_migrations ORDER BY nombre').all().map((r) => r.nombre);
    const nuestras = migracionesDelSistema();
    const desconocidas = suyas.filter((m) => !nuestras.includes(m));
    if (desconocidas.length) throw new Error(`La copia es de una versión más nueva del sistema (${desconocidas.join(', ')}). Actualizá primero el servidor.`);
    const faltan = nuestras.filter((m) => !suyas.includes(m));
    if (faltan.length) throw new Error(`La copia es de una versión anterior (le falta ${faltan.join(', ')}). Abrila una vez con la versión actual (npm run tunel) y volvé a sacar la copia.`);
    if (!db.prepare("SELECT 1 FROM usuarios WHERE rol = 'admin' AND activo = 1").get()) throw new Error('La copia no tiene ningún administrador activo: después de restaurarla nadie podría entrar.');
    return resumenDatos(db);
  } finally { db.close(); }
}

// Guarda la copia subida como restauración pendiente (se aplica al reiniciar). Devuelve el resumen de la copia.
export function prepararRestauracion(dbPath, buffer, huella) {
  const calculada = crypto.createHash('sha256').update(buffer).digest('hex');
  if (!huella || calculada !== String(huella).toLowerCase()) throw new Error('La copia llegó incompleta o dañada (la huella no coincide). No se cambió nada.');
  const temporal = `${dbPath}.subiendo`;
  const pendiente = `${dbPath}.restaurar`;
  fs.writeFileSync(temporal, buffer);
  const fd = fs.openSync(temporal, 'r+'); fs.fsyncSync(fd); fs.closeSync(fd);
  try {
    const resumen = validarCopia(temporal);
    fs.renameSync(temporal, pendiente);
    return resumen;
  } catch (e) {
    fs.rmSync(temporal, { force: true });
    throw e;
  }
}

// Se llama al arrancar, ANTES de abrir la base: si hay una restauración pendiente, la base actual se aparta
// (con sus archivos -wal y -shm, así no se pierde nada de lo último escrito) y la copia pasa a ser la base.
export function aplicarRestauracionPendiente(dbPath) {
  const pendiente = `${dbPath}.restaurar`;
  if (!fs.existsSync(pendiente)) return null;
  const dir = path.join(path.dirname(dbPath), 'reemplazadas');
  fs.mkdirSync(dir, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const apartada = path.join(dir, `negocio-reemplazada-${sello}.db`);
  for (const suf of ['', '-wal', '-shm']) if (fs.existsSync(dbPath + suf)) fs.renameSync(dbPath + suf, apartada + suf);
  fs.renameSync(pendiente, dbPath);
  return apartada;
}
