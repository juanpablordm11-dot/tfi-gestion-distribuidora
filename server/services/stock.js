// Inventario en dos depósitos. Unidad base = unidad suelta (paquete). Una caja = unidades_por_caja unidades.
// Valoración: costo promedio ponderado móvil. Por producto se guarda el valor total del stock
// (en centavos, entero); el costo promedio es valor / unidades. Así nunca se acumulan errores de redondeo.
import { get, all, run } from '../db.js';
import { ahora, hoy, bad, divRound } from '../util.js';

export const producto = (id) => {
  const p = get('SELECT * FROM productos WHERE id = ?', id);
  if (!p) throw bad('El producto no existe.');
  return p;
};
export const deposito = (id) => {
  const d = get('SELECT * FROM depositos WHERE id = ?', id);
  if (!d) throw bad('El depósito no existe.');
  return d;
};
export const stockEn = (pid, did) =>
  get('SELECT cantidad FROM existencias WHERE producto_id = ? AND deposito_id = ?', pid, did)?.cantidad ?? 0;
export const stockTotal = (pid) =>
  get('SELECT COALESCE(SUM(cantidad), 0) AS t FROM existencias WHERE producto_id = ?', pid).t;

export const unidadesDe = (p, presentacion, cantidad) =>
  presentacion === 'caja' ? cantidad * p.unidades_por_caja : cantidad;

// Costo promedio por unidad en centavos (con decimales; SOLO para mostrar y calcular márgenes en pantalla).
export function costoUnitarioPromedio(p, total = stockTotal(p.id)) {
  if (total > 0 && p.valor_inventario > 0) return p.valor_inventario / total;
  return p.costo_caja / p.unidades_por_caja;
}

// Costo (entero, centavos) que sale del inventario al retirar `unidades`.
export function costoDeSalida(p, unidades, total) {
  if (total <= 0) return 0;
  if (unidades >= total) return p.valor_inventario;
  return Math.min(p.valor_inventario, divRound(p.valor_inventario * unidades, total));
}

// Costo (entero) con el que ENTRA mercadería sin precio de compra propio (entrada manual, ajuste, anulación).
export function costoDeEntrada(p, unidades, costoCaja = null) {
  if (costoCaja != null) return divRound(costoCaja * unidades, p.unidades_por_caja);
  const total = stockTotal(p.id);
  if (total > 0 && p.valor_inventario > 0) return divRound(p.valor_inventario * unidades, total);
  return divRound(p.costo_caja * unidades, p.unidades_por_caja);
}

