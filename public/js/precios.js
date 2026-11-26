// Cálculos de precios compartidos por la interfaz (sin DOM, para poder probarlos con npm test).

// Precio por unidad a partir del precio por caja: caja ÷ unidades, redondeado AL CENTAVO MÁS CERCANO
// (medio centavo o más, sube). Todo en centavos enteros, sin decimales:
// $1.150 la caja de 20 → $57,50 (5750); $1.000 la caja de 3 → $333,33 (33333); $2.000 ÷ 3 → $666,67 (66667).
// Devuelve null si no se puede calcular (sin precio de caja, unidades inválidas o si daría menos de 1 centavo).
export function unidadDesdeCaja(cajaCentavos, unidadesPorCaja) {
  if (!Number.isInteger(cajaCentavos) || cajaCentavos <= 0) return null;
  if (!Number.isInteger(unidadesPorCaja) || unidadesPorCaja < 1) return null;
  // round(caja / n) con enteros: floor((2·caja + n) / (2·n))
  const a = 2 * cajaCentavos + unidadesPorCaja; const b = 2 * unidadesPorCaja;
  const unidad = (a - (a % b)) / b;
  return unidad >= 1 ? unidad : null; // nunca un precio en $0
}

const fmt = (dec) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pesos = (centavos) => `$ ${(centavos % 100 === 0 ? fmt(0) : fmt(2)).format(centavos / 100)}`;

// Texto del aviso que se muestra al completar la unidad, con la cuenta a la vista.
export function avisoUnidad(cajaCentavos, unidadesPorCaja, unidadCentavos) {
  const cuenta = `${pesos(cajaCentavos)} ÷ ${unidadesPorCaja}`;
  if (unidadCentavos * unidadesPorCaja === cajaCentavos) return `Unidad recalculada: ${cuenta} = ${pesos(unidadCentavos)}. Podés cambiarla.`;
  // La división no da justo en centavos: se muestra con 3 decimales (truncada, con "…") y el redondeo
  const milesimos = 10 * cajaCentavos; const n = unidadesPorCaja;
  const exacta = `$ ${fmt(3).format(((milesimos - (milesimos % n)) / n) / 1000)}${milesimos % n ? '…' : ''}`;
  return `Unidad recalculada: ${cuenta} = ${exacta} → ${pesos(unidadCentavos)} (redondeado al centavo). Podés cambiarla.`;
}
