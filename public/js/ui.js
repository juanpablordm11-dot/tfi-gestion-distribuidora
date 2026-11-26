// Herramientas de interfaz: elementos, formatos argentinos, ventanas, formularios y tablas.
import { ApiError } from './api.js';

// ---------------------------------------------------------------- DOM
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'for') el.htmlFor = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && !['list', 'form'].includes(k) && !k.includes('-')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  agregar(el, kids);
  return el;
}
function agregar(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) agregar(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const vaciar = (el) => { el.replaceChildren(); return el; };

const ICONOS = {
  inicio: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  vender: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  ventas: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-5 3 3 5-7"/>',
  clientes: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 5"/>',
  deudas: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  productos: '<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>',
  stock: '<path d="M3 20V9l9-5 9 5v11"/><path d="M8 20v-6h8v6M8 17h8"/>',
  compras: '<path d="M3 4h2l2.2 11h10.6L20 7H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  caja: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M3 11h18M7 15h3"/><path d="M8 7V5h8v2"/>',
  ganancias: '<path d="M12 3v18"/><path d="M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.5 2.6 4 3 4 1.2 4 3-1.5 3-4 3c-2.3 0-3.9-.9-4.8-2.3"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  mas: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  alerta: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.4v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  salir: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  transferir: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  descargar: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  imprimir: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  compartir: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  ver: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
export function icon(nombre, clase = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', `icon ${clase}`.trim()); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONOS[nombre] || '';
  return s;
}

// ------------------------------------------------------------ FORMATOS
const fmtEntero = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('es-AR');
const fmtPct = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
// Centavos (enteros) → "$ 1.510" o "$ 1.510,50". Solo para mostrar.
export function money(c) {
  if (c === null || c === undefined) return '—';
  return (c % 100 === 0 ? fmtEntero : fmtDec).format(c / 100).replace(/ /g, ' ');
}
// Un importe siempre en color normal: lo que significa lo dice una etiqueta chica (DEBE, VENCIDO, A FAVOR…),
// nunca el color del número, para que una deuda no se confunda con un precio.
export function importe(c, etiqueta = null, tipo = '') {
  return h('span', { class: 'importe' }, h('b', { class: 'num' }, money(c)), etiqueta ? h('span', { class: `etq ${tipo}` }, etiqueta) : null);
}
// Cómo se nombra una venta: los saldos iniciales (deuda de antes del sistema) llevan número negativo y no son ventas.
export const nroVenta = (n) => (n < 0 ? 'Saldo inicial' : `Venta N° ${n}`);
export const nroCorto = (n) => (n < 0 ? 'Saldo inicial' : `N° ${n}`);
export const moneyFull = (c) => (c === null || c === undefined ? '—' : fmtDec.format(c / 100).replace(/ /g, ' '));
export const num = (n) => (n === null || n === undefined ? '—' : fmtNum.format(n));
export const pct = (p) => (p === null || p === undefined ? '—' : `${fmtPct.format(p)} %`);
export function fdate(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fdt(s) {
  if (!s) return '—';
  return `${fdate(s)} ${String(s).slice(11, 16)}`;
}
export function hoyISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const sumaDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };

// "1.234,56" / "1234,5" / "1500.50" / "$ 2.000" → centavos enteros (sin pasar por decimales). NaN si no es válido.
export function parseMoney(txt) {
  if (typeof txt !== 'string') return NaN;
  let s = txt.replace(/[$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [e, d = ''] = s.split('.');
  return Number(e) * 100 + Number((d + '00').slice(0, 2));
}
export const centavosATexto = (c) => (c === null || c === undefined ? '' : (c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2).replace('.', ',')));

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const idemKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

export function stockTxt(unidades, porCaja) {
  if (!porCaja || porCaja <= 1) return `${num(unidades)} u.`;
  const c = Math.floor(unidades / porCaja); const r = unidades % porCaja;
  if (unidades === 0) return '0';
  if (c === 0) return `${r} u.`;
  return r === 0 ? `${num(c)} ${c === 1 ? 'caja' : 'cajas'}` : `${num(c)} ${c === 1 ? 'caja' : 'cajas'} + ${r} u.`;
}
export const nombreProducto = (p) => [p.nombre, p.marca && p.marca !== p.nombre ? p.marca : null, p.variante].filter(Boolean).join(' · ');
export const etiquetaMedio = { efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' };

// -------------------------------------------------------------- AVISOS
export function toast(mensaje, tipo = 'ok') {
  const cont = document.getElementById('toasts');
  const t = h('div', { class: `toast ${tipo === 'ok' ? '' : tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    icon(tipo === 'ok' ? 'check' : 'alerta'), h('div', null, mensaje));
  cont.append(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 8000 : 4500);
  return t;
}
export const errorMsg = (e) => (e instanceof ApiError || e?.message ? e.message : 'Ocurrió un error inesperado.');

// ------------------------------------------------------------- MODALES
let pilaModales = 0;
const abiertas = new Set();
// Cierra todas las ventanas abiertas como si se tocara "Cerrar" (al cambiar de pantalla). Los formularios quedan cancelados.
export function cerrarVentanas() { for (const cerrar of [...abiertas]) cerrar(); }
export function modal({ titulo, contenido, pie, tamano = '', alCerrar, bloquear = false }) {
  const bg = h('div', { class: 'modal-bg', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
  const caja = h('div', { class: `modal ${tamano}` });
  const cerrar = (valor) => {
    if (!bg.isConnected) return;
    abiertas.delete(cerrar);
    bg.remove(); pilaModales--;
    if (pilaModales === 0) document.body.style.overflow = '';
    document.removeEventListener('keydown', teclas, true);
    alCerrar?.(valor);
  };
  const teclas = (e) => {
    if (e.key === 'Escape' && !bloquear && bg === [...document.querySelectorAll('.modal-bg')].pop()) { e.stopPropagation(); cerrar(); }
  };
  caja.append(
    h('div', { class: 'modal-head' }, h('h2', null, titulo), bloquear ? null : h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icon('x'))),
    h('div', { class: 'modal-body' }, contenido),
    pie ? h('div', { class: 'modal-foot' }, pie) : null,
  );
  bg.append(caja);
  if (!bloquear) bg.addEventListener('mousedown', (e) => { if (e.target === bg) cerrar(); });
  document.addEventListener('keydown', teclas, true);
  document.body.append(bg); pilaModales++; abiertas.add(cerrar);
  document.body.style.overflow = 'hidden';
  setTimeout(() => (caja.querySelector('[autofocus], input:not([type=hidden]), select, textarea') || caja.querySelector('button'))?.focus(), 30);
  return { el: bg, cuerpo: caja.querySelector('.modal-body'), cerrar };
}

export function confirmar({ titulo = 'Confirmar', mensaje, textoOk = 'Confirmar', peligro = false, contenido }) {
  return new Promise((resolve) => {
    let hecho = false;
    const fin = (v) => { if (!hecho) { hecho = true; resolve(v); } };
    const m = modal({
      titulo, contenido: h('div', { class: 'stack' }, mensaje ? h('p', null, mensaje) : null, contenido),
      alCerrar: () => fin(false),
      pie: [
        h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cancelar'),
        h('button', { class: `btn ${peligro ? 'danger solid' : 'primary'}`, type: 'button', onclick: () => { fin(true); m.cerrar(); } }, textoOk),
      ],
    });
  });
}

// ----------------------------------------------------------- FORMULARIOS
// Campo de dinero: muestra "1.500,00" y entrega centavos enteros.
export function campoDinero(valorInicial = null, props = {}) {
  const el = h('input', { class: 'input money', type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: '0', ...props });
  if (valorInicial !== null && valorInicial !== undefined) el.value = centavosATexto(valorInicial);
  el.addEventListener('blur', () => { const c = parseMoney(el.value); if (!Number.isNaN(c) && el.value.trim()) el.value = centavosATexto(c); });
  el.cents = () => { if (!el.value.trim()) return null; const c = parseMoney(el.value); return Number.isNaN(c) ? NaN : c; };
  el.setCents = (c) => { el.value = c === null || c === undefined ? '' : centavosATexto(c); el.dispatchEvent(new Event('input', { bubbles: true })); };
  return el;
}

export function campo(etiqueta, input, { hint, id } = {}) {
  const idc = id || `f-${Math.random().toString(36).slice(2, 8)}`;
  if (input && !input.id) input.id = idc;
  return h('div', { class: 'field' }, h('label', { for: input?.id || idc }, etiqueta), input, hint ? h('div', { class: 'hint' }, hint) : null);
}

// Construye un formulario a partir de una lista de campos y lo muestra en una ventana.
// Devuelve una promesa con el resultado de onSubmit (o null si se cancela).
export function formModal({ titulo, campos, valores = {}, textoOk = 'Guardar', onSubmit, tamano = '', intro, extra, alAbrir }) {
  return new Promise((resolve) => {
    const refs = {};
    let resultado = null;
    const error = h('div', { class: 'alert bad', hidden: true, role: 'alert' });
    const form = h('form', { class: 'form-grid', novalidate: true });
    for (const c of campos) {
      if (c.type === 'separador') { form.append(h('h3', { class: 'full' }, c.label)); continue; }
      const v = c.name in valores ? valores[c.name] : c.value;
      let input;
      if (c.type === 'money') { input = campoDinero(v ?? null, { placeholder: c.placeholder ?? '0' }); }
      else if (c.type === 'int') { input = h('input', { class: 'input numero', type: 'number', inputMode: 'numeric', step: 1, min: c.min ?? 0, max: c.max, placeholder: c.placeholder ?? '0', value: v ?? '' }); }
      else if (c.type === 'textarea') { input = h('textarea', { class: 'input', rows: 3, maxLength: c.maxlength ?? 500, placeholder: c.placeholder }, v ?? ''); }
      else if (c.type === 'select') {
        input = h('select', { class: 'input' }, (c.options || []).map((o, i) => h('option', { value: String(i), selected: o.value === v }, o.label)));
      } else if (c.type === 'check') { input = h('input', { type: 'checkbox', checked: !!v }); }
      else if (c.type === 'date') { input = h('input', { class: 'input', type: 'date', value: v ?? '', max: c.max }); }
      else { input = h('input', { class: 'input', type: c.type === 'password' ? 'password' : 'text', maxLength: c.maxlength ?? 200, autocomplete: c.type === 'password' ? 'new-password' : 'off', placeholder: c.placeholder, value: v ?? '' }); }
      if (c.autofocus) input.autofocus = true;
      if (c.disabled) input.disabled = true;
      refs[c.name] = { input, def: c };
      const wrap = c.type === 'check'
        ? h('div', { class: `field ${c.full ? 'full' : ''}` }, h('label', { class: 'check' }, input, c.label), c.hint ? h('div', { class: 'hint' }, c.hint) : null)
        : h('div', { class: `field ${c.full || c.type === 'textarea' ? 'full' : ''}` },
          h('label', { for: (input.id = `f-${c.name}-${Math.random().toString(36).slice(2, 6)}`) }, c.label + (c.required ? ' *' : '')),
          c.prefix ? h('div', { class: 'input-group' }, h('span', { class: 'pre' }, c.prefix), input) : input,
          c.hint ? h('div', { class: 'hint' }, c.hint) : null);
      form.append(wrap);
    }
    const leer = () => {
      const out = {}; const errores = [];
      for (const [name, { input, def }] of Object.entries(refs)) {
        let v;
        if (def.type === 'money') { v = input.cents(); if (Number.isNaN(v)) { errores.push(`${def.label}: importe inválido.`); input.setAttribute('aria-invalid', 'true'); } }
        else if (def.type === 'int') { v = input.value === '' ? null : Number(input.value); if (v !== null && !Number.isInteger(v)) errores.push(`${def.label}: tiene que ser un número entero.`); }
        else if (def.type === 'select') v = def.options[Number(input.value)]?.value ?? null;
        else if (def.type === 'check') v = input.checked;
        else v = input.value.trim();
        if (def.required && (v === null || v === '' || v === undefined)) { errores.push(`${def.label}: es obligatorio.`); input.setAttribute('aria-invalid', 'true'); }
        else if (input.getAttribute?.('aria-invalid') && !Number.isNaN(v)) input.removeAttribute('aria-invalid');
        out[name] = v;
      }
      return { out, errores };
    };
    const botonOk = h('button', { class: 'btn primary', type: 'submit' }, textoOk);
    const enviar = async (e) => {
      e?.preventDefault();
      error.hidden = true;
      const { out, errores } = leer();
      if (errores.length) { error.textContent = errores[0]; error.hidden = false; return; }
      botonOk.disabled = true; botonOk.textContent = 'Guardando…';
      try {
        resultado = await onSubmit(out);
        m.cerrar(resultado ?? true);
      } catch (err) {
        error.textContent = errorMsg(err); error.hidden = false;
        botonOk.disabled = false; botonOk.textContent = textoOk;
      }
    };
    form.addEventListener('submit', enviar);
    const m = modal({
      titulo, tamano,
      contenido: h('div', { class: 'stack' }, intro ? h('p', { class: 'muted' }, intro) : null, error, form, extra),
      alCerrar: (v) => resolve(v === undefined ? null : v),
      pie: [h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cancelar'), botonOk],
    });
    botonOk.addEventListener('click', (e) => { e.preventDefault(); enviar(); });
    alAbrir?.(Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.input])), m);
  });
}

// ---------------------------------------------------------------- TABLAS
export const badge = (texto, tipo = '') => h('span', { class: `badge ${tipo}` }, texto);
export const estadoBadge = {
  pendiente: () => badge('Pendiente', 'warn'), parcial: () => badge('Parcial', 'info'), pagada: () => badge('Pagada', 'ok'),
  vencida: () => badge('Vencida', 'bad'), anulada: () => badge('Anulada'), confirmada: () => badge('Confirmada', 'ok'),
};
export const modalidadBadge = (m) => badge({ contado: 'Contado', fiado: 'Fiado', mixto: 'Mixto', ambas: 'Ambas' }[m] || m, m === 'contado' ? 'ok' : m === 'fiado' ? 'warn' : 'info');

export function estadoVacio(titulo, texto, accion) {
  return h('div', { class: 'empty' }, icon('info'), h('h3', null, titulo), texto ? h('p', null, texto) : null, accion);
}
export const cargando = () => h('div', { class: 'cargando' }, h('span', { class: 'spinner' }), h('div', { class: 'small' }, 'Cargando…'));

// Tabla ordenable. columnas: { key, label, num, render(row), sort(row) | true, class }
export function dataTable({ columnas, filas = [], vacio, onClick, claseFila, pie, ordenInicial }) {
  const wrap = h('div', { class: 'table-wrap' });
  let datos = filas; let orden = ordenInicial || null; // { key, dir }
  const render = () => {
    vaciar(wrap);
    if (!datos.length) { wrap.append(vacio || estadoVacio('Sin resultados', 'No hay nada para mostrar con estos filtros.')); return; }
    let lista = datos;
    if (orden) {
      const col = columnas.find((c) => c.key === orden.key);
      const val = (r) => (typeof col.sort === 'function' ? col.sort(r) : r[col.key]);
      lista = [...datos].sort((a, b) => {
        const x = val(a); const y = val(b);
        const c = typeof x === 'string' || typeof y === 'string' ? String(x ?? '').localeCompare(String(y ?? ''), 'es') : (x ?? -Infinity) - (y ?? -Infinity);
        return orden.dir === 'asc' ? c : -c;
      });
    }
    const thead = h('thead', null, h('tr', null, columnas.map((c) => {
      const ordenable = !!c.sort || c.sort === true;
      const th = h('th', {
        class: `${c.num ? 'num' : ''} ${ordenable ? 'sortable' : ''}`, scope: 'col',
        'aria-sort': orden?.key === c.key ? (orden.dir === 'asc' ? 'ascending' : 'descending') : null,
        onclick: ordenable ? () => { orden = { key: c.key, dir: orden?.key === c.key && orden.dir === 'asc' ? 'desc' : 'asc' }; render(); } : null,
      }, c.label, orden?.key === c.key ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : '');
      return th;
    })));
    const tbody = h('tbody', null, lista.map((r) => h('tr', {
      class: `${onClick ? 'clic' : ''} ${claseFila?.(r) || ''}`.trim(),
      tabIndex: onClick ? 0 : null,
      onclick: onClick ? (e) => { if (!e.target.closest('button, a, input, select, label')) onClick(r); } : null,
      onkeydown: onClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onClick(r); } : null,
    }, columnas.map((c) => h('td', { class: `${c.num ? 'num' : ''} ${c.class || ''}`.trim() }, c.render ? c.render(r) : (r[c.key] ?? '—'))))));
    const tfoot = pie ? h('tfoot', null, pie(lista)) : null;
    wrap.append(h('table', { class: 'tbl' }, thead, tbody, tfoot));
  };
  render();
  return { el: wrap, setFilas(f) { datos = f; render(); } };
}

// ------------------------------------------------------------- FILTROS
// Piezas comunes para que todos los listados se filtren de la misma forma.
// Buscador de texto: filtra mientras se escribe (espera 200 ms para no recalcular en cada tecla).
export function campoBuscar(placeholder, alEscribir) {
  const el = h('input', { class: 'input buscar', type: 'search', placeholder, 'aria-label': placeholder });
  el.addEventListener('input', debounce(alEscribir, 200));
  return el;
}
// Lista desplegable a partir de pares [valor, texto]. El primero suele ser "Todos…" con valor ''.
export function selectFiltro(etiqueta, opciones) {
  return h('select', { class: 'input', 'aria-label': etiqueta }, opciones.map(([v, t]) => h('option', { value: v }, t)));
}
export const botonLimpiar = (alLimpiar) => h('button', { class: 'btn ghost sm', type: 'button', title: 'Volver a mostrar todo', onclick: alLimpiar }, icon('x'), 'Limpiar filtros');
// Muestra "12 de 40" cuando hay filtros aplicados, o "40 en total" si se ve todo.
export function contadorResultados() {
  const el = h('span', { class: 'muted small', role: 'status' });
  el.poner = (n, total) => { el.textContent = n === total ? `${total} en total` : `${n} de ${total}`; };
  return el;
}
// true si el texto buscado aparece en alguno de los campos (sin importar mayúsculas ni tildes).
export function coincide(buscado, ...campos) {
  const q = norm(buscado).trim();
  return !q || campos.some((c) => norm(c).includes(q));
}
// true si la fecha 'AAAA-MM-DD…' está dentro del rango (un extremo vacío = sin límite).
export const enRango = (fecha, { desde, hasta }) => (!desde || fecha.slice(0, 10) >= desde) && (!hasta || fecha.slice(0, 10) <= hasta);

export function segmentado(opciones, valor, alCambiar, { llenar = false, etiqueta } = {}) {
  const cont = h('div', { class: `seg ${llenar ? 'fill' : ''}`, role: 'group', 'aria-label': etiqueta });
  const pintar = () => { for (const b of cont.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(valor))); };
  for (const o of opciones) {
    cont.append(h('button', { type: 'button', dataset: { v: String(o.value) }, onclick: () => { valor = o.value; pintar(); alCambiar(o.value); } }, o.label));
  }
  pintar();
  cont.set = (v) => { valor = v; pintar(); };
  return cont;
}

export function tabs(items, activo, alCambiar) {
  const cont = h('div', { class: 'tabs', role: 'tablist' });
  const pintar = () => { for (const b of cont.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.v === activo)); };
  for (const it of items) cont.append(h('button', { type: 'button', role: 'tab', dataset: { v: it.value }, onclick: () => { activo = it.value; pintar(); alCambiar(it.value); } }, it.label));
  pintar();
  return cont;
}

// Buscador de clientes/productos con lista desplegable simple (para elegir en formularios).
export function selectorBusqueda({ items, etiqueta, valorInicial = null, placeholder = 'Buscar…', alElegir }) {
  const entrada = h('input', { class: 'input', type: 'text', placeholder, autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false' });
  const lista = h('div', { class: 'prod-lista', hidden: true, style: { position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: '4px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', boxShadow: 'var(--shadow)', maxHeight: '260px' } });
  const cont = h('div', { style: { position: 'relative' } }, entrada, lista);
  let elegido = null;
  const mostrar = () => {
    const q = norm(entrada.value);
    const coinc = items.filter((it) => !q || norm(etiqueta(it)).includes(q)).slice(0, 40);
    vaciar(lista);
    if (!coinc.length) lista.append(h('div', { class: 'muted small', style: { padding: '10px' } }, 'No se encontró nada.'));
    for (const it of coinc) lista.append(h('button', { type: 'button', class: 'prod-item', onmousedown: (e) => e.preventDefault(), onclick: () => elegir(it) }, h('span', { class: 'n' }, etiqueta(it))));
    lista.hidden = false; entrada.setAttribute('aria-expanded', 'true');
  };
  const elegir = (it) => { elegido = it; entrada.value = it ? etiqueta(it) : ''; lista.hidden = true; entrada.setAttribute('aria-expanded', 'false'); alElegir?.(it); };
  entrada.addEventListener('focus', () => { entrada.select(); mostrar(); });
  entrada.addEventListener('input', () => { elegido = null; mostrar(); alElegir?.(null); });
  entrada.addEventListener('blur', () => { setTimeout(() => { lista.hidden = true; if (!elegido) entrada.value = ''; else entrada.value = etiqueta(elegido); }, 120); });
  entrada.addEventListener('keydown', (e) => { if (e.key === 'Escape') { lista.hidden = true; } });
  if (valorInicial) elegir(valorInicial);
  return { el: cont, get: () => elegido, set: elegir, input: entrada };
}

export function descargar(nombre, contenido, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = h('a', { href: url, download: nombre }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function aCSV(filas) {
  return '﻿' + filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
