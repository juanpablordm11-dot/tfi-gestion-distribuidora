// Ventas: confirmación atómica (todo o nada), precios por cliente, costo histórico y anulación.
import { get, all, run, tx, auditar, config } from '../db.js';
import { ahora, hoy, sumarDias, pesos, bad, conflicto, noEncontrado, entero, dinero, texto, opcion, idemKey, booleano, repartir, pct, esFecha } from '../util.js';
import * as stock from './stock.js';
import * as caja from './caja.js';
import { MEDIOS, saldoCliente, estadoDeuda, pagosDeVenta, registrarCobro } from './deudas.js';

export function precioLista(clienteId, p, presentacion) {
  const campo = presentacion === 'caja' ? 'precio_caja' : 'precio_unidad';
  const pc = get('SELECT precio_unidad, precio_caja FROM precios_cliente WHERE cliente_id = ? AND producto_id = ?', clienteId, p.id);
  return pc && pc[campo] != null ? pc[campo] : p[campo];
}

export function detalleVenta(id) {
  const v = get(
    `SELECT v.*, c.nombre AS cliente, d.nombre AS deposito, u.nombre AS usuario, ua.nombre AS anulada_por_nombre,
            s.pagado, (v.total - s.pagado) AS saldo
       FROM ventas v JOIN clientes c ON c.id = v.cliente_id JOIN depositos d ON d.id = v.deposito_id
       JOIN v_ventas_saldo s ON s.venta_id = v.id
       LEFT JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN usuarios ua ON ua.id = v.anulada_por
      WHERE v.id = ?`, id);
  if (!v) throw noEncontrado('No existe esa venta.');
  const lineas = all(
    `SELECT l.*, p.nombre, p.marca, p.variante, p.unidades_por_caja
       FROM venta_lineas l JOIN productos p ON p.id = l.producto_id WHERE l.venta_id = ? ORDER BY l.id`, id);
  const ingreso = lineas.reduce((s, l) => s + l.ingreso_neto, 0);
  const costo = lineas.reduce((s, l) => s + l.costo_total, 0);
  // Plata que el cliente entregó para su deuda vieja junto con esta venta (cobro aparte) y a qué deudas fue.
  const entregas = all('SELECT id, monto, medio, anulado FROM pagos WHERE venta_entrega_id = ? ORDER BY id', id).map((p) => {
    const aplicaciones = all(
      `SELECT a.venta_id, a.monto, w.numero, w.tipo, w.fecha FROM pago_aplicaciones a JOIN ventas w ON w.id = a.venta_id
        WHERE a.pago_id = ? AND a.anulada = 0 ORDER BY a.id`, p.id);
    const aplicado = aplicaciones.reduce((s, a) => s + a.monto, 0);
    return { ...p, aplicaciones, aplicado, a_favor: p.monto - aplicado };
  });
  const entregaVigente = entregas.filter((p) => !p.anulado);
  return {
    ...v, estado_deuda: estadoDeuda(v), lineas, pagos: pagosDeVenta(id),
    entregas_deuda: entregas, entrega_deuda: entregaVigente.reduce((s, p) => s + p.monto, 0),
    ganancia: ingreso - costo, margen_pct: pct(ingreso - costo, ingreso), recargo_pct: pct(ingreso - costo, costo),
  };
}

// Datos para imprimir el comprobante interno de la venta (NO es factura fiscal) con el estado de cuenta del cliente.
export function comprobanteVenta(id) {
  const venta = detalleVenta(id);
  const cliente = get('SELECT nombre, documento, telefono, direccion, modalidad FROM clientes WHERE id = ?', venta.cliente_id);
  const s = saldoCliente(venta.cliente_id);
  return {
    venta, cliente,
    negocio: {
      nombre: config.get('negocio_nombre'), direccion: config.get('negocio_direccion') || null,
      telefono: config.get('negocio_telefono') || null, pie: config.get('comprobante_pie') || null,
    },
    saldo_hoy: s.deuda - s.saldo_favor, impreso: ahora(),
  };
}

