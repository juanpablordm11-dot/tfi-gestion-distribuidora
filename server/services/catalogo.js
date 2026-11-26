// Productos, clientes, proveedores y listas de precios personalizadas.
import { get, all, run, tx, auditar } from '../db.js';
import { ahora, bad, conflicto, noEncontrado, entero, dinero, texto, opcion, booleano, divRound, pct, like } from '../util.js';
import * as stock from './stock.js';
import { saldoCliente } from './deudas.js';

// ------------------------------------------------------------------ PRODUCTOS
function enriquecer(p, ex) {
  const galpon = ex[1] ?? 0; const casa = ex[2] ?? 0; const total = galpon + casa;
  const costoU = stock.costoUnitarioPromedio(p, total);          // centavos con decimales
  const costoCaja = costoU * p.unidades_por_caja;
  const gananciaU = p.precio_unidad - costoU;
  const gananciaC = p.precio_caja - costoCaja;
  return {
    ...p,
    stock_galpon: galpon, stock_casa: casa, stock_total: total,
    costo_unidad: Math.round(costoU), costo_caja_promedio: Math.round(costoCaja),
    ganancia_unidad: Math.round(gananciaU), ganancia_caja: Math.round(gananciaC),
    margen_unidad_pct: p.precio_unidad > 0 ? pct(gananciaU, p.precio_unidad) : null,
    recargo_unidad_pct: costoU > 0 ? pct(gananciaU, costoU) : null,
    margen_caja_pct: p.precio_caja > 0 ? pct(gananciaC, p.precio_caja) : null,
    recargo_caja_pct: costoCaja > 0 ? pct(gananciaC, costoCaja) : null,
    sin_costo: costoU <= 0,
    estado_stock: total === 0 ? 'agotado' : (p.stock_minimo > 0 && total <= p.stock_minimo ? 'bajo' : 'ok'),
  };
}

export function listarProductos({ q, activos, estado_stock } = {}) {
  const cond = []; const par = [];
  if (q) { cond.push("(p.nombre LIKE ? ESCAPE '\\' OR p.marca LIKE ? ESCAPE '\\' OR p.codigo LIKE ? ESCAPE '\\' OR p.variante LIKE ? ESCAPE '\\')"); par.push(like(q), like(q), like(q), like(q)); }
  if (activos === '1') cond.push('p.activo = 1');
  if (activos === '0') cond.push('p.activo = 0');
  const prods = all(`SELECT p.* FROM productos p ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY p.nombre COLLATE NOCASE, p.variante COLLATE NOCASE`, ...par);
  const ex = new Map();
  for (const e of all('SELECT producto_id, deposito_id, cantidad FROM existencias')) {
    if (!ex.has(e.producto_id)) ex.set(e.producto_id, {});
    ex.get(e.producto_id)[e.deposito_id] = e.cantidad;
  }
  let res = prods.map((p) => enriquecer(p, ex.get(p.id) ?? {}));
  if (estado_stock === 'bajo') res = res.filter((p) => p.activo && p.estado_stock === 'bajo');
  if (estado_stock === 'agotado') res = res.filter((p) => p.activo && p.estado_stock === 'agotado');
  return res;
}

export function obtenerProducto(id) {
  const p = get('SELECT * FROM productos WHERE id = ?', id);
  if (!p) throw noEncontrado('No existe ese producto.');
  return enriquecer(p, stock.existenciasDe(id));
}

function leerProducto(b, actual = null) {
  const unidades_por_caja = entero(b.unidades_por_caja ?? actual?.unidades_por_caja ?? 1, 'Unidades por caja', { min: 1, max: 100000 });
  // El costo puede cargarse por caja o por unidad; internamente se guarda el costo de la caja.
  let costo_caja;
  if (b.costo_caja !== undefined && b.costo_caja !== null && b.costo_caja !== '') costo_caja = dinero(b.costo_caja, 'Costo por caja');
  else if (b.costo_unidad !== undefined && b.costo_unidad !== null && b.costo_unidad !== '') costo_caja = dinero(b.costo_unidad, 'Costo por unidad') * unidades_por_caja;
  else costo_caja = actual?.costo_caja ?? 0;
  return {
    codigo: texto(b.codigo, 'Código', { max: 60 }),
    nombre: texto(b.nombre, 'Nombre', { requerido: true, max: 120 }),
    marca: texto(b.marca, 'Marca', { max: 80 }),
    variante: texto(b.variante, 'Variante', { max: 80 }),
    unidades_por_caja, costo_caja,
    precio_unidad: dinero(b.precio_unidad ?? 0, 'Precio por unidad'),
    precio_caja: dinero(b.precio_caja ?? 0, 'Precio por caja'),
    stock_minimo: entero(b.stock_minimo ?? 0, 'Stock mínimo', { min: 0, max: 10_000_000 }),
    observaciones: texto(b.observaciones, 'Observaciones', { max: 500 }),
  };
}

