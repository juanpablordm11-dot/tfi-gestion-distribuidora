// Cuentas corrientes: saldos, cobros (pagos parciales), anulación de pagos y saldo a favor.
import { get, all, run, tx, auditar } from '../db.js';
import { ahora, hoy, pesos, bad, conflicto, noEncontrado, entero, texto, opcion, idemKey, esFecha } from '../util.js';
import * as caja from './caja.js';

export const MEDIOS = ['efectivo', 'transferencia', 'otro'];

export function estadoDeuda(v, hoyStr = hoy()) {
  if (v.estado === 'anulada') return 'anulada';
  const saldo = v.total - v.pagado;
  if (saldo <= 0) return 'pagada';
  if (v.vencimiento && v.vencimiento < hoyStr) return 'vencida';
  return v.pagado > 0 ? 'parcial' : 'pendiente';
}

export function saldoCliente(clienteId) {
  const deuda = get(
    `SELECT COALESCE(SUM(s.total - s.pagado), 0) AS d
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id
      WHERE v.cliente_id = ? AND v.estado = 'confirmada'`, clienteId).d;
  const favor = get(
    `SELECT COALESCE(SUM(p.monto - p.devuelto - COALESCE((SELECT SUM(a.monto) FROM pago_aplicaciones a WHERE a.pago_id = p.id AND a.anulada = 0), 0)), 0) AS f
       FROM pagos p WHERE p.cliente_id = ? AND p.anulado = 0`, clienteId).f;
  const vencida = get(
    `SELECT COALESCE(SUM(s.total - s.pagado), 0) AS d
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id
      WHERE v.cliente_id = ? AND v.estado = 'confirmada' AND s.total > s.pagado AND v.vencimiento IS NOT NULL AND v.vencimiento < ?`,
    clienteId, hoy()).d;
  return { deuda, saldo_favor: favor, vencida };
}

export function ventasAbiertas(clienteId) {
  return all(
    `SELECT v.id, v.numero, v.fecha, v.total, v.vencimiento, s.pagado, (v.total - s.pagado) AS saldo
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id
      WHERE v.cliente_id = ? AND v.estado = 'confirmada' AND s.total > s.pagado
      ORDER BY v.fecha, v.id`, clienteId);
}

// Lista de deudas (una fila por venta con saldo pendiente, o todas las fiadas si incluirPagadas).
export function listarDeudas({ cliente_id, estado, incluirPagadas } = {}) {
  const filas = all(
    `SELECT v.id AS venta_id, v.numero, v.fecha, v.cliente_id, c.nombre AS cliente, v.total, s.pagado, v.modalidad_pago,
            (v.total - s.pagado) AS saldo, v.vencimiento, v.estado,
            (SELECT COUNT(*) FROM pago_aplicaciones a WHERE a.venta_id = v.id AND a.anulada = 0) AS cant_pagos
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id JOIN clientes c ON c.id = v.cliente_id
      WHERE v.estado = 'confirmada' ${cliente_id ? 'AND v.cliente_id = ?' : ''}
      ORDER BY v.fecha DESC, v.id DESC LIMIT 1000`, ...(cliente_id ? [cliente_id] : []));
  const h = hoy();
  return filas
    .map((f) => ({ ...f, estado_deuda: estadoDeuda(f, h) }))
    // Por defecto solo lo que se debe; con incluirPagadas también el historial de ventas fiadas/mixtas ya saldadas.
    .filter((f) => f.saldo > 0 || (incluirPagadas && f.modalidad_pago !== 'contado'))
    .filter((f) => !estado || f.estado_deuda === estado);
}

export function pagosDeVenta(ventaId) {
  return all(
    `SELECT a.id AS aplicacion_id, a.monto, a.anulada, a.fecha, p.id AS pago_id, p.medio, p.origen, p.nota, p.anulado
       FROM pago_aplicaciones a JOIN pagos p ON p.id = a.pago_id
      WHERE a.venta_id = ? ORDER BY a.id`, ventaId);
}

