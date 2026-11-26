// Compras a proveedores: suman stock, actualizan el costo promedio y registran el egreso o la deuda con el proveedor.
import { get, all, run, tx, auditar } from '../db.js';
import { ahora, hoy, pesos, bad, conflicto, noEncontrado, entero, dinero, texto, opcion, idemKey, repartir, divRound, esFecha } from '../util.js';
import * as stock from './stock.js';
import * as caja from './caja.js';
import { MEDIOS } from './deudas.js';

const saldoSql = `(c.total - COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = c.id AND pp.anulado = 0), 0))`;

export function detalleCompra(id) {
  const c = get(
    `SELECT c.*, pr.nombre AS proveedor, d.nombre AS deposito, ${saldoSql} AS saldo,
            (c.total - ${saldoSql}) AS pagado
       FROM compras c LEFT JOIN proveedores pr ON pr.id = c.proveedor_id JOIN depositos d ON d.id = c.deposito_id WHERE c.id = ?`, id);
  if (!c) throw noEncontrado('No existe esa compra.');
  const lineas = all(
    `SELECT l.*, p.nombre, p.marca, p.variante FROM compra_lineas l JOIN productos p ON p.id = l.producto_id WHERE l.compra_id = ? ORDER BY l.id`, id);
  const pagos = all('SELECT * FROM pagos_proveedor WHERE compra_id = ? ORDER BY id', id);
  return { ...c, lineas, pagos };
}

export function listarCompras({ proveedor_id, desde, hasta, estado } = {}) {
  const cond = []; const par = [];
  if (proveedor_id) { cond.push('c.proveedor_id = ?'); par.push(Number(proveedor_id)); }
  if (desde && esFecha(desde)) { cond.push('substr(c.fecha, 1, 10) >= ?'); par.push(desde); }
  if (hasta && esFecha(hasta)) { cond.push('substr(c.fecha, 1, 10) <= ?'); par.push(hasta); }
  if (estado === 'confirmada' || estado === 'anulada') { cond.push('c.estado = ?'); par.push(estado); }
  return all(
    `SELECT c.id, c.fecha, c.total, c.estado, c.tipo, c.proveedor_id, pr.nombre AS proveedor, d.nombre AS deposito, ${saldoSql} AS saldo
       FROM compras c LEFT JOIN proveedores pr ON pr.id = c.proveedor_id JOIN depositos d ON d.id = c.deposito_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY c.fecha DESC, c.id DESC LIMIT 500`, ...par);
}

// Saldo inicial con un proveedor: lo que el negocio ya le debía al empezar a usar el sistema.
// Es una "compra" de tipo saldo_inicial sin productos: se paga como cualquier otra deuda con el proveedor,
// pero no suma stock, no cambia costos ni toca la caja.
export function crearSaldoInicialProveedor(proveedorId, b, user) {
  const monto = dinero(b.monto, 'Saldo que se le debía', { min: 1 });
  const fechaDia = b.fecha ? String(b.fecha) : hoy();
  if (!esFecha(fechaDia)) throw bad('La fecha no es válida.');
  if (fechaDia > hoy()) throw bad('La fecha no puede ser futura.');
  const observaciones = texto(b.observaciones, 'Observaciones', { max: 300 });
  return tx(() => {
    const pr = get('SELECT * FROM proveedores WHERE id = ?', proveedorId);
    if (!pr) throw noEncontrado('No existe ese proveedor.');
    const previo = get("SELECT id FROM compras WHERE proveedor_id = ? AND tipo = 'saldo_inicial' AND estado = 'confirmada'", proveedorId);
    if (previo) throw conflicto(`${pr.nombre} ya tiene un saldo inicial cargado. Si está mal, anulalo y cargalo de nuevo.`, 'YA_TIENE_SALDO_INICIAL');
    const id = run(
      `INSERT INTO compras (fecha, proveedor_id, deposito_id, total, observaciones, idem_key, usuario_id, tipo)
       VALUES (?, ?, 1, ?, ?, ?, ?, 'saldo_inicial')`,
      `${fechaDia} ${ahora().slice(11)}`, proveedorId, monto, observaciones ?? 'Saldo que se le debía al empezar a usar el sistema',
      `saldo-inicial-prov-${proveedorId}-${Date.now()}`, user?.id ?? null).id;
    auditar(user?.id, 'saldo_inicial', 'proveedor', proveedorId, { monto, fecha: fechaDia, compra_id: id });
    return detalleCompra(id);
  });
}

