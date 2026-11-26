// Comprobante de venta en PDF (el mismo contenido que el impreso), para compartirlo por WhatsApp.
// NO es una factura fiscal: lo dice en el encabezado y en el pie.
import { crearPdf, ancho } from './pdf.js';
import { comprobanteVenta } from './services/ventas.js';
import { bad } from './util.js';

const NUM = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const DEC = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Igual que en pantalla: sin decimales si el importe es entero.
const money = (c) => `${c < 0 ? '-' : ''}$ ${(c % 100 === 0 ? NUM : DEC).format(Math.abs(c) / 100)}`;
const conSigno = (c) => (c < 0 ? `- ${money(-c)}` : money(c));
const fdate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const fdt = (s) => (s ? `${fdate(s)} ${s.slice(11, 16)}` : '—');
const CONDICION = { contado: 'Contado', fiado: 'Cuenta corriente (fiado)', mixto: 'Pago parcial' };
const MEDIO = { efectivo: 'efectivo', transferencia: 'transferencia', otro: 'otro medio' };
// A qué deuda fue cada parte de lo entregado para la deuda.
const nombreDeuda = (a) => (a.tipo === 'saldo_inicial' ? 'Deuda anterior al sistema (saldo inicial)' : `Venta N° ${a.numero} del ${fdate(a.fecha)}`);

