// Clientes: lista, ficha completa y lista de precios personalizada por cliente.
import { get, post, put, del, qs } from '../api.js';
import { h, icon, vaciar, money, pct, fdt, fdate, norm, debounce, badge, estadoBadge, modalidadBadge, dataTable, tabs, segmentado, toast, errorMsg, confirmar, formModal,
  estadoVacio, cargando, nombreProducto, campoDinero, centavosATexto, descargar, aCSV, importe, nroCorto } from '../ui.js';
import { abrirCobro } from './_pago.js';
import { verVenta } from './_venta.js';
import { unidadDesdeCaja, avisoUnidad } from '../precios.js';
import { app, esAdmin } from '../app.js';

const MODALIDADES = [
  { value: 'contado', label: 'Solo contado' }, { value: 'fiado', label: 'Solo fiado' }, { value: 'ambas', label: 'Contado y fiado' },
];

// El crédito (modalidad, límite y plazo) lo define el administrador: al empleado no le aparecen esos campos
// y, si los mandara igual, el servidor los ignora (server/routes.js).
export function camposCliente() {
  const credito = esAdmin();
  return [
    { name: 'nombre', label: 'Nombre o razón social', required: true, full: true, autofocus: true },
    { name: 'documento', label: 'CUIT / DNI' }, { name: 'telefono', label: 'Teléfono' },
    { name: 'direccion', label: 'Dirección', full: true },
    credito ? { name: 'modalidad', label: 'Modalidad de pago', type: 'select', options: MODALIDADES, hint: 'Solo a los clientes "fiado" o "contado y fiado" se les puede dejar deuda.' } : null,
    credito ? { name: 'limite_credito', label: 'Límite de crédito', type: 'money', prefix: '$', hint: 'Máximo que puede deber. Vacío = sin límite.' } : null,
    credito ? { name: 'plazo_dias', label: 'Plazo de pago (días)', type: 'int', min: 0, hint: 'Para calcular el vencimiento de sus deudas. 0 = sin vencimiento.' } : null,
    { name: 'observaciones', label: 'Observaciones', type: 'textarea', hint: credito ? undefined : 'Un cliente nuevo queda de contado. Para venderle fiado, pedile al administrador que le habilite crédito.' },
  ].filter(Boolean);
}
export async function formCliente(c = null) {
  const r = await formModal({
    titulo: c ? `Editar: ${c.nombre}` : 'Nuevo cliente', textoOk: c ? 'Guardar cambios' : 'Crear cliente', tamano: 'wide', campos: camposCliente(),
    valores: c ? { ...c, limite_credito: c.limite_credito || null, plazo_dias: c.plazo_dias } : { modalidad: 'contado' },
    onSubmit: (v) => { const cuerpo = { ...v, limite_credito: v.limite_credito ?? 0, plazo_dias: v.plazo_dias ?? 0 }; return c ? put(`/api/clientes/${c.id}`, cuerpo) : post('/api/clientes', cuerpo); },
  });
  if (r) toast(c ? 'Cambios guardados.' : 'Cliente creado.');
  return r;
}

export default async function (root, ctx) {
  if (ctx.params[0]) return ficha(root, ctx, Number(ctx.params[0]));
  return lista(root);
}

