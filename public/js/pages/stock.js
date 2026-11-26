// Stock en Galpón y Casa: existencias, transferencias, entradas, mermas, ajustes e historial de movimientos.
import { get, post, qs } from '../api.js';
import { esAdmin } from '../app.js';
import { h, icon, vaciar, money, num, norm, debounce, toast, errorMsg, formModal, dataTable, badge, tabs, stockTxt, nombreProducto, estadoVacio, fdate, fdt, hoyISO, sumaDias } from '../ui.js';

const TIPOS = {
  compra: ['Compra', 'ok'], entrada_manual: ['Entrada manual', 'info'], venta: ['Venta', ''], merma: ['Pérdida / rotura', 'bad'], ajuste: ['Ajuste de inventario', 'warn'],
  transferencia: ['Transferencia', 'info'], anulacion_venta: ['Anulación de venta', 'warn'], anulacion_compra: ['Anulación de compra', 'warn'],
};
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMes = (aaaaMm) => `${MESES[Number(aaaaMm.slice(5, 7)) - 1]} ${aaaaMm.slice(0, 4)}`;

// Filas agrupadas por mes (AAAA-MM) de `campo`, conservando el orden en que vienen.
function porMes(filas, campo) {
  const m = new Map();
  for (const f of filas) { const k = f[campo].slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
  return m;
}

// Tiempo desde la fecha de ingreso hasta hoy (solo para mostrar).
function antiguedad(iso) {
  const dias = Math.round((Date.parse(hoyISO()) - Date.parse(iso)) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias < 60) return `${dias} ${dias === 1 ? 'día' : 'días'}`;
  const meses = Math.floor(dias / 30.44);
  return meses < 24 ? `${meses} meses` : `${Math.floor(meses / 12)} años`;
}

// "85 cajas + 14 u. sueltas". Cajas completas y sueltas por separado: no se pueden sumar cajas de productos con distinto tamaño de caja.
function totalCajas(lista, cant) {
  const cajas = lista.reduce((s, r) => s + Math.floor(cant(r) / r.unidades_por_caja), 0);
  const sueltas = lista.reduce((s, r) => s + (cant(r) % r.unidades_por_caja), 0);
  return `${num(cajas)} ${cajas === 1 ? 'caja' : 'cajas'}${sueltas ? ` + ${num(sueltas)} u. sueltas` : ''}`;
}

export default async function (root, ctx) {
  let productos = [];
  let pestana = 'existencias';
  const cuerpo = h('div');
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Stock'), h('p', null, 'Qué tenés en el Galpón y en la Casa. Todo cambio queda registrado.')),
      // Mover mercadería es tarea del administrador; el empleado solo consulta.
      esAdmin() ? h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => abrir('transferencia') }, icon('transferir'), 'Transferir'),
        h('button', { class: 'btn', type: 'button', onclick: () => abrir('entrada') }, icon('plus'), 'Entrada manual'),
        h('a', { class: 'btn primary', href: '#/compras' }, icon('compras'), 'Registrar compra')) : null),
    tabs([{ value: 'existencias', label: 'Existencias' }, { value: 'lugar', label: 'Por lugar' }, { value: 'fecha', label: 'Por fecha de ingreso' },
      { value: 'ingresos', label: 'Ingresos por mes' }, { value: 'movimientos', label: 'Historial de movimientos' }], pestana, (v) => { pestana = v; mostrar(); }),
    cuerpo);

  async function recargar() { productos = await get('/api/productos?activos=1'); }

  async function mostrar() {
    vaciar(cuerpo);
    if (pestana === 'existencias') return existencias();
    if (pestana === 'lugar') return porLugar();
    if (pestana === 'fecha') return porFechaIngreso();
    if (pestana === 'ingresos') return ingresosPorMes();
    return movimientos();
  }

  function acciones(p) {
    if (!esAdmin()) return null;
    return h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
      h('button', { class: 'btn sm', type: 'button', onclick: () => abrir('transferencia', p) }, 'Transferir'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => abrir('entrada', p) }, 'Entrada'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => abrir('ajuste', p) }, 'Contar'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => abrir('merma', p) }, 'Pérdida'));
  }

  function existencias() {
    const buscar = h('input', { class: 'input buscar', type: 'search', placeholder: 'Buscar producto…', 'aria-label': 'Buscar' });
    const tot = h('div', { class: 'pie-tabla' });
    const t = dataTable({
      columnas: [
        { key: 'n', label: 'Producto', sort: (r) => r.nombre.toLowerCase(), render: (r) => h('div', null, h('b', null, nombreProducto(r)), h('div', { class: 'small muted' }, `Caja de ${r.unidades_por_caja} · mínimo ${r.stock_minimo ? num(r.stock_minimo) + ' u.' : 'sin aviso'}`)) },
        { key: 'g', label: 'Galpón', num: true, sort: (r) => r.stock_galpon, render: (r) => h('div', null, h('b', null, stockTxt(r.stock_galpon, r.unidades_por_caja)), r.unidades_por_caja > 1 && r.stock_galpon ? h('div', { class: 'small muted' }, `${num(r.stock_galpon)} u.`) : null) },
        { key: 'c', label: 'Casa', num: true, sort: (r) => r.stock_casa, render: (r) => h('div', null, h('b', null, stockTxt(r.stock_casa, r.unidades_por_caja)), r.unidades_por_caja > 1 && r.stock_casa ? h('div', { class: 'small muted' }, `${num(r.stock_casa)} u.`) : null) },
        { key: 't', label: 'Total', num: true, sort: (r) => r.stock_total, render: (r) => h('div', null, h('b', null, stockTxt(r.stock_total, r.unidades_por_caja)),
          r.estado_stock === 'agotado' ? h('div', null, badge('Agotado', 'bad')) : r.estado_stock === 'bajo' ? h('div', null, badge('Stock bajo', 'warn')) : null) },
        ...(esAdmin() ? [{ key: 'v', label: 'Valor al costo', num: true, sort: (r) => r.valor_inventario, render: (r) => money(r.valor_inventario) },
          { key: 'a', label: '', class: 'acciones', render: acciones }] : []),
      ],
      vacio: estadoVacio('No hay productos', 'Cargá productos primero.', h('a', { class: 'btn primary', href: '#/productos' }, 'Ir a Productos')),
    });
    const filtrar = () => {
      const q = norm(buscar.value);
      const lista = productos.filter((p) => !q || norm(`${p.nombre} ${p.marca ?? ''} ${p.variante ?? ''} ${p.codigo ?? ''}`).includes(q));
      t.setFilas(lista);
      tot.textContent = `Galpón: ${num(lista.reduce((s, p) => s + p.stock_galpon, 0))} u. · Casa: ${num(lista.reduce((s, p) => s + p.stock_casa, 0))} u.${esAdmin() ? ` · Valor al costo: ${money(lista.reduce((s, p) => s + p.valor_inventario, 0))}` : ''}`;
    };
    buscar.addEventListener('input', debounce(filtrar, 150));
    cuerpo.append(h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, buscar), t.el, tot));
    filtrar();
  }

  // Una tarjeta por depósito con solo lo que hay en ese lugar.
  async function porLugar() {
    const buscar = h('input', { class: 'input buscar', type: 'search', placeholder: 'Buscar producto…', 'aria-label': 'Buscar' });
    // Fecha de ingreso de la mercadería más vieja de cada producto en cada depósito (los lotes vienen del más viejo al más nuevo).
    const masViejo = new Map();
    const lugares = [{ id: 1, nombre: 'Galpón', campo: 'stock_galpon' }, { id: 2, nombre: 'Casa', campo: 'stock_casa' }].map((l) => {
      const resumen = h('div', { class: 'small muted' });
      const t = dataTable({
        columnas: [
          { key: 'n', label: 'Producto', sort: (r) => r.nombre.toLowerCase(), render: (r) => h('div', null, h('b', null, nombreProducto(r)), h('div', { class: 'small muted' }, `Caja de ${r.unidades_por_caja}`)) },
          { key: 'c', label: `Hay en ${l.nombre}`, num: true, sort: (r) => r[l.campo], render: (r) => h('div', null, h('b', null, stockTxt(r[l.campo], r.unidades_por_caja)),
            r.unidades_por_caja > 1 ? h('div', { class: 'small muted' }, `${num(r[l.campo])} u.`) : null) },
          { key: 'v', label: 'Lo más viejo', sort: (r) => masViejo.get(`${r.id}-${l.id}`) ?? '', render: (r) => {
            const f = masViejo.get(`${r.id}-${l.id}`);
            return f ? h('div', null, fdate(f), h('div', { class: 'small muted' }, antiguedad(f))) : '—';
          } },
        ],
        vacio: estadoVacio(`No hay mercadería en ${l.nombre}`, 'Ningún producto tiene stock en este lugar.'),
      });
      return { ...l, resumen, t, el: h('div', { class: 'card flush' }, h('div', { class: 'card-head' }, h('h2', null, l.nombre), resumen), t.el) };
    });
    const filtrar = () => {
      const q = norm(buscar.value);
      for (const l of lugares) {
        const lista = productos.filter((p) => p[l.campo] > 0 && (!q || norm(`${p.nombre} ${p.marca ?? ''} ${p.variante ?? ''} ${p.codigo ?? ''}`).includes(q)));
        l.resumen.textContent = `${num(lista.length)} ${lista.length === 1 ? 'producto' : 'productos'} · ${totalCajas(lista, (p) => p[l.campo])}`;
        l.t.setFilas(lista);
      }
    };
    buscar.addEventListener('input', debounce(filtrar, 150));
    cuerpo.append(h('div', { class: 'card flush', style: { marginBottom: '16px' } }, h('div', { class: 'toolbar' }, buscar)),
      h('div', { class: 'grid c2' }, lugares.map((l) => l.el)));
    filtrar();
    try {
      for (const l of await get('/api/stock/lotes')) {
        const k = `${l.producto_id}-${l.deposito_id}`;
        if (!masViejo.has(k)) masViejo.set(k, l.fecha_ingreso);
      }
      filtrar();
    } catch (e) { toast(errorMsg(e), 'error'); }
  }

  const selectorProducto = () => h('select', { class: 'input', 'aria-label': 'Producto' }, h('option', { value: '' }, 'Todos los productos'),
    productos.map((p) => h('option', { value: p.id }, nombreProducto(p))));

  // Lo que hay hoy, agrupado por el mes en que entró. Lo más viejo primero.
  async function porFechaIngreso() {
    const selProd = selectorProducto();
    const selDep = h('select', { class: 'input', 'aria-label': 'Depósito' }, h('option', { value: '' }, 'Galpón y Casa'), h('option', { value: 1 }, 'Galpón'), h('option', { value: 2 }, 'Casa'));
    const zona = h('div');
    const cargar = async () => {
      let filas;
      try { filas = await get('/api/stock/lotes' + qs({ producto_id: selProd.value, deposito_id: selDep.value })); }
      catch (e) { toast(errorMsg(e), 'error'); return; }
      vaciar(zona);
      if (!filas.length) {
        zona.append(h('div', { class: 'card' }, estadoVacio('No hay mercadería con estos filtros', 'Cuando entre mercadería (compras o entradas manuales) va a aparecer acá con su fecha de ingreso.')));
        return;
      }
      for (const [mes, lista] of porMes(filas, 'fecha_ingreso')) {
        const t = dataTable({
          columnas: [
            { key: 'f', label: 'Ingresó', render: (r) => fdate(r.fecha_ingreso) },
            { key: 'n', label: 'Producto', render: (r) => h('b', null, nombreProducto(r)) },
            { key: 'd', label: 'Lugar', render: (r) => r.deposito },
            { key: 'q', label: 'Queda', num: true, render: (r) => h('div', null, h('b', null, stockTxt(r.cantidad, r.unidades_por_caja)),
              r.unidades_por_caja > 1 ? h('div', { class: 'small muted' }, `${num(r.cantidad)} u.`) : null) },
            { key: 'a', label: 'Antigüedad', num: true, render: (r) => antiguedad(r.fecha_ingreso) },
          ], filas: lista,
        });
        zona.append(h('div', { class: 'card flush', style: { marginBottom: '16px' } },
          h('div', { class: 'card-head' }, h('h2', null, nombreMes(mes)), h('div', { class: 'small muted' }, totalCajas(lista, (r) => r.cantidad))), t.el));
      }
    };
    for (const el of [selProd, selDep]) el.addEventListener('change', cargar);
    cuerpo.append(h('div', { class: 'card flush', style: { marginBottom: '16px' } }, h('div', { class: 'toolbar' }, selProd, selDep),
      h('div', { class: 'pie-tabla' }, 'Lo más viejo primero. En cada venta elegís de qué fecha sale la mercadería. Las transferencias, pérdidas y ajustes descuentan primero lo más viejo de ese depósito.')), zona);
    await cargar();
  }

  // Todo lo que entró (compras y entradas manuales), agrupado por mes, con cuánto queda hoy de cada ingreso.
  async function ingresosPorMes() {
    const selProd = selectorProducto();
    const desde = h('input', { class: 'input', type: 'date', 'aria-label': 'Desde' });
    const hasta = h('input', { class: 'input', type: 'date', max: hoyISO(), 'aria-label': 'Hasta' });
    const zona = h('div');
    const cargar = async () => {
      let filas;
      try { filas = await get('/api/stock/ingresos' + qs({ producto_id: selProd.value, desde: desde.value, hasta: hasta.value })); }
      catch (e) { toast(errorMsg(e), 'error'); return; }
      vaciar(zona);
      if (!filas.length) {
        zona.append(h('div', { class: 'card' }, estadoVacio('No hay ingresos con estos filtros', 'Acá aparecen las compras y las entradas manuales, con la fecha en que entró la mercadería.')));
        return;
      }
      for (const [mes, lista] of porMes(filas, 'fecha_ingreso')) {
        const t = dataTable({
          columnas: [
            { key: 'f', label: 'Fecha', render: (r) => fdate(r.fecha_ingreso) },
            { key: 'n', label: 'Producto', render: (r) => h('b', null, nombreProducto(r)) },
            { key: 'd', label: 'Entró a', render: (r) => r.deposito },
            { key: 'o', label: 'Origen', render: (r) => (r.origen === 'compra'
              ? `Compra N° ${r.ref_id}`
              : h('div', null, 'Entrada manual', r.motivo ? h('div', { class: 'small muted' }, r.motivo) : null)) },
            { key: 'i', label: 'Ingresó', num: true, render: (r) => stockTxt(r.unidades_iniciales, r.unidades_por_caja) },
            { key: 'q', label: 'Queda hoy', num: true, render: (r) => (r.quedan === 0 ? badge('Se terminó', '') : h('b', null, stockTxt(r.quedan, r.unidades_por_caja))) },
          ], filas: lista,
        });
        zona.append(h('div', { class: 'card flush', style: { marginBottom: '16px' } },
          h('div', { class: 'card-head' }, h('h2', null, nombreMes(mes)),
            h('div', { class: 'small muted' }, `${num(lista.length)} ${lista.length === 1 ? 'ingreso' : 'ingresos'} · entraron ${totalCajas(lista, (r) => r.unidades_iniciales)}`)), t.el));
      }
    };
    for (const el of [selProd, desde, hasta]) el.addEventListener('change', cargar);
    cuerpo.append(h('div', { class: 'card flush', style: { marginBottom: '16px' } },
      h('div', { class: 'toolbar' }, selProd, desde, h('span', { class: 'muted' }, 'a'), hasta),
      h('div', { class: 'pie-tabla' }, '"Queda hoy" suma lo que queda de ese ingreso en el Galpón y en la Casa. Las compras anuladas no figuran; las transferencias no son ingresos.')), zona);
    await cargar();
  }

  async function movimientos() {
    const f = { producto_id: '', deposito_id: '', tipo: '', desde: sumaDias(hoyISO(), -30), hasta: hoyISO() };
    const selProd = h('select', { class: 'input', 'aria-label': 'Producto' }, h('option', { value: '' }, 'Todos los productos'), productos.map((p) => h('option', { value: p.id }, nombreProducto(p))));
    const selDep = h('select', { class: 'input', 'aria-label': 'Depósito' }, h('option', { value: '' }, 'Ambos depósitos'), h('option', { value: 1 }, 'Galpón'), h('option', { value: 2 }, 'Casa'));
    const selTipo = h('select', { class: 'input', 'aria-label': 'Tipo' }, h('option', { value: '' }, 'Todos los tipos'), Object.entries(TIPOS).map(([k, v]) => h('option', { value: k }, v[0])));
    const desde = h('input', { class: 'input', type: 'date', value: f.desde, 'aria-label': 'Desde' });
    const hasta = h('input', { class: 'input', type: 'date', value: f.hasta, 'aria-label': 'Hasta' });
    const zona = h('div');
    const t = dataTable({
      columnas: [
        { key: 'fecha', label: 'Fecha', sort: true, render: (r) => fdt(r.fecha) },
        { key: 'p', label: 'Producto', render: (r) => nombreProducto(r) },
        { key: 'tipo', label: 'Tipo', render: (r) => badge(TIPOS[r.tipo]?.[0] || r.tipo, TIPOS[r.tipo]?.[1]) },
        { key: 'u', label: 'Cantidad', num: true, render: (r) => {
          const signo = r.deposito_origen && r.deposito_destino ? '⇄' : r.deposito_destino ? '+' : '−';
          return h('b', { style: { color: signo === '+' ? 'var(--ok)' : 'inherit' } }, `${signo} ${stockTxt(r.unidades, r.unidades_por_caja)}`);
        } },
        { key: 'd', label: 'Depósito', render: (r) => (r.origen && r.destino ? `${r.origen} → ${r.destino}` : r.destino || r.origen) },
        { key: 'm', label: 'Motivo', render: (r) => h('span', { class: 'small' }, r.motivo || '—') },
        ...(esAdmin() ? [{ key: 'c', label: 'Valor', num: true, render: (r) => (r.costo ? money(r.costo) : '—') }] : []),
        { key: 'u2', label: 'Usuario', render: (r) => h('span', { class: 'small muted' }, r.usuario || '—') },
      ],
      vacio: estadoVacio('Sin movimientos', 'No hay movimientos con estos filtros.'),
    });
    const recargar2 = async () => {
      try { t.setFilas(await get('/api/stock/movimientos' + qs({ producto_id: selProd.value, deposito_id: selDep.value, tipo: selTipo.value, desde: desde.value, hasta: hasta.value }))); }
      catch (e) { toast(errorMsg(e), 'error'); }
    };
    for (const el of [selProd, selDep, selTipo, desde, hasta]) el.addEventListener('change', recargar2);
    cuerpo.append(h('div', { class: 'card flush' }, h('div', { class: 'toolbar' }, selProd, selDep, selTipo, desde, h('span', { class: 'muted' }, 'a'), hasta), t.el,
      h('div', { class: 'pie-tabla' }, 'Se muestran hasta 500 movimientos. Las transferencias no son ventas y no generan ingresos ni ganancias.')));
    recargar2();
  }

  // ---- Operaciones
  async function abrir(tipo, p = null) {
    const opsProd = productos.map((x) => ({ value: x.id, label: nombreProducto(x) }));
    const dep = [{ value: 1, label: 'Galpón' }, { value: 2, label: 'Casa' }];
    const pres = [{ value: 'unidad', label: 'Unidades sueltas' }, { value: 'caja', label: 'Cajas completas' }];
    const campoProd = { name: 'producto_id', label: 'Producto', type: 'select', options: opsProd, value: p?.id, required: true, full: true };
    const config = {
      transferencia: {
        titulo: 'Transferir entre depósitos', ok: 'Transferir', url: '/api/stock/transferencia',
        intro: 'Mueve mercadería de un depósito a otro. No es una venta: no genera ingresos ni ganancias.',
        campos: [campoProd, { name: 'origen', label: 'Sale de', type: 'select', options: dep, value: 1, required: true }, { name: 'destino', label: 'Va a', type: 'select', options: dep, value: 2, required: true },
          { name: 'presentacion', label: 'Cantidad en', type: 'select', options: pres, value: 'caja' }, { name: 'cantidad', label: 'Cantidad', type: 'int', min: 1, required: true }, { name: 'motivo', label: 'Motivo (opcional)', full: true }],
      },
      entrada: {
        titulo: 'Entrada manual de mercadería', ok: 'Registrar entrada', url: '/api/stock/entrada',
        intro: 'Para mercadería que ya tenías o que llegó sin compra. Si la compraste, mejor usá Compras para que quede el gasto y el proveedor. Si es de meses pasados, cargá cada ingreso por separado con su fecha real.',
        campos: [campoProd, { name: 'deposito_id', label: 'Entra al', type: 'select', options: dep, value: 1, required: true }, { name: 'presentacion', label: 'Cantidad en', type: 'select', options: pres, value: 'caja' },
          { name: 'cantidad', label: 'Cantidad', type: 'int', min: 1, required: true },
          { name: 'fecha_ingreso', label: 'Fecha en que entró', type: 'date', value: hoyISO(), max: hoyISO(), required: true },
          { name: 'costo_caja', label: 'Costo por caja (opcional)', type: 'money', prefix: '$', hint: 'Si lo dejás vacío se usa el costo actual.' },
          { name: 'motivo', label: 'Motivo', required: true, full: true, placeholder: 'Ej.: Stock inicial, mercadería que ya tenía' }],
      },
      merma: {
        titulo: 'Pérdida o rotura', ok: 'Registrar pérdida', url: '/api/stock/merma',
        intro: 'Descuenta mercadería perdida, robada, dañada o vencida. Se suma a las pérdidas del período.',
        campos: [campoProd, { name: 'deposito_id', label: 'Sale del', type: 'select', options: dep, value: 1, required: true }, { name: 'presentacion', label: 'Cantidad en', type: 'select', options: pres, value: 'unidad' },
          { name: 'cantidad', label: 'Cantidad', type: 'int', min: 1, required: true }, { name: 'motivo', label: 'Motivo', required: true, full: true, placeholder: 'Ej.: Paquetes mojados' }],
      },
      ajuste: {
        titulo: 'Contar y ajustar stock', ok: 'Ajustar stock', url: '/api/stock/ajuste',
        intro: 'Contaste lo que hay y no coincide con el sistema. Escribí cuántas unidades hay realmente y se registra la diferencia.',
        campos: [campoProd, { name: 'deposito_id', label: 'Depósito', type: 'select', options: dep, value: 1, required: true },
          { name: 'nuevo_total_unidades', label: 'Unidades que hay realmente', type: 'int', min: 0, required: true, hint: 'En unidades sueltas, no en cajas.' }, { name: 'motivo', label: 'Motivo', required: true, full: true, placeholder: 'Ej.: Conteo del mes' }],
      },
    }[tipo];
    const r = await formModal({
      titulo: config.titulo, intro: config.intro, campos: config.campos, textoOk: config.ok,
      onSubmit: (v) => {
        if (tipo === 'transferencia' && v.origen === v.destino) throw new Error('El depósito de origen y el de destino tienen que ser distintos.');
        return post(config.url, v);
      },
    });
    if (r) { toast('Listo, el stock se actualizó.'); await recargar(); mostrar(); }
  }

  await recargar();
  await mostrar();
}
