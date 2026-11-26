// Selector de período reutilizable (Hoy, Semana, Mes, Mes pasado, Año, Personalizado).
import { h, segmentado, sumaDias } from '../ui.js';
import { app } from '../app.js';

export function rangoDe(clave, hoy = app.hoy) {
  const [y, m] = hoy.split('-').map(Number);
  const p = (n) => String(n).padStart(2, '0');
  if (clave === 'todo') return { desde: '', hasta: '' }; // sin límite de fechas
  if (clave === 'hoy') return { desde: hoy, hasta: hoy };
  if (clave === 'semana') {
    const dow = (new Date(hoy + 'T00:00:00Z').getUTCDay() + 6) % 7;
    return { desde: sumaDias(hoy, -dow), hasta: hoy };
  }
  if (clave === 'mes') return { desde: `${y}-${p(m)}-01`, hasta: hoy };
  if (clave === 'mes_pasado') {
    const py = m === 1 ? y - 1 : y; const pm = m === 1 ? 12 : m - 1;
    return { desde: `${py}-${p(pm)}-01`, hasta: sumaDias(`${y}-${p(m)}-01`, -1) };
  }
  if (clave === 'anio') return { desde: `${y}-01-01`, hasta: hoy };
  return null;
}

export function selectorPeriodo({ inicial = 'mes', alCambiar, opciones }) {
  let clave = inicial; let rango = rangoDe(clave);
  const opts = opciones || [
    { value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' },
    { value: 'mes_pasado', label: 'Mes pasado' }, { value: 'anio', label: 'Año' }, { value: 'custom', label: 'Fechas…' },
  ];
  const desde = h('input', { class: 'input', type: 'date', 'aria-label': 'Desde', value: rango.desde });
  const hasta = h('input', { class: 'input', type: 'date', 'aria-label': 'Hasta', value: rango.hasta });
  const fechas = h('div', { class: 'row', hidden: true }, desde, h('span', { class: 'muted' }, 'a'), hasta);
  const emitir = () => alCambiar({ ...rango, clave });
  const seg = segmentado(opts, clave, (v) => {
    clave = v; fechas.hidden = v !== 'custom';
    if (v !== 'custom') { rango = rangoDe(v); desde.value = rango.desde; hasta.value = rango.hasta; emitir(); }
  }, { etiqueta: 'Período' });
  const cambioFechas = () => { if (desde.value && hasta.value && desde.value <= hasta.value) { rango = { desde: desde.value, hasta: hasta.value }; emitir(); } };
  desde.addEventListener('change', cambioFechas); hasta.addEventListener('change', cambioFechas);
  // poner(clave): vuelve a un período sin avisar (lo usa el botón "Limpiar filtros", que después recarga una sola vez).
  const poner = (v) => { clave = v; seg.set(v); fechas.hidden = true; rango = rangoDe(v); desde.value = rango.desde; hasta.value = rango.hasta; };
  return { el: h('div', { class: 'row' }, seg, fechas), rango: () => ({ ...rango, clave }), poner };
}