// Saldo inicial de cuenta corriente: lo que el cliente ya debía al empezar a usar el sistema.
// Es una "venta" de tipo saldo_inicial sin productos: cuenta como deuda y se cobra como cualquier otra,
// pero no toca stock, ventas, ganancias ni caja. Lleva número negativo para no ocupar números de venta.
export function crearSaldoInicialCliente(clienteId, b, user) {
  const monto = dinero(b.monto, 'Saldo que debía', { min: 1 });
  const fechaDia = b.fecha ? String(b.fecha) : hoy();
  if (!esFecha(fechaDia)) throw bad('La fecha no es válida.');
  if (fechaDia > hoy()) throw bad('La fecha no puede ser futura.');
  let vencimiento = null;
  if (b.vencimiento) {
    if (!esFecha(b.vencimiento)) throw bad('La fecha de vencimiento no es válida.');
    vencimiento = b.vencimiento;
  }
  const observaciones = texto(b.observaciones, 'Observaciones', { max: 300 });
  return tx(() => {
    const cliente = get('SELECT * FROM clientes WHERE id = ?', clienteId);
    if (!cliente) throw noEncontrado('No existe ese cliente.');
    const previo = get("SELECT id FROM ventas WHERE cliente_id = ? AND tipo = 'saldo_inicial' AND estado = 'confirmada'", clienteId);
    if (previo) throw conflicto(`${cliente.nombre} ya tiene un saldo inicial cargado. Si está mal, anulalo y cargalo de nuevo.`, 'YA_TIENE_SALDO_INICIAL');
    const sAntes = saldoCliente(clienteId);
    const numero = get('SELECT COALESCE(MIN(numero), 0) - 1 AS n FROM ventas WHERE numero < 0').n;
    const id = run(
      `INSERT INTO ventas (numero, fecha, cliente_id, deposito_id, modalidad_pago, total, vencimiento, observaciones, idem_key, usuario_id, tipo, saldo_anterior, saldo_posterior)
       VALUES (?, ?, ?, 1, 'fiado', ?, ?, ?, ?, ?, 'saldo_inicial', ?, ?)`,
      numero, `${fechaDia} ${ahora().slice(11)}`, clienteId, monto, vencimiento, observaciones ?? 'Saldo que debía al empezar a usar el sistema',
      `saldo-inicial-${clienteId}-${Date.now()}`, user?.id ?? null, sAntes.deuda - sAntes.saldo_favor, sAntes.deuda - sAntes.saldo_favor + monto).id;
    auditar(user?.id, 'saldo_inicial', 'cliente', clienteId, { monto, fecha: fechaDia, venta_id: id });
    return detalleVenta(id);
  });
}

