// Ganancias: sale solo de las ventas registradas (precio vendido − costo promedio del momento), menos gastos y pérdidas.
import { get, qs } from '../api.js';
import { h, icon, vaciar, money, pct, num, fdate, fdt, badge, dataTable, tabs, errorMsg, estadoVacio, cargando, nombreProducto } from '../ui.js';
import { lineChart, etiquetaPeriodo, SERIE } from '../charts.js';
import { selectorPeriodo } from './_periodo.js';
import { verVenta } from './_venta.js';

const variacionTxt = (v) => {
  if (v === null || v === undefined) return h('span', { class: 'small muted' }, 'Sin datos del período anterior');
  const t = `${v > 0 ? '▲' : v < 0 ? '▼' : '='} ${Math.abs(v).toLocaleString('es-AR')} % vs. período anterior`;
  return h('span', { class: 'small', style: { color: v > 0 ? 'var(--ok)' : v < 0 ? 'var(--bad)' : 'var(--ink-3)' } }, t);
};

export default async function (root) {
  let pestana = 'productos'; let d = null;
  const cuerpo = h('div', { class: 'stack' }); const detalle = h('div');
  const sel = selectorPeriodo({ inicial: 'mes', alCambiar: () => cargar() });
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Ganancias'), h('p', null, 'Se calculan solas con cada venta: lo que cobrás por la mercadería menos lo que te costó.'))),
    h('div', { class: 'card', style: { padding: '12px' } }, sel.el), cuerpo);

  async function cargar() {
    vaciar(cuerpo).append(cargando());
    try { d = await get('/api/ganancias' + qs(sel.rango())); } catch (e) { vaciar(cuerpo).append(h('div', { class: 'alert bad' }, icon('alerta'), errorMsg(e))); return; }
    pintar();
  }

  function pintar() {
    const a = d.actual; const v = d.variacion;
    vaciar(cuerpo);
    if (!a.ventas_cantidad) cuerpo.append(h('div', { class: 'alert info' }, icon('info'), 'No hay ventas en este período. Los números en cero son reales, no un error.'));
    if (a.lineas_sin_costo > 0) cuerpo.append(h('div', { class: 'alert warn' }, icon('alerta'), `${a.lineas_sin_costo} renglón(es) de venta se registraron sin costo (producto sin compras ni stock inicial valorizado). La ganancia de este período está incompleta: cargá el costo del stock para que sea exacta.`));
    cuerpo.append(
      h('div', { class: 'grid c4' },
        h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Vendido'), h('div', { class: 'v' }, money(a.ventas_total)), h('div', { class: 's' }, variacionTxt(v.ventas))),
        h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Ganancia bruta'), h('div', { class: 'v' }, money(a.ganancia_bruta)), h('div', { class: 's' }, variacionTxt(v.ganancia_bruta))),
        h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Gastos'), h('div', { class: 'v' }, money(a.gastos)), h('div', { class: 's' }, variacionTxt(v.gastos))),
        h('div', { class: `kpi ${a.resultado_neto < 0 ? 'bad' : ''}` }, h('div', { class: 't' }, 'Resultado neto'), h('div', { class: 'v' }, money(a.resultado_neto)), h('div', { class: 's' }, variacionTxt(v.resultado_neto)))),
      h('section', { class: 'card' }, h('h2', null, 'Cómo se llega al resultado'),
        h('div', { class: 'lista-simple' },
          h('div', null, h('span', null, 'Ingreso neto de ventas (después de descuentos)'), h('b', { class: 'num' }, money(a.ingreso_neto))),
          h('div', null, h('span', null, 'Costo de lo vendido'), h('b', { class: 'num' }, `− ${money(a.costo_vendido)}`)),
          h('div', null, h('b', null, 'Ganancia bruta'), h('b', { class: 'num' }, money(a.ganancia_bruta))),
          h('div', null, h('span', null, 'Gastos del período'), h('b', { class: 'num' }, `− ${money(a.gastos)}`)),
          h('div', null, h('span', null, 'Mermas y ajustes de stock (pérdidas)'), h('b', { class: 'num' }, `− ${money(a.mermas_ajustes)}`)),
          h('div', null, h('b', null, 'Resultado neto'), h('b', { class: 'num', style: { fontSize: '1.15rem' } }, money(a.resultado_neto)))),
        h('div', { class: 'small muted', style: { marginTop: '10px' } },
          `Margen sobre venta: ${pct(a.margen_pct)} (ganancia ÷ lo vendido). Recargo sobre costo: ${pct(a.recargo_pct)} (ganancia ÷ lo que te costó). Son dos números distintos, no confundir. `,
          `Los retiros personales (${money(a.retiros)}) no se descuentan: es plata tuya, no un gasto. Lo cobrado en el período fue ${money(a.cobros)}; puede diferir de lo vendido porque hay ventas fiadas.`)),
      h('section', { class: 'card' }, h('h2', null, 'Evolución'),
        d.serie.puntos.some((p) => p.ventas || p.gastos) ? lineChart({ etiquetas: d.serie.puntos.map((p) => etiquetaPeriodo(p.periodo, d.serie.agrupar)), series: [{ nombre: 'Vendido', valores: d.serie.puntos.map((p) => p.ventas), color: 'var(--c2)' }, { nombre: 'Ganancia bruta', valores: d.serie.puntos.map((p) => p.ganancia), color: 'var(--ok)' }, { nombre: 'Gastos', valores: d.serie.puntos.map((p) => p.gastos), color: 'var(--warn)' }] })
          : h('p', { class: 'muted' }, 'Sin movimientos en el período.')),
      tabs([{ value: 'productos', label: 'Por producto' }, { value: 'clientes', label: 'Por cliente' }, { value: 'ventas', label: 'Por venta' }], pestana, (x) => { pestana = x; detalleP(); }), detalle);
    detalleP();
  }

  function detalleP() {
    vaciar(detalle);
    let t;
    if (pestana === 'productos') t = dataTable({
      columnas: [
        { key: 'nombre', label: 'Producto', sort: true, render: (r) => nombreProducto(r) },
        { key: 'unidades', label: 'Vendido', num: true, sort: true, render: (r) => h('div', null, `${num(r.unidades)} u.`, h('div', { class: 'small muted' }, `${num(r.cajas_equivalentes)} cajas`)) },
        { key: 'ingreso', label: 'Ingreso', num: true, sort: true, render: (r) => money(r.ingreso) }, { key: 'costo', label: 'Costo', num: true, sort: true, render: (r) => money(r.costo) },
        { key: 'ganancia', label: 'Ganancia', num: true, sort: true, render: (r) => h('b', null, money(r.ganancia)) },
        { key: 'margen_pct', label: 'Margen s/venta', num: true, sort: true, render: (r) => pct(r.margen_pct) }, { key: 'recargo_pct', label: 'Recargo s/costo', num: true, sort: true, render: (r) => pct(r.recargo_pct) },
        { key: 'gc', label: 'Ganancia por caja', num: true, render: (r) => money(r.ganancia_caja) },
      ], filas: d.por_producto, ordenInicial: { key: 'ganancia', dir: 'desc' }, vacio: estadoVacio('Sin ventas en el período', 'Cuando vendas, acá ves qué producto te deja más.'),
    });
    else if (pestana === 'clientes') t = dataTable({
      columnas: [
        { key: 'nombre', label: 'Cliente', sort: true, render: (r) => h('a', { href: `#/clientes/${r.cliente_id}` }, r.nombre) }, { key: 'ventas', label: 'Ventas', num: true, sort: true, render: (r) => num(r.ventas) },
        { key: 'ingreso', label: 'Ingreso', num: true, sort: true, render: (r) => money(r.ingreso) }, { key: 'ganancia', label: 'Ganancia', num: true, sort: true, render: (r) => h('b', null, money(r.ganancia)) },
        { key: 'margen_pct', label: 'Margen s/venta', num: true, sort: true, render: (r) => pct(r.margen_pct) }, { key: 'recargo_pct', label: 'Recargo s/costo', num: true, sort: true, render: (r) => pct(r.recargo_pct) },
      ], filas: d.por_cliente, ordenInicial: { key: 'ganancia', dir: 'desc' }, vacio: estadoVacio('Sin ventas en el período', 'Acá ves qué clientes te dejan más ganancia.'),
    });
    else t = dataTable({
      columnas: [
        { key: 'numero', label: 'N°', sort: true, render: (r) => h('b', null, r.numero) }, { key: 'fecha', label: 'Fecha', sort: true, render: (r) => fdt(r.fecha) }, { key: 'cliente', label: 'Cliente', sort: true, render: (r) => r.cliente },
        { key: 'total', label: 'Total', num: true, sort: true, render: (r) => money(r.total) }, { key: 'ganancia', label: 'Ganancia', num: true, sort: true, render: (r) => h('b', null, money(r.ganancia)) },
      ], filas: d.por_venta, ordenInicial: { key: 'fecha', dir: 'desc' }, onClick: (r) => verVenta(r.id, cargar), vacio: estadoVacio('Sin ventas en el período', ''),
    });
    detalle.append(h('div', { class: 'card flush' }, t.el, pestana === 'ventas' && d.por_venta.length >= 200 ? h('div', { class: 'pie-tabla' }, 'Se muestran las primeras 200 ventas del período.') : null));
  }

  await cargar();
}
