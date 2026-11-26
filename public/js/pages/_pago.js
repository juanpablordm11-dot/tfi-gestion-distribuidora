// Registrar un cobro: pagos parciales, reparto entre deudas, excedente con decisión explícita y comprobante.
import { get, post, ApiError } from '../api.js';
import { h, icon, vaciar, money, moneyFull, fdt, fdate, badge, modal, campo, campoDinero, selectorBusqueda, segmentado, toast, errorMsg, idemKey, etiquetaMedio, cargando, importe as importeTxt, nroVenta, nroCorto } from '../ui.js';

// opciones: { clienteId?, ventaId?, alHacer? }
export async function abrirCobro({ clienteId = null, ventaId = null, alHacer = () => {} } = {}) {
  let clientes = [];
  try { clientes = await get('/api/clientes?activos='); } catch (e) { toast(errorMsg(e), 'error'); return; }
  let cliente = clientes.find((c) => c.id === clienteId) || null;
  let abiertas = []; let saldo = null; let modo = ventaId ? 'elegir' : 'auto'; let idem = idemKey(); let enviando = false;
  const reparto = new Map(); // venta_id → input de dinero

  const error = h('div', { class: 'alert bad', hidden: true, role: 'alert' });
  const zona = h('div', { class: 'stack' });
  const importe = campoDinero(null, { 'aria-label': 'Importe recibido', placeholder: '0' });
  const medio = h('select', { class: 'input', 'aria-label': 'Medio de pago' }, ['efectivo', 'transferencia', 'otro'].map((x) => h('option', { value: x }, etiquetaMedio[x])));
  const nota = h('input', { class: 'input', placeholder: 'Nota (opcional)', maxLength: 200, 'aria-label': 'Nota' });
  const preview = h('div', { class: 'small' });
  const sel = selectorBusqueda({ items: clientes, etiqueta: (c) => c.nombre + (c.deuda > 0 ? ` · debe ${money(c.deuda)}` : ''), placeholder: 'Buscar cliente…', alElegir: (c) => { cliente = c; if (c) cargarDeudas(); else pintar(); } });
  const btnOk = h('button', { class: 'btn primary', type: 'button', onclick: () => enviar() }, icon('check'), 'Registrar cobro');

  const m = modal({
    titulo: 'Registrar cobro', tamano: 'wide',
    contenido: h('div', { class: 'stack' }, error, clienteId ? null : campo('Cliente', sel.el), zona),
    pie: [h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cancelar'), btnOk],
  });

  async function cargarDeudas() {
    vaciar(zona).append(cargando());
    try {
      const r = await get(`/api/clientes/${cliente.id}/deudas`);
      abiertas = r.abiertas; saldo = r.saldo;
    } catch (e) { error.textContent = errorMsg(e); error.hidden = false; return; }
    reparto.clear(); importe.value = '';
    pintar();
  }

  const sumaReparto = () => [...reparto.values()].reduce((s, i) => s + (i.cents() > 0 ? i.cents() : 0), 0);
  const montoActual = () => { const c = importe.cents(); return Number.isNaN(c) || c === null ? 0 : c; };

  function actualizarPreview() {
    if (!cliente) { preview.textContent = ''; return; }
    const monto = montoActual();
    const aplicado = modo === 'elegir' ? Math.min(sumaReparto(), monto || sumaReparto()) : Math.min(monto, saldo.deuda);
    const resto = saldo.deuda - aplicado;
    const sobra = modo === 'elegir' ? monto - sumaReparto() : monto - saldo.deuda;
    vaciar(preview).append(
      monto > 0 ? h('div', null, `Después de este cobro, ${cliente.nombre} queda debiendo `, h('b', null, money(Math.max(resto, 0))), '.') : '',
      sobra > 0 && monto > 0 ? h('div', { style: { color: 'var(--warn)', fontWeight: 650 } }, `Atención: sobran ${money(sobra)}. Al confirmar vas a elegir qué hacer con ese excedente.`) : '');
  }

  function pintar() {
    vaciar(zona);
    if (!cliente) { zona.append(h('div', { class: 'muted' }, 'Elegí el cliente que te está pagando.')); return; }
    zona.append(h('div', { class: 'cliente-chip' }, h('div', { class: 'row between' }, h('b', null, cliente.nombre), saldo.deuda > 0 ? importeTxt(saldo.deuda, 'debe', 'debe') : h('span', { class: 'etq favor' }, 'sin deuda')),
      saldo.vencida > 0 ? h('div', { class: 'small' }, 'De eso, ya vencido: ', importeTxt(saldo.vencida, 'vencido', 'vencido')) : null,
      saldo.saldo_favor > 0 ? h('div', { class: 'small' }, 'Tiene ', importeTxt(saldo.saldo_favor, 'a favor', 'favor')) : null));
    if (!abiertas.length) {
      zona.append(h('div', { class: 'alert' }, icon('info'), h('div', null, 'Este cliente no tiene deudas pendientes. Si te paga igual, el importe podés guardarlo como saldo a favor.')));
    }
    const rapido = h('div', { class: 'row' },
      h('button', { class: 'btn sm', type: 'button', disabled: !saldo.deuda, onclick: () => { importe.setCents(saldo.deuda); if (modo === 'elegir') for (const v of abiertas) reparto.get(v.id)?.setCents(v.saldo); actualizarPreview(); } }, `Pagar todo (${money(saldo.deuda)})`));
    if (abiertas.length > 1 || ventaId) {
      zona.append(segmentado([{ value: 'auto', label: 'Las deudas más viejas primero' }, { value: 'elegir', label: 'Elegir cuáles pago' }], modo, (v) => { modo = v; pintar(); }, { etiqueta: 'Cómo se aplica' }));
    }
    if (modo === 'elegir' && abiertas.length) {
      reparto.clear();
      const filas = abiertas.map((v) => {
        const inp = campoDinero(ventaId === v.id ? v.saldo : null, { 'aria-label': `Pagar de ${nroVenta(v.numero)}`, placeholder: '0' });
        reparto.set(v.id, inp);
        inp.addEventListener('input', () => { importe.setCents(sumaReparto() || null); });
        return h('div', { class: 't-linea', style: { gridTemplateColumns: '1fr 150px', alignItems: 'center' } },
          h('div', null, h('b', null, nroVenta(v.numero)), h('div', { class: 'small muted' }, `${fdate(v.fecha)} · total ${money(v.total)} · pagado ${money(v.pagado)}${v.vencimiento ? ` · vence ${fdate(v.vencimiento)}` : ''}`),
            h('div', { class: 'small' }, 'Debe ', h('b', null, money(v.saldo)))), inp);
      });
      zona.append(h('div', { class: 'card', style: { padding: '8px 14px' } }, filas));
      if (ventaId) importe.setCents(sumaReparto() || null);
    } else if (abiertas.length) {
      zona.append(h('div', { class: 'small muted' }, `Se aplica primero a la deuda más vieja: ${abiertas.map((v) => `${nroCorto(v.numero)} (${money(v.saldo)})`).slice(0, 4).join(', ')}${abiertas.length > 4 ? '…' : ''}`));
    }
    zona.append(h('div', { class: 'form-grid' },
      campo(modo === 'elegir' ? 'Importe recibido (se completa con lo que elijas)' : 'Importe recibido', importe), campo('Medio de pago', medio)),
      rapido, nota, preview);
    actualizarPreview();
    importe.oninput = actualizarPreview;
    setTimeout(() => importe.focus(), 30);
  }

  async function enviar(excedente) {
    if (enviando) return;
    error.hidden = true;
    if (!cliente) { error.textContent = 'Elegí el cliente.'; error.hidden = false; return; }
    const monto = montoActual();
    if (!(monto > 0)) { error.textContent = 'Ingresá un importe mayor a cero.'; error.hidden = false; importe.focus(); return; }
    if (Number.isNaN(importe.cents())) { error.textContent = 'El importe no es válido.'; error.hidden = false; return; }
    const cuerpo = { idem_key: idem, cliente_id: cliente.id, monto, medio: medio.value, nota: nota.value.trim() || undefined, excedente: typeof excedente === 'string' ? excedente : undefined };
    if (modo === 'elegir') {
      cuerpo.aplicar = [...reparto.entries()].map(([venta_id, i]) => ({ venta_id, monto: i.cents() })).filter((a) => a.monto > 0);
      if (!cuerpo.aplicar.length && saldo.deuda > 0) { error.textContent = 'Indicá cuánto pagás de cada deuda.'; error.hidden = false; return; }
    }
    enviando = true; btnOk.disabled = true;
    try {
      const r = await post('/api/pagos', cuerpo);
      m.cerrar(); toast('Cobro registrado.'); comprobante(r); alHacer(r);
    } catch (e) {
      enviando = false; btnOk.disabled = false;
      if (e instanceof ApiError && e.code === 'EXCEDENTE') return decidirExcedente(e.extra.excedente);
      error.textContent = errorMsg(e); error.hidden = false;
    }
  }

  function decidirExcedente(sobra) {
    const d = modal({
      titulo: 'Sobra plata: ¿qué hacemos?', bloquear: false,
      contenido: h('div', { class: 'stack' }, h('p', null, `El importe es ${money(sobra)} mayor a lo que ${cliente.nombre} debe. Elegí cómo registrarlo:`),
        h('div', { class: 'alert' }, icon('info'), h('div', null, h('b', null, 'Doy vuelto: '), `se registra solo lo que corresponde a la deuda y la caja suma esa cifra.`)),
        h('div', { class: 'alert' }, icon('info'), h('div', null, h('b', null, 'Saldo a favor: '), `se registra todo el importe y ${money(sobra)} quedan como crédito del cliente para sus próximas compras.`))),
      pie: [
        h('button', { class: 'btn', type: 'button', onclick: () => d.cerrar() }, 'Volver'),
        h('button', { class: 'btn', type: 'button', onclick: () => { d.cerrar(); enviar('vuelto'); } }, 'Doy vuelto'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => { d.cerrar(); enviar('saldo_a_favor'); } }, 'Guardar como saldo a favor'),
      ],
    });
  }

  if (cliente) { sel.set(cliente); sel.input.disabled = true; await cargarDeudas(); } else pintar();
}