// ------------------------------------------------------------------- LISTA
async function lista(root) {
  let clientes = []; let mod = ''; let act = '1';
  const buscar = h('input', { class: 'input buscar', type: 'search', placeholder: 'Buscar por nombre, documento o teléfono…', 'aria-label': 'Buscar' });
  const pie = h('div', { class: 'pie-tabla' });
  const tabla = dataTable({
    columnas: [
      { key: 'nombre', label: 'Cliente', sort: (c) => c.nombre.toLowerCase(), render: (c) => h('div', null, h('b', null, c.nombre), h('div', { class: 'small muted' }, [c.documento, c.telefono].filter(Boolean).join(' · ') || ' '), c.activo ? null : badge('Inactivo')) },
      { key: 'modalidad', label: 'Modalidad', render: (c) => modalidadBadge(c.modalidad) },
      { key: 'deuda', label: 'Debe', num: true, sort: true, render: (c) => (c.deuda > 0 ? h('div', null, importe(c.deuda), c.vencida > 0 ? h('div', null, importe(c.vencida, 'vencido', 'vencido')) : null) : '—') },
      { key: 'saldo_favor', label: 'A favor', num: true, sort: true, render: (c) => (c.saldo_favor > 0 ? badge(money(c.saldo_favor), 'ok') : '—') },
      { key: 'limite_credito', label: 'Límite', num: true, render: (c) => (c.modalidad === 'contado' ? '—' : c.limite_credito > 0 ? money(c.limite_credito) : 'Sin límite') },
      { key: 'a', label: '', class: 'acciones', render: (c) => h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
        h('a', { class: 'btn sm primary', href: `#/venta/cliente/${c.id}` }, 'Vender'),
        c.deuda > 0 ? h('button', { class: 'btn sm', type: 'button', onclick: () => abrirCobro({ clienteId: c.id, alHacer: cargar }) }, 'Cobrar') : null) },
    ],
    onClick: (c) => { location.hash = `#/clientes/${c.id}`; },
    claseFila: (c) => (c.activo ? '' : 'anulada'),
    vacio: estadoVacio('Todavía no hay clientes', 'Cargá tus clientes de contado y fiados. Después podés ponerle precios especiales a cada uno.', h('button', { class: 'btn primary', onclick: nuevo }, icon('plus'), 'Nuevo cliente')),
  });
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Clientes'), h('p', null, 'Tus clientes de contado y fiados, con su deuda y sus precios.')),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: exportar }, icon('descargar'), 'Exportar'), h('button', { class: 'btn primary', type: 'button', onclick: nuevo }, icon('plus'), 'Nuevo cliente'))),
    h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, buscar,
      segmentado([{ value: '', label: 'Todos' }, { value: 'contado', label: 'Contado' }, { value: 'fiado', label: 'Fiado' }, { value: 'ambas', label: 'Ambas' }], mod, (v) => { mod = v; cargar(); }),
      segmentado([{ value: '1', label: 'Activos' }, { value: '0', label: 'Inactivos' }], act, (v) => { act = v; cargar(); })), tabla.el, pie));
  buscar.addEventListener('input', debounce(() => cargar(), 200));
  async function nuevo() { const r = await formCliente(); if (r) location.hash = `#/clientes/${r.id}`; }
  function exportar() {
    descargar('clientes.csv', aCSV([['Cliente', 'Documento', 'Teléfono', 'Modalidad', 'Debe', 'Vencido', 'A favor'], ...clientes.map((c) => [c.nombre, c.documento, c.telefono, c.modalidad, centavosATexto(c.deuda), centavosATexto(c.vencida), centavosATexto(c.saldo_favor)])]));
  }
  async function cargar() {
    try {
      clientes = await get('/api/clientes' + qs({ q: buscar.value.trim(), modalidad: mod, activos: act }));
      tabla.setFilas(clientes);
      pie.textContent = `${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} · deuda total: ${money(clientes.reduce((s, c) => s + c.deuda, 0))}`;
    } catch (e) { toast(errorMsg(e), 'error'); }
  }
  await cargar();
}

