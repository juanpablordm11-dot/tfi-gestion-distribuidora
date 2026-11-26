// Gastos operativos y movimientos manuales de caja (retiros personales, otros ingresos/egresos).
import { get, all, run, tx, auditar } from '../db.js';
import { ahora, hoy, bad, conflicto, noEncontrado, entero, dinero, texto, opcion, esFecha } from '../util.js';
import * as caja from './caja.js';
import { MEDIOS } from './deudas.js';

export const CATEGORIAS_GASTO = ['transporte', 'alquiler', 'servicios', 'sueldos', 'mantenimiento', 'otros'];

function fechaOpcional(f, nombre) {
  if (!f) return ahora();
  if (!esFecha(f)) throw bad(`${nombre}: la fecha no es válida.`);
  if (f > hoy()) throw bad(`${nombre}: la fecha no puede ser futura.`);
  return `${f} ${ahora().slice(11)}`;
}

export function crearGasto(b, user) {
  const categoria = opcion(b.categoria, 'Categoría', CATEGORIAS_GASTO);
  const descripcion = texto(b.descripcion, 'Descripción', { requerido: true, max: 200 });
  const monto = entero(b.monto, 'Importe', { min: 1 });
  const medio = opcion(b.medio, 'Medio de pago', MEDIOS, { defecto: 'efectivo' });
  const fecha = fechaOpcional(b.fecha, 'Gasto');
  return tx(() => {
    const id = run('INSERT INTO gastos (fecha, categoria, descripcion, monto, medio, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
      fecha, categoria, descripcion, monto, medio, user?.id ?? null).id;
    caja.movimiento({ tipo: 'egreso', categoria: 'gasto', medio, monto, concepto: `Gasto (${categoria}): ${descripcion}`, ref_tipo: 'gasto', ref_id: id, usuario_id: user?.id, fecha });
    auditar(user?.id, 'crear', 'gasto', id, { categoria, monto });
    return get('SELECT * FROM gastos WHERE id = ?', id);
  });
}

export function anularGasto(id, b, user) {
  const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
  return tx(() => {
    const g = get('SELECT * FROM gastos WHERE id = ?', id);
    if (!g) throw noEncontrado('No existe ese gasto.');
    if (g.anulado) throw conflicto('Ese gasto ya está anulado.');
    run('UPDATE gastos SET anulado = 1, anulado_motivo = ? WHERE id = ?', motivo, id);
    const orig = caja.movOriginal('gasto', id);
    if (orig) caja.compensar(orig.id, null, `Anulación de gasto #${id}: ${motivo}`, user?.id);
    auditar(user?.id, 'anular', 'gasto', id, { motivo });
    return get('SELECT * FROM gastos WHERE id = ?', id);
  });
}

export function listarGastos({ desde, hasta, categoria } = {}) {
  const cond = []; const par = [];
  if (desde && esFecha(desde)) { cond.push('substr(fecha, 1, 10) >= ?'); par.push(desde); }
  if (hasta && esFecha(hasta)) { cond.push('substr(fecha, 1, 10) <= ?'); par.push(hasta); }
  if (categoria && CATEGORIAS_GASTO.includes(categoria)) { cond.push('categoria = ?'); par.push(categoria); }
  const filas = all(`SELECT * FROM gastos ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY fecha DESC, id DESC LIMIT 1000`, ...par);
  const porCategoria = all(
    `SELECT categoria, SUM(monto) AS total FROM gastos WHERE anulado = 0 ${cond.length ? 'AND ' + cond.join(' AND ') : ''} GROUP BY categoria ORDER BY total DESC`, ...par);
  return { gastos: filas, por_categoria: porCategoria, total: porCategoria.reduce((s, c) => s + c.total, 0) };
}

// Movimientos manuales: retiros del dueño (NO son gasto del negocio), otros ingresos y otros egresos.
export function movimientoManual(b, user) {
  const tipoCat = opcion(b.categoria, 'Tipo de movimiento', ['retiro', 'otro_ingreso', 'otro_egreso']);
  const tipo = tipoCat === 'otro_ingreso' ? 'ingreso' : 'egreso';
  const monto = entero(b.monto, 'Importe', { min: 1 });
  const medio = opcion(b.medio, 'Medio de pago', MEDIOS, { defecto: 'efectivo' });
  const concepto = texto(b.concepto, 'Concepto', { requerido: true, max: 200 });
  const fecha = fechaOpcional(b.fecha, 'Movimiento');
  return tx(() => {
    const id = caja.movimiento({ tipo, categoria: tipoCat, medio, monto, concepto, ref_tipo: 'manual', usuario_id: user?.id, fecha });
    auditar(user?.id, 'crear', 'caja_mov', id, { categoria: tipoCat, monto, concepto });
    return get('SELECT * FROM caja_mov WHERE id = ?', id);
  });
}

export function listarCaja({ desde, hasta, categoria, medio } = {}) {
  const cond = []; const par = [];
  if (desde && esFecha(desde)) { cond.push('substr(m.fecha, 1, 10) >= ?'); par.push(desde); }
  if (hasta && esFecha(hasta)) { cond.push('substr(m.fecha, 1, 10) <= ?'); par.push(hasta); }
  if (categoria) { cond.push('m.categoria = ?'); par.push(categoria); }
  if (medio) { cond.push('m.medio = ?'); par.push(medio); }
  const movimientos = all(
    `SELECT m.*, u.nombre AS usuario FROM caja_mov m LEFT JOIN usuarios u ON u.id = m.usuario_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY m.fecha DESC, m.id DESC LIMIT 1000`, ...par);
  const periodo = all(
    `SELECT m.tipo, SUM(m.monto) AS total FROM caja_mov m ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} GROUP BY m.tipo`, ...par);
  const ingresos = periodo.find((x) => x.tipo === 'ingreso')?.total ?? 0;
  const egresos = periodo.find((x) => x.tipo === 'egreso')?.total ?? 0;
  return { movimientos, periodo: { ingresos, egresos, neto: ingresos - egresos }, saldo: caja.saldoCaja() };
}
