// Comprobante interno de venta con el estado de cuenta del cliente: compartir en PDF (WhatsApp), ver en grande
// para una captura, o imprimir. NO es una factura fiscal: lo dice en el encabezado y en el pie.
import { get } from './api.js';
import { h, icon, modal, money, num, fdate, fdt, nombreProducto, toast, errorMsg, etiquetaMedio } from './ui.js';

const CONDICION = { contado: 'Contado', fiado: 'Cuenta corriente (fiado)', mixto: 'Pago parcial' };
const conSigno = (c) => (c < 0 ? `− ${money(-c)}` : money(c));
const estadoSaldo = (s) => (s > 0 ? `debe ${money(s)}` : s < 0 ? `tiene ${money(-s)} a favor` : 'sin deuda');

const dato = (etiqueta, valor) => h('div', { class: 'comp-dato' }, h('span', null, `${etiqueta}: `), h('b', null, valor));
const conMedio = (t, m) => `${t}${m ? ` (${etiquetaMedio[m].toLowerCase()})` : ''}`;
const nombreDeuda = (a) => (a.tipo === 'saldo_inicial' ? 'Deuda anterior al sistema (saldo inicial)' : `Venta N° ${a.numero} del ${fdate(a.fecha)}`);
const fila = (etiqueta, importe, clase = '') => h('tr', { class: clase }, h('td', null, etiqueta), h('td', { class: 'num' }, importe));

function estadoDeCuenta(v, saldoHoy, impreso) {
  const ventaPagos = v.pagos.filter((p) => p.origen === 'venta');
  const medio = ventaPagos[0]?.medio;
  // Lo entregado para la deuda en ese momento (aunque después se haya anulado: el estado de cuenta es el del momento).
  const entregas = v.entregas_deuda ?? [];
  const paraDeuda = entregas.reduce((s, p) => s + p.monto, 0);
  const filas = [];
  let post;
  if (v.saldo_anterior != null) {
    // Lo que había en el momento de la venta (no cambia aunque después pague).
    const ant = v.saldo_anterior;
    post = v.saldo_posterior;
    const entrego = ant + v.total - post;
    filas.push(fila(ant < 0 ? 'Saldo a favor anterior' : 'Saldo anterior', conSigno(ant)),
      fila('Esta venta', `+ ${money(v.total)}`), fila('Total', conSigno(ant + v.total), 'sub'));
    if (paraDeuda > 0) {
      if (entrego - paraDeuda > 0) filas.push(fila(conMedio('Pagó esta compra', medio), `− ${money(entrego - paraDeuda)}`));
      filas.push(fila(conMedio('Entregó a cuenta de deuda', entregas[0].medio), `− ${money(paraDeuda)}`));
    } else if (entrego > 0) filas.push(fila(conMedio('Entregó', medio), `− ${money(entrego)}`));
  } else {
    // Ventas anteriores a que se guardara el estado de cuenta: solo lo que se sabe con certeza.
    post = saldoHoy;
    const entrego = ventaPagos.reduce((s, p) => s + p.monto, 0);
    filas.push(fila('Esta venta', money(v.total)));
    if (entrego > 0) filas.push(fila(`Entregó${medio ? ` (${etiquetaMedio[medio].toLowerCase()})` : ''}`, `− ${money(entrego)}`));
  }
  const titulo = post > 0 ? 'SALDO — DEBE' : post < 0 ? 'SALDO — A FAVOR' : 'SALDO — SIN DEUDA';
  filas.push(fila(v.saldo_anterior != null ? titulo : `${titulo} (al ${fdate(impreso)})`, money(Math.abs(post)), 'saldo'));
  return h('section', { class: 'comp-cuenta' },
    h('h3', null, 'Estado de cuenta'),
    h('table', null, h('tbody', null, filas)),
    post > 0 && v.vencimiento ? h('div', { class: 'comp-nota' }, `Vencimiento: ${fdate(v.vencimiento)}`) : null,
    v.saldo_anterior != null && saldoHoy !== post ? h('div', { class: 'comp-nota' }, `Saldo de la cuenta al ${fdate(impreso)}: ${estadoSaldo(saldoHoy)}.`) : null);
}