export function crearVenta(b, user) {
  const idem = idemKey(b.idem_key);
  const clienteId = entero(b.cliente_id, 'Cliente', { min: 1 });
  const depId = entero(b.deposito_id, 'Depósito', { min: 1 });
  if (!Array.isArray(b.lineas) || b.lineas.length === 0) throw bad('Agregá al menos un producto a la venta.');
  if (b.lineas.length > 200) throw bad('Demasiados productos en una sola venta.');
  const modalidad = opcion(b.modalidad_pago, 'Modalidad de pago', ['contado', 'fiado', 'mixto']);
  const medio = opcion(b.medio, 'Medio de pago', MEDIOS, { defecto: 'efectivo' });
  const descuentoPedido = dinero(b.descuento ?? 0, 'Descuento');
  const observaciones = texto(b.observaciones, 'Observaciones', { max: 300 });
  // Plata que además entrega para su deuda vieja (solo si paga la venta completa). Lo que pase de la deuda queda a favor.
  const entregaDeuda = dinero(b.entrega_deuda, 'Entrega para la deuda', { min: 1, opcional: true });
  if (entregaDeuda && modalidad !== 'contado') throw bad('Para entregar plata para la deuda, la venta tiene que pagarse completa (contado).');
  // La deuda que veía la pantalla al cargar la entrega (si otro dispositivo cobró o vendió mientras tanto, se frena y se avisa)
  const deudaVista = entregaDeuda ? dinero(b.deuda_vista, 'Deuda vista', { opcional: true }) : null;
  let vencimientoPedido = null;
  if (b.vencimiento) {
    if (!esFecha(b.vencimiento)) throw bad('La fecha de vencimiento no es válida.');
    vencimientoPedido = b.vencimiento;
  }

  return tx(() => {
    const dup = get('SELECT id FROM ventas WHERE idem_key = ?', idem);
    if (dup) return { duplicada: true, venta: detalleVenta(dup.id) };

    const cliente = get('SELECT * FROM clientes WHERE id = ?', clienteId);
    if (!cliente) throw bad('El cliente no existe.');
    if (!cliente.activo) throw bad('El cliente está inactivo. Reactivalo para venderle.');
    stock.deposito(depId);
    const sAntes = saldoCliente(clienteId);
    if (entregaDeuda && sAntes.deuda <= 0) throw bad(`${cliente.nombre} no tiene deuda: no hay nada para entregar a cuenta.`);
    if (entregaDeuda && deudaVista !== null && deudaVista !== sAntes.deuda) {
      throw conflicto(`La deuda de ${cliente.nombre} cambió mientras cargabas la venta: ahora es ${pesos(sAntes.deuda)} (antes ${pesos(deudaVista)}). Revisá lo que entrega y confirmá de nuevo.`,
        'DEUDA_CAMBIO', { deuda: sAntes.deuda });
    }

    // 1) Armar y validar las líneas. Los importes los calcula SIEMPRE el servidor.
    const lineas = b.lineas.map((l, i) => {
      const n = i + 1;
      const pid = entero(l.producto_id, `Producto de la línea ${n}`, { min: 1 });
      const p = stock.producto(pid);
      if (!p.activo) throw bad(`"${p.nombre}" está inactivo y no se puede vender.`);
      const presentacion = opcion(l.presentacion, `Presentación de la línea ${n}`, ['caja', 'unidad']);
      const cantidad = entero(l.cantidad, `Cantidad de "${p.nombre}"`, { min: 1, max: 1_000_000 });
      const lista = precioLista(clienteId, p, presentacion);
      const precio = l.precio === undefined || l.precio === null ? lista : dinero(l.precio, `Precio de "${p.nombre}"`);
      if (l.fecha_ingreso && !esFecha(l.fecha_ingreso)) throw bad(`La fecha de ingreso de "${p.nombre}" no es válida.`);
      return { p, presentacion, cantidad, unidades: stock.unidadesDe(p, presentacion, cantidad), precio, precio_lista: lista, subtotal: precio * cantidad,
        fecha_ingreso: l.fecha_ingreso || null };
    });
    // De qué fecha de ingreso sale cada línea: la elige quien vende. Si en el depósito hay una sola fecha, se usa esa.
    const depNombre = stock.deposito(depId).nombre;
    for (const l of lineas) {
      const fechas = stock.fechasDisponibles(l.p.id, depId);
      if (l.fecha_ingreso) {
        if (!fechas.some((f) => f.fecha_ingreso === l.fecha_ingreso)) {
          throw bad(`No hay "${l.p.nombre}" con fecha de ingreso ${l.fecha_ingreso.split('-').reverse().join('/')} en ${depNombre}.`, 'SIN_STOCK_FECHA');
        }
      } else if (fechas.length > 1) {
        throw bad(`Elegí de qué fecha de ingreso sale "${l.p.nombre}": en ${depNombre} hay mercadería de ${fechas.length} fechas distintas.`, 'ELEGIR_FECHA',
          { producto_id: l.p.id, fechas });
      } else if (fechas.length === 1) l.fecha_ingreso = fechas[0].fecha_ingreso;
    }
    const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
    if (descuentoPedido > subtotal) throw bad('El descuento no puede ser mayor al subtotal.');
    const total = subtotal - descuentoPedido;
    if (total <= 0) throw bad('El total de la venta tiene que ser mayor a cero.');
    const desc = repartir(descuentoPedido, lineas.map((l) => l.subtotal));
    lineas.forEach((l, i) => { l.descuento_asignado = desc[i]; l.ingreso_neto = l.subtotal - desc[i]; });

    // 2) Pago y deuda
    let pagado;
    if (modalidad === 'contado') pagado = total;
    else if (modalidad === 'fiado') pagado = 0;
    else {
      pagado = dinero(b.pagado, 'Importe pagado');
      if (pagado <= 0 || pagado >= total) throw bad('En una venta mixta lo pagado tiene que ser mayor a cero y menor al total.');
    }
    const pendiente = total - pagado;
    if (pendiente > 0) {
      if (cliente.modalidad === 'contado') {
        throw bad(`${cliente.nombre} es cliente de contado. Cambiale la modalidad a "Fiado" o "Ambas" para dejarle deuda.`, 'CLIENTE_CONTADO');
      }
      const s = saldoCliente(clienteId);
      if (cliente.limite_credito > 0 && s.deuda + pendiente > cliente.limite_credito && !booleano(b.forzar_limite)) {
        throw conflicto(`Con esta venta ${cliente.nombre} pasaría su límite de crédito (${pesos(cliente.limite_credito)}). Deuda actual ${pesos(s.deuda)} + esta venta ${pesos(pendiente)}.`,
          'LIMITE_CREDITO', { limite: cliente.limite_credito, deuda: s.deuda, pendiente });
      }
    }
    const vencimiento = pendiente > 0
      ? (vencimientoPedido ?? (cliente.plazo_dias > 0 ? sumarDias(hoy(), cliente.plazo_dias) : null))
      : null;

    // 3) Guardar la venta
    const numero = get('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM ventas').n;
    const fecha = ahora();
    const ventaId = run(
      `INSERT INTO ventas (numero, fecha, cliente_id, deposito_id, modalidad_pago, descuento, total, vencimiento, observaciones, idem_key, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      numero, fecha, clienteId, depId, modalidad, descuentoPedido, total, vencimiento, observaciones, idem, user?.id ?? null).id;

    // 4) Descontar stock y fijar el costo histórico de cada línea
    for (const l of lineas) {
      const costo = stock.salir({
        producto_id: l.p.id, deposito_id: depId, unidades: l.unidades, tipo: 'venta',
        motivo: `Venta N° ${numero}`, ref_tipo: 'venta', ref_id: ventaId, usuario_id: user?.id, fecha_ingreso: l.fecha_ingreso,
      });
      run(
        `INSERT INTO venta_lineas (venta_id, producto_id, presentacion, cantidad, unidades, precio, precio_lista, subtotal, descuento_asignado, ingreso_neto, costo_total, ganancia, fecha_ingreso)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ventaId, l.p.id, l.presentacion, l.cantidad, l.unidades, l.precio, l.precio_lista, l.subtotal, l.descuento_asignado, l.ingreso_neto, costo, l.ingreso_neto - costo, l.fecha_ingreso);
    }

    // 5) Cobro inmediato (si hubo) → pago + caja. La parte fiada NO toca la caja.
    if (pagado > 0) {
      const pagoId = run(
        `INSERT INTO pagos (cliente_id, fecha, monto, medio, origen, idem_key, usuario_id) VALUES (?, ?, ?, ?, 'venta', ?, ?)`,
        clienteId, fecha, pagado, medio, `${idem}:pago`, user?.id ?? null).id;
      run('INSERT INTO pago_aplicaciones (pago_id, venta_id, monto, fecha) VALUES (?, ?, ?, ?)', pagoId, ventaId, pagado, fecha);
      caja.movimiento({
        tipo: 'ingreso', categoria: 'venta', medio, monto: pagado,
        concepto: `Venta N° ${numero} - ${cliente.nombre}`, ref_tipo: 'pago', ref_id: pagoId, usuario_id: user?.id,
      });
    }

    // 5b) Entrega para la deuda: un cobro aparte (no es parte de la venta), a las deudas más viejas; lo que sobra queda a favor
    let cobroDeuda = null;
    if (entregaDeuda) {
      cobroDeuda = registrarCobro({
        cliente, monto: entregaDeuda, medio, excedente: 'saldo_a_favor', idem: `${idem}:deuda`, user, ventaEntregaId: ventaId,
        nota: `Entregado junto con la venta N° ${numero}`, concepto: `Cobro de deuda a ${cliente.nombre} (con la venta N° ${numero})`,
      });
    }

    // 6) Estado de cuenta antes y después, para el comprobante
    const sDespues = saldoCliente(clienteId);
    run('UPDATE ventas SET saldo_anterior = ?, saldo_posterior = ? WHERE id = ?',
      sAntes.deuda - sAntes.saldo_favor, sDespues.deuda - sDespues.saldo_favor, ventaId);

    const modificados = lineas.filter((l) => l.precio !== l.precio_lista)
      .map((l) => ({ producto: l.p.nombre, presentacion: l.presentacion, lista: l.precio_lista, cobrado: l.precio }));
    auditar(user?.id, 'crear', 'venta', ventaId, {
      numero, cliente: cliente.nombre, total, pagado, descuento: descuentoPedido,
      ...(cobroDeuda ? { entrega_deuda: entregaDeuda, a_favor: cobroDeuda.sobra } : {}),
      ...(modificados.length ? { precios_modificados: modificados } : {}),
    });
    return { duplicada: false, venta: detalleVenta(ventaId) };
  });
}