function comprobante(r) {
  const p = r.pago;
  const m = modal({
    titulo: 'Cobro registrado',
    contenido: h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('b', null, p.cliente), h('span', { class: 'small muted' }, fdt(p.fecha))),
      h('div', { class: 'row between' }, h('span', null, 'Importe recibido'), h('b', { class: 'num', style: { fontSize: '1.5rem' } }, money(p.monto))),
      h('div', { class: 'small muted' }, `Medio: ${etiquetaMedio[p.medio]}${p.nota ? ` · ${p.nota}` : ''}`),
      r.aplicaciones.length ? h('div', { class: 'lista-simple' }, r.aplicaciones.map((a) => h('div', null, h('span', null, `Aplicado a: ${nroVenta(a.numero)}`), h('b', { class: 'num' }, money(a.monto))))) : null,
      r.saldo_a_favor_generado > 0 ? h('div', { class: 'alert' }, icon('info'), h('div', null, `Quedan ${money(r.saldo_a_favor_generado)} como saldo a favor del cliente.`)) : null,
      h('div', { class: 'row between' }, h('span', null, 'Saldo que sigue debiendo'), r.cliente_saldo.deuda > 0 ? importeTxt(r.cliente_saldo.deuda, 'debe', 'debe') : h('span', { class: 'etq favor' }, 'sin deuda')),
      h('div', { class: 'small muted' }, 'Comprobante interno de gestión. No es una factura fiscal.')),
    pie: [
      h('button', { class: 'btn', type: 'button', onclick: () => { document.body.classList.add('imprimiendo'); window.print(); setTimeout(() => document.body.classList.remove('imprimiendo'), 300); } }, icon('imprimir'), 'Imprimir'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => m.cerrar() }, 'Listo'),
    ],
  });
}