// Recuadro con lo que entregó para la deuda junto con la venta: cuánto y a qué deudas fue.
function entregaDeuda(v) {
  const entregas = v.entregas_deuda ?? [];
  const paraDeuda = entregas.reduce((s, p) => s + p.monto, 0);
  if (!paraDeuda || v.saldo_anterior == null) return null;
  const entrego = v.saldo_anterior + v.total - v.saldo_posterior;
  const compra = entrego - paraDeuda;
  return h('section', { class: 'comp-entrega' },
    h('div', { class: 'comp-entrega-head' }, h('h3', null, 'Pago a cuenta de deuda'),
      h('span', null, `Entregó hoy en total: `, h('b', null, money(entrego)), compra > 0 ? ` (compra ${money(compra)} + deuda ${money(paraDeuda)})` : '')),
    h('p', null, `Además de esta compra entregó ${money(paraDeuda)} para su deuda, aplicados así:`),
    h('table', null, h('tbody', null, entregas.flatMap((p) => [
      ...p.aplicaciones.map((a) => fila(nombreDeuda(a), money(a.monto))),
      ...(p.a_favor > 0 ? [fila('Quedó a favor del cliente', money(p.a_favor))] : []),
    ]))),
    entregas.some((p) => p.anulado) ? h('p', null, h('b', null, 'Este pago a cuenta fue anulado después de emitido el comprobante.')) : null);
}

function armar({ venta: v, cliente: c, negocio: n, saldo_hoy: saldoHoy, impreso }) {
  return h('div', { class: 'comp' },
    v.estado === 'anulada' ? h('div', { class: 'comp-anulada' }, `VENTA ANULADA el ${fdt(v.anulada_fecha)}`) : null,
    h('header', { class: 'comp-head' },
      h('div', null, h('div', { class: 'comp-negocio' }, n.nombre), n.direccion ? h('div', null, n.direccion) : null, n.telefono ? h('div', null, `Tel.: ${n.telefono}`) : null),
      h('div', { class: 'comp-tipo' },
        h('div', { class: 'comp-titulo' }, 'COMPROBANTE DE VENTA'),
        h('div', null, `N° ${String(v.numero).padStart(8, '0')}`),
        h('div', null, `Fecha: ${fdt(v.fecha)}`),
        h('div', { class: 'comp-nofiscal' }, 'DOCUMENTO NO VÁLIDO COMO FACTURA'))),
    h('section', { class: 'comp-cliente' },
      dato('Cliente', c.nombre), c.documento ? dato('CUIT / DNI', c.documento) : null,
      c.telefono ? dato('Teléfono', c.telefono) : null, c.direccion ? dato('Dirección', c.direccion) : null,
      dato('Condición', CONDICION[v.modalidad_pago] ?? v.modalidad_pago), dato('Sale de', v.deposito), v.usuario ? dato('Atendió', v.usuario) : null),
    h('table', { class: 'comp-items' },
      h('thead', null, h('tr', null, h('th', { class: 'num' }, 'Cant.'), h('th', null, 'Detalle'), h('th', { class: 'num' }, 'Precio unit.'), h('th', { class: 'num' }, 'Importe'))),
      h('tbody', null, v.lineas.map((l) => h('tr', null,
        h('td', { class: 'num' }, num(l.cantidad)),
        h('td', null, h('div', null, nombreProducto(l)), h('div', { class: 'comp-sub' }, l.presentacion === 'caja'
          ? `${l.cantidad === 1 ? 'Caja' : 'Cajas'} de ${l.unidades_por_caja} u. (${num(l.unidades)} u.)`
          : (l.cantidad === 1 ? 'Unidad suelta' : 'Unidades sueltas'))),
        h('td', { class: 'num' }, money(l.precio), h('div', { class: 'comp-sub' }, l.presentacion === 'caja' ? 'por caja' : 'por unidad')),
        h('td', { class: 'num' }, money(l.subtotal)))))),
    h('table', { class: 'comp-totales' }, h('tbody', null,
      v.descuento > 0 ? fila('Subtotal', money(v.total + v.descuento)) : null,
      v.descuento > 0 ? fila('Descuento', `− ${money(v.descuento)}`) : null,
      fila('TOTAL DE ESTA VENTA', money(v.total), 'saldo'))),
    estadoDeCuenta(v, saldoHoy, impreso),
    entregaDeuda(v),
    v.observaciones ? h('div', { class: 'comp-nota' }, `Observaciones: ${v.observaciones}`) : null,
    h('section', { class: 'comp-firmas' },
      h('div', null, h('div', { class: 'comp-linea' }), 'Firma del cliente'),
      h('div', null, h('div', { class: 'comp-linea' }), 'Aclaración')),
    h('footer', { class: 'comp-pie' }, n.pie ? h('div', null, n.pie) : null,
      h('div', null, `Comprobante interno de gestión, sin validez fiscal. No válido como factura. Impreso el ${fdt(impreso)}.`)));
}

