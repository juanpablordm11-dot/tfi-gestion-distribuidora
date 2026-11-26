// Detalle de una venta (compartido por Ventas, Deudas y Clientes) y su anulación controlada.
import { get, post } from '../api.js';
import { h, icon, money, moneyFull, pct, fdt, fdate, badge, estadoBadge, modalidadBadge, modal, formModal, confirmar, nombreProducto, toast, errorMsg, etiquetaMedio, dataTable, importe, nroVenta } from '../ui.js';
import { app, esAdmin } from '../app.js';
import { abrirCobro } from './_pago.js';
import { compartirComprobante, verComprobante } from '../comprobante.js';

export async function verVenta(id, alCambiar = () => {}) {
  let v;
  try { v = await get(`/api/ventas/${id}`); } catch (e) { toast(errorMsg(e), 'error'); return; }
  const anulada = v.estado === 'anulada';
  const esSI = v.tipo === 'saldo_inicial'; // deuda de antes del sistema: no es una venta
  const cuerpo = h('div', { class: 'stack' },
    h('div', { class: 'row between' },
      h('div', null, h('b', { style: { fontSize: '1.1rem' } }, v.cliente), h('div', { class: 'small muted' }, esSI ? `Deuda de antes del sistema · fecha ${fdate(v.fecha)}${v.usuario ? ` · cargada por ${v.usuario}` : ''}` : `${fdt(v.fecha)} · sale de ${v.deposito}${v.usuario ? ` · ${v.usuario}` : ''}`)),
      h('div', { class: 'row' }, esSI ? badge('Saldo inicial', 'info') : modalidadBadge(v.modalidad_pago), anulada ? estadoBadge.anulada() : estadoBadge[v.estado_deuda]?.())),
    anulada ? h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, h('b', null, 'Venta anulada'), ` el ${fdt(v.anulada_fecha)}${v.anulada_por_nombre ? ` por ${v.anulada_por_nombre}` : ''}. Motivo: ${v.anulada_motivo}. El stock volvió al depósito y la deuda se canceló; el registro se conserva.`)) : null,
    esSI ? h('div', { class: 'alert' }, icon('info'), h('div', null, 'Es lo que el cliente ya debía al empezar a usar el sistema. No es una venta: no tiene productos, no cuenta en ventas ni ganancias y no movió el stock ni la caja. Se cobra como cualquier otra deuda.')) : null,
    esSI ? null : h('div', { class: 'table-wrap card flush' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Producto', 'Cantidad', 'Precio', 'Subtotal', ...(esAdmin() ? ['Costo', 'Ganancia'] : [])].map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
      h('tbody', null, v.lineas.map((l) => h('tr', null,
        h('td', null, nombreProducto(l), l.fecha_ingreso ? h('div', { class: 'small muted' }, `Ingreso ${fdate(l.fecha_ingreso)}`) : null),
        h('td', { class: 'num' }, `${l.cantidad} ${l.presentacion === 'caja' ? (l.cantidad === 1 ? 'caja' : 'cajas') : 'u.'}`, l.presentacion === 'caja' ? h('div', { class: 'small muted' }, `${l.unidades} u.`) : null),
        h('td', { class: 'num' }, money(l.precio), l.precio !== l.precio_lista ? h('div', { class: 'small muted' }, h('span', { class: 'etq debe' }, 'modificado'), ` lista ${money(l.precio_lista)}`) : null),
        h('td', { class: 'num' }, money(l.subtotal), l.descuento_asignado ? h('div', { class: 'small muted' }, `− ${money(l.descuento_asignado)}`) : null),
        esAdmin() ? h('td', { class: 'num muted' }, money(l.costo_total)) : null,
        esAdmin() ? h('td', { class: 'num' }, importe(l.ganancia, l.ganancia < 0 ? 'pérdida' : null, 'vencido')) : null))))),
    h('div', { class: 'grid c2' },
      h('div', { class: 'lista-simple' },
        v.descuento > 0 ? h('div', null, h('span', null, 'Descuento'), h('b', { class: 'num' }, `− ${money(v.descuento)}`)) : null,
        h('div', null, h('b', null, 'Total'), h('b', { class: 'num' }, money(v.total))),
        h('div', null, h('span', null, 'Cobrado'), h('b', { class: 'num' }, money(anulada ? 0 : v.pagado))),
        h('div', null, h('span', null, 'Saldo pendiente'), importe(anulada ? 0 : v.saldo, !anulada && v.saldo > 0 ? 'debe' : null, 'debe')),
        v.vencimiento && !anulada && v.saldo > 0 ? h('div', null, h('span', null, 'Vence'), h('b', null, fdate(v.vencimiento))) : null,
        ...(v.entregas_deuda ?? []).map((p) => h('div', { style: p.anulado ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : {} },
          h('span', null, `Además entregó para su deuda${p.anulado ? ' (cobro anulado)' : ''}`, h('div', { class: 'small muted' },
            [...p.aplicaciones.map((a) => `${a.tipo === 'saldo_inicial' ? 'Deuda anterior' : nroVenta(a.numero)}: ${money(a.monto)}`), ...(p.a_favor > 0 ? [`a favor: ${money(p.a_favor)}`] : [])].join(' · '))),
          h('b', { class: 'num' }, money(p.monto))))),
      esSI ? h('div', { class: 'lista-simple' }, v.observaciones ? h('div', null, h('span', null, 'Observaciones'), h('span', null, v.observaciones)) : null) : h('div', { class: 'lista-simple' },
        // La ganancia es información del dueño: el empleado no la ve (y el servidor tampoco se la manda).
        esAdmin() ? h('div', null, h('span', null, 'Ganancia bruta'), h('b', { class: 'num' }, money(v.ganancia))) : null,
        esAdmin() ? h('div', null, h('span', null, 'Margen sobre la venta'), h('b', { class: 'num' }, pct(v.margen_pct))) : null,
        esAdmin() ? h('div', null, h('span', null, 'Ganancia sobre el costo'), h('b', { class: 'num' }, pct(v.recargo_pct))) : null,
        v.observaciones ? h('div', null, h('span', null, 'Observaciones'), h('span', null, v.observaciones)) : null)),
    v.pagos.length ? h('div', null, h('h3', { style: { marginBottom: '6px' } }, 'Pagos recibidos'),
      h('div', { class: 'lista-simple' }, v.pagos.map((p) => h('div', { style: p.anulada || p.anulado ? { color: 'var(--ink-3)', textDecoration: 'line-through' } : {} },
        h('span', null, `${fdt(p.fecha)} · ${etiquetaMedio[p.medio]}${p.origen === 'venta' ? ' · al vender' : ''}${p.anulada ? ' · desvinculado' : ''}`), h('b', { class: 'num' }, money(p.monto)))))) : null,
    h('div', { class: 'small muted' }, esSI ? 'Saldo inicial de cuenta corriente.' : `${nroVenta(v.numero)}. Comprobante interno de gestión, no es una factura fiscal.`));

  const pie = [];
  if (!esSI) pie.push(h('button', { class: 'btn', type: 'button', onclick: () => compartirComprobante(v.id) }, icon('compartir'), 'Compartir'),
    h('button', { class: 'btn', type: 'button', onclick: () => verComprobante(v.id) }, icon('ver'), 'Ver comprobante'));
  if (!anulada && v.saldo > 0) pie.push(h('button', { class: 'btn primary', type: 'button', onclick: () => { m.cerrar(); abrirCobro({ clienteId: v.cliente_id, ventaId: v.id, alHacer: alCambiar }); } }, icon('deudas'), 'Cobrar'));
  if (!anulada && app.usuario.rol === 'admin') pie.push(h('button', { class: 'btn danger', type: 'button', onclick: () => anular(v, () => { m.cerrar(); alCambiar(); }) }, esSI ? 'Anular saldo inicial' : 'Anular venta'));
  pie.push(h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cerrar'));
  const m = modal({ titulo: esSI ? `Saldo inicial · ${v.cliente}` : nroVenta(v.numero), tamano: 'wide', contenido: cuerpo, pie });
}