// Anula una venta: devuelve el stock al depósito de origen (con su costo), revierte la deuda y,
// si había cobros, los devuelve en efectivo o los deja como saldo a favor. La venta queda como "anulada".
export function anularVenta(id, b, user) {
  const motivo = texto(b.motivo, 'Motivo', { requerido: true, min: 3, max: 200 });
  const destino = opcion(b.destino_pagos, 'Destino de los pagos', ['devolver', 'saldo_a_favor'], { opcional: true });
  return tx(() => {
    const v = get('SELECT * FROM ventas WHERE id = ?', id);
    if (!v) throw noEncontrado('No existe esa venta.');
    if (v.estado === 'anulada') throw conflicto('Esa venta ya está anulada.');
    const apps = all(
      `SELECT a.id, a.monto, a.pago_id, p.medio, p.origen FROM pago_aplicaciones a JOIN pagos p ON p.id = a.pago_id
        WHERE a.venta_id = ? AND a.anulada = 0 AND p.anulado = 0`, id);
    const cobrado = apps.reduce((s, a) => s + a.monto, 0);
    if (cobrado > 0 && !destino) {
      throw conflicto(`Esta venta tiene ${pesos(cobrado)} cobrados. Elegí si se los devolvés al cliente o quedan como saldo a favor.`,
        'TIENE_PAGOS', { cobrado });
    }
    // Stock y costo vuelven al depósito de origen
    const lineas = all('SELECT * FROM venta_lineas WHERE venta_id = ?', id);
    for (const l of lineas) {
      stock.entrar({
        producto_id: l.producto_id, deposito_id: v.deposito_id, unidades: l.unidades, costo: l.costo_total, tipo: 'anulacion_venta',
        motivo: `Anulación de venta N° ${v.numero}: ${motivo}`, ref_tipo: 'venta', ref_id: id, usuario_id: user?.id,
        devolverDe: { ref_tipo: 'venta', ref_id: id },
      });
    }
    // Pagos: se desvinculan de la venta (queda registro) y se reintegran o quedan a favor
    for (const a of apps) {
      run('UPDATE pago_aplicaciones SET anulada = 1 WHERE id = ?', a.id);
      if (destino === 'devolver') {
        run('UPDATE pagos SET devuelto = devuelto + ? WHERE id = ?', a.monto, a.pago_id);
        const orig = caja.movOriginal('pago', a.pago_id);
        if (orig) caja.compensar(orig.id, a.monto, `Devolución por anulación de venta N° ${v.numero}`, user?.id);
      }
    }
    run('UPDATE ventas SET estado = ?, anulada_motivo = ?, anulada_fecha = ?, anulada_por = ? WHERE id = ?',
      'anulada', motivo, ahora(), user?.id ?? null, id);
    auditar(user?.id, 'anular', 'venta', id, { numero: v.numero, motivo, cobrado, destino_pagos: destino ?? null });
    return detalleVenta(id);
  });
}