// Registrar un cobro. Reglas:
//  - monto > 0; se aplica a las deudas elegidas (o a las más viejas primero).
//  - Si sobra plata (excedente) hay que decidir explícitamente: 'vuelto' (se devuelve) o 'saldo_a_favor'.
export function cobrar(b, user) {
  const idem = idemKey(b.idem_key);
  const clienteId = entero(b.cliente_id, 'Cliente', { min: 1 });
  const monto = entero(b.monto, 'Importe', { min: 1 });
  const medio = opcion(b.medio, 'Medio de pago', MEDIOS, { defecto: 'efectivo' });
  const nota = texto(b.nota, 'Nota', { max: 200 });
  const excedente = opcion(b.excedente, 'Excedente', ['vuelto', 'saldo_a_favor'], { opcional: true });
  return tx(() => {
    const dup = get('SELECT id FROM pagos WHERE idem_key = ?', idem);
    if (dup) return { duplicado: true, ...resumenPago(dup.id) };
    const cliente = get('SELECT * FROM clientes WHERE id = ?', clienteId);
    if (!cliente) throw bad('El cliente no existe.');
    const { pagoId } = registrarCobro({ cliente, monto, medio, nota, excedente, aplicar: b.aplicar, idem, user });
    return resumenPago(pagoId);
  });
}

// Guarda un cobro dentro de una transacción ya abierta (la de cobrar() o la de una venta con entrega para la deuda).
// ventaEntregaId: la venta en la que el cliente entregó esta plata para su deuda (solo para mostrarlo en el comprobante).
export function registrarCobro({ cliente, monto, medio, nota = null, excedente = null, aplicar = null, idem, user, ventaEntregaId = null, concepto = null }) {
  const clienteId = cliente.id;
  const abiertas = ventasAbiertas(clienteId);
  let aplicaciones = [];
  if (Array.isArray(aplicar) && aplicar.length) {
    const vistos = new Set();
    for (const a of aplicar) {
      const vid = entero(a.venta_id, 'Venta', { min: 1 });
      const m = entero(a.monto, 'Importe aplicado', { min: 1 });
      if (vistos.has(vid)) throw bad('Una misma deuda aparece dos veces.');
      vistos.add(vid);
      const v = abiertas.find((x) => x.id === vid);
      if (!v) throw bad('Una de las deudas elegidas no existe, ya está pagada o no es de este cliente.');
      if (m > v.saldo) throw bad(`La venta N° ${v.numero} solo debe ${pesos(v.saldo)} y se intenta aplicar ${pesos(m)}.`);
      aplicaciones.push({ venta_id: vid, monto: m });
    }
    const suma = aplicaciones.reduce((s, a) => s + a.monto, 0);
    if (suma > monto) throw bad('Lo repartido entre las deudas supera el importe recibido.');
  } else {
    let resto = monto;
    for (const v of abiertas) {
      if (resto <= 0) break;
      const m = Math.min(resto, v.saldo);
      aplicaciones.push({ venta_id: v.id, monto: m });
      resto -= m;
    }
  }
  const aplicado = aplicaciones.reduce((s, a) => s + a.monto, 0);
  const sobra = monto - aplicado;
  let montoPago = monto;
  if (sobra > 0) {
    if (!excedente) {
      throw conflicto(`El importe supera lo que se aplica a las deudas por ${pesos(sobra)}. Elegí qué hacer con el excedente.`,
        'EXCEDENTE', { excedente: sobra, aplicado });
    }
    if (excedente === 'vuelto') montoPago = aplicado; // se da vuelto: solo se registra lo que se aplica
  }
  if (montoPago <= 0) throw bad('No hay nada para registrar con ese importe.');
  const fecha = ahora();
  const pagoId = run(
    `INSERT INTO pagos (cliente_id, fecha, monto, medio, origen, nota, idem_key, usuario_id, venta_entrega_id) VALUES (?, ?, ?, ?, 'cobro', ?, ?, ?, ?)`,
    clienteId, fecha, montoPago, medio, nota, idem, user?.id ?? null, ventaEntregaId).id;
  for (const a of aplicaciones) {
    run('INSERT INTO pago_aplicaciones (pago_id, venta_id, monto, fecha) VALUES (?, ?, ?, ?)', pagoId, a.venta_id, a.monto, fecha);
  }
  caja.movimiento({
    tipo: 'ingreso', categoria: 'cobro_deuda', medio, monto: montoPago,
    concepto: concepto ?? `Cobro a ${cliente.nombre}`, ref_tipo: 'pago', ref_id: pagoId, usuario_id: user?.id,
  });
  auditar(user?.id, 'cobrar', 'pago', pagoId, {
    cliente_id: clienteId, monto: montoPago, excedente: sobra > 0 ? { decision: excedente, monto: sobra } : null,
    ...(ventaEntregaId ? { venta_entrega_id: ventaEntregaId } : {}),
  });
  return { pagoId, aplicado, sobra };
}

