// Deudas de clientes (cuentas corrientes): saldos, vencimientos, cobros parciales e historial de pagos.
import { get, post, qs } from '../api.js';
import { h, icon, vaciar, money, fdt, fdate, badge, estadoBadge, dataTable, tabs, toast, errorMsg, estadoVacio, formModal, etiquetaMedio, norm, importe, nroCorto,
  campoBuscar, selectFiltro, botonLimpiar, contadorResultados, coincide, enRango, descargar, aCSV, centavosATexto } from '../ui.js';
import { abrirCobro } from './_pago.js';
import { verVenta } from './_venta.js';
import { selectorPeriodo } from './_periodo.js';
import { app } from '../app.js';

export default async function (root) {
  let pestana = 'pendientes'; let estadoF = ''; let clienteF = '';
  // Filtros del historial de cobros (se crean una vez para que no se pierdan al cambiar de pestaña).
  const fh = {
    buscar: campoBuscar('Buscar por cliente o N° de venta…', () => fh.aplicar?.()),
    medio: selectFiltro('Medio de pago', [['', 'Todos los medios'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['otro', 'Otro']]),
    estado: selectFiltro('Estado', [['vigente', 'Solo vigentes'], ['', 'Vigentes y anulados'], ['anulado', 'Solo anulados']]),
    periodo: selectorPeriodo({ inicial: 'todo', alCambiar: () => fh.aplicar?.(),
      opciones: [{ value: 'todo', label: 'Todo' }, { value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }, { value: 'custom', label: 'Fechas…' }] }),
    contador: contadorResultados(),
  };
  fh.medio.addEventListener('change', () => fh.aplicar?.());
  fh.estado.addEventListener('change', () => fh.aplicar?.());
  const resumen = h('div', { class: 'grid c3' });
  const cuerpo = h('div');
  const clientes = await get('/api/clientes');

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Deudas de clientes'), h('p', null, 'Lo que te deben por ventas fiadas. Cada cobro baja el saldo y entra a la caja.')),
      h('button', { class: 'btn primary', type: 'button', onclick: () => abrirCobro({ alHacer: refrescar }) }, icon('plus'), 'Registrar cobro')),
    resumen,
    tabs([{ value: 'pendientes', label: 'Deudas pendientes' }, { value: 'clientes', label: 'Por cliente' }, { value: 'pagos', label: 'Historial de cobros' }], pestana, (v) => { pestana = v; mostrar(); }),
    cuerpo);

  async function refrescar() {
    const cl = await get('/api/clientes'); clientes.splice(0, clientes.length, ...cl);
    const conDeuda = clientes.filter((c) => c.deuda > 0);
    const total = conDeuda.reduce((s, c) => s + c.deuda, 0); const venc = conDeuda.reduce((s, c) => s + c.vencida, 0);
    const favor = clientes.reduce((s, c) => s + c.saldo_favor, 0);
    vaciar(resumen).append(
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Deuda total'), h('div', { class: 'v' }, money(total)), h('div', { class: 's' }, `${conDeuda.length} ${conDeuda.length === 1 ? 'cliente' : 'clientes'}`)),
      h('div', { class: `kpi ${venc > 0 ? 'bad' : ''}` }, h('div', { class: 't' }, 'Vencida'), h('div', { class: 'v' }, money(venc)), h('div', { class: 's' }, venc > 0 ? 'Pasó la fecha de vencimiento' : 'Nada vencido')),
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Saldo a favor de clientes'), h('div', { class: 'v' }, money(favor)), h('div', { class: 's' }, 'Pagaron de más y queda como crédito')));
    mostrar();
  }

  async function mostrar() {
    vaciar(cuerpo).append(h('div', { class: 'cargando' }, h('span', { class: 'spinner' })));
    try {
      vaciar(cuerpo);
      if (pestana === 'pendientes') await pendientes();
      else if (pestana === 'clientes') porCliente();
      else await historial();
    } catch (e) { vaciar(cuerpo).append(h('div', { class: 'alert bad' }, icon('alerta'), errorMsg(e))); }
  }

  async function pendientes() {
    const selCli = h('select', { class: 'input', 'aria-label': 'Cliente' }, h('option', { value: '' }, 'Todos los clientes'), clientes.filter((c) => c.deuda > 0).map((c) => h('option', { value: c.id, selected: String(c.id) === clienteF }, c.nombre)));
    const selEst = h('select', { class: 'input', 'aria-label': 'Estado' }, [['', 'Todos los estados'], ['vencida', 'Vencidas'], ['parcial', 'Parcialmente pagadas'], ['pendiente', 'Sin pagos']].map(([v, t]) => h('option', { value: v, selected: v === estadoF }, t)));
    const t = dataTable({
      columnas: [
        { key: 'cliente', label: 'Cliente', sort: true, render: (r) => h('b', null, r.cliente) },
        { key: 'numero', label: 'Venta', sort: true, render: (r) => nroCorto(r.numero) },
        { key: 'fecha', label: 'Fecha', sort: true, render: (r) => fdate(r.fecha) },
        { key: 'total', label: 'Importe original', num: true, sort: true, render: (r) => money(r.total) },
        { key: 'pagado', label: 'Abonado', num: true, sort: true, render: (r) => money(r.pagado) },
        { key: 'saldo', label: 'Saldo pendiente', num: true, sort: true, render: (r) => h('b', null, money(r.saldo)) },
        { key: 'vencimiento', label: 'Vence', sort: (r) => r.vencimiento || '9999', render: (r) => (r.vencimiento ? fdate(r.vencimiento) : '—') },
        { key: 'estado_deuda', label: 'Estado', render: (r) => estadoBadge[r.estado_deuda]() },
        { key: 'a', label: '', class: 'acciones', render: (r) => h('button', { class: 'btn sm primary', type: 'button', onclick: () => abrirCobro({ clienteId: r.cliente_id, ventaId: r.venta_id, alHacer: refrescar }) }, 'Cobrar') },
      ],
      onClick: (r) => verVenta(r.venta_id, refrescar),
      claseFila: (r) => (r.estado_deuda === 'vencida' ? '' : ''),
      ordenInicial: { key: 'vencimiento', dir: 'asc' },
      vacio: estadoVacio('No hay deudas pendientes', 'Cuando vendas "fiado" o "paga una parte", la deuda aparece acá sola, sin cargarla dos veces.', h('a', { class: 'btn primary', href: '#/venta' }, 'Nueva venta')),
    });
    const cont = contadorResultados();
    let vista = [];
    const exportar = () => descargar('deudas.csv', aCSV([['Cliente', 'Venta', 'Fecha', 'Importe original', 'Abonado', 'Saldo pendiente', 'Vence', 'Estado'],
      ...vista.map((r) => [r.cliente, r.numero, r.fecha, centavosATexto(r.total), centavosATexto(r.pagado), centavosATexto(r.saldo), r.vencimiento || '', r.estado_deuda])]));
    const cargarLista = async () => {
      clienteF = selCli.value; estadoF = selEst.value;
      const filas = await get('/api/deudas' + qs({ cliente_id: clienteF, estado: estadoF }));
      t.setFilas(filas); vista = filas;
      cont.textContent = `${filas.length} ${filas.length === 1 ? 'deuda' : 'deudas'} · ${money(filas.reduce((s, r) => s + r.saldo, 0))} pendiente`;
    };
    selCli.addEventListener('change', cargarLista); selEst.addEventListener('change', cargarLista);
    const limpiar = () => { selCli.value = ''; selEst.value = ''; cargarLista(); };
    cuerpo.append(h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, selCli, selEst, botonLimpiar(limpiar), cont,
      h('button', { class: 'btn sm', type: 'button', style: { marginLeft: 'auto' }, title: 'Descarga las deudas que se ven, con los filtros aplicados', onclick: exportar }, icon('descargar'), 'Exportar')), t.el));
    await cargarLista();
  }

  function porCliente() {
    const todos = clientes.filter((c) => c.deuda > 0 || c.saldo_favor > 0);
    const cont = contadorResultados();
    const selTipo = selectFiltro('Situación', [['', 'Deben o tienen a favor'], ['debe', 'Solo los que deben'], ['vencida', 'Solo con deuda vencida'], ['favor', 'Solo con saldo a favor']]);
    const filtrar = () => {
      const tipo = selTipo.value;
      const lista = todos.filter((c) => coincide(buscar.value, c.nombre, c.telefono, c.documento)
        && (!tipo || (tipo === 'debe' ? c.deuda > 0 : tipo === 'vencida' ? c.vencida > 0 : c.saldo_favor > 0)));
      t.setFilas(lista); cont.poner(lista.length, todos.length);
    };
    const buscar = campoBuscar('Buscar cliente por nombre, teléfono o documento…', filtrar);
    selTipo.addEventListener('change', filtrar);
    const lista = todos;
    const t = dataTable({
      columnas: [
        { key: 'nombre', label: 'Cliente', sort: true, render: (c) => h('div', null, h('b', null, c.nombre), h('div', { class: 'small muted' }, c.telefono || '')) },
        { key: 'deuda', label: 'Debe', num: true, sort: true, render: (c) => importe(c.deuda) },
        { key: 'vencida', label: 'Vencido', num: true, sort: true, render: (c) => (c.vencida > 0 ? badge(money(c.vencida), 'bad') : '—') },
        { key: 'saldo_favor', label: 'A favor', num: true, sort: true, render: (c) => (c.saldo_favor > 0 ? badge(money(c.saldo_favor), 'ok') : '—') },
        { key: 'limite_credito', label: 'Límite', num: true, render: (c) => (c.limite_credito > 0 ? money(c.limite_credito) : 'Sin límite') },
        { key: 'a', label: '', class: 'acciones', render: (c) => h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
          h('a', { class: 'btn sm', href: `#/clientes/${c.id}` }, 'Ficha'), h('button', { class: 'btn sm primary', type: 'button', onclick: () => abrirCobro({ clienteId: c.id, alHacer: refrescar }) }, 'Cobrar')) },
      ], filas: lista, ordenInicial: { key: 'deuda', dir: 'desc' },
      vacio: todos.length ? estadoVacio('Ningún cliente coincide', 'Probá con otro nombre o cambiá la situación elegida.') : estadoVacio('Nadie debe plata', 'Todos tus clientes están al día.'),
    });
    cuerpo.append(h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, buscar, selTipo, cont), t.el));
    filtrar();
  }

  async function historial() {
    const lista = await get('/api/pagos');
    const todos = lista.filter((p) => p.origen === 'cobro');
    const cobros = [];
    const t = dataTable({
      columnas: [
        { key: 'fecha', label: 'Fecha', sort: true, render: (p) => fdt(p.fecha) },
        { key: 'cliente', label: 'Cliente', sort: true, render: (p) => p.cliente },
        { key: 'monto', label: 'Importe', num: true, sort: true, render: (p) => h('b', null, money(p.monto)) },
        { key: 'medio', label: 'Medio', render: (p) => etiquetaMedio[p.medio] },
        { key: 'ventas', label: 'Aplicado a ventas', render: (p) => (p.ventas ? p.ventas.split(',').map((n) => nroCorto(Number(n))).join(', ') : h('span', { class: 'muted' }, 'Saldo a favor')) },
        { key: 'estado', label: 'Estado', render: (p) => (p.anulado ? h('span', { title: p.anulado_motivo }, estadoBadge.anulada()) : badge('Vigente', 'ok')) },
        { key: 'a', label: '', class: 'acciones', render: (p) => (!p.anulado && app.usuario.rol === 'admin' ? h('button', { class: 'btn sm danger', type: 'button', onclick: () => anularPago(p) }, 'Anular') : null) },
      ], filas: cobros, claseFila: (p) => (p.anulado ? 'anulada' : ''), ordenInicial: { key: 'fecha', dir: 'desc' },
      vacio: todos.length
        ? estadoVacio('No hay cobros con estos filtros', 'Probá con otro período o tocá "Limpiar filtros".')
        : estadoVacio('Todavía no hay cobros', 'Cuando registres un cobro de deuda aparece acá con su fecha, medio y a qué venta se aplicó.'),
      pie: (l) => {
        const vig = l.filter((p) => !p.anulado);
        return h('tr', null, h('td', { colSpan: 2 }, `${vig.length} ${vig.length === 1 ? 'cobro vigente' : 'cobros vigentes'}`), h('td', { class: 'num' }, h('b', null, money(vig.reduce((s, p) => s + p.monto, 0)))), h('td', { colSpan: 4 }));
      },
    });
    fh.aplicar = () => {
      const rango = fh.periodo.rango(); const est = fh.estado.value;
      const l = todos.filter((p) => coincide(fh.buscar.value, p.cliente, p.ventas) && (!fh.medio.value || p.medio === fh.medio.value)
        && (!est || (est === 'vigente' ? !p.anulado : p.anulado)) && enRango(p.fecha, rango));
      t.setFilas(l); fh.contador.poner(l.length, todos.length);
    };
    const limpiar = () => { fh.buscar.value = ''; fh.medio.value = ''; fh.estado.value = 'vigente'; fh.periodo.poner('todo'); fh.aplicar(); };
    cuerpo.append(h('div', { class: 'card flush' },
      h('div', { class: 'toolbar' }, fh.buscar, fh.medio, fh.estado, fh.periodo.el, botonLimpiar(limpiar), fh.contador),
      t.el, h('div', { class: 'pie-tabla' }, 'Un cobro mal cargado no se borra: se anula, la deuda vuelve a su saldo anterior y la caja se corrige con un movimiento contrario.')));
    fh.aplicar();
  }

  async function anularPago(p) {
    const r = await formModal({
      titulo: `Anular cobro de ${money(p.monto)}`, textoOk: 'Anular cobro',
      intro: `La deuda de ${p.cliente} vuelve a subir ${money(p.monto)} y la caja resta ese importe. El cobro queda en el historial como anulado.`,
      campos: [{ name: 'motivo', label: 'Motivo', required: true, full: true, autofocus: true, placeholder: 'Ej.: Se cargó dos veces' }],
      onSubmit: (v) => post(`/api/pagos/${p.id}/anular`, v),
    });
    if (r) { toast('Cobro anulado.'); refrescar(); }
  }

  await refrescar();
}
