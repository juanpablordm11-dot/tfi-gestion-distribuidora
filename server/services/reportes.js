// Indicadores, ganancias y datos para los gráficos. Todo sale de las operaciones guardadas.
import { get, all } from '../db.js';
import { hoy, sumarDias, pct, bad, esFecha } from '../util.js';
import { listarVentas } from './ventas.js';
import { saldoCaja } from './caja.js';

const fechaV = 'substr(v.fecha, 1, 10)';

export function rango(q) {
  const h = hoy();
  const desde = q.desde && esFecha(q.desde) ? q.desde : h.slice(0, 8) + '01';
  const hasta = q.hasta && esFecha(q.hasta) ? q.hasta : h;
  if (desde > hasta) throw bad('La fecha "desde" no puede ser posterior a "hasta".');
  return { desde, hasta };
}

const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;

export function resumen({ desde, hasta }) {
  const ventas = get(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM ventas v WHERE v.estado = 'confirmada' AND v.tipo = 'venta' AND ${fechaV} BETWEEN ? AND ?`, desde, hasta);
  const l = get(
    `SELECT COALESCE(SUM(l.ingreso_neto), 0) AS ingreso, COALESCE(SUM(l.costo_total), 0) AS costo, COALESCE(SUM(l.ganancia), 0) AS ganancia,
            COALESCE(SUM(CASE WHEN l.costo_total = 0 THEN 1 ELSE 0 END), 0) AS sin_costo
       FROM venta_lineas l JOIN ventas v ON v.id = l.venta_id WHERE v.estado = 'confirmada' AND ${fechaV} BETWEEN ? AND ?`, desde, hasta);
  const neto = (cats) => get(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS t FROM caja_mov
      WHERE categoria IN (${cats.map(() => '?').join(',')}) AND substr(fecha, 1, 10) BETWEEN ? AND ?`, ...cats, desde, hasta).t;
  const cobrosVentas = neto(['venta']);
  const cobrosDeudas = neto(['cobro_deuda']);
  const gastos = get(`SELECT COALESCE(SUM(monto), 0) AS t FROM gastos WHERE anulado = 0 AND substr(fecha, 1, 10) BETWEEN ? AND ?`, desde, hasta).t;
  const retiros = -neto(['retiro']); // plata que el dueño sacó (positivo)
  const mermas = get(`SELECT COALESCE(SUM(costo), 0) AS t FROM mov_stock WHERE tipo = 'merma' AND substr(fecha, 1, 10) BETWEEN ? AND ?`, desde, hasta).t;
  const ajustes = get(
    `SELECT COALESCE(SUM(CASE WHEN deposito_origen IS NOT NULL THEN costo ELSE -costo END), 0) AS t FROM mov_stock
      WHERE tipo = 'ajuste' AND substr(fecha, 1, 10) BETWEEN ? AND ?`, desde, hasta).t; // positivo = pérdida
  const perdidas = mermas + ajustes;
  const resultado = l.ganancia - gastos - perdidas;
  return {
    desde, hasta,
    ventas_total: ventas.total, ventas_cantidad: ventas.n,
    ingreso_neto: l.ingreso, costo_vendido: l.costo, ganancia_bruta: l.ganancia,
    margen_pct: pct(l.ganancia, l.ingreso), recargo_pct: pct(l.ganancia, l.costo),
    lineas_sin_costo: l.sin_costo,
    cobros: cobrosVentas + cobrosDeudas, cobros_ventas: cobrosVentas, cobros_deudas: cobrosDeudas,
    gastos, retiros, mermas_ajustes: perdidas, resultado_neto: resultado,
  };
}