export function comprobantePdf(ventaId) {
  const { venta: v, cliente: c, negocio: n, saldo_hoy: saldoHoy, impreso } = comprobanteVenta(ventaId);
  if (v.tipo === 'saldo_inicial') throw bad('Un saldo inicial no tiene comprobante de venta.');
  const pdf = crearPdf();
  const IZQ = 40; const DER = 555;
  let y = 50;

  if (v.estado === 'anulada') {
    pdf.rect(IZQ, 26, DER - IZQ, 20, 1.5);
    pdf.texto(297, 40, `VENTA ANULADA el ${fdt(v.anulada_fecha)}`, { tam: 12, negrita: true, alinear: 'centro' });
    y = 74;
  }
  // Encabezado
  pdf.texto(IZQ, y, pdf.recortar(n.nombre, 260, 16), { tam: 16, negrita: true });
  if (n.direccion) pdf.texto(IZQ, y + 16, pdf.recortar(n.direccion, 260, 9), { tam: 9 });
  if (n.telefono) pdf.texto(IZQ, y + (n.direccion ? 29 : 16), `Tel.: ${n.telefono}`, { tam: 9 });
  pdf.texto(DER, y + 2, 'COMPROBANTE DE VENTA', { tam: 13, negrita: true, alinear: 'der' });
  pdf.texto(DER, y + 18, `N° ${String(v.numero).padStart(8, '0')}`, { tam: 10, alinear: 'der' });
  pdf.texto(DER, y + 32, `Fecha: ${fdt(v.fecha)}`, { tam: 10, alinear: 'der' });
  const aviso = 'DOCUMENTO NO VÁLIDO COMO FACTURA'; const wAviso = ancho(aviso, 8, true) + 14;
  pdf.rect(DER - wAviso, y + 38, wAviso, 14, 0.8);
  pdf.texto(DER - wAviso / 2, y + 48, aviso, { tam: 8, negrita: true, alinear: 'centro' });
  y += 64;
  pdf.linea(IZQ, y, DER, y, 1.4);

  // Datos del cliente, en dos columnas
  const datos = [['Cliente', c.nombre], c.documento && ['CUIT / DNI', c.documento], c.telefono && ['Teléfono', c.telefono], c.direccion && ['Dirección', c.direccion],
    ['Condición', CONDICION[v.modalidad_pago] ?? v.modalidad_pago], ['Sale de', v.deposito], v.usuario && ['Atendió', v.usuario]].filter(Boolean);
  y += 16;
  datos.forEach(([et, val], i) => {
    const x = i % 2 === 0 ? IZQ : 310; const yy = y + Math.floor(i / 2) * 14;
    pdf.texto(x, yy, `${et}: `, { tam: 9.5, gris: true });
    const xv = x + ancho(`${et}: `, 9.5);
    pdf.texto(xv, yy, pdf.recortar(val, 240 - (xv - x), 9.5), { tam: 9.5, negrita: true });
  });
  y += Math.ceil(datos.length / 2) * 14 + 2;
  pdf.linea(IZQ, y, DER, y, 0.8);

  // Detalle de productos (con salto de página si no entra)
  const cabecera = () => {
    y += 16;
    pdf.texto(75, y, 'Cant.', { tam: 9, negrita: true, alinear: 'der' });
    pdf.texto(90, y, 'Detalle', { tam: 9, negrita: true });
    pdf.texto(470, y, 'Precio unit.', { tam: 9, negrita: true, alinear: 'der' });
    pdf.texto(DER, y, 'Importe', { tam: 9, negrita: true, alinear: 'der' });
    y += 6; pdf.linea(IZQ, y, DER, y, 0.8);
  };
  cabecera();
  for (const l of v.lineas) {
    if (y > 760) { pdf.nuevaPagina(); y = 40; cabecera(); }
    const nombre = [l.nombre, l.marca && l.marca !== l.nombre ? l.marca : null, l.variante].filter(Boolean).join(' · ');
    y += 15;
    pdf.texto(75, y, NUM.format(l.cantidad), { tam: 10, alinear: 'der' });
    pdf.texto(90, y, pdf.recortar(nombre, 290, 10), { tam: 10 });
    pdf.texto(470, y, money(l.precio), { tam: 10, alinear: 'der' });
    pdf.texto(DER, y, money(l.subtotal), { tam: 10, alinear: 'der' });
    y += 11;
    pdf.texto(90, y, l.presentacion === 'caja' ? `${l.cantidad === 1 ? 'Caja' : 'Cajas'} de ${l.unidades_por_caja} u. (${NUM.format(l.unidades)} u.)` : (l.cantidad === 1 ? 'Unidad suelta' : 'Unidades sueltas'), { tam: 8, gris: true });
    pdf.texto(470, y, l.presentacion === 'caja' ? 'por caja' : 'por unidad', { tam: 8, gris: true, alinear: 'der' });
    y += 6; pdf.linea(IZQ, y, DER, y, 0.3);
  }

  // Totales
  if (y > 640) { pdf.nuevaPagina(); y = 40; }
  const fila = (etiqueta, importe, fuerte = false) => {
    y += fuerte ? 18 : 15;
    if (fuerte) pdf.linea(330, y - 12, DER, y - 12, 1.2);
    pdf.texto(335, y, etiqueta, { tam: fuerte ? 11.5 : 10, negrita: fuerte });
    pdf.texto(DER, y, importe, { tam: fuerte ? 11.5 : 10, negrita: fuerte, alinear: 'der' });
  };
  y += 4;
  if (v.descuento > 0) { fila('Subtotal', money(v.total + v.descuento)); fila('Descuento', `- ${money(v.descuento)}`); }
  fila('TOTAL DE ESTA VENTA', money(v.total), true);

  // Estado de cuenta (el del momento de la venta)
  y += 24;
  pdf.texto(330, y, 'ESTADO DE CUENTA', { tam: 9.5, negrita: true });
  y += 4; pdf.linea(330, y, DER, y, 0.8);
  const pagosVenta = v.pagos.filter((p) => p.origen === 'venta');
  const medio = pagosVenta[0]?.medio;
  const conMedio = (t, m) => `${t}${m ? ` (${MEDIO[m] ?? m})` : ''}`;
  // Lo entregado para la deuda en ese momento (aunque después se haya anulado: el estado de cuenta es el del momento).
  const entregas = v.entregas_deuda ?? [];
  const paraDeuda = entregas.reduce((s, p) => s + p.monto, 0);
  let post;
  if (v.saldo_anterior != null) {
    const ant = v.saldo_anterior; post = v.saldo_posterior; const entrego = ant + v.total - post;
    fila(ant < 0 ? 'Saldo a favor anterior' : 'Saldo anterior', conSigno(ant));
    fila('Esta venta', `+ ${money(v.total)}`);
    fila('Total', conSigno(ant + v.total));
    if (paraDeuda > 0) {
      if (entrego - paraDeuda > 0) fila(conMedio('Pagó esta compra', medio), `- ${money(entrego - paraDeuda)}`);
      fila(conMedio('Entregó a cuenta de deuda', entregas[0].medio), `- ${money(paraDeuda)}`);
    } else if (entrego > 0) fila(conMedio('Entregó', medio), `- ${money(entrego)}`);
  } else {
    post = saldoHoy; const entrego = pagosVenta.reduce((s, p) => s + p.monto, 0);
    fila('Esta venta', money(v.total));
    if (entrego > 0) fila(`Entregó${medio ? ` (${MEDIO[medio] ?? medio})` : ''}`, `- ${money(entrego)}`);
  }
  fila(post > 0 ? 'SALDO — DEBE' : post < 0 ? 'SALDO — A FAVOR' : 'SALDO — SIN DEUDA', money(Math.abs(post)), true);
  if (post > 0 && v.vencimiento) { y += 15; pdf.texto(DER, y, `Vencimiento: ${fdate(v.vencimiento)}`, { tam: 9, alinear: 'der' }); }
  if (v.saldo_anterior != null && saldoHoy !== post) {
    y += 14; pdf.texto(DER, y, `Saldo de la cuenta al ${fdate(impreso)}: ${saldoHoy > 0 ? `debe ${money(saldoHoy)}` : saldoHoy < 0 ? `tiene ${money(-saldoHoy)} a favor` : 'sin deuda'}.`, { tam: 9, alinear: 'der', gris: true });
  }
  // Detalle de lo entregado para la deuda: cuánto y a qué deudas fue
  if (paraDeuda > 0 && v.saldo_anterior != null) {
    const entrego = v.saldo_anterior + v.total - v.saldo_posterior; // todo lo que entregó ese día (compra + deuda)
    const renglones = entregas.flatMap((p) => [...p.aplicaciones.map((a) => [nombreDeuda(a), money(a.monto)]), ...(p.a_favor > 0 ? [['Quedó a favor del cliente', money(p.a_favor)]] : [])]);
    const alto = 44 + renglones.length * 14 + (entregas.some((p) => p.anulado) ? 14 : 0);
    if (y + alto > 790) { pdf.nuevaPagina(); y = 30; }
    y += 22;
    pdf.rect(IZQ, y, DER - IZQ, alto, 0.8);
    y += 15;
    pdf.texto(IZQ + 10, y, 'PAGO A CUENTA DE DEUDA', { tam: 9.5, negrita: true });
    pdf.texto(DER - 10, y, `Entregó hoy en total: ${money(entrego)}${entrego - paraDeuda > 0 ? ` (compra ${money(entrego - paraDeuda)} + deuda ${money(paraDeuda)})` : ''}`, { tam: 9, alinear: 'der' });
    y += 15;
    pdf.texto(IZQ + 10, y, `Además de esta compra entregó ${money(paraDeuda)} para su deuda, aplicados así:`, { tam: 9, gris: true });
    for (const [et, imp] of renglones) {
      y += 14;
      pdf.texto(IZQ + 22, y, pdf.recortar(et, 380, 9.5), { tam: 9.5 });
      pdf.texto(DER - 10, y, imp, { tam: 9.5, alinear: 'der' });
    }
    if (entregas.some((p) => p.anulado)) { y += 14; pdf.texto(IZQ + 10, y, 'Este pago a cuenta fue anulado después de emitido el comprobante.', { tam: 9, negrita: true }); }
    y += 8;
  }
  if (v.observaciones) { y += 20; pdf.texto(IZQ, y, pdf.recortar(`Observaciones: ${v.observaciones}`, DER - IZQ, 9), { tam: 9 }); }

  // Pie
  y = Math.max(y + 40, 770);
  if (y > 800) { pdf.nuevaPagina(); y = 770; }
  pdf.linea(IZQ, y, DER, y, 0.6);
  if (n.pie) pdf.texto(297, y + 14, pdf.recortar(n.pie, DER - IZQ, 9), { tam: 9, alinear: 'centro' });
  pdf.texto(297, y + (n.pie ? 27 : 14), `Comprobante interno de gestión, sin validez fiscal. No válido como factura. Generado el ${fdt(impreso)}.`, { tam: 7.5, gris: true, alinear: 'centro' });
  return { buffer: pdf.terminar(), nombreArchivo: `Comprobante-venta-${v.numero}.pdf` };
}