export async function imprimirComprobante(ventaId) {
  let datos;
  try { datos = await get(`/api/ventas/${ventaId}/comprobante`); } catch (e) { toast(errorMsg(e), 'error'); return; }
  document.getElementById('comprobante')?.remove();
  const el = armar(datos);
  el.id = 'comprobante';
  document.body.append(el);
  document.body.classList.add('imprimiendo-comprobante');
  const limpiar = () => { document.body.classList.remove('imprimiendo-comprobante'); el.remove(); window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  window.print();
}

// Número de WhatsApp a partir del teléfono cargado (Argentina): 11 2345-6789 → 5491123456789. Si no se puede saber, vacío
// (WhatsApp abre igual y se elige el contacto).
function numeroWhatsapp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('54')) return d;
  d = d.replace(/^0/, '');
  return d.length === 10 ? `549${d}` : '';
}

// Compartir: genera el PDF en el servidor y abre el menú de compartir del celular / la PC (ahí aparece WhatsApp).
// Si el aparato no puede compartir archivos, lo descarga y ofrece abrir WhatsApp o verlo en grande para una captura.
export async function compartirComprobante(ventaId) {
  let blob; let datos;
  try {
    const r = await fetch(`/api/ventas/${ventaId}/comprobante.pdf`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo generar el comprobante.');
    blob = await r.blob();
    datos = await get(`/api/ventas/${ventaId}/comprobante`);
  } catch (e) { toast(errorMsg(e), 'error'); return; }
  const v = datos.venta;
  const nombre = `Comprobante-venta-${v.numero}.pdf`;
  const texto = `Comprobante de tu compra N° ${v.numero} en ${datos.negocio.nombre}: total ${money(v.total)}.`;
  const archivo = new File([blob], nombre, { type: 'application/pdf' });
  const compartir = () => navigator.share({ files: [archivo], title: nombre, text: texto });
  if (navigator.canShare?.({ files: [archivo] })) {
    try { await compartir(); return; }
    catch (e) {
      if (e?.name === 'AbortError') return; // lo cerró la persona
      if (e?.name === 'NotAllowedError') {
        // Safari / iPhone: el menú de compartir solo se abre justo después de un toque, y generar el PDF demoró.
        // Con el PDF ya listo, un toque más lo abre al instante.
        const m = modal({
          titulo: 'Comprobante listo',
          contenido: h('p', null, `El PDF de la venta N° ${v.numero} está listo. Tocá "Enviar PDF" y elegí WhatsApp.`),
          pie: [
            h('button', { class: 'btn primary', type: 'button', onclick: () => { m.cerrar(); compartir().catch(() => {}); } }, icon('compartir'), 'Enviar PDF'),
            h('button', { class: 'btn', type: 'button', onclick: () => { m.cerrar(); verComprobante(ventaId); } }, icon('ver'), 'Ver comprobante'),
            h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cerrar'),
          ],
        });
        return;
      }
      // Otro error del menú: sigue con la alternativa (descargar).
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  const m = modal({
    titulo: 'Compartir comprobante',
    contenido: h('div', { class: 'stack' },
      h('p', null, `Se descargó el PDF "${nombre}" (está en la carpeta de Descargas).`),
      h('p', { class: 'muted' }, 'Para mandarlo: tocá "Abrir WhatsApp" y en el chat del cliente adjuntá el archivo con el clip → Documento. O tocá "Ver comprobante" y sacale una captura de pantalla.')),
    pie: [
      h('a', { class: 'btn primary', href: `https://wa.me/${numeroWhatsapp(datos.cliente.telefono)}?text=${encodeURIComponent(texto)}`, target: '_blank', rel: 'noopener' }, 'Abrir WhatsApp'),
      h('button', { class: 'btn', type: 'button', onclick: () => { m.cerrar(); verComprobante(ventaId); } }, icon('ver'), 'Ver comprobante'),
      h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cerrar'),
    ],
  });
}

// Ver en grande, con fondo blanco y letra clara, para sacarle una captura (o imprimirlo desde la PC).
export async function verComprobante(ventaId) {
  let datos;
  try { datos = await get(`/api/ventas/${ventaId}/comprobante`); } catch (e) { toast(errorMsg(e), 'error'); return; }
  const m = modal({
    titulo: `Comprobante · venta N° ${datos.venta.numero}`, tamano: 'xl',
    contenido: h('div', { class: 'comp-pantalla' }, armar(datos)),
    pie: [
      h('button', { class: 'btn primary', type: 'button', onclick: () => { m.cerrar(); compartirComprobante(ventaId); } }, icon('compartir'), 'Compartir'),
      h('button', { class: 'btn', type: 'button', onclick: () => imprimirComprobante(ventaId) }, icon('imprimir'), 'Imprimir'),
      h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cerrar'),
    ],
  });
}