export function estadoGeneral() {
  const h = hoy();
  const deuda = get(
    `SELECT COALESCE(SUM(s.total - s.pagado), 0) AS total,
            COALESCE(SUM(CASE WHEN v.vencimiento IS NOT NULL AND v.vencimiento < ? THEN s.total - s.pagado ELSE 0 END), 0) AS vencida,
            COUNT(DISTINCT v.cliente_id) AS clientes
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id WHERE v.estado = 'confirmada' AND s.total > s.pagado`, h);
  const stockDep = all(
    `SELECT d.id, d.nombre, COALESCE(SUM(e.cantidad), 0) AS unidades FROM depositos d
       LEFT JOIN existencias e ON e.deposito_id = d.id GROUP BY d.id ORDER BY d.id`);
  const inv = get('SELECT COALESCE(SUM(valor_inventario), 0) AS valor FROM productos').valor;
  const prods = all(
    `SELECT p.id, p.nombre, p.marca, p.variante, p.stock_minimo, p.unidades_por_caja, COALESCE(SUM(e.cantidad), 0) AS total
       FROM productos p LEFT JOIN existencias e ON e.producto_id = p.id WHERE p.activo = 1 GROUP BY p.id`);
  return {
    deuda_total: deuda.total, deuda_vencida: deuda.vencida, clientes_con_deuda: deuda.clientes,
    deuda_proveedores: get(`SELECT COALESCE(SUM(c.total - COALESCE((SELECT SUM(pp.monto) FROM pagos_proveedor pp WHERE pp.compra_id = c.id AND pp.anulado = 0), 0)), 0) AS t
                              FROM compras c WHERE c.estado = 'confirmada'`).t,
    stock_por_deposito: stockDep, valor_inventario: inv,
    stock_bajo: prods.filter((p) => p.total > 0 && p.stock_minimo > 0 && p.total <= p.stock_minimo),
    agotados: prods.filter((p) => p.total === 0),
    cantidad_productos: prods.length,
  };
}

const periodoSql = {
  dia: (c) => `substr(${c}, 1, 10)`,
  mes: (c) => `substr(${c}, 1, 7)`,
  semana: (c) => `date(substr(${c}, 1, 10), '-' || ((CAST(strftime('%w', substr(${c}, 1, 10)) AS INTEGER) + 6) % 7) || ' days')`,
};

function periodosEntre(desde, hasta, agrupar) {
  const out = [];
  if (agrupar === 'mes') {
    let [y, m] = desde.slice(0, 7).split('-').map(Number);
    const fin = hasta.slice(0, 7);
    for (;;) { const k = `${y}-${String(m).padStart(2, '0')}`; out.push(k); if (k >= fin) break; m++; if (m > 12) { m = 1; y++; } }
  } else if (agrupar === 'semana') {
    const dow = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
    let d = sumarDias(desde, -dow(desde));
    while (d <= hasta) { out.push(d); d = sumarDias(d, 7); }
  } else {
    let d = desde; while (d <= hasta) { out.push(d); d = sumarDias(d, 1); }
  }
  return out;
}

export function serie({ desde, hasta }, agrupar = 'dia') {
  if (!periodoSql[agrupar]) agrupar = 'dia';
  if (agrupar === 'dia' && diasEntre(desde, hasta) > 400) agrupar = 'semana';
  const pv = periodoSql[agrupar]('v.fecha'); const pc = periodoSql[agrupar]('m.fecha'); const pg = periodoSql[agrupar]('g.fecha');
  const ventas = all(`SELECT ${pv} AS p, SUM(v.total) AS t FROM ventas v WHERE v.estado = 'confirmada' AND v.tipo = 'venta' AND ${fechaV} BETWEEN ? AND ? GROUP BY p`, desde, hasta);
  const gan = all(
    `SELECT ${pv} AS p, SUM(l.ganancia) AS t FROM venta_lineas l JOIN ventas v ON v.id = l.venta_id
      WHERE v.estado = 'confirmada' AND ${fechaV} BETWEEN ? AND ? GROUP BY p`, desde, hasta);
  const cobros = all(
    `SELECT ${pc} AS p, SUM(CASE WHEN m.tipo = 'ingreso' THEN m.monto ELSE -m.monto END) AS t FROM caja_mov m
      WHERE m.categoria IN ('venta', 'cobro_deuda') AND substr(m.fecha, 1, 10) BETWEEN ? AND ? GROUP BY p`, desde, hasta);
  const gastos = all(`SELECT ${pg} AS p, SUM(g.monto) AS t FROM gastos g WHERE g.anulado = 0 AND substr(g.fecha, 1, 10) BETWEEN ? AND ? GROUP BY p`, desde, hasta);
  const mapa = (rows) => new Map(rows.map((r) => [r.p, r.t]));
  const [mv, mg, mc, mx] = [mapa(ventas), mapa(gan), mapa(cobros), mapa(gastos)];
  return {
    agrupar,
    puntos: periodosEntre(desde, hasta, agrupar).map((p) => ({
      periodo: p, ventas: mv.get(p) ?? 0, ganancia: mg.get(p) ?? 0, cobros: mc.get(p) ?? 0, gastos: mx.get(p) ?? 0,
    })),
  };
}