export function crearCompra(b, user) {
  const idem = idemKey(b.idem_key);
  const depId = entero(b.deposito_id, 'Depósito de destino', { min: 1 });
  const proveedorId = b.proveedor_id ? entero(b.proveedor_id, 'Proveedor', { min: 1 }) : null;
  if (!Array.isArray(b.lineas) || b.lineas.length === 0) throw bad('Agregá al menos un producto a la compra.');
  const descuentoPedido = dinero(b.descuento ?? 0, 'Descuento');
  const medio = opcion(b.medio, 'Medio de pago', MEDIOS, { defecto: 'efectivo' });
  const observaciones = texto(b.observaciones, 'Observaciones', { max: 300 });
  let fecha = ahora();
  if (b.fecha) {
    if (!esFecha(b.fecha)) throw bad('La fecha de la compra no es válida.');
    if (b.fecha > hoy()) throw bad('La fecha de la compra no puede ser futura.');
    fecha = `${b.fecha} ${ahora().slice(11)}`;
  }
  return tx(() => {
    const dup = get('SELECT id FROM compras WHERE idem_key = ?', idem);
    if (dup) return { duplicada: true, compra: detalleCompra(dup.id) };
    stock.deposito(depId);
    if (proveedorId && !get('SELECT 1 FROM proveedores WHERE id = ?', proveedorId)) throw bad('El proveedor no existe.');

    const lineas = b.lineas.map((l, i) => {
      const p = stock.producto(entero(l.producto_id, `Producto de la línea ${i + 1}`, { min: 1 }));
      const presentacion = opcion(l.presentacion, `Presentación de la línea ${i + 1}`, ['caja', 'unidad']);
      const cantidad = entero(l.cantidad, `Cantidad de "${p.nombre}"`, { min: 1, max: 1_000_000 });
      const costo = dinero(l.costo, `Costo de "${p.nombre}"`);
      return { p, presentacion, cantidad, costo, unidades: stock.unidadesDe(p, presentacion, cantidad), subtotal: costo * cantidad };
    });
    const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
    if (descuentoPedido > subtotal) throw bad('El descuento no puede ser mayor al subtotal.');
    const total = subtotal - descuentoPedido;
    if (total <= 0) throw bad('El total de la compra tiene que ser mayor a cero.');
    const pagado = dinero(b.pagado ?? 0, 'Importe pagado');
    if (pagado > total) throw bad(`Lo pagado (${pesos(pagado)}) no puede superar el total (${pesos(total)}).`);
    if (total - pagado > 0 && !proveedorId) throw bad('Para dejar saldo pendiente tenés que elegir un proveedor.');

    const compraId = run(
      `INSERT INTO compras (fecha, proveedor_id, deposito_id, descuento, total, observaciones, idem_key, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      fecha, proveedorId, depId, descuentoPedido, total, observaciones, idem, user?.id ?? null).id;
    const desc = repartir(descuentoPedido, lineas.map((l) => l.subtotal));
    lineas.forEach((l, i) => {
      const neto = l.subtotal - desc[i];
      run(
        `INSERT INTO compra_lineas (compra_id, producto_id, presentacion, cantidad, unidades, costo, subtotal, descuento_asignado, costo_neto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, compraId, l.p.id, l.presentacion, l.cantidad, l.unidades, l.costo, l.subtotal, desc[i], neto);
      stock.entrar({
        producto_id: l.p.id, deposito_id: depId, unidades: l.unidades, costo: neto, tipo: 'compra',
        motivo: `Compra N° ${compraId}`, ref_tipo: 'compra', ref_id: compraId, usuario_id: user?.id, fecha_ingreso: fecha.slice(0, 10),
      });
      // El "último costo por caja" del producto se actualiza con lo que realmente costó esta compra.
      const costoCajaNuevo = divRound(neto * l.p.unidades_por_caja, l.unidades);
      run('UPDATE productos SET costo_caja = ? WHERE id = ?', costoCajaNuevo, l.p.id);
    });
    if (pagado > 0) {
      const ppId = run('INSERT INTO pagos_proveedor (compra_id, fecha, monto, medio, usuario_id) VALUES (?, ?, ?, ?, ?)',
        compraId, ahora(), pagado, medio, user?.id ?? null).id;
      caja.movimiento({
        tipo: 'egreso', categoria: 'pago_proveedor', medio, monto: pagado,
        concepto: `Compra N° ${compraId}${proveedorId ? ' - ' + get('SELECT nombre FROM proveedores WHERE id = ?', proveedorId).nombre : ''}`,
        ref_tipo: 'pago_proveedor', ref_id: ppId, usuario_id: user?.id,
      });
    }
    auditar(user?.id, 'crear', 'compra', compraId, { total, pagado, proveedor_id: proveedorId });
    return { duplicada: false, compra: detalleCompra(compraId) };
  });
}

