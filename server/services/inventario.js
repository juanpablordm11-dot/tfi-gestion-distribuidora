// Operaciones manuales de inventario y consulta del historial de movimientos.
import { get, all, tx, auditar } from '../db.js';
import { bad, entero, dinero, texto, opcion, esFecha, hoy } from '../util.js';
import * as stock from './stock.js';

const cantidadUnidades = (p, b, nombre = 'Cantidad') => {
  const presentacion = opcion(b.presentacion, 'Presentación', ['caja', 'unidad'], { defecto: 'unidad' });
  const cantidad = entero(b.cantidad, nombre, { min: 1, max: 100_000_000 });
  return stock.unidadesDe(p, presentacion, cantidad);
};

export function entradaManual(b, user) {
  // Mercadería que ya estaba en el negocio: se puede cargar con la fecha real en que entró.
  let fechaIngreso = hoy();
  if (b.fecha_ingreso) {
    if (!esFecha(b.fecha_ingreso)) throw bad('La fecha de ingreso no es válida.');
    if (b.fecha_ingreso > hoy()) throw bad('La fecha de ingreso no puede ser futura.');
    fechaIngreso = b.fecha_ingreso;
  }
  return tx(() => {
    const p = stock.producto(entero(b.producto_id, 'Producto', { min: 1 }));
    const dep = stock.deposito(entero(b.deposito_id, 'Depósito', { min: 1 }));
    const unidades = cantidadUnidades(p, b);
    const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
    const costoCaja = b.costo_caja === undefined || b.costo_caja === null || b.costo_caja === '' ? null : dinero(b.costo_caja, 'Costo por caja');
    const id = stock.entrar({
      producto_id: p.id, deposito_id: dep.id, unidades, costo: stock.costoDeEntrada(p, unidades, costoCaja),
      tipo: 'entrada_manual', motivo, usuario_id: user?.id, fecha_ingreso: fechaIngreso,
    });
    auditar(user?.id, 'entrada_manual', 'producto', p.id, { deposito: dep.nombre, unidades, motivo, fecha_ingreso: fechaIngreso });
    return { ok: true, id };
  });
}

export function merma(b, user) {
  return tx(() => {
    const p = stock.producto(entero(b.producto_id, 'Producto', { min: 1 }));
    const dep = stock.deposito(entero(b.deposito_id, 'Depósito', { min: 1 }));
    const unidades = cantidadUnidades(p, b);
    const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
    const costo = stock.salir({ producto_id: p.id, deposito_id: dep.id, unidades, tipo: 'merma', motivo, usuario_id: user?.id });
    auditar(user?.id, 'merma', 'producto', p.id, { deposito: dep.nombre, unidades, costo, motivo });
    return { ok: true, costo };
  });
}

// Ajuste por conteo físico: el usuario dice cuántas unidades hay realmente y el sistema registra la diferencia.
export function ajuste(b, user) {
  return tx(() => {
    const p = stock.producto(entero(b.producto_id, 'Producto', { min: 1 }));
    const dep = stock.deposito(entero(b.deposito_id, 'Depósito', { min: 1 }));
    const nuevo = entero(b.nuevo_total_unidades, 'Cantidad contada', { min: 0, max: 100_000_000 });
    const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
    const actual = stock.stockEn(p.id, dep.id);
    const dif = nuevo - actual;
    if (dif === 0) throw bad('El conteo coincide con el stock del sistema: no hay nada que ajustar.');
    if (dif > 0) {
      stock.entrar({ producto_id: p.id, deposito_id: dep.id, unidades: dif, costo: stock.costoDeEntrada(p, dif), tipo: 'ajuste', motivo, usuario_id: user?.id });
    } else {
      stock.salir({ producto_id: p.id, deposito_id: dep.id, unidades: -dif, tipo: 'ajuste', motivo, usuario_id: user?.id });
    }
    auditar(user?.id, 'ajuste', 'producto', p.id, { deposito: dep.nombre, antes: actual, despues: nuevo, motivo });
    return { ok: true, diferencia: dif };
  });
}

export function transferencia(b, user) {
  return tx(() => {
    const p = stock.producto(entero(b.producto_id, 'Producto', { min: 1 }));
    const origen = stock.deposito(entero(b.origen, 'Depósito de origen', { min: 1 }));
    const destino = stock.deposito(entero(b.destino, 'Depósito de destino', { min: 1 }));
    const unidades = cantidadUnidades(p, b);
    const motivo = texto(b.motivo, 'Motivo', { max: 200 }) ?? 'Transferencia entre depósitos';
    const id = stock.transferir({ producto_id: p.id, origen: origen.id, destino: destino.id, unidades, motivo, usuario_id: user?.id });
    auditar(user?.id, 'transferencia', 'producto', p.id, { de: origen.nombre, a: destino.nombre, unidades });
    return { ok: true, id };
  });
}