export function porProducto({ desde, hasta }) {
  return all(
    `SELECT p.id AS producto_id, p.nombre, p.marca, p.variante, p.unidades_por_caja,
            SUM(l.unidades) AS unidades, SUM(l.ingreso_neto) AS ingreso, SUM(l.costo_total) AS costo, SUM(l.ganancia) AS ganancia,
            SUM(CASE WHEN l.costo_total = 0 THEN 1 ELSE 0 END) AS sin_costo
       FROM venta_lineas l JOIN ventas v ON v.id = l.venta_id JOIN productos p ON p.id = l.producto_id
      WHERE v.estado = 'confirmada' AND ${fechaV} BETWEEN ? AND ? GROUP BY p.id ORDER BY ganancia DESC`, desde, hasta)
    .map((r) => ({
      ...r, cajas_equivalentes: Math.round((r.unidades / r.unidades_por_caja) * 100) / 100,
      margen_pct: pct(r.ganancia, r.ingreso), recargo_pct: pct(r.ganancia, r.costo),
      ganancia_unidad: Math.round(r.ganancia / r.unidades), ganancia_caja: Math.round((r.ganancia / r.unidades) * r.unidades_por_caja),
    }));
}

export function porCliente({ desde, hasta }) {
  return all(
    `SELECT c.id AS cliente_id, c.nombre, COUNT(DISTINCT v.id) AS ventas, SUM(l.ingreso_neto) AS ingreso, SUM(l.costo_total) AS costo, SUM(l.ganancia) AS ganancia
       FROM venta_lineas l JOIN ventas v ON v.id = l.venta_id JOIN clientes c ON c.id = v.cliente_id
      WHERE v.estado = 'confirmada' AND ${fechaV} BETWEEN ? AND ? GROUP BY c.id ORDER BY ganancia DESC`, desde, hasta)
    .map((r) => ({ ...r, margen_pct: pct(r.ganancia, r.ingreso), recargo_pct: pct(r.ganancia, r.costo) }));
}

export function gastosPorCategoria({ desde, hasta }) {
  return all(`SELECT categoria, SUM(monto) AS total FROM gastos WHERE anulado = 0 AND substr(fecha, 1, 10) BETWEEN ? AND ? GROUP BY categoria ORDER BY total DESC`, desde, hasta);
}

export function deudaPorCliente() {
  return all(
    `SELECT c.id AS cliente_id, c.nombre, SUM(s.total - s.pagado) AS saldo,
            SUM(CASE WHEN v.vencimiento IS NOT NULL AND v.vencimiento < ? THEN s.total - s.pagado ELSE 0 END) AS vencida
       FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id JOIN clientes c ON c.id = v.cliente_id
      WHERE v.estado = 'confirmada' AND s.total > s.pagado GROUP BY c.id ORDER BY saldo DESC`, hoy());
}