// ------------------------------------------------------------------- FICHA
async function ficha(root, ctx, id) {
  let d; let pestana = 'resumen';
  const cab = h('div'); const cuerpo = h('div');
  root.append(cab, cuerpo);

  async function cargar() {
    d = await get(`/api/clientes/${id}`);
    ctx.titulo(d.cliente.nombre);
    pintarCabecera(); pintarCuerpo();
  }

  function pintarCabecera() {
    const c = d.cliente;
    vaciar(cab).append(
      h('div', { class: 'page-head' },
        h('div', null, h('a', { href: '#/clientes', class: 'small' }, '← Clientes'),
          h('div', { class: 'row', style: { marginTop: '4px' } }, h('h1', null, c.nombre), modalidadBadge(c.modalidad), c.activo ? null : badge('Inactivo')),
          h('p', null, [c.documento, c.telefono, c.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'),
          c.plazo_dias || c.limite_credito ? h('p', null, [c.limite_credito ? `Límite de crédito ${money(c.limite_credito)}` : null, c.plazo_dias ? `Plazo ${c.plazo_dias} días` : null].filter(Boolean).join(' · ')) : null),
        h('div', { class: 'row' },
          h('a', { class: 'btn primary', href: `#/venta/cliente/${c.id}` }, icon('plus'), 'Nueva venta'),
          h('button', { class: 'btn', type: 'button', disabled: c.deuda <= 0, onclick: () => abrirCobro({ clienteId: c.id, alHacer: cargar }) }, icon('deudas'), 'Cobrar'),
          h('button', { class: 'btn', type: 'button', onclick: async () => { if (await formCliente(c)) cargar(); } }, icon('editar'), 'Editar'),
          app.usuario.rol === 'admin' ? (d.saldo_inicial
            ? h('button', { class: 'btn', type: 'button', title: 'Lo que debía antes de empezar a usar el sistema', onclick: () => verVenta(d.saldo_inicial.id, cargar) }, `Deuda anterior: ${money(d.saldo_inicial.total)}`)
            : h('button', { class: 'btn', type: 'button', title: 'Cargar lo que este cliente ya debía antes de empezar a usar el sistema', onclick: cargarSaldoInicial }, icon('plus'), 'Deuda anterior')) : null,
          esAdmin() ? h('button', { class: 'btn', type: 'button', onclick: alternar }, c.activo ? 'Desactivar' : 'Activar') : null,
          app.usuario.rol === 'admin' ? h('button', { class: 'btn danger', type: 'button', onclick: eliminar }, 'Eliminar') : null)),
      h('div', { class: 'grid c4', style: { marginBottom: '18px' } },
        h('div', { class: `kpi ${c.deuda > 0 ? 'bad' : ''}` }, h('div', { class: 't' }, 'Debe'), h('div', { class: 'v' }, money(c.deuda)), h('div', { class: 's' }, c.vencida > 0 ? `${money(c.vencida)} vencido` : c.deuda > 0 ? 'Al día' : 'Sin deuda')),
        h('div', { class: `kpi ${c.saldo_favor > 0 ? 'ok' : ''}` }, h('div', { class: 't' }, 'Saldo a favor'), h('div', { class: 'v' }, money(c.saldo_favor)),
          c.saldo_favor > 0 && c.deuda > 0 ? h('button', { class: 'btn sm', type: 'button', onclick: aplicarFavor }, 'Aplicar a su deuda') : h('div', { class: 's' }, 'Crédito del cliente')),
        h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Compras'), h('div', { class: 'v' }, money(d.resumen.total)), h('div', { class: 's' }, `${d.resumen.n} ${d.resumen.n === 1 ? 'venta' : 'ventas'} confirmadas`)),
        h('div', { class: 'kpi' }, h('div', { class: 't' }, 'Precios especiales'), h('div', { class: 'v' }, d.precios.filter((p) => p.especial_caja != null || p.especial_unidad != null).length), h('div', { class: 's' }, 'productos con precio propio'))),
      tabs([{ value: 'resumen', label: 'Últimas operaciones' }, { value: 'precios', label: 'Lista de precios' }], pestana, (v) => { pestana = v; pintarCuerpo(); }));
  }

  // Deuda que el cliente ya tenía antes del sistema: suma a su cuenta, pero no es una venta (no toca stock, ventas ni caja).
  async function cargarSaldoInicial() {
    const c = d.cliente;
    const r = await formModal({
      titulo: `Deuda anterior de ${c.nombre}`, textoOk: 'Cargar deuda anterior',
      intro: 'Cargá lo que este cliente YA te debía antes de empezar a usar el sistema (por ejemplo, lo que tenías anotado en el cuaderno). Se suma a su deuda y se cobra como cualquier otra, pero no es una venta: no descuenta stock ni cuenta en ventas, ganancias o caja. Se carga una sola vez por cliente.',
      campos: [
        { name: 'monto', label: 'Cuánto debía', type: 'money', prefix: '$', required: true, autofocus: true },
        { name: 'fecha', label: 'A qué fecha', type: 'date', value: app.hoy, max: app.hoy, required: true, hint: 'El día del que es ese saldo (normalmente hoy).' },
        { name: 'vencimiento', label: 'Vence (opcional)', type: 'date' },
        { name: 'observaciones', label: 'Observaciones (opcional)', full: true, placeholder: 'Ej.: Saldo del cuaderno al 31/10' },
      ],
      onSubmit: (v) => post(`/api/clientes/${c.id}/saldo-inicial`, { ...v, vencimiento: v.vencimiento || undefined, observaciones: v.observaciones || undefined }),
    });
    if (r) { toast(`Listo: ${c.nombre} quedó debiendo ${money(r.total)} de antes.`); cargar(); }
  }

  function pintarCuerpo() {
    vaciar(cuerpo);
    if (pestana === 'precios') return pintarPrecios();
    const ventas = dataTable({
      columnas: [
        { key: 'numero', label: 'N°', render: (v) => h('b', null, nroCorto(v.numero)) }, { key: 'fecha', label: 'Fecha', render: (v) => fdt(v.fecha) },
        { key: 'modalidad_pago', label: 'Pago', render: (v) => (v.numero < 0 ? badge('Saldo inicial', 'info') : modalidadBadge(v.modalidad_pago)) },
        { key: 'total', label: 'Total', num: true, render: (v) => money(v.total) },
        { key: 'saldo', label: 'Saldo', num: true, render: (v) => (v.estado === 'anulada' ? '—' : v.saldo > 0 ? importe(v.saldo) : '—') },
        { key: 'estado', label: 'Estado', render: (v) => (v.estado === 'anulada' ? estadoBadge.anulada() : v.saldo > 0 ? (v.vencimiento && v.vencimiento < app.hoy ? estadoBadge.vencida() : v.pagado > 0 ? estadoBadge.parcial() : estadoBadge.pendiente()) : estadoBadge.pagada()) },
      ], filas: d.ventas, onClick: (v) => verVenta(v.id, cargar), claseFila: (v) => (v.estado === 'anulada' ? 'anulada' : ''),
      vacio: estadoVacio('Todavía no le vendiste', 'Cuando le registres una venta aparece acá.', h('a', { class: 'btn primary', href: `#/venta/cliente/${id}` }, 'Nueva venta')),
    });
    const pagos = dataTable({
      columnas: [
        { key: 'fecha', label: 'Fecha', render: (p) => fdt(p.fecha) }, { key: 'monto', label: 'Importe', num: true, render: (p) => h('b', null, money(p.monto)) },
        { key: 'medio', label: 'Medio', render: (p) => ({ efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' }[p.medio]) },
        { key: 'estado', label: '', render: (p) => (p.anulado ? estadoBadge.anulada() : null) },
      ], filas: d.pagos, claseFila: (p) => (p.anulado ? 'anulada' : ''), vacio: estadoVacio('Sin cobros de deuda', 'Los cobros que registres aparecen acá.'),
    });
    cuerpo.append(h('div', { class: 'grid side' },
      h('section', { class: 'card flush' }, h('div', { class: 'card-head' }, h('h2', null, 'Ventas')), ventas.el),
      h('section', { class: 'card flush' }, h('div', { class: 'card-head' }, h('h2', null, 'Cobros de deuda')), pagos.el)),
      d.cliente.observaciones ? h('div', { class: 'card', style: { marginTop: '16px' } }, h('h3', null, 'Observaciones'), h('p', { class: 'muted' }, d.cliente.observaciones)) : '');
  }

  function pintarPrecios() {
    const buscar = h('input', { class: 'input buscar', type: 'search', placeholder: 'Buscar producto…', 'aria-label': 'Buscar producto' });
    const soloEsp = h('label', { class: 'check small' }, h('input', { type: 'checkbox' }), 'Solo con precio especial');
    const zona = h('div', { class: 'table-wrap' });
    const dif = (esp, gen) => (esp == null || !gen ? '' : `${esp >= gen ? '+' : ''}${(((esp - gen) / gen) * 100).toFixed(1).replace('.', ',')} % vs general`);
    const pintar = () => {
      const q = norm(buscar.value);
      const lista = d.precios.filter((p) => (!q || norm(nombreProducto(p)).includes(q)) && (!soloEsp.querySelector('input').checked || p.especial_caja != null || p.especial_unidad != null));
      vaciar(zona);
      if (!lista.length) { zona.append(estadoVacio(d.precios.length ? 'Sin resultados' : 'No hay productos cargados', d.precios.length ? 'Probá con otro nombre.' : 'Cargá productos para armar la lista de precios.')); return; }
      zona.append(h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Producto'), h('th', { class: 'num' }, 'Caja: general'), h('th', { class: 'num' }, 'Caja: para este cliente'), h('th', { class: 'num' }, 'Unidad: general'), h('th', { class: 'num' }, 'Unidad: para este cliente'))),
        h('tbody', null, lista.map((p) => {
          const ic = campoDinero(p.especial_caja, { placeholder: 'igual al general', 'aria-label': `Precio por caja de ${p.nombre}` });
          const iu = campoDinero(p.especial_unidad, { placeholder: 'igual al general', 'aria-label': `Precio por unidad de ${p.nombre}` });
          // El empleado ve los precios especiales (para cobrar bien) pero no los cambia.
          if (!esAdmin()) { ic.disabled = true; iu.disabled = true; ic.title = iu.title = 'Solo el administrador cambia precios'; }
          const dc = h('div', { class: 'small muted' }, dif(p.especial_caja, p.general_caja)); const du = h('div', { class: 'small muted' }, dif(p.especial_unidad, p.general_unidad));
          const nu = h('div', { class: 'small calc-aviso', hidden: true }); // aviso cuando la unidad se calculó desde la caja
          const guardar = async (desdeCaja = false) => {
            const a = ic.cents();
            // Al cambiar la caja, la unidad se recalcula: caja ÷ unidades, redondeado al centavo (se puede corregir a mano)
            nu.hidden = true;
            if (desdeCaja === true && a !== null && !Number.isNaN(a)) {
              const u = unidadDesdeCaja(a, p.unidades_por_caja);
              if (u !== null && u !== iu.cents()) {
                iu.value = centavosATexto(u);
                nu.textContent = avisoUnidad(a, p.unidades_por_caja, u);
                nu.hidden = false;
              }
            }
            const b = iu.cents();
            if (Number.isNaN(a) || Number.isNaN(b)) { toast('Hay un precio con formato inválido.', 'warn'); return; }
            try {
              const r = await put(`/api/clientes/${id}/precios/${p.producto_id}`, { precio_caja: a, precio_unidad: b });
              Object.assign(p, r); dc.textContent = dif(r.especial_caja, r.general_caja); du.textContent = dif(r.especial_unidad, r.general_unidad);
              toast(a === null && b === null ? `Precio de ${p.nombre} vuelve al general.` : `Precio de ${p.nombre} guardado.`);
              const n = d.precios.filter((x) => x.especial_caja != null || x.especial_unidad != null).length;
            } catch (e) { toast(errorMsg(e), 'error'); }
          };
          ic.addEventListener('change', () => guardar(true)); iu.addEventListener('change', () => guardar(false));
          return h('tr', null, h('td', null, h('b', null, nombreProducto(p)), h('div', { class: 'small muted' }, `caja de ${p.unidades_por_caja} u.`), p.activo ? null : h('div', null, badge('Inactivo'))),
            h('td', { class: 'num muted' }, money(p.general_caja)), h('td', { class: 'num', style: { minWidth: '160px' } }, ic, dc),
            h('td', { class: 'num muted' }, money(p.general_unidad)), h('td', { class: 'num', style: { minWidth: '160px' } }, iu, du, nu));
        }))));
    };
    buscar.addEventListener('input', debounce(pintar, 120)); soloEsp.querySelector('input').addEventListener('change', pintar);
    cuerpo.append(h('div', { class: 'card flush' },
      h('div', { class: 'toolbar' }, buscar, soloEsp),
      h('div', { class: 'alert', style: { margin: '14px 18px 0' } }, icon('info'), h('div', null, 'Escribí el precio de este cliente y salí del casillero: se guarda solo. Al cargar el precio de la caja, el de la unidad se calcula solo (caja ÷ unidades, redondeado al centavo) y lo podés cambiar. Si lo dejás vacío se usa el precio general. Cambiar esta lista no modifica ventas anteriores.')),
      zona));
    pintar();
  }

  async function alternar() {
    const c = d.cliente;
    if (c.activo && !(await confirmar({ titulo: 'Desactivar cliente', mensaje: `${c.nombre} deja de aparecer para vender. Su historial y su deuda se conservan.`, textoOk: 'Desactivar' }))) return;
    try { await post(`/api/clientes/${id}/estado`, { activo: !c.activo }); toast(c.activo ? 'Cliente desactivado.' : 'Cliente activado.'); cargar(); } catch (e) { toast(errorMsg(e), 'error'); }
  }
  async function eliminar() {
    if (!(await confirmar({ titulo: 'Eliminar cliente', mensaje: `¿Eliminar a ${d.cliente.nombre}? Solo se puede si nunca tuvo ventas ni pagos. Si tiene historial, desactivalo.`, textoOk: 'Eliminar', peligro: true }))) return;
    try { await del(`/api/clientes/${id}`); toast('Cliente eliminado.'); location.hash = '#/clientes'; } catch (e) { toast(errorMsg(e), 'error'); }
  }
  async function aplicarFavor() {
    try { const r = await post(`/api/clientes/${id}/aplicar-saldo-favor`); toast(`Se aplicaron ${money(r.aplicado)} del saldo a favor.`); cargar(); } catch (e) { toast(errorMsg(e), 'error'); }
  }

  await cargar();
}
