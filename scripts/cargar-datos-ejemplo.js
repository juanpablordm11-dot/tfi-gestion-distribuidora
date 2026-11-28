// Carga DATOS DE EJEMPLO ficticios (pero realistas) de una distribuidora de cigarrillos, para presentar el sistema.
//   npm run datos-ejemplo                  → usa data/negocio.db (la base de práctica)
//   DB_PATH=otra.db npm run datos-ejemplo  → usa otra base
// Requisitos: la base tiene que existir, tener un administrador y NO tener productos cargados (para no mezclar datos).
// Ningún dato es real: los clientes, proveedores, teléfonos y montos son inventados.
//
// Cómo funciona: simula ~60 días de operación. Antes de cada operación "adelanta el reloj" a ese día y hora,
// así cada venta, cobro, compra y gasto queda con su fecha en TODAS las tablas a la vez (venta, stock, caja,
// lotes). Todo pasa por los mismos servicios que usa el sistema, con sus reglas de negocio: nada se inserta a mano.
import fs from 'node:fs';
import path from 'node:path';

process.env.DB_PATH ||= 'data/negocio.db';
const destino = path.resolve(process.env.DB_PATH);
if (/demo\.db$/i.test(destino)) { console.error('Para la demo usá npm run demo.'); process.exit(1); }
if (!fs.existsSync(destino)) {
  console.error(`No existe ${destino}. Primero iniciá el sistema (npm start) y creá el usuario administrador.`);
  process.exit(1);
}

// ---- Reloj simulado: los servicios usan new Date() / Date.now() para la fecha de cada operación.
const DateReal = Date;
let reloj = null; // milisegundos del momento simulado (null = hora real)
class DateSimulada extends DateReal {
  constructor(...a) { if (a.length === 0 && reloj !== null) super(reloj); else super(...a); }
  static now() { return reloj ?? DateReal.now(); }
}
globalThis.Date = DateSimulada;

const { migrar, get, config } = await import('../server/db.js');
const cat = await import('../server/services/catalogo.js');
const { crearCompra } = await import('../server/services/compras.js');
const { crearVenta } = await import('../server/services/ventas.js');
const { cobrar } = await import('../server/services/deudas.js');
const { crearGasto } = await import('../server/services/finanzas.js');
migrar();

if (get('SELECT COUNT(*) AS n FROM productos').n > 0) {
  console.error('La base ya tiene productos cargados. Este script solo se usa sobre una base recién creada, para no mezclar datos.');
  process.exit(1);
}
const admin = get("SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id LIMIT 1");
if (!admin) { console.error('Primero creá el usuario administrador (npm start y entrá al sistema).'); process.exit(1); }
const user = { id: admin.id };

