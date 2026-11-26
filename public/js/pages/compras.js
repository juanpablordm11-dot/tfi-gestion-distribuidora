// Compras y proveedores: suman stock, actualizan el costo promedio y registran la deuda con el proveedor.
import { get, post, put, qs } from '../api.js';
import { h, icon, vaciar, money, moneyFull, num, fdt, fdate, badge, estadoBadge, dataTable, tabs, toast, errorMsg, estadoVacio, modal, formModal, confirmar, campo, campoDinero,
  segmentado, idemKey, nombreProducto, etiquetaMedio, hoyISO, sumaDias, cargando, norm, centavosATexto, importe,
  campoBuscar, selectFiltro, botonLimpiar, contadorResultados, coincide, enRango, descargar, aCSV } from '../ui.js';
import { selectorPeriodo } from './_periodo.js';
import { app } from '../app.js';

export default async function (root) {
  let pestana = 'compras';
  let productos = []; let proveedores = []; let datos = { compras: [], deuda_proveedores: [] };

  // Filtros de la pestaña Compras. Se crean una sola vez para que no se pierdan al cambiar de pestaña o recargar.
  const fc = {
    buscar: campoBuscar('Buscar por N° o proveedor…', () => filtrarCompras()),
    prov: selectFiltro('Proveedor', [['', 'Todos los proveedores']]),
    estado: selectFiltro('Estado', [['', 'Todos los estados'], ['saldo', 'Con saldo a pagar'], ['pagada', 'Pagadas'], ['anulada', 'Anuladas']]),
    periodo: selectorPeriodo({ inicial: 'todo', alCambiar: () => filtrarCompras(),
      opciones: [{ value: 'todo', label: 'Todo' }, { value: 'mes', label: 'Este mes' }, { value: 'mes_pasado', label: 'Mes pasado' }, { value: 'anio', label: 'Año' }, { value: 'custom', label: 'Fechas…' }] }),
    contador: contadorResultados(),
  };
  fc.prov.addEventListener('change', () => filtrarCompras());
  fc.estado.addEventListener('change', () => filtrarCompras());
  const limpiarCompras = () => { fc.buscar.value = ''; fc.prov.value = ''; fc.estado.value = ''; fc.periodo.poner('todo'); filtrarCompras(); };
  const cumpleEstado = (c, e) => !e || (e === 'anulada' ? c.estado === 'anulada' : c.estado !== 'anulada' && (e === 'saldo' ? c.saldo > 0 : !(c.saldo > 0)));
  let tablaCompras = null;
  function filtrarCompras() {
    if (!tablaCompras) return;
    const rango = fc.periodo.rango();
    const lista = datos.compras.filter((c) => coincide(fc.buscar.value, c.id, c.proveedor)
      && (!fc.prov.value || String(c.proveedor_id) === fc.prov.value) && cumpleEstado(c, fc.estado.value) && enRango(c.fecha, rango));
    tablaCompras.setFilas(lista);
    fc.contador.poner(lista.length, datos.compras.length);
    vistaCompras = lista;
  }
  // Exporta lo que se está viendo (con los filtros aplicados).
  let vistaCompras = [];
  const exportarCompras = () => descargar('compras.csv', aCSV([['N°', 'Fecha', 'Proveedor', 'Entra a', 'Total', 'Debo', 'Estado'],
    ...vistaCompras.map((c) => [c.tipo === 'saldo_inicial' ? 'Saldo inicial' : c.id, c.fecha, c.proveedor || '', c.deposito, centavosATexto(c.total),
      c.estado === 'anulada' ? '' : centavosATexto(c.saldo), c.estado === 'anulada' ? 'Anulada' : c.saldo > 0 ? 'Con saldo' : 'Pagada'])]));

  // Filtros de la pestaña Proveedores.
  const fp = {
    buscar: campoBuscar('Buscar proveedor por nombre o teléfono…', () => filtrarProveedores()),
    estado: selectFiltro('Estado', [['activos', 'Solo activos'], ['', 'Activos e inactivos'], ['inactivos', 'Solo inactivos']]),
    deuda: selectFiltro('Deuda', [['', 'Con y sin deuda'], ['si', 'Solo a los que les debo']]),
    contador: contadorResultados(),
  };
  fp.estado.addEventListener('change', () => filtrarProveedores());
  fp.deuda.addEventListener('change', () => filtrarProveedores());
  let tablaProv = null; let deudaProv = new Map();
  function filtrarProveedores() {
    if (!tablaProv) return;
    const lista = proveedores.filter((p) => coincide(fp.buscar.value, p.nombre, p.telefono)
      && (!fp.estado.value || (fp.estado.value === 'activos' ? p.activo : !p.activo)) && (!fp.deuda.value || deudaProv.get(p.id) > 0));
    tablaProv.setFilas(lista);
    fp.contador.poner(lista.length, proveedores.length);
  }
  const resumen = h('div', { class: 'grid c3' }); const cuerpo = h('div');
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Compras y proveedores'), h('p', null, 'Cuando cargás una compra, el stock sube, el costo promedio se actualiza y la plata sale de la caja (o queda como deuda).')),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => formProveedor() }, icon('plus'), 'Proveedor'), h('button', { class: 'btn primary', type: 'button', onclick: () => nuevaCompra() }, icon('compras'), 'Nueva compra'))),
    resumen, tabs([{ value: 'compras', label: 'Compras' }, { value: 'proveedores', label: 'Proveedores' }], pestana, (v) => { pestana = v; mostrar(); }), cuerpo);

  async function recargar() {
    [productos, proveedores, datos] = await Promise.all([get('/api/productos?activos=1'), get('/api/proveedores'), get('/api/compras')]);
    const deuda = datos.deuda_proveedores.reduce((s, d) => s + d.saldo, 0);
    const mes = datos.compras.filter((c) => c.estado === 'confirmada' && c.tipo !== 'saldo_inicial' && c.fecha.slice(0, 7) === app.hoy.slice(0, 7)).reduce((s, c) => s + c.total, 0);
    vaciar(resumen).append(
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Comprado este mes'), h('div', { class: 'v' }, money(mes)), h('div', { class: 's' }, 'Se refleja en el costo de lo vendido, no como gasto')),
      h('div', { class: `kpi ${deuda > 0 ? 'warn' : ''}` }, h('div', { class: 't' }, 'Le debés a proveedores'), h('div', { class: 'v' }, money(deuda)), h('div', { class: 's' }, `${datos.deuda_proveedores.length} ${datos.deuda_proveedores.length === 1 ? 'proveedor' : 'proveedores'}`)),
      h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Compras registradas'), h('div', { class: 'v' }, datos.compras.filter((c) => c.estado === 'confirmada' && c.tipo !== 'saldo_inicial').length), h('div', { class: 's' }, 'confirmadas')));
    mostrar();
  }

  function mostrar() {
    vaciar(cuerpo);
    if (pestana === 'proveedores') return listaProveedores();
    const t = dataTable({
      columnas: [
        { key: 'id', label: 'N°', sort: true, render: (c) => (c.tipo === 'saldo_inicial' ? badge('Saldo inicial', 'info') : h('b', null, c.id)) }, { key: 'fecha', label: 'Fecha', sort: true, render: (c) => fdt(c.fecha) },
        { key: 'proveedor', label: 'Proveedor', sort: true, render: (c) => c.proveedor || h('span', { class: 'muted' }, 'Sin especificar') },
        { key: 'deposito', label: 'Entra a', render: (c) => (c.tipo === 'saldo_inicial' ? h('span', { class: 'muted' }, 'Deuda anterior') : c.deposito) }, { key: 'total', label: 'Total', num: true, sort: true, render: (c) => money(c.total) },
        { key: 'saldo', label: 'Debo', num: true, sort: true, render: (c) => (c.estado === 'anulada' ? '—' : c.saldo > 0 ? importe(c.saldo) : '—') },
        { key: 'estado', label: 'Estado', render: (c) => (c.estado === 'anulada' ? estadoBadge.anulada() : c.saldo > 0 ? badge('Con saldo', 'warn') : badge('Pagada', 'ok')) },
      ], ordenInicial: { key: 'fecha', dir: 'desc' }, onClick: (c) => verCompra(c.id), claseFila: (c) => (c.estado === 'anulada' ? 'anulada' : ''),
      vacio: datos.compras.length
        ? estadoVacio('No hay compras con estos filtros', 'Probá con otro período o tocá "Limpiar filtros".', botonLimpiar(limpiarCompras))
        : estadoVacio('Todavía no cargaste compras', 'Registrá la mercadería que te llega: elegís el proveedor, el depósito y los productos.', h('button', { class: 'btn primary', onclick: () => nuevaCompra() }, 'Nueva compra')),
    });
    // Las opciones de proveedor se rearman en cada recarga (puede haber proveedores nuevos) sin perder lo elegido.
    const elegido = fc.prov.value;
    vaciar(fc.prov).append(h('option', { value: '' }, 'Todos los proveedores'), ...proveedores.map((p) => h('option', { value: p.id }, p.nombre)));
    fc.prov.value = elegido;
    tablaCompras = t; tablaProv = null;
    cuerpo.append(h('div', { class: 'card flush' },
      h('div', { class: 'toolbar' }, fc.buscar, fc.prov, fc.estado, fc.periodo.el, botonLimpiar(limpiarCompras), fc.contador,
        h('button', { class: 'btn sm', type: 'button', style: { marginLeft: 'auto' }, title: 'Descarga las compras que se ven, con los filtros aplicados', onclick: exportarCompras }, icon('descargar'), 'Exportar')),
      t.el, h('div', { class: 'pie-tabla' }, 'Se muestran las últimas 500 compras. Tocá una para ver el detalle, pagarla o anularla.')));
    filtrarCompras();
  }

  function listaProveedores() {
    const deudas = new Map(datos.deuda_proveedores.map((d) => [d.proveedor_id, d.saldo]));
    deudaProv = deudas;
    const t = dataTable({
      columnas: [
        { key: 'nombre', label: 'Proveedor', sort: true, render: (p) => h('div', null, h('b', null, p.nombre), p.activo ? null : badge('Inactivo')) }, { key: 'telefono', label: 'Teléfono', render: (p) => p.telefono || '—' },
        { key: 'saldo', label: 'Le debo', num: true, sort: (p) => deudas.get(p.id) || 0, render: (p) => (deudas.get(p.id) ? importe(deudas.get(p.id)) : '—') },
        { key: 'a', label: '', class: 'acciones', render: (p) => h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
          app.usuario.rol === 'admin' ? h('button', { class: 'btn sm', type: 'button', title: 'Cargar lo que ya le debías antes de empezar a usar el sistema', onclick: () => saldoInicialProveedor(p) }, 'Deuda anterior') : null,
          h('button', { class: 'btn sm', type: 'button', onclick: () => formProveedor(p) }, icon('editar'), 'Editar')) },
      ], claseFila: (p) => (p.activo ? '' : 'anulada'),
      vacio: proveedores.length
        ? estadoVacio('Ningún proveedor coincide', 'Probá con otro nombre o mostrá también los inactivos.')
        : estadoVacio('Todavía no cargaste proveedores', 'Cargá a quién le comprás para llevar su cuenta.', h('button', { class: 'btn primary', onclick: () => formProveedor() }, 'Nuevo proveedor')),
    });
    tablaProv = t; tablaCompras = null;
    cuerpo.append(h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, fp.buscar, fp.estado, fp.deuda, fp.contador), t.el));
    filtrarProveedores();
  }

  // Lo que el negocio ya le debía al proveedor antes del sistema: se paga como cualquier compra, sin tocar stock ni caja.
  async function saldoInicialProveedor(p) {
    const r = await formModal({
      titulo: `Deuda anterior con ${p.nombre}`, textoOk: 'Cargar deuda anterior',
      intro: 'Cargá lo que YA le debías a este proveedor antes de empezar a usar el sistema. Queda como deuda para pagarle, pero no es una compra: no suma stock, no cambia costos y no mueve la caja. Se carga una sola vez por proveedor.',
      campos: [
        { name: 'monto', label: 'Cuánto le debías', type: 'money', prefix: '$', required: true, autofocus: true },
        { name: 'fecha', label: 'A qué fecha', type: 'date', value: app.hoy, max: app.hoy, required: true },
        { name: 'observaciones', label: 'Observaciones (opcional)', full: true },
      ],
      onSubmit: (v) => post(`/api/proveedores/${p.id}/saldo-inicial`, { ...v, observaciones: v.observaciones || undefined }),
    });
    if (r) { toast(`Listo: quedó una deuda anterior de ${money(r.total)} con ${p.nombre}.`); await recargar(); }
  }

  async function formProveedor(p = null) {
    const r = await formModal({
      titulo: p ? `Editar: ${p.nombre}` : 'Nuevo proveedor', textoOk: p ? 'Guardar' : 'Crear proveedor', valores: p || {},
      campos: [{ name: 'nombre', label: 'Nombre', required: true, full: true, autofocus: true }, { name: 'telefono', label: 'Teléfono' }, { name: 'activo', label: 'Activo', type: 'check', value: p ? !!p.activo : true }, { name: 'observaciones', label: 'Observaciones', type: 'textarea' }],
      onSubmit: (v) => (p ? put(`/api/proveedores/${p.id}`, v) : post('/api/proveedores', v)),
    });
    if (r) { toast('Proveedor guardado.'); await recargar(); }
    return r;
  }

  // ---------------------------------------------------------- Nueva compra
  async function nuevaCompra() {
    if (!productos.length) { toast('Primero cargá productos.', 'warn'); location.hash = '#/productos'; return; }
    const st = { dep: 1, lineas: [{ producto_id: productos[0].id, pres: 'caja', cantidad: null, costo: null }], idem: idemKey() };
    const error = h('div', { class: 'alert bad', hidden: true, role: 'alert' });
    const selProv = h('select', { class: 'input' }, h('option', { value: '' }, 'Sin especificar'), proveedores.filter((p) => p.activo).map((p) => h('option', { value: p.id }, p.nombre)));
    const fecha = h('input', { class: 'input', type: 'date', value: app.hoy, max: app.hoy });
    const dep = segmentado([{ value: 1, label: 'Galpón' }, { value: 2, label: 'Casa' }], 1, (v) => { st.dep = v; }, { etiqueta: 'Depósito de destino' });
    const desc = campoDinero(null, { placeholder: '0' }); const pagado = campoDinero(null, { placeholder: '0' });
    const medio = h('select', { class: 'input' }, ['efectivo', 'transferencia', 'otro'].map((x) => h('option', { value: x }, etiquetaMedio[x])));
    const obs = h('input', { class: 'input', placeholder: 'Observaciones (opcional)', maxLength: 300 });
    const zonaLineas = h('div', { class: 'stack' }); const resumenC = h('div', { class: 'lista-simple' });
    let pagadoManual = false;

    const costoSugerido = (p, pres) => (pres === 'caja' ? p.costo_caja : Math.round(p.costo_caja / p.unidades_por_caja));
    const totales = () => {
      const sub = st.lineas.reduce((s, l) => s + (l.cantidad || 0) * (l.costo || 0), 0);
      const d = Math.min(Math.max(desc.cents() || 0, 0), sub);
      return { sub, d, total: sub - d };
    };
    const refrescar = () => {
      const t = totales();
      if (!pagadoManual) pagado.value = t.total ? centavosATexto(t.total) : '';
      const pg = Math.min(pagado.cents() || 0, t.total);
      vaciar(resumenC).append(h('div', null, h('span', null, 'Subtotal'), h('b', { class: 'num' }, money(t.sub))), t.d ? h('div', null, h('span', null, 'Descuento'), h('b', { class: 'num' }, `− ${money(t.d)}`)) : '',
        h('div', null, h('b', null, 'Total'), h('b', { class: 'num', style: { fontSize: '1.2rem' } }, money(t.total))), h('div', null, h('span', null, 'Pago ahora'), h('b', { class: 'num' }, money(pg))),
        h('div', null, h('span', null, 'Queda debiendo al proveedor'), importe(t.total - pg, t.total - pg > 0 ? 'le debo' : null, 'debe')));
    };
    const pintarLineas = () => {
      vaciar(zonaLineas);
      st.lineas.forEach((l, i) => {
        const p = productos.find((x) => x.id === l.producto_id);
        const selP = h('select', { class: 'input', 'aria-label': 'Producto' }, productos.map((x) => h('option', { value: x.id, selected: x.id === l.producto_id }, nombreProducto(x))));
        const selPres = h('select', { class: 'input', 'aria-label': 'Presentación' }, h('option', { value: 'caja', selected: l.pres === 'caja' }, `Cajas (${p.unidades_por_caja} u.)`), h('option', { value: 'unidad', selected: l.pres === 'unidad' }, 'Unidades'));
        const cant = h('input', { class: 'input numero', type: 'number', min: 1, step: 1, value: l.cantidad ?? '', placeholder: 'Cant.', 'aria-label': 'Cantidad' });
        const costo = campoDinero(l.costo, { placeholder: costoSugerido(p, l.pres) ? centavosATexto(costoSugerido(p, l.pres)) : 'Costo', 'aria-label': 'Costo por presentación' });
        const sub = h('div', { class: 'num', style: { fontWeight: 700, minWidth: '90px', textAlign: 'right' } }, money((l.cantidad || 0) * (l.costo || 0)));
        selP.addEventListener('change', () => { l.producto_id = Number(selP.value); l.costo = null; pintarLineas(); });
        selPres.addEventListener('change', () => { l.pres = selPres.value; l.costo = null; pintarLineas(); });
        cant.addEventListener('input', () => { l.cantidad = Number(cant.value) || null; sub.textContent = money((l.cantidad || 0) * (l.costo || 0)); refrescar(); });
        costo.addEventListener('input', () => { const c = costo.cents(); l.costo = Number.isNaN(c) ? null : c; sub.textContent = money((l.cantidad || 0) * (l.costo || 0)); refrescar(); });
        const usar = h('button', { class: 'btn ghost sm', type: 'button', title: 'Usar el último costo', onclick: () => { l.costo = costoSugerido(p, l.pres); pintarLineas(); } }, 'Último costo');
        zonaLineas.append(h('div', { class: 'card', style: { padding: '12px', background: 'var(--surface-2)' } },
          h('div', { class: 'form-grid' }, h('div', { class: 'full' }, selP), selPres, cant),
          h('div', { class: 'row between', style: { marginTop: '10px' } }, h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Costo de cada una:'), h('div', { style: { width: '130px' } }, costo), usar),
            h('div', { class: 'row' }, sub, st.lineas.length > 1 ? h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Quitar', onclick: () => { st.lineas.splice(i, 1); pintarLineas(); } }, icon('x')) : null))));
      });
      refrescar();
    };
    desc.addEventListener('input', refrescar);
    pagado.addEventListener('input', () => { pagadoManual = true; refrescar(); });
    pintarLineas();

    let enviando = false;
    const ok = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (enviando) return; error.hidden = true;
      const t = totales();
      const lineas = st.lineas.map((l) => ({ producto_id: l.producto_id, presentacion: l.pres, cantidad: l.cantidad, costo: l.costo }));
      if (lineas.some((l) => !l.cantidad || l.costo === null || l.costo === undefined)) { error.textContent = 'Completá cantidad y costo de todos los productos.'; error.hidden = false; return; }
      const pg = pagado.cents(); if (Number.isNaN(pg) || Number.isNaN(desc.cents())) { error.textContent = 'Revisá los importes: hay uno con formato inválido.'; error.hidden = false; return; }
      enviando = true; ok.disabled = true;
      try {
        await post('/api/compras', { idem_key: st.idem, proveedor_id: selProv.value ? Number(selProv.value) : undefined, deposito_id: st.dep, fecha: fecha.value, lineas, descuento: desc.cents() || 0, pagado: Math.min(pg || 0, t.total), medio: medio.value, observaciones: obs.value.trim() || undefined });
        m.cerrar(true); toast('Compra registrada: el stock ya se actualizó.'); recargar();
      } catch (e) { enviando = false; ok.disabled = false; error.textContent = errorMsg(e); error.hidden = false; }
    } }, icon('check'), 'Registrar compra');
    const m = modal({
      titulo: 'Nueva compra', tamano: 'wide',
      contenido: h('div', { class: 'stack' }, error,
        h('div', { class: 'form-grid' }, campo('Proveedor', selProv), campo('Fecha', fecha), h('div', { class: 'field full' }, h('label', null, 'Entra al depósito'), dep)),
        h('h3', null, 'Productos comprados'), zonaLineas,
        h('button', { class: 'btn', type: 'button', onclick: () => { st.lineas.push({ producto_id: productos[0].id, pres: 'caja', cantidad: null, costo: null }); pintarLineas(); } }, icon('plus'), 'Agregar otro producto'),
        h('div', { class: 'form-grid' }, campo('Descuento (importe)', desc, { hint: 'Baja el costo de lo comprado.' }), campo('Pago ahora', pagado, { hint: 'Lo que ya pagaste. El resto queda como deuda.' }), campo('Medio de pago', medio), campo('Observaciones', obs)),
        resumenC),
      pie: [h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cancelar'), ok],
    });
  }

  async function verCompra(id) {
    let c; try { c = await get(`/api/compras/${id}`); } catch (e) { toast(errorMsg(e), 'error'); return; }
    const anulada = c.estado === 'anulada';
    const esSI = c.tipo === 'saldo_inicial'; // deuda de antes del sistema: no es una compra
    const cuerpoM = h('div', { class: 'stack' },
      esSI ? h('div', { class: 'alert' }, icon('info'), h('div', null, 'Es lo que ya le debías a este proveedor al empezar a usar el sistema. No es una compra: no sumó stock, no cambió costos y no movió la caja. Se paga como cualquier otra deuda.')) : null,
      h('div', { class: 'row between' }, h('div', null, h('b', { style: { fontSize: '1.1rem' } }, c.proveedor || 'Proveedor sin especificar'), h('div', { class: 'small muted' }, `${fdt(c.fecha)} · entra a ${c.deposito}`)), anulada ? estadoBadge.anulada() : c.saldo > 0 ? badge('Con saldo', 'warn') : badge('Pagada', 'ok')),
      anulada ? h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, `Compra anulada el ${fdt(c.anulada_fecha)}. Motivo: ${c.anulada_motivo}. El stock se descontó y se conserva el registro.`)) : null,
      h('div', { class: 'card flush table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Producto', 'Cantidad', 'Costo c/u', 'Subtotal', 'Costo neto'].map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
        h('tbody', null, c.lineas.map((l) => h('tr', null, h('td', null, nombreProducto(l)), h('td', { class: 'num' }, `${l.cantidad} ${l.presentacion === 'caja' ? (l.cantidad === 1 ? 'caja' : 'cajas') : 'u.'}`, l.presentacion === 'caja' ? h('div', { class: 'small muted' }, `${l.unidades} u.`) : null),
          h('td', { class: 'num' }, money(l.costo)), h('td', { class: 'num' }, money(l.subtotal)), h('td', { class: 'num' }, money(l.costo_neto))))))),
      h('div', { class: 'lista-simple' }, c.descuento ? h('div', null, h('span', null, 'Descuento'), h('b', { class: 'num' }, `− ${money(c.descuento)}`)) : null, h('div', null, h('b', null, 'Total'), h('b', { class: 'num' }, money(c.total))),
        h('div', null, h('span', null, 'Pagado'), h('b', { class: 'num' }, money(anulada ? 0 : c.pagado))), h('div', null, h('span', null, 'Saldo con el proveedor'), importe(anulada ? 0 : c.saldo, !anulada && c.saldo > 0 ? 'le debo' : null, 'debe'))),
      c.pagos.length ? h('div', null, h('h3', { style: { marginBottom: '6px' } }, 'Pagos al proveedor'), h('div', { class: 'lista-simple' }, c.pagos.map((p) => h('div', { style: p.anulado ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : {} }, h('span', null, `${fdt(p.fecha)} · ${etiquetaMedio[p.medio]}`), h('b', { class: 'num' }, money(p.monto)))))) : null,
      c.observaciones ? h('div', { class: 'small muted' }, c.observaciones) : null);
    const pie = [];
    if (!anulada && c.saldo > 0) pie.push(h('button', { class: 'btn primary', type: 'button', onclick: () => { m.cerrar(); pagarSaldo(c); } }, 'Pagar al proveedor'));
    if (!anulada && app.usuario.rol === 'admin') pie.push(h('button', { class: 'btn danger', type: 'button', onclick: () => { m.cerrar(); anular(c); } }, 'Anular compra'));
    pie.push(h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cerrar'));
    const m = modal({ titulo: esSI ? `Deuda anterior · ${c.proveedor}` : `Compra N° ${c.id}`, tamano: 'wide', contenido: cuerpoM, pie });
  }

  async function pagarSaldo(c) {
    const r = await formModal({
      titulo: 'Pagar al proveedor', textoOk: 'Registrar pago', intro: `Compra N° ${c.id}${c.proveedor ? ` · ${c.proveedor}` : ''}. Saldo: ${money(c.saldo)}.`,
      campos: [{ name: 'monto', label: 'Importe', type: 'money', prefix: '$', required: true, autofocus: true, value: c.saldo }, { name: 'medio', label: 'Medio de pago', type: 'select', value: 'efectivo', options: Object.entries(etiquetaMedio).map(([value, label]) => ({ value, label })) }],
      onSubmit: (v) => post(`/api/compras/${c.id}/pagos`, v),
    });
    if (r) { toast('Pago registrado: salió de la caja.'); recargar(); }
  }

  async function anular(c) {
    const campos = [{ name: 'motivo', label: 'Motivo', required: true, full: true, autofocus: true }];
    if (c.pagado > 0) campos.push({ name: 'destino_pagos', label: `Ya pagaste ${money(c.pagado)}. ¿El proveedor te lo devuelve?`, type: 'select', required: true, full: true, options: [
      { value: 'reintegro', label: 'Sí, me lo reintegra (entra a la caja)' }, { value: 'sin_reintegro', label: 'No, queda como crédito con el proveedor (no mueve la caja)' }] });
    const r = await formModal({ titulo: `Anular compra N° ${c.id}`, textoOk: 'Anular compra', intro: 'Se descuenta del stock lo que había sumado esta compra. Solo se puede si esa mercadería todavía está en el depósito.', campos, onSubmit: (v) => post(`/api/compras/${c.id}/anular`, v) });
    if (r) { toast('Compra anulada.'); recargar(); }
  }

  await recargar();
}
