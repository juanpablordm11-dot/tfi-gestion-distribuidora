// Movimientos de caja. Nunca se borran: una anulación genera un movimiento opuesto que apunta al original.
import { get, all, run, config } from '../db.js';
import { ahora } from '../util.js';

export function movimiento({ tipo, categoria, medio = 'efectivo', monto, concepto, ref_tipo = null, ref_id = null, reversa_de = null, usuario_id = null, fecha = null }) {
  return run(
    `INSERT INTO caja_mov (fecha, tipo, categoria, medio, monto, concepto, ref_tipo, ref_id, reversa_de, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fecha ?? ahora(), tipo, categoria, medio, monto, concepto, ref_tipo, ref_id, reversa_de, usuario_id).id;
}

// Compensa (en todo o en parte) un movimiento original con uno de signo contrario.
export function compensar(movId, monto, concepto, usuario_id) {
  const o = get('SELECT * FROM caja_mov WHERE id = ?', movId);
  if (!o) return null;
  return movimiento({
    tipo: o.tipo === 'ingreso' ? 'egreso' : 'ingreso', categoria: o.categoria, medio: o.medio,
    monto: monto ?? o.monto, concepto, ref_tipo: o.ref_tipo, ref_id: o.ref_id, reversa_de: o.id, usuario_id,
  });
}

export const movOriginal = (ref_tipo, ref_id) =>
  get('SELECT * FROM caja_mov WHERE ref_tipo = ? AND ref_id = ? AND reversa_de IS NULL ORDER BY id LIMIT 1', ref_tipo, ref_id);

export function saldoCaja() {
  const inicial = Number(config.get('saldo_inicial_caja') || 0);
  const filas = all(`SELECT medio, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) AS neto FROM caja_mov GROUP BY medio`);
  const porMedio = { efectivo: inicial, transferencia: 0, otro: 0 };
  for (const f of filas) porMedio[f.medio] += f.neto;
  const total = porMedio.efectivo + porMedio.transferencia + porMedio.otro;
  return { inicial, porMedio, total };
}