function registrar({ producto_id, tipo, unidades, origen = null, destino = null, motivo = null, ref_tipo = null, ref_id = null, costo = 0, usuario_id = null }) {
  return run(
    `INSERT INTO mov_stock (fecha, producto_id, tipo, unidades, deposito_origen, deposito_destino, motivo, ref_tipo, ref_id, costo, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ahora(), producto_id, tipo, unidades, origen, destino, motivo, ref_tipo, ref_id, costo, usuario_id).id;
}

// ---- Lotes por fecha de ingreso. Solo llevan cantidades: el costo sigue siendo el promedio ponderado.
// Para cada producto y depósito, la suma de los lotes es igual a la existencia.
function crearLote({ producto_id, deposito_id, fecha_ingreso, origen, raiz_id = null, ref_tipo = null, ref_id = null, mov_id, unidades }) {
  return run(
    `INSERT INTO lotes (producto_id, deposito_id, fecha_ingreso, origen, raiz_id, ref_tipo, ref_id, mov_id, unidades_iniciales, cantidad, creado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    producto_id, deposito_id, fecha_ingreso, origen, raiz_id, ref_tipo ?? null, ref_id ?? null, mov_id, unidades, unidades, ahora()).id;
}

// Fechas de ingreso con mercadería en un depósito, de la más vieja a la más nueva.
export const fechasDisponibles = (pid, did) => all(
  `SELECT fecha_ingreso, SUM(cantidad) AS cantidad FROM lotes WHERE producto_id = ? AND deposito_id = ? AND cantidad > 0
    GROUP BY fecha_ingreso ORDER BY fecha_ingreso`, pid, did);

const fechaTxt = (iso) => iso.split('-').reverse().join('/');

// Descuenta `unidades` de los lotes del depósito, del más viejo al más nuevo (FIFO).
// Con `fecha` descuenta solo de los lotes de esa fecha de ingreso (la elige quien vende).
// Con `preferir` ({ ref_tipo, ref_id }) primero descuenta los lotes que creó esa operación (al anular una compra).
function consumirLotes(producto_id, deposito_id, unidades, mov_id, { fecha = null, preferir = null } = {}) {
  const lotes = fecha
    ? all('SELECT * FROM lotes WHERE producto_id = ? AND deposito_id = ? AND cantidad > 0 AND fecha_ingreso = ? ORDER BY id', producto_id, deposito_id, fecha)
    : preferir
      ? all(`SELECT * FROM lotes WHERE producto_id = ? AND deposito_id = ? AND cantidad > 0
              ORDER BY CASE WHEN ref_tipo = ? AND ref_id = ? AND raiz_id IS NULL THEN 0 ELSE 1 END, fecha_ingreso, id`,
        producto_id, deposito_id, preferir.ref_tipo, preferir.ref_id)
      : all('SELECT * FROM lotes WHERE producto_id = ? AND deposito_id = ? AND cantidad > 0 ORDER BY fecha_ingreso, id', producto_id, deposito_id);
  if (fecha) {
    const hay = lotes.reduce((s, l) => s + l.cantidad, 0);
    if (unidades > hay) {
      throw bad(`De "${producto(producto_id).nombre}" con fecha de ingreso ${fechaTxt(fecha)} hay ${hay} unidades en ${deposito(deposito_id).nombre} y se piden ${unidades}.`,
        'SIN_STOCK_FECHA', { producto_id, deposito_id, fecha_ingreso: fecha, disponible: hay, pedido: unidades });
    }
  }
  let falta = unidades;
  const usados = [];
  for (const l of lotes) {
    if (falta === 0) break;
    const u = Math.min(falta, l.cantidad);
    run('UPDATE lotes SET cantidad = cantidad - ? WHERE id = ?', u, l.id);
    run('INSERT INTO lote_mov (lote_id, mov_id, unidades) VALUES (?, ?, ?)', l.id, mov_id, -u);
    usados.push({ ...l, unidades: u });
    falta -= u;
  }
  // No debería pasar nunca: la existencia ya se validó y los lotes suman lo mismo. Si pasa, se revierte todo.
  if (falta > 0) throw new Error(`Lotes descuadrados con la existencia (producto ${producto_id}, depósito ${deposito_id}).`);
  return usados;
}

// Al anular una venta, devuelve la mercadería a los mismos lotes de los que había salido.
// Devuelve cuántas unidades pudo reponer (las ventas anteriores a los lotes no tienen de dónde reponer).
function devolverALotes(producto_id, deposito_id, unidades, mov_id, { ref_tipo, ref_id }) {
  const pendientes = all(
    `SELECT lm.lote_id, -SUM(lm.unidades) AS pendiente
       FROM lote_mov lm JOIN mov_stock m ON m.id = lm.mov_id JOIN lotes l ON l.id = lm.lote_id
      WHERE m.ref_tipo = ? AND m.ref_id = ? AND m.producto_id = ? AND l.deposito_id = ?
      GROUP BY lm.lote_id HAVING pendiente > 0 ORDER BY MIN(l.fecha_ingreso), lm.lote_id`,
    ref_tipo, ref_id, producto_id, deposito_id);
  let resto = unidades;
  for (const p of pendientes) {
    if (resto === 0) break;
    const u = Math.min(resto, p.pendiente);
    run('UPDATE lotes SET cantidad = cantidad + ? WHERE id = ?', u, p.lote_id);
    run('INSERT INTO lote_mov (lote_id, mov_id, unidades) VALUES (?, ?, ?)', p.lote_id, mov_id, u);
    resto -= u;
  }
  return unidades - resto;
}

// ENTRA mercadería a un depósito. `costo` = valor en centavos que se suma al inventario.
// Crea un lote con `fecha_ingreso`; con `devolverDe` (anulación de venta) primero repone los lotes originales.
export function entrar({ producto_id, deposito_id, unidades, costo, tipo, motivo, ref_tipo, ref_id, usuario_id, fecha_ingreso = hoy(), devolverDe = null }) {
  run(`INSERT INTO existencias (producto_id, deposito_id, cantidad) VALUES (?, ?, ?)
       ON CONFLICT (producto_id, deposito_id) DO UPDATE SET cantidad = cantidad + excluded.cantidad`,
    producto_id, deposito_id, unidades);
  run('UPDATE productos SET valor_inventario = valor_inventario + ? WHERE id = ?', costo, producto_id);
  const movId = registrar({ producto_id, tipo, unidades, destino: deposito_id, motivo, ref_tipo, ref_id, costo, usuario_id });
  const repuestas = devolverDe ? devolverALotes(producto_id, deposito_id, unidades, movId, devolverDe) : 0;
  if (unidades > repuestas) {
    crearLote({ producto_id, deposito_id, fecha_ingreso, origen: tipo, ref_tipo, ref_id, mov_id: movId, unidades: unidades - repuestas });
  }
  return costo;
}

// SALE mercadería de un depósito. Devuelve el costo (centavos) que se retiró del inventario.
// Con `fecha_ingreso` sale solo de esa fecha; sin ella, de lo más viejo.
export function salir({ producto_id, deposito_id, unidades, tipo, motivo, ref_tipo, ref_id, usuario_id, fecha_ingreso = null }) {
  const p = producto(producto_id);
  const disponible = stockEn(producto_id, deposito_id);
  if (unidades > disponible) {
    const dep = deposito(deposito_id).nombre;
    throw bad(`No hay stock suficiente de "${p.nombre}" en ${dep}: hay ${disponible} unidades y se piden ${unidades}.`, 'SIN_STOCK',
      { producto_id, deposito_id, disponible, pedido: unidades });
  }
  const total = stockTotal(producto_id);
  const costo = costoDeSalida(p, unidades, total);
  run('UPDATE existencias SET cantidad = cantidad - ? WHERE producto_id = ? AND deposito_id = ?', unidades, producto_id, deposito_id);
  run('UPDATE productos SET valor_inventario = valor_inventario - ? WHERE id = ?', costo, producto_id);
  const movId = registrar({ producto_id, tipo, unidades, origen: deposito_id, motivo, ref_tipo, ref_id, costo, usuario_id });
  consumirLotes(producto_id, deposito_id, unidades, movId, { fecha: fecha_ingreso });
  return costo;
}

// Transferencia: descuenta del origen y suma al destino. No es una venta: no toca caja ni ganancias ni valor total.
export function transferir({ producto_id, origen, destino, unidades, motivo, usuario_id }) {
  if (origen === destino) throw bad('El depósito de origen y el de destino tienen que ser distintos.');
  const p = producto(producto_id);
  const disponible = stockEn(producto_id, origen);
  if (unidades > disponible) {
    throw bad(`No hay stock suficiente de "${p.nombre}" en ${deposito(origen).nombre}: hay ${disponible} unidades y se piden ${unidades}.`, 'SIN_STOCK');
  }
  const costo = costoDeSalida(p, unidades, stockTotal(producto_id));
  run('UPDATE existencias SET cantidad = cantidad - ? WHERE producto_id = ? AND deposito_id = ?', unidades, producto_id, origen);
  run(`INSERT INTO existencias (producto_id, deposito_id, cantidad) VALUES (?, ?, ?)
       ON CONFLICT (producto_id, deposito_id) DO UPDATE SET cantidad = cantidad + excluded.cantidad`, producto_id, destino, unidades);
  const movId = registrar({ producto_id, tipo: 'transferencia', unidades, origen, destino, motivo, costo, usuario_id });
  // La mercadería conserva su fecha de ingreso original al cambiar de depósito.
  for (const l of consumirLotes(producto_id, origen, unidades, movId)) {
    crearLote({ producto_id, deposito_id: destino, fecha_ingreso: l.fecha_ingreso, origen: l.origen, raiz_id: l.raiz_id ?? l.id,
      ref_tipo: l.ref_tipo, ref_id: l.ref_id, mov_id: movId, unidades: l.unidades });
  }
  return movId;
}

export function existenciasDe(pid) {
  const filas = all('SELECT deposito_id, cantidad FROM existencias WHERE producto_id = ?', pid);
  const o = { 1: 0, 2: 0 };
  for (const f of filas) o[f.deposito_id] = f.cantidad;
  return o;
}

// Saca mercadería con un costo YA conocido (se usa al anular una compra: se resta lo que esa compra había sumado).
export function salirConCosto({ producto_id, deposito_id, unidades, costo, tipo, motivo, ref_tipo, ref_id, usuario_id }) {
  const p = producto(producto_id);
  const disponible = stockEn(producto_id, deposito_id);
  if (unidades > disponible) {
    throw bad(`No se puede anular: de "${p.nombre}" en ${deposito(deposito_id).nombre} quedan ${disponible} unidades y esa operación había sumado ${unidades}.`, 'SIN_STOCK');
  }
  const total = stockTotal(producto_id);
  const quitar = unidades >= total ? p.valor_inventario : Math.min(p.valor_inventario, costo);
  run('UPDATE existencias SET cantidad = cantidad - ? WHERE producto_id = ? AND deposito_id = ?', unidades, producto_id, deposito_id);
  run('UPDATE productos SET valor_inventario = valor_inventario - ? WHERE id = ?', quitar, producto_id);
  const movId = registrar({ producto_id, tipo, unidades, origen: deposito_id, motivo, ref_tipo, ref_id, costo: quitar, usuario_id });
  consumirLotes(producto_id, deposito_id, unidades, movId, { preferir: { ref_tipo, ref_id } });
  return quitar;
}
