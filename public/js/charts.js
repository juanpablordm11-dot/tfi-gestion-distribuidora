// Gráficos simples en SVG/HTML, sin librerías. Los colores salen de las variables CSS (--c1…) y respetan el modo oscuro.
import { h, money, num } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const k of kids) if (k) el.append(k);
  return el;
};
export const SERIE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
// Valores negativos: rayado, para distinguirlos del rojo de la marca sin depender solo del color.
const NEGATIVO = 'repeating-linear-gradient(135deg, var(--bad) 0 4px, transparent 4px 7px)';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function etiquetaPeriodo(p, agrupar = 'dia') {
  if (agrupar === 'mes') return `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;
  return `${p.slice(8, 10)}/${p.slice(5, 7)}`;
}
export function dineroCorto(c) {
  const p = c / 100; const a = Math.abs(p);
  if (a >= 1e6) return `${(p / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${Math.round(p / 1e3).toLocaleString('es-AR')} mil`;
  return Math.round(p).toLocaleString('es-AR');
}

function escalaNice(min, max, ticks = 4) {
  if (max === min) { max = min + 1; }
  const rango = max - min; const paso0 = rango / ticks;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= paso0);
  const lo = Math.floor(min / paso) * paso; const hi = Math.ceil(max / paso) * paso;
  const marcas = []; for (let v = lo; v <= hi + paso / 2; v += paso) marcas.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, marcas };
}

let tip;
function mostrarTip(e, html) {
  if (!tip) { tip = h('div', { class: 'tip', role: 'tooltip' }); document.body.append(tip); }
  tip.replaceChildren(...html); tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14; let y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${Math.max(8, y)}px`;
}
const ocultarTip = () => { if (tip) tip.hidden = true; };

const vacioMsg = (txt) => h('div', { class: 'muted small', style: { padding: '28px 8px', textAlign: 'center' } }, txt);

// Líneas con cursor: una o más series en el tiempo.
export function lineChart({ etiquetas, series, formato = money, formatoEje = dineroCorto, alto = 250 }) {
  if (!etiquetas.length || series.every((x) => x.valores.every((v) => v === 0))) return vacioMsg('Todavía no hay movimientos en este período.');
  const W = 680; const H = alto; const m = { t: 12, r: 12, b: 26, l: 46 };
  const todos = series.flatMap((x) => x.valores);
  const sc = escalaNice(Math.min(0, ...todos), Math.max(...todos));
  const X = (i) => m.l + (etiquetas.length === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (etiquetas.length - 1));
  const Y = (v) => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Gráfico de ${series.map((x) => x.nombre).join(' y ')}` });
  for (const v of sc.marcas) {
    svg.append(s('line', { class: 'grid-line', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    const t = s('text', { class: 'axis', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = formatoEje(v); svg.append(t);
  }
  const salto = Math.ceil(etiquetas.length / 8);
  etiquetas.forEach((e, i) => {
    if (i % salto !== 0 && i !== etiquetas.length - 1) return;
    if (i !== etiquetas.length - 1 && etiquetas.length - 1 - i < salto / 2) return;
    const t = s('text', { class: 'axis', x: X(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === etiquetas.length - 1 ? 'end' : 'middle' }); t.textContent = e; svg.append(t);
  });
  series.forEach((x, k) => {
    const color = x.color || SERIE[k];
    const d = x.valores.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    svg.append(s('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    if (etiquetas.length <= 31) x.valores.forEach((v, i) => svg.append(s('circle', { cx: X(i), cy: Y(v), r: 2.6, fill: color, stroke: 'var(--surface)', 'stroke-width': 1.5 })));
  });
  const cursor = s('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, stroke: 'var(--ink-3)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
  svg.append(cursor);
  const zona = s('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
  zona.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(etiquetas.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (etiquetas.length - 1))));
    cursor.setAttribute('x1', X(i)); cursor.setAttribute('x2', X(i)); cursor.setAttribute('visibility', 'visible');
    mostrarTip(e, [h('b', null, etiquetas[i]), ...series.map((x, k) => h('div', null, h('span', { style: { color: x.color || SERIE[k] } }, '● '), `${x.nombre}: ${formato(x.valores[i])}`))]);
  });
  zona.addEventListener('mouseleave', () => { cursor.setAttribute('visibility', 'hidden'); ocultarTip(); });
  svg.append(zona);
  return h('div', { class: 'chart' },
    series.length > 1 ? h('div', { class: 'legend' }, series.map((x, k) => h('span', null, h('i', { style: { background: x.color || SERIE[k] } }), x.nombre))) : null, svg);
}

// Columnas verticales de una serie (admite valores negativos).
export function columnChart({ etiquetas, valores, nombre, color = SERIE[0], formato = money, formatoEje = dineroCorto, alto = 240 }) {
  if (!etiquetas.length || valores.every((v) => v === 0)) return vacioMsg('Todavía no hay movimientos en este período.');
  const W = 680; const H = alto; const m = { t: 12, r: 12, b: 26, l: 46 };
  const sc = escalaNice(Math.min(0, ...valores), Math.max(0, ...valores));
  const Y = (v) => m.t + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - m.t - m.b);
  const ancho = (W - m.l - m.r) / etiquetas.length; const bw = Math.max(2, Math.min(34, ancho * 0.66));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': nombre });
  for (const v of sc.marcas) {
    svg.append(s('line', { class: 'grid-line', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    const t = s('text', { class: 'axis', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = formatoEje(v); svg.append(t);
  }
  const salto = Math.ceil(etiquetas.length / 9);
  valores.forEach((v, i) => {
    const cx = m.l + ancho * i + ancho / 2; const y0 = Y(0); const y1 = Y(v);
    // Los negativos van solo con contorno punteado: no se confunden con el rojo de la marca.
    const r = s('rect', { x: cx - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), fill: v < 0 ? 'var(--bad-soft)' : color, rx: Math.min(4, bw / 3),
      ...(v < 0 ? { stroke: 'var(--bad)', 'stroke-width': 1.5, 'stroke-dasharray': '3 2' } : {}) });
    r.addEventListener('mousemove', (e) => mostrarTip(e, [h('b', null, etiquetas[i]), h('div', null, `${nombre}: ${formato(v)}`)]));
    r.addEventListener('mouseleave', ocultarTip);
    svg.append(r);
    if (i % salto === 0) { const t = s('text', { class: 'axis', x: cx, y: H - 6, 'text-anchor': 'middle' }); t.textContent = etiquetas[i]; svg.append(t); }
  });
  return h('div', { class: 'chart' }, svg);
}

// Barras horizontales (HTML). items: [{ etiqueta, valor, extra? }]
export function barrasH({ items, formato = money, color = SERIE[0], vacio = 'Sin datos todavía.' }) {
  if (!items.length) return vacioMsg(vacio);
  const max = Math.max(...items.map((i) => Math.abs(i.valor)), 1);
  return h('div', null, items.map((it) => h('div', { class: 'barra-h', title: it.extra || '' },
    h('span', { class: 'nm' }, it.etiqueta),
    h('span', { class: 'pista' }, h('i', { style: { width: `${Math.max(2, (Math.abs(it.valor) / max) * 100)}%`, background: it.valor < 0 ? NEGATIVO : (it.color || color) } })),
    h('span', { class: 'num' }, formato(it.valor)))));
}

// Barras apiladas horizontales: p. ej. Galpón vs Casa por producto. items: [{ etiqueta, partes: [n1, n2] }]
export function apiladasH({ items, nombres, formato = num, vacio = 'Sin existencias cargadas todavía.' }) {
  if (!items.length || items.every((i) => i.partes.every((p) => p === 0))) return vacioMsg(vacio);
  const max = Math.max(...items.map((i) => i.partes.reduce((a, b) => a + b, 0)), 1);
  return h('div', null,
    h('div', { class: 'legend' }, nombres.map((n, k) => h('span', null, h('i', { style: { background: SERIE[k] } }), n))),
    items.map((it) => h('div', { class: 'barra-h' },
      h('span', { class: 'nm' }, it.etiqueta),
      h('span', { class: 'pista', style: { display: 'flex', gap: '2px', background: 'var(--surface-2)' } },
        ...it.partes.map((p, k) => h('i', { style: { width: `${(p / max) * 100}%`, background: SERIE[k], borderRadius: k ? '0 6px 6px 0' : '0' }, title: `${nombres[k]}: ${formato(p)}` }))),
      h('span', { class: 'num' }, formato(it.partes.reduce((a, b) => a + b, 0))))));
}

// Dona con leyenda. items: [{ etiqueta, valor }]
export function dona({ items, formato = money, centro, vacio = 'Sin datos todavía.' }) {
  const datos = items.filter((i) => i.valor > 0);
  if (!datos.length) return vacioMsg(vacio);
  const total = datos.reduce((a, b) => a + b.valor, 0);
  const R = 64; const r = 40; const C = 80;
  const svg = s('svg', { viewBox: '0 0 160 160', width: 160, height: 160, role: 'img', 'aria-label': 'Distribución' });
  let ang = -Math.PI / 2;
  datos.forEach((it, k) => {
    const a = (it.valor / total) * Math.PI * 2; const fin = ang + (datos.length === 1 ? a - 0.0001 : a);
    const g = (rad, ang2) => [C + rad * Math.cos(ang2), C + rad * Math.sin(ang2)];
    const [x1, y1] = g(R, ang); const [x2, y2] = g(R, fin); const [x3, y3] = g(r, fin); const [x4, y4] = g(r, ang);
    const big = a > Math.PI ? 1 : 0;
    const p = s('path', { d: `M${x1},${y1} A${R},${R} 0 ${big} 1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${big} 0 ${x4},${y4}Z`, fill: SERIE[k % SERIE.length], stroke: 'var(--surface)', 'stroke-width': 2 });
    p.addEventListener('mousemove', (e) => mostrarTip(e, [h('b', null, it.etiqueta), h('div', null, `${formato(it.valor)} (${Math.round((it.valor / total) * 100)} %)`)]));
    p.addEventListener('mouseleave', ocultarTip);
    svg.append(p); ang += a;
  });
  if (centro) {
    const t1 = s('text', { x: C, y: C - 2, 'text-anchor': 'middle', style: 'font-size:11px;fill:var(--ink-3)' }); t1.textContent = centro.titulo;
    const t2 = s('text', { x: C, y: C + 15, 'text-anchor': 'middle', style: 'font-size:14px;font-weight:700;fill:var(--ink)' }); t2.textContent = centro.valor;
    svg.append(t1, t2);
  }
  return h('div', { class: 'row', style: { gap: '18px', alignItems: 'center' } }, svg,
    h('div', { class: 'grow', style: { minWidth: '160px' } }, datos.map((it, k) => h('div', { class: 'row between small', style: { padding: '3px 0', flexWrap: 'nowrap' } },
      h('span', { class: 'nowrap', style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, h('i', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: SERIE[k % SERIE.length], marginRight: '7px' } }), it.etiqueta),
      h('b', { class: 'num' }, formato(it.valor))))));
}