export function crearProducto(b, user) {
  const d = leerProducto(b);
  const inicial = b.stock_inicial && typeof b.stock_inicial === 'object' ? b.stock_inicial : {};
  const uG = entero(inicial[1] ?? 0, 'Stock inicial del galpón', { min: 0, max: 100_000_000 });
  const uC = entero(inicial[2] ?? 0, 'Stock inicial de la casa', { min: 0, max: 100_000_000 });
  return tx(() => {
    if (d.codigo && get('SELECT 1 FROM productos WHERE codigo = ?', d.codigo)) throw bad('Ya existe un producto con ese código.');
    const id = run(
      `INSERT INTO productos (codigo, nombre, marca, variante, unidades_por_caja, costo_caja, precio_unidad, precio_caja, stock_minimo, observaciones, creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.codigo, d.nombre, d.marca, d.variante, d.unidades_por_caja, d.costo_caja, d.precio_unidad, d.precio_caja, d.stock_minimo, d.observaciones, ahora()).id;
    for (const [dep, u] of [[1, uG], [2, uC]]) {
      if (u > 0) {
        stock.entrar({ producto_id: id, deposito_id: dep, unidades: u, costo: stock.costoDeEntrada(stock.producto(id), u), tipo: 'entrada_manual',
          motivo: 'Stock inicial al crear el producto', usuario_id: user?.id });
      }
    }
    auditar(user?.id, 'crear', 'producto', id, d);
    return obtenerProducto(id);
  });
}

export function editarProducto(id, b, user) {
  return tx(() => {
    const actual = get('SELECT * FROM productos WHERE id = ?', id);
    if (!actual) throw noEncontrado('No existe ese producto.');
    const d = leerProducto(b, actual);
    if (d.unidades_por_caja !== actual.unidades_por_caja) {
      const tiene = get('SELECT (SELECT COUNT(*) FROM mov_stock WHERE producto_id = ?) AS n', id).n;
      if (tiene > 0) throw bad('No se puede cambiar cuántas unidades trae la caja porque el producto ya tiene movimientos. Creá un producto nuevo para la otra presentación.');
    }
    if (d.codigo && get('SELECT 1 FROM productos WHERE codigo = ? AND id <> ?', d.codigo, id)) throw bad('Ya existe un producto con ese código.');
    run(
      `UPDATE productos SET codigo = ?, nombre = ?, marca = ?, variante = ?, unidades_por_caja = ?, costo_caja = ?, precio_unidad = ?, precio_caja = ?, stock_minimo = ?, observaciones = ? WHERE id = ?`,
      d.codigo, d.nombre, d.marca, d.variante, d.unidades_por_caja, d.costo_caja, d.precio_unidad, d.precio_caja, d.stock_minimo, d.observaciones, id);
    const cambios = {};
    for (const k of Object.keys(d)) if (d[k] !== actual[k]) cambios[k] = { antes: actual[k], despues: d[k] };
    if (Object.keys(cambios).length) auditar(user?.id, 'editar', 'producto', id, cambios);
    return obtenerProducto(id);
  });
}

export function estadoProducto(id, activo, user) {
  const p = get('SELECT id FROM productos WHERE id = ?', id);
  if (!p) throw noEncontrado('No existe ese producto.');
  run('UPDATE productos SET activo = ? WHERE id = ?', activo ? 1 : 0, id);
  auditar(user?.id, activo ? 'activar' : 'desactivar', 'producto', id);
  return obtenerProducto(id);
}

export function eliminarProducto(id, user) {
  return tx(() => {
    const p = get('SELECT * FROM productos WHERE id = ?', id);
    if (!p) throw noEncontrado('No existe ese producto.');
    const usos = get(`SELECT (SELECT COUNT(*) FROM mov_stock WHERE producto_id = ?) + (SELECT COUNT(*) FROM venta_lineas WHERE producto_id = ?)
                      + (SELECT COUNT(*) FROM compra_lineas WHERE producto_id = ?) AS n`, id, id, id).n;
    if (usos > 0) throw conflicto('Este producto tiene movimientos históricos y no se puede eliminar. Podés desactivarlo para que no aparezca en las ventas.', 'CON_HISTORIAL');
    run('DELETE FROM precios_cliente WHERE producto_id = ?', id);
    run('DELETE FROM existencias WHERE producto_id = ?', id);
    run('DELETE FROM productos WHERE id = ?', id);
    auditar(user?.id, 'eliminar', 'producto', id, { nombre: p.nombre });
    return { ok: true };
  });
}

// ------------------------------------------------------------------- CLIENTES
export function listarClientes({ q, modalidad, activos } = {}) {
  const cond = []; const par = [];
  if (q) {
    cond.push("(c.nombre LIKE ? ESCAPE '\\' OR c.documento LIKE ? ESCAPE '\\' OR c.telefono LIKE ? ESCAPE '\\' OR CAST(c.id AS TEXT) = ?)");
    par.push(like(q), like(q), like(q), String(q).replace(/^#/, ''));
  }
  if (modalidad && ['contado', 'fiado', 'ambas'].includes(modalidad)) { cond.push('c.modalidad = ?'); par.push(modalidad); }
  if (activos === '1') cond.push('c.activo = 1');
  if (activos === '0') cond.push('c.activo = 0');
  const filas = all(`SELECT c.* FROM clientes c ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY c.nombre COLLATE NOCASE LIMIT 1000`, ...par);
  return filas.map((c) => ({ ...c, ...saldoCliente(c.id) }));
}

function leerCliente(b) {
  return {
    nombre: texto(b.nombre, 'Nombre', { requerido: true, max: 120 }),
    documento: texto(b.documento, 'CUIT/DNI', { max: 20 }),
    telefono: texto(b.telefono, 'Teléfono', { max: 40 }),
    direccion: texto(b.direccion, 'Dirección', { max: 200 }),
    observaciones: texto(b.observaciones, 'Observaciones', { max: 500 }),
    modalidad: opcion(b.modalidad, 'Modalidad de pago', ['contado', 'fiado', 'ambas'], { defecto: 'contado' }),
    limite_credito: dinero(b.limite_credito ?? 0, 'Límite de crédito'),
    plazo_dias: entero(b.plazo_dias ?? 0, 'Plazo de pago (días)', { min: 0, max: 3650 }),
  };
}

export function crearCliente(b, user) {
  const d = leerCliente(b);
  const id = run(
    `INSERT INTO clientes (nombre, documento, telefono, direccion, observaciones, modalidad, limite_credito, plazo_dias, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    d.nombre, d.documento, d.telefono, d.direccion, d.observaciones, d.modalidad, d.limite_credito, d.plazo_dias, ahora()).id;
  auditar(user?.id, 'crear', 'cliente', id, d);
  return obtenerCliente(id);
}

export function editarCliente(id, b, user) {
  const actual = get('SELECT * FROM clientes WHERE id = ?', id);
  if (!actual) throw noEncontrado('No existe ese cliente.');
  const d = leerCliente(b);
  run(
    `UPDATE clientes SET nombre = ?, documento = ?, telefono = ?, direccion = ?, observaciones = ?, modalidad = ?, limite_credito = ?, plazo_dias = ? WHERE id = ?`,
    d.nombre, d.documento, d.telefono, d.direccion, d.observaciones, d.modalidad, d.limite_credito, d.plazo_dias, id);
  const cambios = {};
  for (const k of Object.keys(d)) if (d[k] !== actual[k]) cambios[k] = { antes: actual[k], despues: d[k] };
  if (Object.keys(cambios).length) auditar(user?.id, 'editar', 'cliente', id, cambios);
  return obtenerCliente(id);
}

export function estadoCliente(id, activo, user) {
  if (!get('SELECT 1 FROM clientes WHERE id = ?', id)) throw noEncontrado('No existe ese cliente.');
  run('UPDATE clientes SET activo = ? WHERE id = ?', activo ? 1 : 0, id);
  auditar(user?.id, activo ? 'activar' : 'desactivar', 'cliente', id);
  return obtenerCliente(id);
}

export function eliminarCliente(id, user) {
  return tx(() => {
    const c = get('SELECT * FROM clientes WHERE id = ?', id);
    if (!c) throw noEncontrado('No existe ese cliente.');
    const usos = get('SELECT (SELECT COUNT(*) FROM ventas WHERE cliente_id = ?) + (SELECT COUNT(*) FROM pagos WHERE cliente_id = ?) AS n', id, id).n;
    if (usos > 0) throw conflicto('Este cliente tiene ventas o pagos registrados y no se puede eliminar. Podés desactivarlo.', 'CON_HISTORIAL');
    run('DELETE FROM precios_cliente WHERE cliente_id = ?', id);
    run('DELETE FROM clientes WHERE id = ?', id);
    auditar(user?.id, 'eliminar', 'cliente', id, { nombre: c.nombre });
    return { ok: true };
  });
}

export function obtenerCliente(id) {
  const c = get('SELECT * FROM clientes WHERE id = ?', id);
  if (!c) throw noEncontrado('No existe ese cliente.');
  return { ...c, ...saldoCliente(id) };
}

export function fichaCliente(id) {
  const c = obtenerCliente(id);
  const ventas = all(
    `SELECT v.id, v.numero, v.fecha, v.total, v.modalidad_pago, v.estado, s.pagado, (v.total - s.pagado) AS saldo, v.vencimiento
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id WHERE v.cliente_id = ? ORDER BY v.fecha DESC, v.id DESC LIMIT 30`, id);
  const pagos = all(
    `SELECT id, fecha, monto, medio, origen, nota, anulado FROM pagos WHERE cliente_id = ? AND origen = 'cobro' ORDER BY fecha DESC, id DESC LIMIT 30`, id);
  const compras = get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM ventas WHERE cliente_id = ? AND estado = 'confirmada' AND tipo = 'venta'`, id);
  // Saldo inicial vigente (deuda de antes del sistema), para mostrarlo o permitir cargarlo en la ficha
  const saldo_inicial = get("SELECT id, total, fecha FROM ventas WHERE cliente_id = ? AND tipo = 'saldo_inicial' AND estado = 'confirmada'", id) ?? null;
  return { cliente: c, ventas, pagos, resumen: compras, precios: preciosDeCliente(id), saldo_inicial };
}

// ------------------------------------------------------------ PRECIOS POR CLIENTE
export function preciosDeCliente(clienteId) {
  return all(
    `SELECT p.id AS producto_id, p.nombre, p.marca, p.variante, p.unidades_por_caja, p.activo,
            p.precio_unidad AS general_unidad, p.precio_caja AS general_caja,
            pc.precio_unidad AS especial_unidad, pc.precio_caja AS especial_caja
       FROM productos p LEFT JOIN precios_cliente pc ON pc.producto_id = p.id AND pc.cliente_id = ?
      WHERE p.activo = 1 OR pc.cliente_id IS NOT NULL
      ORDER BY p.nombre COLLATE NOCASE, p.variante COLLATE NOCASE`, clienteId);
}

export function fijarPrecioCliente(clienteId, productoId, b, user) {
  return tx(() => {
    if (!get('SELECT 1 FROM clientes WHERE id = ?', clienteId)) throw noEncontrado('No existe ese cliente.');
    const p = get('SELECT * FROM productos WHERE id = ?', productoId);
    if (!p) throw noEncontrado('No existe ese producto.');
    const pu = b.precio_unidad === null || b.precio_unidad === undefined || b.precio_unidad === '' ? null : dinero(b.precio_unidad, 'Precio por unidad');
    const pcj = b.precio_caja === null || b.precio_caja === undefined || b.precio_caja === '' ? null : dinero(b.precio_caja, 'Precio por caja');
    const antes = get('SELECT precio_unidad, precio_caja FROM precios_cliente WHERE cliente_id = ? AND producto_id = ?', clienteId, productoId);
    if (pu === null && pcj === null) run('DELETE FROM precios_cliente WHERE cliente_id = ? AND producto_id = ?', clienteId, productoId);
    else {
      run(`INSERT INTO precios_cliente (cliente_id, producto_id, precio_unidad, precio_caja, actualizado) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (cliente_id, producto_id) DO UPDATE SET precio_unidad = excluded.precio_unidad, precio_caja = excluded.precio_caja, actualizado = excluded.actualizado`,
        clienteId, productoId, pu, pcj, ahora());
    }
    auditar(user?.id, 'precio_cliente', 'cliente', clienteId, { producto: p.nombre, antes: antes ?? null, despues: { precio_unidad: pu, precio_caja: pcj } });
    return preciosDeCliente(clienteId).find((x) => x.producto_id === productoId);
  });
}

// ---------------------------------------------------------------- PROVEEDORES
export function listarProveedores() { return all('SELECT * FROM proveedores ORDER BY activo DESC, nombre COLLATE NOCASE'); }
export function guardarProveedor(id, b, user) {
  const d = {
    nombre: texto(b.nombre, 'Nombre', { requerido: true, max: 120 }),
    telefono: texto(b.telefono, 'Teléfono', { max: 40 }),
    observaciones: texto(b.observaciones, 'Observaciones', { max: 300 }),
    activo: b.activo === undefined ? 1 : (booleano(b.activo) ? 1 : 0),
  };
  if (id) {
    if (!get('SELECT 1 FROM proveedores WHERE id = ?', id)) throw noEncontrado('No existe ese proveedor.');
    run('UPDATE proveedores SET nombre = ?, telefono = ?, observaciones = ?, activo = ? WHERE id = ?', d.nombre, d.telefono, d.observaciones, d.activo, id);
    auditar(user?.id, 'editar', 'proveedor', id, d);
    return get('SELECT * FROM proveedores WHERE id = ?', id);
  }
  const nid = run('INSERT INTO proveedores (nombre, telefono, observaciones, activo, creado) VALUES (?, ?, ?, ?, ?)', d.nombre, d.telefono, d.observaciones, d.activo, ahora()).id;
  auditar(user?.id, 'crear', 'proveedor', nid, d);
  return get('SELECT * FROM proveedores WHERE id = ?', nid);
}