export function pagarCompra(compraId, b, user) {
  const monto = entero(b.monto, 'Importe', { min: 1 });
  const medio = opcion(b.medio, 'Medio de pago', MEDIOS, { defecto: 'efectivo' });
  return tx(() => {
    const c = detalleCompra(compraId);
    if (c.estado === 'anulada') throw conflicto('La compra está anulada.');
    if (monto > c.saldo) throw bad(`El saldo con el proveedor es ${pesos(c.saldo)}; no se puede pagar ${pesos(monto)}.`);
    const ppId = run('INSERT INTO pagos_proveedor (compra_id, fecha, monto, medio, usuario_id) VALUES (?, ?, ?, ?, ?)',
      compraId, ahora(), monto, medio, user?.id ?? null).id;
    caja.movimiento({
      tipo: 'egreso', categoria: 'pago_proveedor', medio, monto,
      concepto: `Pago de compra N° ${compraId}${c.proveedor ? ' - ' + c.proveedor : ''}`, ref_tipo: 'pago_proveedor', ref_id: ppId, usuario_id: user?.id,
    });
    auditar(user?.id, 'pagar', 'compra', compraId, { monto });
    return detalleCompra(compraId);
  });
}

export function anularCompra(compraId, b, user) {
  const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
  const destino = opcion(b.destino_pagos, 'Destino de los pagos', ['reintegro', 'sin_reintegro'], { opcional: true });
  return tx(() => {
    const c = detalleCompra(compraId);
    if (c.estado === 'anulada') throw conflicto('Esa compra ya está anulada.');
    if (c.pagado > 0 && !destino) {
      throw conflicto(`Esta compra tiene ${pesos(c.pagado)} pagados. Indicá si el proveedor te los reintegra o no.`, 'TIENE_PAGOS', { pagado: c.pagado });
    }
    for (const l of c.lineas) {
      stock.salirConCosto({
        producto_id: l.producto_id, deposito_id: c.deposito_id, unidades: l.unidades, costo: l.costo_neto, tipo: 'anulacion_compra',
        motivo: `Anulación de compra N° ${compraId}: ${motivo}`, ref_tipo: 'compra', ref_id: compraId, usuario_id: user?.id,
      });
    }
    for (const pp of c.pagos.filter((x) => !x.anulado)) {
      run('UPDATE pagos_proveedor SET anulado = 1 WHERE id = ?', pp.id);
      if (destino === 'reintegro') {
        const orig = caja.movOriginal('pago_proveedor', pp.id);
        if (orig) caja.compensar(orig.id, pp.monto, `Reintegro por anulación de compra N° ${compraId}`, user?.id);
      }
    }
    run('UPDATE compras SET estado = ?, anulada_motivo = ?, anulada_fecha = ?, anulada_por = ? WHERE id = ?',
      'anulada', motivo, ahora(), user?.id ?? null, compraId);
    auditar(user?.id, 'anular', 'compra', compraId, { motivo, pagado: c.pagado, destino_pagos: destino ?? null });
    return detalleCompra(compraId);
  });
}

export function deudaProveedores() {
  return all(
    `SELECT pr.id AS proveedor_id, pr.nombre AS proveedor, COALESCE(SUM(${saldoSql}), 0) AS saldo
       FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id WHERE c.estado = 'confirmada'
      GROUP BY pr.id HAVING saldo > 0 ORDER BY saldo DESC`);
}
