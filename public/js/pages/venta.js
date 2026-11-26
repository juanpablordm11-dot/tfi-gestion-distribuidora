// Venta rápida: cliente → depósito → productos → ticket → confirmar.
import { get, post, put, ApiError } from '../api.js';
import { compartirComprobante, verComprobante } from '../comprobante.js';
import { h, icon, vaciar, money, moneyFull, num, norm, debounce, toast, errorMsg, modal, confirmar, formModal, campo, campoDinero, segmentado,
  selectorBusqueda, stockTxt, nombreProducto, idemKey, parseMoney, fdate, fdt, badge, modalidadBadge, hoyISO, sumaDias, cargando, etiquetaMedio , importe } from '../ui.js';

// "producto-depósito" → fechas de ingreso con mercadería [{ fecha, cantidad }], de la más vieja a la más nueva.
async function cargarLotes() {
  const m = new Map();
  for (const l of await get('/api/stock/lotes')) {
    const k = `${l.producto_id}-${l.deposito_id}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push({ fecha: l.fecha_ingreso, cantidad: l.cantidad });
  }
  return m;
}

export default async function (root, ctx) {
  const [clientes, productos] = await Promise.all([get('/api/clientes?activos=1'), get('/api/productos?activos=1')]);
  let lotes = await cargarLotes();
  const aviso = (ctx.params[0] === 'cliente' && ctx.params[1]) ? Number(ctx.params[1]) : null;

  const st = {
    cliente: null, precios: new Map(), dep: 1, lineas: [], descuentoTxt: '', modalidad: 'contado', pagadoCents: null, entregaCents: null,
    medio: 'efectivo', vencimiento: '', obs: '', idem: idemKey(), enviando: false,
    fechaElegida: new Map(), // producto → fecha de ingreso elegida en la lista
  };

  const colProductos = h('div', { class: 'stack' });
  const colTicket = h('div', { class: 'ticket-col' });
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Nueva venta'), h('p', null, 'Elegí el cliente, de dónde sale la mercadería y sumá productos. El total se calcula solo.'))),
    h('div', { class: 'venta-grid' }, colProductos, colTicket));

  // ------------------------------------------------ Columna izquierda
  const selCliente = selectorBusqueda({
    items: clientes, etiqueta: (c) => c.nombre + (c.documento ? ` · ${c.documento}` : ''), placeholder: 'Buscar cliente por nombre o documento…',
    alElegir: async (c) => {
      st.cliente = c; st.precios = new Map(); st.entregaCents = null;
      if (c) {
        try { const lista = await get(`/api/clientes/${c.id}/precios`); st.precios = new Map(lista.map((p) => [p.producto_id, p])); } catch (e) { toast(errorMsg(e), 'error'); }
        if (c.modalidad === 'contado' && st.modalidad !== 'contado') st.modalidad = 'contado';
        // Los precios de las líneas ya cargadas pasan a ser los de este cliente
        for (const l of st.lineas) if (!l.editado) { l.precio = precioDe(l.producto, l.pres); l.lista = l.precio; }
      }
      pintarCliente(); pintarProductos(); pintarTicket();
    },
  });
  const infoCliente = h('div');
  const depSeg = segmentado([{ value: 1, label: 'Galpón' }, { value: 2, label: 'Casa' }], st.dep, (v) => { st.dep = v; pintarProductos(); pintarTicket(); }, { etiqueta: 'Depósito de salida' });
  const buscar = h('input', { class: 'input', type: 'search', placeholder: 'Buscar producto por nombre, marca o código…', 'aria-label': 'Buscar producto' });
  const listaProd = h('div', { class: 'prod-lista' });
  buscar.addEventListener('input', debounce(() => pintarProductos(), 80));

  colProductos.append(
    h('section', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', null, '1. ¿A quién le vendés?'), h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, selCliente.el),
        h('button', { class: 'btn', type: 'button', onclick: nuevoCliente }, icon('plus'), 'Nuevo'))),
      infoCliente,
      h('div', { class: 'field' }, h('label', null, '2. ¿De dónde sale la mercadería?'), depSeg)),
    h('section', { class: 'card stack' },
      h('div', { class: 'field' }, h('label', null, '3. Productos'), buscar),
      listaProd));

  function precioDe(p, pres) {
    const e = st.precios.get(p.id);
    const campoE = pres === 'caja' ? e?.especial_caja : e?.especial_unidad;
    return campoE ?? (pres === 'caja' ? p.precio_caja : p.precio_unidad);
  }
  const esEspecial = (p, pres) => { const e = st.precios.get(p.id); return (pres === 'caja' ? e?.especial_caja : e?.especial_unidad) != null; };
  const stockDep = (p) => (st.dep === 1 ? p.stock_galpon : p.stock_casa);
  const enLineas = (p) => st.lineas.filter((l) => l.producto.id === p.id).reduce((s, l) => s + l.cantidad * (l.pres === 'caja' ? p.unidades_por_caja : 1), 0);
  const fechasDe = (p) => lotes.get(`${p.id}-${st.dep}`) ?? [];
  const enLineasFecha = (p, fecha) => st.lineas.filter((l) => l.producto.id === p.id && l.fecha === fecha)
    .reduce((s, l) => s + l.cantidad * (l.pres === 'caja' ? p.unidades_por_caja : 1), 0);
  const nombreDep = () => (st.dep === 1 ? 'Galpón' : 'Casa');

  // Por qué una línea del ticket no se puede vender (o null si está bien).
  function problemaLinea(l) {
    const p = l.producto;
    if (enLineas(p) > stockDep(p)) return `Solo hay ${stockTxt(stockDep(p), p.unidades_por_caja)} en ${nombreDep()}.`;
    if (l.fecha) {
      const hay = fechasDe(p).find((f) => f.fecha === l.fecha)?.cantidad ?? 0;
      if (enLineasFecha(p, l.fecha) > hay) {
        return hay ? `Con ingreso ${fdate(l.fecha)} solo hay ${stockTxt(hay, p.unidades_por_caja)} en ${nombreDep()}.` : `En ${nombreDep()} no hay mercadería con ingreso ${fdate(l.fecha)}.`;
      }
    } else if (fechasDe(p).length > 1) return 'Falta elegir la fecha de ingreso: quitá esta línea y volvé a agregarla eligiendo la fecha.';
    return null;
  }

  function pintarCliente() {
    vaciar(infoCliente);
    const c = st.cliente;
    if (!c) return;
    infoCliente.append(h('div', { class: 'cliente-chip' },
      h('div', { class: 'row between' }, h('b', null, c.nombre), modalidadBadge(c.modalidad)),
      h('div', { class: 'small muted' }, [c.telefono, c.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'),
      c.deuda > 0 ? h('div', { class: 'small row', style: { gap: '6px' } }, importe(c.deuda, 'debe', 'debe'),
        c.vencida > 0 ? importe(c.vencida, 'vencido', 'vencido') : null,
        c.limite_credito > 0 ? h('span', { class: 'muted' }, `límite ${money(c.limite_credito)}`) : null) : null,
      c.saldo_favor > 0 ? h('div', { class: 'small' }, importe(c.saldo_favor, 'a favor', 'favor')) : null,
      st.precios.size && [...st.precios.values()].some((p) => p.especial_unidad != null || p.especial_caja != null) ? h('div', { class: 'small', style: { color: 'var(--ok)' } }, 'Se aplican sus precios especiales.') : null));
  }

  function pintarProductos() {
    const q = norm(buscar.value);
    const lista = productos.filter((p) => !q || norm(`${p.nombre} ${p.marca ?? ''} ${p.variante ?? ''} ${p.codigo ?? ''}`).includes(q));
    vaciar(listaProd);
    if (!productos.length) { listaProd.append(h('div', { class: 'empty' }, h('h3', null, 'Todavía no cargaste productos'), h('a', { class: 'btn primary', href: '#/productos' }, 'Cargar productos'))); return; }
    if (!lista.length) { listaProd.append(h('div', { class: 'muted small', style: { padding: '14px' } }, 'No hay productos con ese nombre.')); return; }
    for (const p of lista) {
      const disp = stockDep(p) - enLineas(p);
      // Si hay mercadería de varias fechas de ingreso, quien vende elige de cuál sale (de la más vieja a la más nueva).
      const fechas = fechasDe(p);
      const guardada = st.fechaElegida.get(p.id);
      const elegida = fechas.length === 1 ? fechas[0].fecha : fechas.some((f) => f.fecha === guardada) ? guardada : null;
      const dispFecha = elegida ? Math.min(disp, fechas.find((f) => f.fecha === elegida).cantidad - enLineasFecha(p, elegida)) : disp;
      const btnPres = (pres) => {
        const precio = precioDe(p, pres);
        const sin = pres === 'caja' ? dispFecha < p.unidades_por_caja : dispFecha < 1;
        const motivo = !st.cliente ? 'Primero elegí el cliente' : fechas.length > 1 && !elegida ? 'Elegí la fecha de ingreso' : sin ? 'No alcanza el stock' : '';
        return h('button', { class: 'btn sm', type: 'button', disabled: !!motivo, title: motivo, onclick: () => agregar(p, pres, elegida) },
          icon('plus'), pres === 'caja' ? `Caja ${money(precio)}` : `Unidad ${money(precio)}`);
      };
      let fechaEl = null;
      if (fechas.length > 1) {
        fechaEl = h('select', { class: 'input', style: { marginTop: '6px', maxWidth: '100%' }, 'aria-label': `Fecha de ingreso de ${nombreProducto(p)}` },
          h('option', { value: '' }, 'Elegí la fecha de ingreso…'),
          fechas.map((f) => h('option', { value: f.fecha, selected: f.fecha === elegida },
            `Ingresó ${fdate(f.fecha)} · quedan ${stockTxt(Math.max(f.cantidad - enLineasFecha(p, f.fecha), 0), p.unidades_por_caja)}`)));
        fechaEl.addEventListener('change', () => { st.fechaElegida.set(p.id, fechaEl.value); pintarProductos(); });
      } else if (elegida) fechaEl = h('div', { class: 'st' }, `Ingresó ${fdate(elegida)}`);
      listaProd.append(h('div', { class: 'prod-item', style: { cursor: 'default' } },
        h('div', null, h('div', { class: 'n' }, nombreProducto(p)),
          h('div', { class: 'st' }, `${nombreDep()}: `, h('b', { style: disp <= 0 ? { color: 'var(--bad)' } : {} }, disp <= 0 ? 'sin stock' : stockTxt(disp, p.unidades_por_caja)),
            ` · caja de ${p.unidades_por_caja}`, (esEspecial(p, 'caja') || esEspecial(p, 'unidad')) ? ' · precio especial' : ''),
          fechaEl),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '6px' } }, btnPres('caja'), btnPres('unidad'))));
    }
  }

  function agregar(p, pres, fecha) {
    const ex = st.lineas.find((l) => l.producto.id === p.id && l.pres === pres && l.fecha === fecha);
    if (ex) ex.cantidad += 1;
    else { const pr = precioDe(p, pres); st.lineas.push({ producto: p, pres, fecha, cantidad: 1, precio: pr, lista: pr, editado: false }); }
    pintarProductos(); pintarTicket();
  }

  async function nuevoCliente() {
    const r = await formModal({
      titulo: 'Nuevo cliente', textoOk: 'Crear y elegir',
      campos: [
        { name: 'nombre', label: 'Nombre o razón social', required: true, full: true, autofocus: true },
        { name: 'telefono', label: 'Teléfono' },
        { name: 'modalidad', label: 'Modalidad de pago', type: 'select', value: 'contado', options: [{ value: 'contado', label: 'Contado' }, { value: 'fiado', label: 'Fiado' }, { value: 'ambas', label: 'Contado y fiado' }] },
      ],
      onSubmit: (v) => post('/api/clientes', v),
    });
    if (r) { clientes.push(r); selCliente.set(r); toast('Cliente creado.'); }
  }

  // ----------------------------------------------------- Ticket (derecha)
  const calc = () => {
    const subtotal = st.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    let desc = 0; const t = st.descuentoTxt.trim();
    if (t) {
      if (t.endsWith('%')) { const bp = parseMoney(t.slice(0, -1)); desc = Number.isNaN(bp) ? 0 : Math.round((subtotal * bp) / 10000); }
      else { const c = parseMoney(t); desc = Number.isNaN(c) ? 0 : c; }
    }
    desc = Math.min(Math.max(desc, 0), subtotal);
    const total = subtotal - desc;
    let pagado = st.modalidad === 'contado' ? total : st.modalidad === 'fiado' ? 0 : Math.min(Math.max(st.pagadoCents ?? 0, 0), total);
    // Entrega para la deuda vieja: solo si paga la venta completa y el cliente debe algo
    const deuda = st.cliente?.deuda ?? 0;
    const entrega = st.modalidad === 'contado' && deuda > 0 ? Math.max(st.entregaCents ?? 0, 0) : 0;
    return { subtotal, desc, total, pagado, pendiente: total - pagado, deuda, entrega };
  };

  let refs = {};
  function pintarTicket() {
    vaciar(colTicket); refs = {};
    const lineasEl = h('div');
    const exceso = [];
    if (!st.lineas.length) lineasEl.append(h('div', { class: 't-vacio' }, icon('vender'), h('div', null, st.cliente ? 'Sumá productos desde la lista.' : 'Elegí un cliente para empezar.')));
    st.lineas.forEach((l, i) => {
      const p = l.producto;
      const problema = problemaLinea(l);
      if (problema) exceso.push(p.nombre);
      const inputQty = h('input', { class: 'input qty numero', type: 'number', min: 1, step: 1, value: l.cantidad, 'aria-label': 'Cantidad' });
      const inputPrecio = campoDinero(l.precio, { class: 'input money precio', 'aria-label': 'Precio' });
      const sub = h('div', { class: 'imp' }, money(l.precio * l.cantidad));
      const mod = h('span', { class: 'mod' }, l.precio !== l.lista ? 'precio modificado' : '');
      const ref = { sub, mod };
      refs[i] = ref;
      inputQty.addEventListener('input', () => { const v = Math.floor(Number(inputQty.value)); if (v >= 1) { l.cantidad = v; sub.textContent = money(l.precio * l.cantidad); actualizarTotales(); } });
      inputQty.addEventListener('change', () => { pintarProductos(); pintarTicket(); });
      inputPrecio.addEventListener('input', () => {
        const c = inputPrecio.cents();
        if (c === null || Number.isNaN(c)) return;
        l.precio = c; l.editado = c !== l.lista; mod.textContent = l.precio !== l.lista ? 'precio modificado' : '';
        sub.textContent = money(l.precio * l.cantidad); actualizarTotales();
      });
      lineasEl.append(h('div', { class: 't-linea' },
        h('div', { class: 'nom' }, nombreProducto(p), l.fecha ? h('div', { class: 'small muted' }, `Ingreso ${fdate(l.fecha)}`) : null), sub,
        h('div', { class: 'ctl' },
          h('span', { class: 'stepper' }, h('button', { type: 'button', 'aria-label': 'Menos', onclick: () => { if (l.cantidad > 1) l.cantidad--; else st.lineas.splice(i, 1); pintarProductos(); pintarTicket(); } }, '−'),
            inputQty, h('button', { type: 'button', 'aria-label': 'Más', onclick: () => { l.cantidad++; pintarProductos(); pintarTicket(); } }, '+')),
          badge(l.pres === 'caja' ? `caja ×${p.unidades_por_caja}` : 'unidad'), h('span', { class: 'muted small' }, 'a'), inputPrecio, mod,
          h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Quitar', onclick: () => { st.lineas.splice(i, 1); pintarProductos(); pintarTicket(); } }, icon('x'))),
        problema ? h('div', { class: 'small', style: { gridColumn: '1 / -1', color: 'var(--bad)', fontWeight: 650 } }, problema) : null));
    });

    const desc = h('input', { class: 'input money', type: 'text', inputMode: 'decimal', placeholder: '0  ó  10%', value: st.descuentoTxt, 'aria-label': 'Descuento' });
    desc.addEventListener('input', () => { st.descuentoTxt = desc.value; actualizarTotales(); });
    refs.sub = h('span'); refs.desc = h('span'); refs.total = h('div', { class: 'v' }); refs.resumenPago = h('div', { class: 'small muted' }); refs.btn = h('button', { class: 'btn primary lg block', type: 'button', onclick: confirmarVenta });

    const puedeFiar = st.cliente && st.cliente.modalidad !== 'contado';
    const modSeg = h('div', { class: 'seg fill', role: 'group', 'aria-label': 'Modalidad de pago' },
      ...[['contado', 'Contado'], ['fiado', 'Fiado'], ['mixto', 'Paga una parte']].map(([v, t]) => h('button', {
        type: 'button', 'aria-pressed': String(st.modalidad === v), disabled: v !== 'contado' && !puedeFiar,
        title: v !== 'contado' && !puedeFiar ? (st.cliente ? 'Este cliente es de contado. Cambiale la modalidad en su ficha para fiarle.' : 'Primero elegí el cliente') : '',
        onclick: () => { st.modalidad = v; if (v === 'mixto' && st.pagadoCents === null) st.pagadoCents = 0; pintarTicket(); } }, t)));

    const filaPago = [];
    if (st.modalidad === 'mixto') {
      const pg = campoDinero(st.pagadoCents, { 'aria-label': 'Paga ahora' });
      pg.addEventListener('input', () => { const c = pg.cents(); st.pagadoCents = Number.isNaN(c) ? 0 : c ?? 0; actualizarTotales(); });
      filaPago.push(campo('Paga ahora', pg));
    }
    if (st.modalidad === 'contado' && st.cliente?.deuda > 0) {
      const en = campoDinero(st.entregaCents, { 'aria-label': 'Además entrega para su deuda' });
      en.addEventListener('input', () => { const c = en.cents(); st.entregaCents = Number.isNaN(c) ? null : c; actualizarTotales(); });
      refs.entregaHint = h('div', { class: 'hint' });
      filaPago.push(h('div', { class: 'field entrega-deuda' },
        h('label', { for: (en.id = 'entrega-deuda', en.id) }, 'Además entrega para su deuda (opcional)'),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'grow' }, en),
          h('button', { class: 'btn', type: 'button', title: `Toda la deuda: ${money(st.cliente.deuda)}`, onclick: () => en.setCents(st.cliente.deuda) }, 'Toda'),
          h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Borrar entrega', onclick: () => en.setCents(null) }, icon('x'))),
        refs.entregaHint));
    }
    const medioSel = h('select', { class: 'input', 'aria-label': 'Medio de pago' }, ['efectivo', 'transferencia', 'otro'].map((m) => h('option', { value: m, selected: st.medio === m }, etiquetaMedio[m])));
    medioSel.addEventListener('change', () => { st.medio = medioSel.value; });
    refs.medioWrap = h('div', null, campo('Cómo paga lo cobrado ahora', medioSel));
    const venc = h('input', { class: 'input', type: 'date', value: st.vencimiento, min: hoyISO() });
    venc.addEventListener('input', () => { st.vencimiento = venc.value; });
    refs.vencWrap = h('div', null, campo('Fecha de vencimiento (opcional)', venc, { hint: st.cliente?.plazo_dias ? `Si la dejás vacía se usan ${st.cliente.plazo_dias} días de plazo.` : 'Si la dejás vacía, la deuda no vence.' }));
    const obs = h('input', { class: 'input', placeholder: 'Observaciones (opcional)', value: st.obs, maxLength: 300, 'aria-label': 'Observaciones' });
    obs.addEventListener('input', () => { st.obs = obs.value; });

    colTicket.append(
      h('div', { class: 'ticket' },
        h('div', { class: 'ticket-head' }, h('b', null, 'Ticket'), h('span', { class: 'small muted' }, st.cliente ? st.cliente.nombre : 'sin cliente')),
        lineasEl,
        h('div', { style: { paddingTop: '8px' } },
          h('div', { class: 't-sub' }, h('span', null, 'Subtotal'), refs.sub),
          h('div', { class: 't-sub', style: { alignItems: 'center' } }, h('label', { for: 'desc-in' }, 'Descuento'), h('div', { style: { width: '130px' } }, (desc.id = 'desc-in', desc)))),
        h('div', { class: 't-total' }, h('span', { class: 'lbl' }, 'TOTAL'), refs.total),
        refs.resumenPago),
      h('div', { class: 'card stack', style: { padding: '14px' } },
        h('div', { class: 'field' }, h('label', null, '4. ¿Cómo paga?'), modSeg),
        ...filaPago, refs.medioWrap, refs.vencWrap, obs,
        h('div', { class: 'sticky-confirm' }, refs.btn)));
    actualizarTotales();
    refs.exceso = exceso;
    refs.btn.disabled = !puedeConfirmar();
  }

  function puedeConfirmar() {
    const t = calc();
    return !!st.cliente && st.lineas.length > 0 && t.total > 0 && !st.enviando && !st.lineas.some(problemaLinea);
  }

  function actualizarTotales() {
    const t = calc();
    refs.sub.textContent = money(t.subtotal);
    refs.total.textContent = money(t.total);
    st.lineas.forEach((l, i) => { if (refs[i]) refs[i].sub.textContent = money(l.precio * l.cantidad); });
    refs.resumenPago.textContent = !st.lineas.length ? '' : t.pendiente > 0 ? `Cobra ahora ${money(t.pagado)} · queda debiendo ${money(t.pendiente)}`
      : t.entrega > 0 ? `Cobra ${money(t.total + t.entrega)} ahora: ${money(t.total)} de esta venta + ${money(t.entrega)} para la deuda` : `Cobra ${money(t.total)} ahora`;
    if (refs.entregaHint) {
      refs.entregaHint.textContent = !t.entrega ? `Debe ${money(t.deuda)}. Se descuenta de lo más viejo primero.`
        : t.entrega < t.deuda ? `Debe ${money(t.deuda)} → después de esta entrega queda debiendo ${money(t.deuda - t.entrega)}.`
        : t.entrega === t.deuda ? 'Cancela toda la deuda.'
        : `Cancela toda la deuda y le quedan ${money(t.entrega - t.deuda)} a favor para la próxima compra.`;
    }
    refs.medioWrap.hidden = t.pagado <= 0; refs.vencWrap.hidden = t.pendiente <= 0;
    refs.btn.replaceChildren(icon('check'), t.entrega > 0 ? `Confirmar · cobra ${money(t.total + t.entrega)}` : `Confirmar venta · ${money(t.total)}`);
    refs.btn.disabled = !puedeConfirmar();
  }

  async function confirmarVenta(forzar = false) {
    const t = calc();
    if (!puedeConfirmar()) return;
    if (st.modalidad === 'mixto' && (t.pagado <= 0 || t.pagado >= t.total)) { toast('En "Paga una parte" el importe tiene que ser mayor a cero y menor al total.', 'warn'); return; }
    st.enviando = true; refs.btn.disabled = true; refs.btn.textContent = 'Guardando…';
    const cuerpo = {
      idem_key: st.idem, cliente_id: st.cliente.id, deposito_id: st.dep, modalidad_pago: st.modalidad, medio: st.medio,
      descuento: t.desc, observaciones: st.obs || undefined, vencimiento: t.pendiente > 0 && st.vencimiento ? st.vencimiento : undefined,
      pagado: st.modalidad === 'mixto' ? t.pagado : undefined, entrega_deuda: t.entrega > 0 ? t.entrega : undefined, deuda_vista: t.entrega > 0 ? t.deuda : undefined, forzar_limite: forzar === true ? true : undefined,
      lineas: st.lineas.map((l) => ({ producto_id: l.producto.id, presentacion: l.pres, cantidad: l.cantidad, precio: l.editado ? l.precio : undefined, fecha_ingreso: l.fecha || undefined })),
    };
    try {
      const r = await post('/api/ventas', cuerpo);
      st.enviando = false;
      await mostrarResumen(r.venta);
    } catch (e) {
      st.enviando = false;
      if (e instanceof ApiError && e.code === 'LIMITE_CREDITO') {
        const ok = await confirmar({ titulo: 'Supera el límite de crédito', mensaje: e.message, textoOk: 'Vender igual', peligro: true });
        if (ok) return confirmarVenta(true);
      } else if (e instanceof ApiError && e.code === 'DEUDA_CAMBIO') {
        // Se actualiza la deuda mostrada para que la persona revise la entrega con el número correcto
        toast(e.message, 'warn');
        try { const cl = await get('/api/clientes?activos=1'); clientes.splice(0, clientes.length, ...cl); const c = clientes.find((x) => x.id === st.cliente.id); if (c) { st.cliente = c; pintarCliente(); pintarTicket(); return; } } catch { /* queda el aviso */ }
      } else toast(errorMsg(e), 'error');
      actualizarTotales();
    }
  }

  async function mostrarResumen(v) {
    toast(`Venta N° ${v.numero} registrada.`);
    // Se refrescan stock y deudas para la próxima venta
    const [cl, pr, lt] = await Promise.all([get('/api/clientes?activos=1'), get('/api/productos?activos=1'), cargarLotes()]);
    clientes.splice(0, clientes.length, ...cl); productos.splice(0, productos.length, ...pr); lotes = lt;
    const m = modal({
      titulo: `Venta N° ${v.numero} registrada`, tamano: '',
      contenido: h('div', { class: 'stack' },
        h('div', { class: 'row between' }, h('b', null, v.cliente), modalidadBadge(v.modalidad_pago)),
        h('div', { class: 'small muted' }, `${fdt(v.fecha)} · sale de ${v.deposito}`),
        h('div', { class: 'lista-simple' }, v.lineas.map((l) => h('div', null, h('span', null, `${l.cantidad} ${l.presentacion === 'caja' ? (l.cantidad === 1 ? 'caja' : 'cajas') : 'u.'} · ${nombreProducto(l)}${l.fecha_ingreso ? ` (ingreso ${fdate(l.fecha_ingreso)})` : ''}`), h('b', { class: 'num' }, money(l.subtotal))))),
        v.descuento > 0 ? h('div', { class: 'row between' }, h('span', null, 'Descuento'), h('b', { class: 'num' }, `− ${money(v.descuento)}`)) : null,
        h('div', { class: 'row between' }, h('b', null, 'Total'), h('b', { class: 'num', style: { fontSize: '1.4rem' } }, money(v.total))),
        h('div', { class: 'row between' }, h('span', null, v.entrega_deuda > 0 ? 'Cobrado por esta venta' : 'Cobrado'), h('b', { class: 'num' }, money(v.pagado))),
        v.entrega_deuda > 0 ? h('div', { class: 'row between' }, h('span', null, 'Entregó para su deuda'), h('b', { class: 'num' }, money(v.entrega_deuda))) : null,
        v.entrega_deuda > 0 ? h('div', { class: 'row between' }, h('b', null, 'Recibido en total'), h('b', { class: 'num' }, money(v.pagado + v.entrega_deuda))) : null,
        v.entrega_deuda > 0 ? h('div', { class: 'small muted' }, v.entregas_deuda.flatMap((p) => [...p.aplicaciones.map((a) => `${a.tipo === 'saldo_inicial' ? 'Deuda anterior' : `Venta N° ${a.numero}`}: ${money(a.monto)}`), ...(p.a_favor > 0 ? [`A favor: ${money(p.a_favor)}`] : [])]).join(' · ')) : null,
        v.saldo > 0 ? h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, `Queda a deber ${money(v.saldo)}${v.vencimiento ? ` · vence el ${v.vencimiento.split('-').reverse().join('/')}` : ''}.`)) : null,
        v.saldo_posterior != null ? h('div', { class: 'row between' }, h('span', null, 'Saldo de la cuenta del cliente'),
          h('b', { class: 'num' }, v.saldo_posterior > 0 ? `Debe ${money(v.saldo_posterior)}` : v.saldo_posterior < 0 ? `A favor ${money(-v.saldo_posterior)}` : 'Sin deuda')) : null,
        h('div', { class: 'small muted' }, 'Comprobante interno de gestión. No es una factura fiscal.')),
      pie: [
        h('button', { class: 'btn', type: 'button', onclick: () => compartirComprobante(v.id) }, icon('compartir'), 'Compartir'),
        h('button', { class: 'btn', type: 'button', onclick: () => verComprobante(v.id) }, icon('ver'), 'Ver comprobante'),
        h('a', { class: 'btn', href: '#/ventas', onclick: () => m.cerrar() }, 'Ver ventas'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => m.cerrar() }, 'Nueva venta'),
      ],
      alCerrar: reiniciar,
    });
  }

  function reiniciar() {
    st.lineas = []; st.descuentoTxt = ''; st.modalidad = 'contado'; st.pagadoCents = null; st.entregaCents = null; st.vencimiento = ''; st.obs = ''; st.idem = idemKey(); st.enviando = false;
    const actual = st.cliente && clientes.find((c) => c.id === st.cliente.id);
    st.cliente = actual || null; if (actual) selCliente.set(actual);
    pintarCliente(); pintarProductos(); pintarTicket();
  }

  pintarProductos(); pintarTicket();
  if (aviso) { const c = clientes.find((x) => x.id === aviso); if (c) selCliente.set(c); }
  else selCliente.input.focus();
}