export function resumenPago(pagoId) {
  const p = get(`SELECT p.*, c.nombre AS cliente FROM pagos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`, pagoId);
  if (!p) throw noEncontrado('No existe ese pago.');
  const aplicaciones = all(
    `SELECT a.venta_id, v.numero, a.monto, a.anulada FROM pago_aplicaciones a JOIN ventas v ON v.id = a.venta_id WHERE a.pago_id = ? ORDER BY a.id`, pagoId);
  const aplicado = aplicaciones.filter((a) => !a.anulada).reduce((s, a) => s + a.monto, 0);
  return { pago: p, aplicaciones, saldo_a_favor_generado: p.monto - aplicado - p.devuelto, cliente_saldo: saldoCliente(p.cliente_id) };
}

export function listarPagos({ cliente_id, desde, hasta } = {}) {
  const cond = []; const par = [];
  if (cliente_id) { cond.push('p.cliente_id = ?'); par.push(cliente_id); }
  if (desde && esFecha(desde)) { cond.push('substr(p.fecha, 1, 10) >= ?'); par.push(desde); }
  if (hasta && esFecha(hasta)) { cond.push('substr(p.fecha, 1, 10) <= ?'); par.push(hasta); }
  return all(
    `SELECT p.id, p.fecha, p.cliente_id, c.nombre AS cliente, p.monto, p.medio, p.origen, p.nota, p.anulado, p.anulado_motivo,
            (SELECT GROUP_CONCAT(v.numero) FROM pago_aplicaciones a JOIN ventas v ON v.id = a.venta_id WHERE a.pago_id = p.id AND a.anulada = 0) AS ventas
       FROM pagos p JOIN clientes c ON c.id = p.cliente_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY p.fecha DESC, p.id DESC LIMIT 500`, ...par);
}

// Anula un pago completo: la deuda vuelve a su saldo anterior y la caja se compensa.
export function anularPago(id, b, user) {
  const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
  return tx(() => {
    const p = get('SELECT * FROM pagos WHERE id = ?', id);
    if (!p) throw noEncontrado('No existe ese pago.');
    if (p.anulado) throw conflicto('Ese pago ya está anulado.');
    run('UPDATE pago_aplicaciones SET anulada = 1 WHERE pago_id = ?', id);
    run('UPDATE pagos SET anulado = 1, anulado_motivo = ?, anulado_fecha = ? WHERE id = ?', motivo, ahora(), id);
    const orig = caja.movOriginal('pago', id);
    const aReintegrar = p.monto - p.devuelto;
    if (orig && aReintegrar > 0) caja.compensar(orig.id, aReintegrar, `Anulación de pago #${id}: ${motivo}`, user?.id);
    auditar(user?.id, 'anular', 'pago', id, { motivo, monto: p.monto });
    return resumenPago(id);
  });
}

// Usa el saldo a favor del cliente para cancelar deudas abiertas (no mueve caja: el dinero ya entró).
export function aplicarSaldoFavor(clienteId, user) {
  return tx(() => {
    const creditos = all(
      `SELECT p.id, (p.monto - p.devuelto - COALESCE((SELECT SUM(a.monto) FROM pago_aplicaciones a WHERE a.pago_id = p.id AND a.anulada = 0), 0)) AS resto
         FROM pagos p WHERE p.cliente_id = ? AND p.anulado = 0 ORDER BY p.fecha, p.id`, clienteId).filter((c) => c.resto > 0);
    const abiertas = ventasAbiertas(clienteId);
    let aplicadoTotal = 0; const fecha = ahora();
    for (const c of creditos) {
      let resto = c.resto;
      for (const v of abiertas) {
        if (resto <= 0) break;
        if (v.saldo <= 0) continue;
        const m = Math.min(resto, v.saldo);
        run('INSERT INTO pago_aplicaciones (pago_id, venta_id, monto, fecha) VALUES (?, ?, ?, ?)', c.id, v.id, m, fecha);
        v.saldo -= m; resto -= m; aplicadoTotal += m;
      }
    }
    if (aplicadoTotal === 0) throw bad('No hay saldo a favor para aplicar o no hay deudas pendientes.');
    auditar(user?.id, 'aplicar_saldo_favor', 'cliente', clienteId, { monto: aplicadoTotal });
    return { aplicado: aplicadoTotal, cliente_saldo: saldoCliente(clienteId) };
  });
}
