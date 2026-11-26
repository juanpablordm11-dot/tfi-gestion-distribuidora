// Caja (ingresos y egresos) y gastos operativos.
import { get, post, put, qs } from '../api.js';
import { h, icon, vaciar, money, fdt, fdate, badge, dataTable, tabs, toast, errorMsg, estadoVacio, formModal, etiquetaMedio, segmentado, hoyISO, importe } from '../ui.js';
import { barrasH, SERIE } from '../charts.js';
import { app } from '../app.js';

const CATEGORIAS = {
  venta: ['Venta (cobrado)', 'ok'], cobro_deuda: ['Cobro de deuda', 'ok'], pago_proveedor: ['Pago a proveedor', 'warn'], gasto: ['Gasto', 'warn'],
  retiro: ['Retiro personal', 'info'], otro_ingreso: ['Otro ingreso', 'ok'], otro_egreso: ['Otro egreso', 'warn'],
};
const GASTOS = [['transporte', 'Transporte'], ['alquiler', 'Alquiler'], ['servicios', 'Servicios'], ['sueldos', 'Sueldos'], ['mantenimiento', 'Mantenimiento'], ['otros', 'Otros gastos']];
const medios = Object.entries(etiquetaMedio).map(([value, label]) => ({ value, label }));

export default async function (root) {
  let pestana = 'caja';
  const hoy = app.hoy || hoyISO();
  const f = { desde: hoy.slice(0, 8) + '01', hasta: hoy };
  const cuerpo = h('div');
  const saldos = h('div', { class: 'grid c4' });

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Caja y gastos'), h('p', null, 'Todo lo que entró y salió, y cuánto dinero debería haber según lo registrado.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => mov('retiro') }, 'Retiro personal'), h('button', { class: 'btn', type: 'button', onclick: () => mov('otro_ingreso') }, 'Otro ingreso'),
        h('button', { class: 'btn primary', type: 'button', onclick: nuevoGasto }, icon('plus'), 'Nuevo gasto'))),
    saldos, h('div', { style: { height: '16px' } }),
    tabs([{ value: 'caja', label: 'Movimientos de caja' }, { value: 'gastos', label: 'Gastos' }], pestana, (v) => { pestana = v; mostrar(); }), cuerpo);

  const filtros = (alCambiar) => {
    const d = h('input', { class: 'input', type: 'date', value: f.desde, 'aria-label': 'Desde' }); const hh = h('input', { class: 'input', type: 'date', value: f.hasta, 'aria-label': 'Hasta' });
    d.addEventListener('change', () => { f.desde = d.value; alCambiar(); }); hh.addEventListener('change', () => { f.hasta = hh.value; alCambiar(); });
    return [d, h('span', { class: 'muted' }, 'a'), hh];
  };

  async function mostrar() {
    vaciar(cuerpo);
    try { if (pestana === 'caja') await vistaCaja(); else await vistaGastos(); } catch (e) { cuerpo.append(h('div', { class: 'alert bad' }, icon('alerta'), errorMsg(e))); }
  }

  async function pintarSaldos() {
    const d = await get('/api/caja?desde=' + hoy + '&hasta=' + hoy);
    const s = d.saldo;
    vaciar(saldos).append(
      h('div', { class: `kpi ${s.total < 0 ? 'bad' : ''}`, title: 'Saldo inicial + todos los ingresos − todos los egresos registrados.' }, h('div', { class: 't' }, 'Debería haber en total'), h('div', { class: 'v' }, money(s.total)), h('div', { class: 's' }, 'Según los movimientos registrados')),
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Efectivo'), h('div', { class: 'v' }, money(s.porMedio.efectivo)), h('div', { class: 's' }, `Incluye el saldo inicial (${money(s.inicial)})`)),
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Transferencias'), h('div', { class: 'v' }, money(s.porMedio.transferencia)), h('div', { class: 's' }, 'Banco / billeteras')),
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Otros medios'), h('div', { class: 'v' }, money(s.porMedio.otro)), h('div', { class: 's' }, 'Cheques u otros')));
    if (app.usuario.rol === 'admin') saldos.append(h('div', { class: 'small muted', style: { gridColumn: '1 / -1' } }, 'Este saldo se calcula con lo que cargaste en el sistema; no es una conciliación bancaria. ',
      h('button', { class: 'btn ghost sm', type: 'button', onclick: editarSaldoInicial }, 'Cambiar saldo inicial')));
  }

  async function vistaCaja() {
    const cat = h('select', { class: 'input', 'aria-label': 'Categoría' }, h('option', { value: '' }, 'Todas las categorías'), Object.entries(CATEGORIAS).map(([k, v]) => h('option', { value: k }, v[0])));
    const med = h('select', { class: 'input', 'aria-label': 'Medio' }, h('option', { value: '' }, 'Todos los medios'), medios.map((m) => h('option', { value: m.value }, m.label)));
    const pie = h('div', { class: 'pie-tabla' });
    const t = dataTable({
      columnas: [
        { key: 'fecha', label: 'Fecha', sort: true, render: (m) => fdt(m.fecha) },
        { key: 'concepto', label: 'Concepto', render: (m) => h('div', null, m.concepto, m.reversa_de ? h('div', { class: 'small', style: { color: 'var(--warn)' } }, 'Corrección de un movimiento anterior') : null) },
        { key: 'categoria', label: 'Categoría', render: (m) => badge(CATEGORIAS[m.categoria]?.[0] || m.categoria, CATEGORIAS[m.categoria]?.[1]) },
        { key: 'medio', label: 'Medio', render: (m) => etiquetaMedio[m.medio] },
        { key: 'in', label: 'Ingreso', num: true, sort: (m) => (m.tipo === 'ingreso' ? m.monto : 0), render: (m) => (m.tipo === 'ingreso' ? importe(m.monto) : '') },
        { key: 'out', label: 'Egreso', num: true, sort: (m) => (m.tipo === 'egreso' ? m.monto : 0), render: (m) => (m.tipo === 'egreso' ? importe(m.monto) : '') },
      ], ordenInicial: { key: 'fecha', dir: 'desc' }, vacio: estadoVacio('Sin movimientos en este período', 'Las ventas cobradas, los cobros de deudas, las compras pagadas y los gastos aparecen acá solos.'),
    });
    const cargar = async () => {
      const d = await get('/api/caja' + qs({ ...f, categoria: cat.value, medio: med.value }));
      t.setFilas(d.movimientos);
      pie.textContent = `En el período: ingresaron ${money(d.periodo.ingresos)} · salieron ${money(d.periodo.egresos)} · neto ${money(d.periodo.neto)}${d.movimientos.length >= 1000 ? ' · (primeros 1000 movimientos)' : ''}`;
    };
    cat.addEventListener('change', cargar); med.addEventListener('change', cargar);
    cuerpo.append(h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, ...filtros(cargar), cat, med), t.el, pie));
    await Promise.all([cargar(), pintarSaldos()]);
  }

  async function vistaGastos() {
    const cat = h('select', { class: 'input', 'aria-label': 'Categoría' }, h('option', { value: '' }, 'Todas las categorías'), GASTOS.map(([v, t]) => h('option', { value: v }, t)));
    const resumenG = h('div'); const pie = h('div', { class: 'pie-tabla' });
    const t = dataTable({
      columnas: [
        { key: 'fecha', label: 'Fecha', sort: true, render: (g) => fdate(g.fecha) }, { key: 'categoria', label: 'Categoría', render: (g) => badge(GASTOS.find((x) => x[0] === g.categoria)?.[1] || g.categoria) },
        { key: 'descripcion', label: 'Descripción', render: (g) => g.descripcion }, { key: 'medio', label: 'Medio', render: (g) => etiquetaMedio[g.medio] },
        { key: 'monto', label: 'Importe', num: true, sort: true, render: (g) => h('b', null, money(g.monto)) },
        { key: 'a', label: '', class: 'acciones', render: (g) => (g.anulado ? badge('Anulado') : h('button', { class: 'btn sm danger', type: 'button', onclick: () => anularGasto(g) }, 'Anular')) },
      ], claseFila: (g) => (g.anulado ? 'anulada' : ''), ordenInicial: { key: 'fecha', dir: 'desc' },
      vacio: estadoVacio('No hay gastos en este período', 'Cargá fletes, alquiler, servicios y otros gastos para que se descuenten de tu ganancia.', h('button', { class: 'btn primary', onclick: nuevoGasto }, 'Nuevo gasto')),
    });
    const cargar = async () => {
      const d = await get('/api/gastos' + qs({ ...f, categoria: cat.value }));
      t.setFilas(d.gastos);
      vaciar(resumenG).append(barrasH({ items: d.por_categoria.map((c) => ({ etiqueta: GASTOS.find((x) => x[0] === c.categoria)?.[1] || c.categoria, valor: c.total })), color: 'var(--warn)', vacio: 'Sin gastos en el período.' }));
      pie.textContent = `Total de gastos del período: ${money(d.total)}. Los retiros personales no cuentan como gasto.`;
    };
    cat.addEventListener('change', cargar);
    cuerpo.append(h('div', { class: 'grid side' }, h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, ...filtros(cargar), cat), t.el, pie), h('section', { class: 'card' }, h('h2', null, 'Por categoría'), resumenG)));
    await Promise.all([cargar(), pintarSaldos()]);
  }

  async function mov(categoria) {
    const t = { retiro: ['Retiro personal', 'Plata que sacás del negocio para vos. No es un gasto del negocio ni baja tu ganancia.'], otro_ingreso: ['Otro ingreso', 'Plata que entra y no es una venta ni el cobro de una deuda.'], otro_egreso: ['Otro egreso', 'Plata que sale y no es un gasto, una compra ni un retiro.'] }[categoria];
    const r = await formModal({
      titulo: t[0], intro: t[1], textoOk: 'Registrar', valores: { fecha: hoy },
      campos: [{ name: 'monto', label: 'Importe', type: 'money', prefix: '$', required: true, autofocus: true }, { name: 'medio', label: 'Medio', type: 'select', options: medios, value: 'efectivo' },
        { name: 'concepto', label: 'Concepto', required: true, full: true }, { name: 'fecha', label: 'Fecha', type: 'date', max: hoy }],
      onSubmit: (v) => post('/api/caja/movimientos', { ...v, categoria }),
    });
    if (r) { toast('Movimiento registrado.'); mostrar(); pintarSaldos(); }
  }

  async function nuevoGasto() {
    const r = await formModal({
      titulo: 'Nuevo gasto', textoOk: 'Registrar gasto', intro: 'Sale de la caja y se resta de tu ganancia del período.', valores: { fecha: hoy },
      campos: [{ name: 'categoria', label: 'Categoría', type: 'select', options: GASTOS.map(([value, label]) => ({ value, label })), required: true }, { name: 'monto', label: 'Importe', type: 'money', prefix: '$', required: true, autofocus: true },
        { name: 'descripcion', label: 'Descripción', required: true, full: true, placeholder: 'Ej.: Flete de la mercadería' }, { name: 'medio', label: 'Medio de pago', type: 'select', options: medios, value: 'efectivo' }, { name: 'fecha', label: 'Fecha', type: 'date', max: hoy }],
      onSubmit: (v) => post('/api/gastos', v),
    });
    if (r) { toast('Gasto registrado.'); pestana = 'gastos'; root.querySelector('.tabs button[data-v="gastos"]')?.click(); }
  }

  async function anularGasto(g) {
    const r = await formModal({
      titulo: 'Anular gasto', textoOk: 'Anular gasto', intro: `Se anula "${g.descripcion}" (${money(g.monto)}). La caja se corrige con un movimiento contrario y queda el registro.`,
      campos: [{ name: 'motivo', label: 'Motivo', required: true, full: true, autofocus: true, placeholder: 'Ej.: Lo cargué dos veces' }], onSubmit: (v) => post(`/api/gastos/${g.id}/anular`, v),
    });
    if (r) { toast('Gasto anulado.'); mostrar(); pintarSaldos(); }
  }

  async function editarSaldoInicial() {
    const r = await formModal({
      titulo: 'Saldo inicial de caja', textoOk: 'Guardar', intro: 'Es la plata en efectivo que había cuando empezaste a usar el sistema. Se suma a todos los movimientos.',
      campos: [{ name: 'saldo_inicial_caja', label: 'Saldo inicial', type: 'money', prefix: '$', required: true, autofocus: true }], valores: { saldo_inicial_caja: app.config.saldo_inicial_caja },
      onSubmit: (v) => put('/api/config', v),
    });
    if (r) { app.config.saldo_inicial_caja = r.saldo_inicial_caja ?? app.config.saldo_inicial_caja; toast('Saldo inicial actualizado.'); pintarSaldos(); }
  }

  await mostrar();
}
