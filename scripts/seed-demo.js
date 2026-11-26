// Carga DATOS DE DEMOSTRACIÓN (ficticios) para probar el sistema: npm run demo  →  luego npm run start:demo
// Usa la base data/demo.db, nunca la real. Usuario: demo / Contraseña: demo12345
import fs from 'node:fs';
import path from 'node:path';
process.env.DB_PATH ||= 'data/demo.db';
const destino = path.resolve(process.env.DB_PATH);
if (/negocio\.db$/.test(destino)) { console.error('Por seguridad, la demo no se carga sobre negocio.db.'); process.exit(1); }
if (fs.existsSync(destino)) {
  if (!process.argv.includes('--forzar')) { console.error(`${destino} ya existe. Usá: npm run demo -- --forzar para rehacerla.`); process.exit(1); }
  for (const e of ['', '-wal', '-shm']) fs.rmSync(destino + e, { force: true });
}
const { migrar, config } = await import('../server/db.js');
const { hoy, sumarDias } = await import('../server/util.js');
const { crearUsuario } = await import('../server/auth.js');
const cat = await import('../server/services/catalogo.js');
const { crearCompra } = await import('../server/services/compras.js');
const { crearVenta } = await import('../server/services/ventas.js');
const { cobrar } = await import('../server/services/deudas.js');
const { crearGasto } = await import('../server/services/finanzas.js');
migrar();
const $ = (n) => Math.round(n * 100);
config.set('negocio_nombre', 'Distribuidora DEMO (datos ficticios)');
const u = crearUsuario({ usuario: 'demo', nombre: 'Usuario Demo', rol: 'admin', pass: 'demo12345' });
const user = { id: u.id ?? 1 };
let k = 0; const idem = () => `demo-${++k}-${Date.now()}`;

const prods = [
  ['Marca Uno Rojo', 'Marca Uno', 'Box 20', 10, 1000, 120, 1150], ['Marca Uno Suave', 'Marca Uno', 'Box 20', 10, 1000, 120, 1150],
  ['Marca Dos', 'Marca Dos', 'Box 20', 10, 850, 100, 960], ['Marca Tres Mentol', 'Marca Tres', 'Box 10', 20, 1400, 80, 1600],
].map(([nombre, marca, variante, upc, costo, pu, pc]) => cat.crearProducto({ nombre, marca, variante, unidades_por_caja: upc, costo_caja: $(costo), precio_unidad: $(pu), precio_caja: $(pc), stock_minimo: 5 }, user));

const cli = [
  cat.crearCliente({ nombre: 'Kiosco La Esquina (demo)', modalidad: 'contado' }, user),
  cat.crearCliente({ nombre: 'Almacén Don Pedro (demo)', modalidad: 'fiado', limite_credito: $(5000), plazo_dias: 15 }, user),
  cat.crearCliente({ nombre: 'Maxikiosco Centro (demo)', modalidad: 'ambas', plazo_dias: 7 }, user),
];
cat.fijarPrecioCliente(cli[1].id, prods[0].id, { precio_caja: $(1200), precio_unidad: $(125) }, user);
cat.guardarProveedor(null, { nombre: 'Proveedor Demo SA', telefono: '000-0000' }, user);

const compra = (p, dep, cajas, costo, haceDias = 0) => crearCompra({ idem_key: idem(), deposito_id: dep, lineas: [{ producto_id: p.id, presentacion: 'caja', cantidad: cajas, costo: $(costo) }],
  pagado: $(cajas * costo), ...(haceDias ? { fecha: sumarDias(hoy(), -haceDias) } : {}) }, user);
// Mercadería de meses anteriores (para ver los lotes por fecha de ingreso): lo más viejo se vende primero.
compra(prods[0], 1, 4, 900, 95); compra(prods[2], 1, 6, 800, 70); compra(prods[1], 2, 3, 950, 40);
compra(prods[0], 1, 30, 1000); compra(prods[1], 1, 20, 1000); compra(prods[2], 1, 25, 850); compra(prods[3], 2, 8, 1400); compra(prods[0], 2, 5, 1020);

const vta = (c, dep, lineas, modalidad, extra = {}) => crearVenta({ idem_key: idem(), cliente_id: c.id, deposito_id: dep, lineas, modalidad_pago: modalidad, ...extra }, user);
// Con mercadería de varias fechas en el depósito, cada línea indica de qué fecha de ingreso sale.
vta(cli[0], 1, [{ producto_id: prods[0].id, presentacion: 'caja', cantidad: 2, fecha_ingreso: sumarDias(hoy(), -95) },
  { producto_id: prods[2].id, presentacion: 'unidad', cantidad: 6, fecha_ingreso: hoy() }], 'contado');
const v2 = vta(cli[1], 1, [{ producto_id: prods[0].id, presentacion: 'caja', cantidad: 3, fecha_ingreso: hoy() }], 'fiado');
vta(cli[2], 1, [{ producto_id: prods[1].id, presentacion: 'caja', cantidad: 4 }], 'mixto', { pagado: $(2000) });
vta(cli[1], 2, [{ producto_id: prods[3].id, presentacion: 'unidad', cantidad: 10 }], 'fiado');
const idV = (v2.venta ?? v2).id;
cobrar({ idem_key: idem(), cliente_id: cli[1].id, monto: $(1000), medio: 'efectivo', aplicar: [{ venta_id: idV, monto: $(1000) }] }, user);
crearGasto({ categoria: 'transporte', monto: $(800), descripcion: 'Flete de mercadería (demo)', medio: 'efectivo' }, user);
console.log('Demo lista en', destino, '\nIngresá con usuario "demo" y contraseña "demo12345" (npm run start:demo).');
