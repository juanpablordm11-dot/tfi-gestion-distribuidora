// Utilidades compartidas: errores HTTP, fechas locales, validaciones y aritmética exacta.

export class HttpError extends Error {
  constructor(status, message, code = null, extra = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const bad = (msg, code, extra) => new HttpError(400, msg, code, extra);
export const noEncontrado = (msg = 'No se encontró el registro') => new HttpError(404, msg);
export const conflicto = (msg, code, extra) => new HttpError(409, msg, code, extra);

// ------------------------------------------------------------------ FECHAS
// Guardamos la hora LOCAL del negocio (Argentina) como texto, sin importar la zona del servidor.
let zona = 'America/Argentina/Buenos_Aires';
export const setZona = (z) => { if (z) zona = z; };

function partes(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}
export function ahora(date = new Date()) {
  const p = partes(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
export const hoy = (date = new Date()) => ahora(date).slice(0, 10);

export function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}
export const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

// --------------------------------------------------------------- VALIDACIÓN
export function entero(v, nombre, { min = 0, max = Number.MAX_SAFE_INTEGER, opcional = false } = {}) {
  if ((v === undefined || v === null || v === '') && opcional) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw bad(`${nombre}: tiene que ser un número entero.`);
  if (v < min) throw bad(`${nombre}: no puede ser menor a ${min}.`);
  if (v > max) throw bad(`${nombre}: es demasiado grande.`);
  return v;
}
// Dinero: entero en centavos, nunca negativo (salvo que se indique).
export function dinero(v, nombre, { min = 0, opcional = false } = {}) {
  return entero(v, nombre, { min, max: 9_000_000_000_000, opcional });
}
export function texto(v, nombre, { max = 200, requerido = false, min = 0 } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad(`${nombre}: tiene que ser texto.`);
  v = v.trim();
  if (requerido && !v) throw bad(`${nombre}: es obligatorio.`);
  if (v && v.length < min) throw bad(`${nombre}: tiene que tener al menos ${min} caracteres.`);
  if (v.length > max) throw bad(`${nombre}: es demasiado largo (máximo ${max} caracteres).`);
  return v || null;
}
export function opcion(v, nombre, validas, { opcional = false, defecto = null } = {}) {
  if ((v === undefined || v === null || v === '') ) {
    if (defecto !== null) return defecto;
    if (opcional) return null;
  }
  if (!validas.includes(v)) throw bad(`${nombre}: valor inválido.`);
  return v;
}
export function booleano(v) { return v === true || v === 1 || v === '1' || v === 'true'; }
export function idemKey(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 80) {
    throw bad('Falta la clave de operación. Recargá la pantalla e intentá de nuevo.', 'IDEM');
  }
  return v;
}

// ------------------------------------------------------- ARITMÉTICA EXACTA
// Redondeo exacto de a/b a entero (mitad hacia arriba) usando BigInt, para no depender del punto flotante.
export function divRound(a, b) {
  const A = BigInt(a); const B = BigInt(b);
  if (B === 0n) return 0;
  const neg = (A < 0n) !== (B < 0n);
  const absA = A < 0n ? -A : A; const absB = B < 0n ? -B : B;
  const q = (2n * absA + absB) / (2n * absB);
  return Number(neg ? -q : q);
}
// Reparte `total` (entero) proporcionalmente a `pesos`, sumando exactamente `total` (método del mayor resto).
export function repartir(total, pesos) {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (total === 0 || suma === 0) return pesos.map(() => 0);
  const base = pesos.map((p) => Math.floor(Number((BigInt(total) * BigInt(p)) / BigInt(suma))));
  let resto = total - base.reduce((a, b) => a + b, 0);
  const orden = pesos
    .map((p, i) => ({ i, r: Number((BigInt(total) * BigInt(p)) % BigInt(suma)) }))
    .sort((x, y) => y.r - x.r || x.i - y.i);
  for (let k = 0; resto > 0; k++, resto--) base[orden[k % orden.length].i]++;
  return base;
}
// Porcentaje con 2 decimales (solo para mostrar; no se usa para dinero).
export const pct = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 100 : null);

export const normalizarBusqueda = (s) => String(s ?? '').trim();
export const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => '\\' + c)}%`;

// Formato de pesos para mensajes de error (solo texto; el dinero se calcula siempre en enteros).
export const pesos = (centavos) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(centavos / 100);