export function listarVentas(f = {}) {
  const cond = []; const par = [];
  if (f.desde && esFecha(f.desde)) { cond.push('substr(v.fecha, 1, 10) >= ?'); par.push(f.desde); }
  if (f.hasta && esFecha(f.hasta)) { cond.push('substr(v.fecha, 1, 10) <= ?'); par.push(f.hasta); }
  if (f.cliente_id) { cond.push('v.cliente_id = ?'); par.push(Number(f.cliente_id)); }
  if (f.deposito_id) { cond.push('v.deposito_id = ?'); par.push(Number(f.deposito_id)); }
  if (f.modalidad && ['contado', 'fiado', 'mixto'].includes(f.modalidad)) { cond.push('v.modalidad_pago = ?'); par.push(f.modalidad); }
  if (f.estado && ['confirmada', 'anulada'].includes(f.estado)) { cond.push('v.estado = ?'); par.push(f.estado); }
  if (f.producto_id) { cond.push('EXISTS (SELECT 1 FROM venta_lineas l WHERE l.venta_id = v.id AND l.producto_id = ?)'); par.push(Number(f.producto_id)); }
  if (f.numero) { cond.push('v.numero = ?'); par.push(Number(f.numero)); }
  cond.push("v.tipo = 'venta'"); // los saldos iniciales no son ventas: se ven en Deudas y en la ficha del cliente
  const filas = all(
    `SELECT v.id, v.numero, v.fecha, v.cliente_id, c.nombre AS cliente, d.nombre AS deposito, v.modalidad_pago, v.total, v.estado, v.vencimiento,
            s.pagado, (v.total - s.pagado) AS saldo,
            (SELECT COALESCE(SUM(l.ganancia), 0) FROM venta_lineas l WHERE l.venta_id = v.id) AS ganancia
       FROM ventas v JOIN clientes c ON c.id = v.cliente_id JOIN depositos d ON d.id = v.deposito_id JOIN v_ventas_saldo s ON s.venta_id = v.id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY v.fecha DESC, v.id DESC LIMIT 1000`, ...par);
  const h = hoy();
  return filas.map((r) => ({ ...r, estado_deuda: estadoDeuda({ ...r }, h) }));
}