async function anular(v, hecho) {
  const campos = [
    { name: 'motivo', label: 'Motivo de la anulación', required: true, full: true, autofocus: true, placeholder: 'Ej.: El cliente devolvió la mercadería' },
  ];
  if (v.pagado > 0) {
    campos.push({ name: 'destino_pagos', label: `Esta venta tiene ${money(v.pagado)} cobrados. ¿Qué hacemos con esa plata?`, type: 'select', full: true, required: true, options: [
      { value: 'devolver', label: `Se la devuelvo al cliente (sale ${money(v.pagado)} de la caja)` },
      { value: 'saldo_a_favor', label: 'Queda como saldo a favor del cliente (la plata sigue en la caja)' }] });
  }
  const r = await formModal({
    titulo: v.tipo === 'saldo_inicial' ? 'Anular saldo inicial' : `Anular ${nroVenta(v.numero)}`, textoOk: v.tipo === 'saldo_inicial' ? 'Anular saldo inicial' : 'Anular venta',
    intro: v.tipo === 'saldo_inicial'
      ? 'La deuda de antes del sistema se cancela. No se borra: queda registrado como anulado. Después podés cargar el saldo correcto desde la ficha del cliente.'
      : 'El stock vuelve al depósito de origen, la deuda se cancela y la venta deja de contar en ventas y ganancias. La venta no se borra: queda en el historial como anulada.',
    extra: (v.entrega_deuda ?? 0) > 0 ? h('div', { class: 'alert info' }, icon('info'), h('div', null,
      `Con esta venta el cliente también entregó ${money(v.entrega_deuda)} para su deuda. Ese cobro NO se anula: sigue descontando la deuda vieja. Si también hay que anularlo, hacelo desde Deudas → Historial de cobros.`)) : null,
    campos, onSubmit: (val) => post(`/api/ventas/${v.id}/anular`, val),
  });
  if (r) { toast(v.tipo === 'saldo_inicial' ? 'Saldo inicial anulado.' : `${nroVenta(v.numero)} anulada.`); hecho(); }
}