export function listarMovimientos(f = {}) {
  const cond = []; const par = [];
  if (f.producto_id) { cond.push('m.producto_id = ?'); par.push(Number(f.producto_id)); }
  if (f.deposito_id) { cond.push('(m.deposito_origen = ? OR m.deposito_destino = ?)'); par.push(Number(f.deposito_id), Number(f.deposito_id)); }
  if (f.tipo) { cond.push('m.tipo = ?'); par.push(f.tipo); }
  if (f.desde && esFecha(f.desde)) { cond.push('substr(m.fecha, 1, 10) >= ?'); par.push(f.desde); }
  if (f.hasta && esFecha(f.hasta)) { cond.push('substr(m.fecha, 1, 10) <= ?'); par.push(f.hasta); }
  return all(
    `SELECT m.*, p.nombre, p.marca, p.variante, p.unidades_por_caja, o.nombre AS origen, d.nombre AS destino, u.nombre AS usuario
       FROM mov_stock m JOIN productos p ON p.id = m.producto_id
       LEFT JOIN depositos o ON o.id = m.deposito_origen LEFT JOIN depositos d ON d.id = m.deposito_destino
       LEFT JOIN usuarios u ON u.id = m.usuario_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY m.fecha DESC, m.id DESC LIMIT 500`, ...par);
}

// Lo que hay hoy, agrupado por producto, depósito y fecha de ingreso (lo más viejo primero).
export function listarLotes(f = {}) {
  const cond = ['l.cantidad > 0']; const par = [];
  if (f.producto_id) { cond.push('l.producto_id = ?'); par.push(Number(f.producto_id)); }
  if (f.deposito_id) { cond.push('l.deposito_id = ?'); par.push(Number(f.deposito_id)); }
  return all(
    `SELECT l.producto_id, l.deposito_id, d.nombre AS deposito, l.fecha_ingreso, SUM(l.cantidad) AS cantidad,
            p.nombre, p.marca, p.variante, p.unidades_por_caja
       FROM lotes l JOIN productos p ON p.id = l.producto_id JOIN depositos d ON d.id = l.deposito_id
      WHERE ${cond.join(' AND ')}
      GROUP BY l.producto_id, l.deposito_id, l.fecha_ingreso
      ORDER BY l.fecha_ingreso, p.nombre, l.producto_id, l.deposito_id`, ...par);
}

// Historial de ingresos (compras y entradas manuales) por fecha, con cuánto queda hoy de cada uno en cualquier depósito.
// Las compras anuladas no figuran. Las transferencias no son ingresos: la mercadería conserva la fecha de su ingreso original.
export function listarIngresos(f = {}) {
  const cond = ["r.raiz_id IS NULL", "r.origen IN ('compra', 'entrada_manual')", "(co.id IS NULL OR co.estado = 'confirmada')"]; const par = [];
  if (f.producto_id) { cond.push('r.producto_id = ?'); par.push(Number(f.producto_id)); }
  if (f.desde && esFecha(f.desde)) { cond.push('r.fecha_ingreso >= ?'); par.push(f.desde); }
  if (f.hasta && esFecha(f.hasta)) { cond.push('r.fecha_ingreso <= ?'); par.push(f.hasta); }
  return all(
    `SELECT r.id, r.fecha_ingreso, r.origen, r.ref_tipo, r.ref_id, r.unidades_iniciales, r.deposito_id, d.nombre AS deposito,
            r.cantidad + COALESCE((SELECT SUM(c.cantidad) FROM lotes c WHERE c.raiz_id = r.id), 0) AS quedan,
            m.motivo, p.id AS producto_id, p.nombre, p.marca, p.variante, p.unidades_por_caja
       FROM lotes r JOIN productos p ON p.id = r.producto_id JOIN depositos d ON d.id = r.deposito_id
       LEFT JOIN mov_stock m ON m.id = r.mov_id
       LEFT JOIN compras co ON r.ref_tipo = 'compra' AND co.id = r.ref_id
      WHERE ${cond.join(' AND ')}
      ORDER BY r.fecha_ingreso DESC, r.id DESC LIMIT 1000`, ...par);
}