export function existenciasPorProducto(limite = 8) {
  return all(
    `SELECT p.id, p.nombre, p.marca, p.variante, p.unidades_por_caja,
            COALESCE(SUM(CASE WHEN e.deposito_id = 1 THEN e.cantidad END), 0) AS galpon,
            COALESCE(SUM(CASE WHEN e.deposito_id = 2 THEN e.cantidad END), 0) AS casa
       FROM productos p LEFT JOIN existencias e ON e.producto_id = p.id WHERE p.activo = 1 GROUP BY p.id
      ORDER BY (galpon + casa) DESC LIMIT ?`, limite);
}

function variacion(actual, anterior) {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 10000) / 100;
}

export function dashboard(q) {
  const r = rango(q);
  const h = hoy();
  const periodo = resumen(r);
  const hoyR = resumen({ desde: h, hasta: h });
  const productos = porProducto(r);
  const clientes = porCliente(r);
  const topVend = all(
    `SELECT p.id AS producto_id, p.nombre, p.marca, p.variante, p.unidades_por_caja, SUM(l.unidades) AS unidades, SUM(l.ingreso_neto) AS ingreso
       FROM venta_lineas l JOIN ventas v ON v.id = l.venta_id JOIN productos p ON p.id = l.producto_id
      WHERE v.estado = 'confirmada' AND ${fechaV} BETWEEN ? AND ? GROUP BY p.id ORDER BY unidades DESC LIMIT 6`, r.desde, r.hasta);
  const topClientes = all(
    `SELECT c.id AS cliente_id, c.nombre, SUM(v.total) AS total, COUNT(*) AS ventas
       FROM ventas v JOIN clientes c ON c.id = v.cliente_id WHERE v.estado = 'confirmada' AND v.tipo = 'venta' AND ${fechaV} BETWEEN ? AND ?
      GROUP BY c.id ORDER BY total DESC LIMIT 6`, r.desde, r.hasta);
  const hayDatos = get("SELECT COUNT(*) AS n FROM ventas WHERE tipo = 'venta'").n > 0;
  const hayProductos = get('SELECT COUNT(*) AS n FROM productos').n > 0;
  const hayClientes = get('SELECT COUNT(*) AS n FROM clientes').n > 0;
  return {
    rango: r, hoy: hoyR, periodo, general: estadoGeneral(), caja: saldoCaja(),
    serie: serie(r, 'dia'), gastos_por_categoria: gastosPorCategoria(r),
    top_productos: topVend, top_clientes: topClientes, deuda_por_cliente: deudaPorCliente().slice(0, 8),
    existencias: existenciasPorProducto(8), ganancia_productos: productos.slice(0, 6), ganancia_clientes: clientes.slice(0, 6),
    vacio: { hay_ventas: hayDatos, hay_productos: hayProductos, hay_clientes: hayClientes },
  };
}

export function ganancias(q) {
  const r = rango(q);
  const dias = diasEntre(r.desde, r.hasta);
  const desdeAnt = sumarDias(r.desde, -dias); const hastaAnt = sumarDias(r.desde, -1);
  const actual = resumen(r); const anterior = resumen({ desde: desdeAnt, hasta: hastaAnt });
  const agrupar = ['dia', 'semana', 'mes'].includes(q.agrupar) ? q.agrupar : (dias > 120 ? 'mes' : dias > 45 ? 'semana' : 'dia');
  return {
    rango: r, anterior_rango: { desde: desdeAnt, hasta: hastaAnt }, actual, anterior,
    variacion: {
      ventas: variacion(actual.ventas_total, anterior.ventas_total),
      ganancia_bruta: variacion(actual.ganancia_bruta, anterior.ganancia_bruta),
      resultado_neto: variacion(actual.resultado_neto, anterior.resultado_neto),
      gastos: variacion(actual.gastos, anterior.gastos),
    },
    serie: serie(r, agrupar), por_producto: porProducto(r), por_cliente: porCliente(r),
    por_venta: listarVentas({ desde: r.desde, hasta: r.hasta, estado: 'confirmada' }).slice(0, 200),
  };
}