// ---- Números al azar repetibles (siempre genera los mismos datos).
let semilla = 20261125;
const azar = () => { semilla = (semilla + 0x6D2B79F5) | 0; let t = semilla; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const uno = (lista) => lista[Math.floor(azar() * lista.length)];
const $ = (pesos) => Math.round(pesos * 100); // pesos → centavos
let nIdem = 0; const idem = () => `ejemplo-${++nIdem}`;

const DIA = 24 * 3600 * 1000;
const ahoraReal = DateReal.now();
const inicio = new DateReal(ahoraReal - 60 * DIA); inicio.setHours(0, 0, 0, 0);
// Pone el reloj en el día d (0 = hace 60 días) a la hora h:m. Nunca pasa de la hora real.
const ponerReloj = (d, h, m = entre(0, 59)) => { reloj = Math.min(inicio.getTime() + d * DIA + (h * 60 + m) * 60000, ahoraReal - 60000); };

// ---- Catálogo: [nombre, marca, variante, unidades por caja, costo caja, precio caja, precio unidad, stock mínimo (u)]
// En cigarrillos la "caja" es el cartón de 10 atados y la "unidad" es el atado.
const catalogo = [
  ['Marlboro Box 20', 'Marlboro', 'Box 20', 10, 36000, 40500, 4300, 60],
  ['Marlboro Gold Box 20', 'Marlboro', 'Gold Box 20', 10, 36000, 40500, 4300, 40],
  ['Marlboro Común 20', 'Marlboro', 'Común 20', 10, 34000, 38500, 4100, 30],
  ['Philip Morris Box 20', 'Philip Morris', 'Box 20', 10, 31000, 35000, 3700, 60],
  ['Philip Morris Común 20', 'Philip Morris', 'Común 20', 10, 29500, 33500, 3550, 40],
  ['Lucky Strike Box 20', 'Lucky Strike', 'Box 20', 10, 33000, 37000, 3950, 40],
  ['Lucky Strike Click Box 20', 'Lucky Strike', 'Click Box 20', 10, 34500, 38800, 4150, 30],
  ['Camel Box 20', 'Camel', 'Box 20', 10, 32000, 36000, 3850, 30],
  ['Chesterfield Box 20', 'Chesterfield', 'Box 20', 10, 27000, 30500, 3250, 50],
  ['Chesterfield Común 20', 'Chesterfield', 'Común 20', 10, 25500, 29000, 3100, 30],
  ['Jockey Club Común 20', 'Jockey Club', 'Común 20', 10, 24000, 27500, 2950, 20],
  ['Derby Box 20', 'Derby', 'Box 20', 10, 22000, 25500, 2750, 30],
  ['Red Point Box 20', 'Red Point', 'Box 20', 10, 20000, 23000, 2500, 30],
  ['Encendedor Bic Maxi', 'Bic', 'Maxi x 50', 50, 37500, 45000, 1100, 100],
  ['Papelillos Smoking x 50 hojas', 'Smoking', 'Display x 25', 25, 15000, 18500, 900, 50],
];
// El stock que ya había en los depósitos al empezar a usar el sistema entra como "stock inicial" (no es una compra).
ponerReloj(0, 7);
const prods = catalogo.map(([nombre, marca, variante, upc, costo, pCaja, pUni, minimo], i) =>
  cat.crearProducto({ codigo: `P${String(i + 1).padStart(3, '0')}`, nombre, marca, variante, unidades_por_caja: upc,
    costo_caja: $(costo), precio_caja: $(pCaja), precio_unidad: $(pUni), stock_minimo: minimo,
    stock_inicial: { 1: entre(20, 35) * upc, 2: i < 6 ? entre(4, 8) * upc : 0 } }, user));
const cigarrillos = prods.slice(0, 13); const accesorios = prods.slice(13);

// ---- Clientes (comercios inventados): [nombre, modalidad, límite de crédito $, plazo días, dirección, teléfono]
const datosClientes = [
  ['Kiosco El Paso', 'contado', 0, 0, 'Av. Independencia 1450', '381 455-1203'],
  ['Maxikiosco San Martín', 'ambas', 600000, 15, 'San Martín 820', '381 462-7781'],
  ['Almacén Los Hermanos', 'fiado', 400000, 10, 'Rivadavia 2310', '381 433-0947'],
  ['Despensa Mary', 'fiado', 250000, 7, 'Lavalle 115', '381 421-6650'],
  ['Kiosco La Plaza 24 hs', 'ambas', 500000, 15, 'Plaza Independencia, local 3', '381 470-2219'],
  ['Autoservicio El Trébol', 'ambas', 900000, 30, 'Av. Mate de Luna 3200', '381 448-3390'],
  ['Polirubro Lucas', 'contado', 0, 0, 'Córdoba 640', '381 415-8822'],
  ['Drugstore Avenida', 'contado', 0, 0, 'Av. Sarmiento 1980', '381 497-1054'],
  ['Kiosco Escolar Belgrano', 'fiado', 200000, 7, 'Belgrano 455', '381 426-3318'],
  ['Almacén Doña Rosa', 'fiado', 300000, 15, 'Jujuy 1120', '381 439-5576'],
  ['Minimercado El Sol', 'ambas', 800000, 30, 'Av. Roca 2750', '381 451-9043'],
  ['Kiosco La Terminal', 'contado', 0, 0, 'Brígido Terán 250, local 12', '381 430-6687'],
];
ponerReloj(0, 8);
const clientes = datosClientes.map(([nombre, modalidad, limite, plazo, direccion, telefono]) =>
  cat.crearCliente({ nombre, modalidad, limite_credito: $(limite), plazo_dias: plazo, direccion, telefono }, user));
// Los clientes grandes tienen precio especial por cartón en las marcas que más compran.
for (const [ci, pi, precio] of [[5, 0, 39500], [5, 3, 34000], [5, 8, 29500], [10, 0, 39800], [10, 3, 34300], [1, 0, 40000], [4, 5, 36300]]) {
  cat.fijarPrecioCliente(clientes[ci].id, prods[pi].id, { precio_caja: $(precio) }, user);
}

const proveedores = ['Mayorista Tabacos del Norte', 'Distribuidora Central de Tabacos', 'Accesorios del Fumador SRL'].map((nombre, i) =>
  cat.guardarProveedor(null, { nombre, telefono: `381 40${i}-${entre(1000, 9999)}` }, user));

// Saldo con el que arrancó la caja.
if (Number(config.get('saldo_inicial_caja') || 0) === 0) config.set('saldo_inicial_caja', $(3000000));

// ---- Ayudas
const stockEn = (p, dep) => get('SELECT cantidad FROM existencias WHERE producto_id = ? AND deposito_id = ?', p.id, dep)?.cantidad ?? 0;
// Fecha de ingreso (lote) de donde sale la mercadería: el más viejo que alcance para lo pedido.
const loteParaVender = (p, dep, unidades) =>
  get('SELECT fecha_ingreso FROM lotes WHERE producto_id = ? AND deposito_id = ? AND cantidad >= ? ORDER BY fecha_ingreso, id LIMIT 1', p.id, dep, unidades)?.fecha_ingreso;
const deudaDe = (c) => get(`SELECT COALESCE(SUM(v.total - s.pagado), 0) AS d FROM ventas v JOIN v_ventas_saldo s ON s.venta_id = v.id
  WHERE v.cliente_id = ? AND v.estado = 'confirmada'`, c.id).d;
const conteo = { compras: 0, ventas: 0, cobros: 0, gastos: 0, omitidas: 0 };
const motivos = new Map(); // por qué el sistema rechazó una venta (sus reglas de negocio)

function comprar(proveedor, dep, items, pagaTodo = true) {
  const lineas = items.map(([p, cajas]) => ({ producto_id: p.id, presentacion: 'caja', cantidad: cajas, costo: p.costo_caja }));
  const total = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  // Se alterna efectivo y transferencia: si todo se pagara por banco, el saldo de transferencias quedaría negativo
  // (el saldo inicial de caja se carga como efectivo).
  const medio = conteo.compras % 2 === 0 ? 'transferencia' : 'efectivo';
  crearCompra({ idem_key: idem(), proveedor_id: proveedor.id, deposito_id: dep, lineas, pagado: pagaTodo ? total : Math.round(total * 0.6 / 100) * 100, medio }, user);
  conteo.compras++;
}

function vender(cliente) {
  const grande = cliente.limite_credito >= $(600000);
  const dep = azar() < 0.8 ? 1 : 2;
  const elegidos = new Set(); const lineas = [];
  for (let i = 0, n = entre(1, grande ? 5 : 3); i < n; i++) {
    const p = azar() < 0.85 ? uno(cigarrillos) : uno(accesorios);
    if (elegidos.has(p.id)) continue;
    const porCaja = azar() < 0.8;
    const cantidad = porCaja ? entre(1, grande ? 8 : 3) : entre(2, 8);
    const unidades = porCaja ? cantidad * p.unidades_por_caja : cantidad;
    const lote = loteParaVender(p, dep, unidades);
    if (!lote) continue;
    elegidos.add(p.id);
    lineas.push({ producto_id: p.id, presentacion: porCaja ? 'caja' : 'unidad', cantidad, fecha_ingreso: lote });
  }
  if (!lineas.length) return;
  let modalidad = cliente.modalidad === 'contado' ? 'contado' : cliente.modalidad === 'fiado' ? 'fiado' : uno(['contado', 'contado', 'fiado', 'mixto']);
  const base = { idem_key: idem(), cliente_id: cliente.id, deposito_id: dep, lineas, medio: uno(['efectivo', 'efectivo', 'transferencia']) };
  const estimado = lineas.reduce((s, l) => { const p = prods.find((x) => x.id === l.producto_id); return s + l.cantidad * (l.presentacion === 'caja' ? p.precio_caja : p.precio_unidad); }, 0);
  try {
    crearVenta({ ...base, modalidad_pago: modalidad, ...(modalidad === 'mixto' ? { pagado: Math.round(estimado * 0.3 / 100) * 100 } : {}) }, user);
    conteo.ventas++;
  } catch (e) {
    // Si el cliente pasaría su límite de crédito, en la vida real le pedís que pague: la venta va al contado.
    if (e.code === 'LIMITE_CREDITO' && cliente.modalidad !== 'fiado') { crearVenta({ ...base, idem_key: idem(), modalidad_pago: 'contado' }, user); conteo.ventas++; }
    else {
      conteo.omitidas++;
      const m = e.code === 'LIMITE_CREDITO' ? 'el cliente (solo fiado) pasaría su límite de crédito' : e.message;
      motivos.set(m, (motivos.get(m) || 0) + 1);
    }
  }
}

// ---- Simulación día por día
const dias = Math.floor((ahoraReal - inicio.getTime()) / DIA);
for (let d = 0; d <= dias; d++) {
  const fecha = new DateReal(inicio.getTime() + d * DIA);
  if (fecha.getDay() === 0) continue; // domingo cerrado

  // Compras: reposición los lunes de lo que quedó bajo en el galpón.
  if (d > 0 && fecha.getDay() === 1) {
    ponerReloj(d, 8, entre(0, 30));
    const reponer = cigarrillos.filter((p) => stockEn(p, 1) < 15 * p.unidades_por_caja).map((p) => [p, entre(15, 25)]);
    if (reponer.length) comprar(uno(proveedores.slice(0, 2)), 1, reponer, azar() < 0.7);
    if (azar() < 0.3) comprar(proveedores[2], 1, accesorios.map((p) => [p, entre(3, 6)]));
  }

  // Ventas del día (sábados, menos).
  const nVentas = fecha.getDay() === 6 ? entre(1, 3) : entre(3, 6);
  for (let i = 0; i < nVentas; i++) { ponerReloj(d, entre(9, 18)); vender(uno(clientes)); }

  // Cobros de deudas: algunos clientes pagan una parte de lo que deben.
  if (azar() < 0.55) {
    const deudores = clientes.filter((c) => deudaDe(c) > 0);
    if (deudores.length) {
      const c = uno(deudores); const deuda = deudaDe(c);
      const monto = Math.max(100, Math.round(deuda * (azar() < 0.4 ? 1 : 0.3 + azar() * 0.5) / 10000) * 10000);
      ponerReloj(d, entre(10, 19));
      cobrar({ idem_key: idem(), cliente_id: c.id, monto: Math.min(monto, deuda), medio: uno(['efectivo', 'transferencia']) }, user);
      conteo.cobros++;
    }
  }

  // Gastos: flete los viernes y, el día 1 de cada mes, alquiler, luz y sueldo del ayudante.
  if (fecha.getDay() === 5) { ponerReloj(d, 17); crearGasto({ categoria: 'transporte', descripcion: 'Flete de reparto semanal', monto: $(entre(25, 45) * 1000), medio: 'efectivo' }, user); conteo.gastos++; }
  if (fecha.getDate() === 1) {
    ponerReloj(d, 9);
    crearGasto({ categoria: 'alquiler', descripcion: 'Alquiler del galpón', monto: $(350000), medio: 'transferencia' }, user);
    crearGasto({ categoria: 'servicios', descripcion: 'Luz e internet', monto: $(entre(55, 75) * 1000), medio: 'transferencia' }, user);
    crearGasto({ categoria: 'sueldos', descripcion: 'Sueldo del ayudante de reparto', monto: $(450000), medio: 'efectivo' }, user);
    conteo.gastos += 3;
  }
}
reloj = null;

console.log(`Datos de ejemplo cargados en ${destino}
  ${prods.length} productos · ${clientes.length} clientes · ${proveedores.length} proveedores
  ${conteo.compras} compras · ${conteo.ventas} ventas · ${conteo.cobros} cobros · ${conteo.gastos} gastos (${conteo.omitidas} ventas omitidas por reglas de negocio)
Todos los datos son ficticios. Recargá el navegador para verlos.`);
for (const [m, n] of motivos) console.log(`  ${n} ventas omitidas porque ${m}.`);
