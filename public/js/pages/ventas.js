// Historial de ventas con filtros por fecha, cliente, producto, modalidad y estado.
import { get, qs } from '../api.js';
import { h, icon, vaciar, money, pct, fdt, fdate, badge, estadoBadge, modalidadBadge, dataTable, toast, errorMsg, estadoVacio, nombreProducto, hoyISO, sumaDias, descargar, aCSV, centavosATexto, importe,
  botonLimpiar } from '../ui.js';
import { verVenta } from './_venta.js';
import { selectorPeriodo } from './_periodo.js';
import { app, esAdmin } from '../app.js';

export default async function (root) {
  const [clientes, productos] = await Promise.all([get('/api/clientes'), get('/api/productos')]);
  // Período con botones rápidos (por defecto el mes actual, como antes).
  const periodo = selectorPeriodo({ inicial: 'mes', alCambiar: () => cargar(),
    opciones: [{ value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }, { value: 'mes_pasado', label: 'Mes pasado' }, { value: 'todo', label: 'Todo' }, { value: 'custom', label: 'Fechas…' }] });
  const contador = h('span', { class: 'muted small', role: 'status' });
  const cli = h('select', { class: 'input', 'aria-label': 'Cliente' }, h('option', { value: '' }, 'Todos los clientes'), clientes.map((c) => h('option', { value: c.id }, c.nombre)));
  const prod = h('select', { class: 'input', 'aria-label': 'Producto' }, h('option', { value: '' }, 'Todos los productos'), productos.map((p) => h('option', { value: p.id }, nombreProducto(p))));
  const mod = h('select', { class: 'input', 'aria-label': 'Modalidad' }, h('option', { value: '' }, 'Toda modalidad'), h('option', { value: 'contado' }, 'Contado'), h('option', { value: 'fiado' }, 'Fiado'), h('option', { value: 'mixto' }, 'Mixto'));
  const est = h('select', { class: 'input', 'aria-label': 'Estado' }, h('option', { value: '' }, 'Todas'), h('option', { value: 'confirmada' }, 'Confirmadas'), h('option', { value: 'anulada' }, 'Anuladas'));
  const num = h('input', { class: 'input', type: 'number', min: 1, placeholder: 'N° venta', style: { width: '110px', minWidth: '0' }, 'aria-label': 'Número de venta' });
  let filas = [];

  const tabla = dataTable({
    columnas: [
      { key: 'numero', label: 'N°', sort: true, render: (r) => h('b', null, r.numero) },
      { key: 'fecha', label: 'Fecha', sort: true, render: (r) => fdt(r.fecha) },
      { key: 'cliente', label: 'Cliente', sort: true, render: (r) => r.cliente },
      { key: 'deposito', label: 'Sale de', render: (r) => r.deposito },
      { key: 'modalidad_pago', label: 'Pago', render: (r) => modalidadBadge(r.modalidad_pago) },
      { key: 'total', label: 'Total', num: true, sort: true, render: (r) => money(r.total) },
      { key: 'pagado', label: 'Cobrado', num: true, sort: true, render: (r) => (r.estado === 'anulada' ? '—' : money(r.pagado)) },
      { key: 'saldo', label: 'Saldo', num: true, sort: true, render: (r) => (r.estado === 'anulada' ? '—' : r.saldo > 0 ? importe(r.saldo) : '—') },
      // La ganancia solo la ve el administrador (al empleado el servidor ni se la manda).
      ...(esAdmin() ? [{ key: 'ganancia', label: 'Ganancia', num: true, sort: true, render: (r) => (r.estado === 'anulada' ? '—' : money(r.ganancia)) }] : []),
      { key: 'estado', label: 'Estado', render: (r) => (r.estado === 'anulada' ? estadoBadge.anulada() : estadoBadge[r.estado_deuda]()) },
    ],
    ordenInicial: { key: 'fecha', dir: 'desc' },
    onClick: (r) => verVenta(r.id, cargar),
    claseFila: (r) => (r.estado === 'anulada' ? 'anulada' : ''),
    vacio: estadoVacio('No hay ventas con estos filtros', 'Probá ampliar las fechas o limpiar los filtros.', h('a', { class: 'btn primary', href: '#/venta' }, icon('plus'), 'Nueva venta')),
    pie: (lista) => {
      const ok = lista.filter((r) => r.estado !== 'anulada');
      const t = (k) => ok.reduce((s, r) => s + r[k], 0);
      return h('tr', null, h('td', { colSpan: 5 }, `${ok.length} ventas confirmadas`), h('td', { class: 'num' }, money(t('total'))), h('td', { class: 'num' }, money(t('pagado'))), h('td', { class: 'num' }, money(t('saldo'))), esAdmin() ? h('td', { class: 'num' }, money(t('ganancia'))) : null, h('td'));
    },
  });
  const zona = h('div', null, tabla.el);

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Ventas'), h('p', null, 'Todas las operaciones registradas. Tocá una para ver el detalle, cobrar o anular.')),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: exportar }, icon('descargar'), 'Exportar'), h('a', { class: 'btn primary', href: '#/venta' }, icon('plus'), 'Nueva venta'))),
    h('div', { class: 'card flush' },
      h('div', { class: 'toolbar' }, periodo.el),
      h('div', { class: 'toolbar' }, cli, prod, mod, est, num, botonLimpiar(limpiar), contador), zona));
  for (const el of [cli, prod, mod, est]) el.addEventListener('change', cargar);
  num.addEventListener('change', cargar);

  function limpiar() {
    for (const el of [cli, prod, mod, est, num]) el.value = '';
    periodo.poner('mes');
    cargar();
  }
  async function cargar() {
    try {
      const { desde, hasta } = periodo.rango();
      filas = await get('/api/ventas' + qs({ desde, hasta, cliente_id: cli.value, producto_id: prod.value, modalidad: mod.value, estado: est.value, numero: num.value }));
      tabla.setFilas(filas);
      contador.textContent = `${filas.length} ${filas.length === 1 ? 'venta' : 'ventas'}`;
    } catch (e) { toast(errorMsg(e), 'error'); }
  }
  function exportar() {
    const g = esAdmin();
    descargar('ventas.csv', aCSV([['N°', 'Fecha', 'Cliente', 'Depósito', 'Pago', 'Total', 'Cobrado', 'Saldo', ...(g ? ['Ganancia'] : []), 'Estado'],
      ...filas.map((r) => [r.numero, r.fecha, r.cliente, r.deposito, r.modalidad_pago, centavosATexto(r.total), centavosATexto(r.pagado), centavosATexto(r.saldo), ...(g ? [centavosATexto(r.ganancia)] : []), r.estado])]));
  }
  await cargar();
}
