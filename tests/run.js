// Pruebas funcionales de punta a punta. Levantan el servidor real con una base temporal y usan la API como lo hace la pantalla.
// Cubren las pruebas A–H del documento del cliente más seguridad, concurrencia e integridad contable.
//   npm test
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'distri-test-'));
const dbPath = path.join(tmp, 'test.db');
const puerto = 3200 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${puerto}`;

const TOKEN_COPIAS = crypto.randomBytes(32).toString('hex');
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(raiz, 'server/index.js')], {
  env: { ...process.env, PORT: String(puerto), DB_PATH: dbPath, HOST: '127.0.0.1', BACKUP_TOKEN: TOKEN_COPIAS }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logSrv = '';
srv.stdout.on('data', (d) => { logSrv += d; });
srv.stderr.on('data', (d) => { logSrv += d; });

function sesion() { return { cookie: '' }; }
async function api(s, method, url, body, extraHeaders = {}) {
  const r = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', ...(s?.cookie ? { cookie: s.cookie } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = r.headers.getSetCookie?.() ?? [];
  const c = sc.find((x) => x.startsWith('sid='));
  if (c && s) s.cookie = c.split(';')[0];
  let data = null; try { data = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, data };
}
const ok = async (s, m, u, b) => { const r = await api(s, m, u, b); assert.ok(r.status < 300, `${m} ${u} → ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const falla = async (s, m, u, b, status, code) => {
  const r = await api(s, m, u, b);
  assert.equal(r.status, status, `${m} ${u} debía dar ${status} y dio ${r.status}: ${JSON.stringify(r.data)}`);
  if (code) assert.equal(r.data.code, code, `código esperado ${code}, vino ${JSON.stringify(r.data)}`);
  return r.data;
};
let n = 0;
const idem = () => `test-${Date.now()}-${++n}-${Math.random().toString(36).slice(2, 8)}`;
const pesos = (x) => Math.round(x * 100); // $ → centavos
// Textos de un PDF del comprobante (en el archivo los paréntesis van escapados con \).
const textoPdf = async (url, s) => {
  const r = await fetch(base + url, { headers: { cookie: s.cookie } });
  assert.equal(r.status, 200, `PDF ${url} → ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString('latin1').replace(/\\([()\\])/g, '$1');
};

const resultados = [];
async function prueba(nombre, fn) {
  try { await fn(); resultados.push([true, nombre]); console.log(`  ✔ ${nombre}`); }
  catch (e) { resultados.push([false, nombre, e]); console.log(`  ✘ ${nombre}\n      ${String(e.message).split('\n').join('\n      ')}`); }
}

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base + '/api/estado'); if (r.ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('El servidor no arrancó:\n' + logSrv);
}

const admin = sesion(); const operador = sesion();
let G = 1; const C = 2; // depósitos Galpón y Casa

const crearProducto = (extra = {}) => ok(admin, 'POST', '/api/productos', {
  nombre: 'Marlboro Rojo', marca: 'Marlboro', variante: 'Box 20', unidades_por_caja: 10,
  costo_caja: pesos(1000), precio_unidad: pesos(120), precio_caja: pesos(1150), stock_minimo: 5, ...extra,
});
const crearCliente = (extra = {}) => ok(admin, 'POST', '/api/clientes', { nombre: 'Cliente', modalidad: 'contado', ...extra });
const comprar = (pid, cajas, costoCaja, dep = G, extra = {}) => ok(admin, 'POST', '/api/compras', {
  idem_key: idem(), deposito_id: dep, lineas: [{ producto_id: pid, presentacion: 'caja', cantidad: cajas, costo: costoCaja }],
  pagado: cajas * costoCaja, ...extra,
});
const vender = (cliente, dep, lineas, extra = {}) => api(admin, 'POST', '/api/ventas', {
  idem_key: idem(), cliente_id: cliente, deposito_id: dep, lineas, modalidad_pago: 'contado', ...extra,
});
const producto = (id) => ok(admin, 'GET', `/api/productos/${id}`);
const saldoCaja = async () => (await ok(admin, 'GET', '/api/caja')).saldo.total;
const resumenHoy = async () => (await ok(admin, 'GET', '/api/ganancias')).actual;
const cliente = async (id) => (await ok(admin, 'GET', `/api/clientes/${id}`)).cliente;

function db() { return new DatabaseSync(dbPath, { readOnly: true }); }

async function main() {
  await esperarServidor();
  console.log('\nSeguridad y acceso');

  await prueba('Sin sesión no se puede leer ningún dato', async () => {
    await falla(null, 'GET', '/api/productos', undefined, 401);
    await falla(null, 'GET', '/api/dashboard', undefined, 401);
    await falla(null, 'GET', '/api/backups/descargar', undefined, 401);
  });
  await prueba('Se crea el primer administrador una sola vez', async () => {
    const e = await ok(null, 'GET', '/api/estado');
    assert.equal(e.necesita_configuracion, true);
    assert.equal(e.demo, false); // la base real nunca muestra el cartel de demostración
    await falla(admin, 'POST', '/api/configuracion-inicial', { usuario: 'juan', nombre: 'Juan', pass: '1234' }, 400); // clave corta
    await ok(admin, 'POST', '/api/configuracion-inicial', { usuario: 'duenio', nombre: 'Dueño', pass: 'clave-segura-1', negocio_nombre: 'Distribuidora Test' });
    await falla(sesion(), 'POST', '/api/configuracion-inicial', { usuario: 'otro', nombre: 'X', pass: 'clave-segura-2' }, 403);
    const yo = await ok(admin, 'GET', '/api/estado');
    assert.equal(yo.usuario.rol, 'admin');
  });
  await prueba('Pedidos sin la cabecera de seguridad o de otro origen se rechazan (CSRF)', async () => {
    const r1 = await fetch(base + '/api/productos', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin.cookie }, body: '{}' });
    assert.equal(r1.status, 403);
    const r2 = await fetch(base + '/api/productos', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', cookie: admin.cookie, origin: 'http://sitio-malo.com' }, body: '{}' });
    assert.equal(r2.status, 403);
  });
  await prueba('Login: clave incorrecta, bloqueo tras 5 intentos y cookie HttpOnly', async () => {
    const s = sesion();
    await falla(s, 'POST', '/api/login', { usuario: 'duenio', pass: 'mala' }, 401);
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify({ usuario: 'duenio', pass: 'clave-segura-1' }) });
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
    for (let i = 0; i < 5; i++) await api(sesion(), 'POST', '/api/login', { usuario: 'fantasma', pass: 'x' });
    await falla(sesion(), 'POST', '/api/login', { usuario: 'fantasma', pass: 'x' }, 429);
  });
  await prueba('Un usuario operador puede vender pero no anular ni administrar', async () => {
    await ok(admin, 'POST', '/api/usuarios', { usuario: 'socio', nombre: 'Socio', rol: 'usuario', pass: 'otra-clave-123' });
    await ok(operador, 'POST', '/api/login', { usuario: 'socio', pass: 'otra-clave-123' });
    await falla(operador, 'GET', '/api/usuarios', undefined, 403);
    await falla(operador, 'POST', '/api/ventas/1/anular', { motivo: 'prueba' }, 403);
    await falla(operador, 'GET', '/api/backups', undefined, 403);
    await ok(operador, 'GET', '/api/productos');
  });
  await prueba('Cambiar el nombre de usuario: valida, no se repite, se entra con el nuevo y queda registrado', async () => {
    const u = await ok(admin, 'POST', '/api/usuarios', { usuario: 'renombrar', nombre: 'Para renombrar', rol: 'admin', pass: 'clave-renombre-1' });
    await falla(admin, 'PUT', `/api/usuarios/${u.id}`, { usuario: 'con espacio' }, 400);
    await falla(admin, 'PUT', `/api/usuarios/${u.id}`, { usuario: 'ab' }, 400);
    await falla(admin, 'PUT', `/api/usuarios/${u.id}`, { usuario: 'SOCIO' }, 400); // ya existe "socio" (sin importar mayúsculas)
    await falla(operador, 'PUT', `/api/usuarios/${u.id}`, { usuario: 'otro.nombre' }, 403);
    const r = await ok(admin, 'PUT', `/api/usuarios/${u.id}`, { usuario: 'renombrado', nombre: 'Para renombrar', rol: 'admin' });
    assert.equal(r.usuario, 'renombrado');
    await falla(sesion(), 'POST', '/api/login', { usuario: 'renombrar', pass: 'clave-renombre-1' }, 401);
    await ok(sesion(), 'POST', '/api/login', { usuario: 'renombrado', pass: 'clave-renombre-1' });
    const d = db(); const a = d.prepare("SELECT detalle FROM auditoria WHERE accion = 'editar' AND entidad = 'usuario' AND entidad_id = ? ORDER BY id DESC").get(u.id); d.close();
    assert.match(a.detalle, /"usuario_antes":"renombrar".*"usuario_despues":"renombrado"/);
    // Mandar el mismo nombre (como hace el formulario al editar otra cosa) no da error
    await ok(admin, 'PUT', `/api/usuarios/${u.id}`, { usuario: 'renombrado', nombre: 'Renombrado', rol: 'admin' });
  });

  await prueba('Recuperar contraseña: código simulado de un solo uso, que vence, se bloquea y no revela usuarios', async () => {
    await ok(admin, 'POST', '/api/usuarios', { usuario: 'olvidadizo', nombre: 'Olvidadizo', rol: 'usuario', pass: 'clave-vieja-123' });
    const viejaSesion = sesion();
    await ok(viejaSesion, 'POST', '/api/login', { usuario: 'olvidadizo', pass: 'clave-vieja-123' });
    // El "envío" simulado escribe el código en la consola del servidor: lo leemos de ahí, como lo haría el usuario.
    const ultimoCodigo = async (usuario) => {
      for (let i = 0; i < 20; i++) {
        const m = [...logSrv.matchAll(new RegExp(`usuario "${usuario}"\\)\\. Código de recuperación: (\\d{6})`, 'g'))].pop();
        if (m) return m[1];
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('No apareció el código en la consola');
    };
    // Un usuario que no existe recibe la misma respuesta (no se puede averiguar quién existe)
    assert.deepEqual(await ok(sesion(), 'POST', '/api/recuperar-clave/pedir', { usuario: 'nadie-asi' }), { ok: true });
    await falla(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'nadie-asi', codigo: '123456', nueva: 'otra-clave-999' }, 400);
    // Pedir código y usarlo
    await ok(sesion(), 'POST', '/api/recuperar-clave/pedir', { usuario: 'olvidadizo' });
    const c1 = await ultimoCodigo('olvidadizo');
    const malo = c1 === '000000' ? '111111' : '000000';
    await falla(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: malo, nueva: 'clave-nueva-456' }, 400);
    await falla(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: c1, nueva: '123' }, 400); // clave nueva corta: el código sigue sirviendo
    await ok(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: c1, nueva: 'clave-nueva-456' });
    await falla(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: c1, nueva: 'otra-mas-789' }, 400); // un solo uso
    await falla(sesion(), 'POST', '/api/login', { usuario: 'olvidadizo', pass: 'clave-vieja-123' }, 401);
    await ok(sesion(), 'POST', '/api/login', { usuario: 'olvidadizo', pass: 'clave-nueva-456' });
    await falla(viejaSesion, 'GET', '/api/productos', undefined, 401); // la sesión abierta con la clave vieja se cerró
    // 5 errores bloquean el código
    await ok(sesion(), 'POST', '/api/recuperar-clave/pedir', { usuario: 'olvidadizo' });
    const c2 = await ultimoCodigo('olvidadizo');
    const malo2 = c2 === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await api(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: malo2, nueva: 'clave-nueva-777' });
    await falla(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: c2, nueva: 'clave-nueva-777' }, 400);
    // Más de 3 pedidos en 15 minutos se frenan (este es el 3.º, el 4.º se rechaza)
    await ok(sesion(), 'POST', '/api/recuperar-clave/pedir', { usuario: 'olvidadizo' });
    await falla(sesion(), 'POST', '/api/recuperar-clave/pedir', { usuario: 'olvidadizo' }, 429);
    // Un código vencido (pasaron los 15 minutos) ya no sirve: simulamos el paso del tiempo en la base
    const c3 = await ultimoCodigo('olvidadizo');
    const dw = new DatabaseSync(dbPath);
    dw.prepare("UPDATE recuperaciones_clave SET expira = 0 WHERE estado = 'pendiente'").run();
    dw.close();
    await falla(sesion(), 'POST', '/api/recuperar-clave/confirmar', { usuario: 'olvidadizo', codigo: c3, nueva: 'clave-nueva-888' }, 400);
    // Queda el historial: nada se borra, en la base solo hay hashes y todo queda auditado
    const d = db();
    const estados = d.prepare("SELECT r.estado FROM recuperaciones_clave r JOIN usuarios u ON u.id = r.usuario_id WHERE u.usuario = 'olvidadizo' ORDER BY r.id").all().map((r) => r.estado);
    const hashes = d.prepare('SELECT codigo_hash FROM recuperaciones_clave').all().map((r) => r.codigo_hash);
    const aud = d.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'recuperar_clave'").get().n;
    d.close();
    assert.deepEqual(estados, ['usada', 'bloqueada', 'pendiente']);
    assert.ok(!hashes.includes(c1) && !hashes.includes(c2));
    assert.equal(aud, 1);
  });

  // ============================================================ PRUEBA A
  console.log('\nPrueba A: venta al contado');
  let P; let cA; let ventaA;
  await prueba('A: venta contado descuenta stock, registra cobro y calcula ganancia con costo histórico', async () => {
    P = await crearProducto();
    cA = await crearCliente({ nombre: 'Kiosco Contado' });
    await comprar(P.id, 5, pesos(1000)); // 50 unidades a $100 c/u
    assert.equal((await producto(P.id)).stock_galpon, 50);
    const cajaAntes = await saldoCaja();
    const r = await vender(cA.id, G, [
      { producto_id: P.id, presentacion: 'caja', cantidad: 1 },
      { producto_id: P.id, presentacion: 'unidad', cantidad: 3 },
    ]);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    ventaA = r.data.venta;
    assert.equal(ventaA.total, pesos(1150) + 3 * pesos(120));              // 1.510
    assert.equal(ventaA.pagado, ventaA.total); assert.equal(ventaA.saldo, 0);
    assert.equal((await producto(P.id)).stock_galpon, 50 - 13);          // 1 caja (10) + 3 unidades
    assert.equal((await saldoCaja()) - cajaAntes, ventaA.total);          // el cobro entró a caja
    assert.equal(ventaA.lineas[0].costo_total, pesos(1000));              // costo histórico de una caja
    assert.equal(ventaA.lineas[1].costo_total, 3 * pesos(100));
    assert.equal(ventaA.ganancia, ventaA.total - pesos(1000) - pesos(300));
  });
  await prueba('A: las estadísticas se actualizan', async () => {
    const r = await resumenHoy();
    assert.equal(r.ventas_total, pesos(1510));
    assert.equal(r.ganancia_bruta, pesos(1510) - pesos(1300));
    assert.equal(r.cobros_ventas, pesos(1510));
    const d = await ok(admin, 'GET', '/api/dashboard');
    assert.equal(d.periodo.ventas_total, pesos(1510));
    assert.ok(d.top_productos.length === 1);
  });

  // ============================================================ PRUEBA B
  console.log('\nPrueba B: venta fiada');
  let cB; let ventaB;
  await prueba('B: la venta fiada baja stock, sube la deuda y NO suma plata a la caja', async () => {
    cB = await crearCliente({ nombre: 'Almacén Fiado', modalidad: 'fiado' });
    const stockAntes = (await producto(P.id)).stock_galpon;
    const cajaAntes = await saldoCaja();
    const r = await vender(cB.id, G, [{ producto_id: P.id, presentacion: 'caja', cantidad: 2 }], { modalidad_pago: 'fiado' });
    assert.equal(r.status, 201); ventaB = r.data.venta;
    assert.equal(ventaB.total, pesos(2300)); assert.equal(ventaB.pagado, 0); assert.equal(ventaB.saldo, pesos(2300));
    assert.equal((await producto(P.id)).stock_galpon, stockAntes - 20);
    assert.equal(await saldoCaja(), cajaAntes);
    assert.equal((await cliente(cB.id)).deuda, pesos(2300));
    const deudas = await ok(admin, 'GET', '/api/deudas');
    const d = deudas.find((x) => x.venta_id === ventaB.id);
    assert.equal(d.saldo, pesos(2300)); assert.equal(d.estado_deuda, 'pendiente');
  });
  await prueba('B: a un cliente de contado no se le puede dejar deuda', async () => {
    await falla(admin, 'POST', '/api/ventas', {
      idem_key: idem(), cliente_id: cA.id, deposito_id: G, modalidad_pago: 'fiado',
      lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1 }],
    }, 400, 'CLIENTE_CONTADO');
  });
  await prueba('B: venta mixta (paga una parte y queda deuda por el resto)', async () => {
    const cajaAntes = await saldoCaja();
    const r = await vender(cB.id, G, [{ producto_id: P.id, presentacion: 'caja', cantidad: 1 }], { modalidad_pago: 'mixto', pagado: pesos(500) });
    assert.equal(r.status, 201);
    assert.equal(r.data.venta.pagado, pesos(500)); assert.equal(r.data.venta.saldo, pesos(650));
    assert.equal((await saldoCaja()) - cajaAntes, pesos(500));
    assert.equal(r.data.venta.estado_deuda, 'parcial');
  });

  // ============================================================ PRUEBA C
  console.log('\nPrueba C: pagos parciales');
  let cC; let ventaC;
  await prueba('C: deuda de $2.000 → pago 500 → saldo 1.500 → pago 700 → saldo 800, con historial y caja', async () => {
    await comprar(P.id, 10, pesos(1000)); // más mercadería para las pruebas siguientes
    cC = await crearCliente({ nombre: 'Distribuidora Norte', modalidad: 'ambas' });
    const r = await vender(cC.id, G, [{ producto_id: P.id, presentacion: 'caja', cantidad: 1, precio: pesos(2000) }], { modalidad_pago: 'fiado' });
    ventaC = r.data.venta;
    assert.equal(ventaC.total, pesos(2000));
    assert.equal(ventaC.lineas[0].precio_lista, pesos(1150)); // queda registrado que se cambió el precio
    const cajaAntes = await saldoCaja();
    const p1 = await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: pesos(500), medio: 'efectivo' });
    assert.equal(p1.cliente_saldo.deuda, pesos(1500));
    const p2 = await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: pesos(700), medio: 'transferencia' });
    assert.equal(p2.cliente_saldo.deuda, pesos(800));
    assert.equal((await saldoCaja()) - cajaAntes, pesos(1200));
    const v = await ok(admin, 'GET', `/api/ventas/${ventaC.id}`);
    assert.equal(v.total, pesos(2000)); assert.equal(v.pagado, pesos(1200)); assert.equal(v.saldo, pesos(800));
    assert.equal(v.pagos.length, 2); assert.equal(v.estado_deuda, 'parcial');
    const caja = await ok(admin, 'GET', '/api/caja?categoria=cobro_deuda');
    assert.equal(caja.movimientos.filter((m) => m.concepto.includes('Distribuidora Norte')).length, 2);
    const g = await resumenHoy(); // el cobro posterior NO vuelve a generar la ganancia de la venta
    const gananciaVentaC = pesos(2000) - pesos(1000);
    assert.ok(g.ganancia_bruta >= gananciaVentaC);
  });
  await prueba('C: la ganancia no cambia al cobrar deudas (solo cambia la caja)', async () => {
    const antes = await resumenHoy();
    await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: pesos(100) });
    const despues = await resumenHoy();
    assert.equal(despues.ganancia_bruta, antes.ganancia_bruta);
    assert.equal(despues.ventas_total, antes.ventas_total);
    assert.equal(despues.cobros_deudas - antes.cobros_deudas, pesos(100));
  });
  await prueba('C: pagos inválidos y excedentes', async () => {
    await falla(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: -500 }, 400);
    await falla(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: 0 }, 400);
    await falla(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: 12.5 }, 400);
    // Debe 700. Paga 1.000 sin decir qué hacer con el excedente → el sistema lo exige
    const e = await falla(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: pesos(1000) }, 409, 'EXCEDENTE');
    assert.equal(e.extra.excedente, pesos(300));
    assert.equal((await cliente(cC.id)).deuda, pesos(700)); // no se guardó nada
    const cajaAntes = await saldoCaja();
    const r = await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: pesos(1000), excedente: 'vuelto' });
    assert.equal(r.pago.monto, pesos(700)); // solo se registra lo que se aplica
    assert.equal((await saldoCaja()) - cajaAntes, pesos(700));
    assert.equal((await cliente(cC.id)).deuda, 0);
    assert.equal((await cliente(cC.id)).saldo_favor, 0);
  });
  await prueba('C: excedente como saldo a favor, y se aplica a una deuda nueva', async () => {
    const r0 = await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: cC.id, monto: pesos(300), excedente: 'saldo_a_favor' });
    assert.equal(r0.cliente_saldo.saldo_favor, pesos(300));
    const v = await vender(cC.id, G, [{ producto_id: P.id, presentacion: 'unidad', cantidad: 5 }], { modalidad_pago: 'fiado' });
    assert.equal(v.data.venta.total, pesos(600));
    const ap = await ok(admin, 'POST', `/api/clientes/${cC.id}/aplicar-saldo-favor`);
    assert.equal(ap.aplicado, pesos(300));
    const c = await cliente(cC.id);
    assert.equal(c.deuda, pesos(300)); assert.equal(c.saldo_favor, 0);
  });
  await prueba('C: se puede repartir un pago eligiendo deudas y anularlo', async () => {
    const c = await crearCliente({ nombre: 'Reparto', modalidad: 'fiado' });
    const v1 = (await vender(c.id, G, [{ producto_id: P.id, presentacion: 'unidad', cantidad: 2 }], { modalidad_pago: 'fiado' })).data.venta; // 240
    const v2 = (await vender(c.id, G, [{ producto_id: P.id, presentacion: 'unidad', cantidad: 3 }], { modalidad_pago: 'fiado' })).data.venta; // 360
    const cajaAntes = await saldoCaja();
    const p = await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: c.id, monto: pesos(300), aplicar: [{ venta_id: v2.id, monto: pesos(300) }] });
    assert.equal((await ok(admin, 'GET', `/api/ventas/${v2.id}`)).saldo, pesos(60));
    assert.equal((await ok(admin, 'GET', `/api/ventas/${v1.id}`)).saldo, pesos(240));
    await falla(operador, 'POST', `/api/pagos/${p.pago.id}/anular`, { motivo: 'error de carga' }, 403);
    await ok(admin, 'POST', `/api/pagos/${p.pago.id}/anular`, { motivo: 'Error de carga' });
    assert.equal((await cliente(c.id)).deuda, pesos(600));
    assert.equal(await saldoCaja(), cajaAntes); // la caja volvió al valor de antes
    await falla(admin, 'POST', `/api/pagos/${p.pago.id}/anular`, { motivo: 'otra vez' }, 409);
  });

  // ============================================================ PRUEBA D
  console.log('\nPrueba D: precios personalizados');
  await prueba('D: cada cliente paga su precio y los cambios no tocan ventas anteriores', async () => {
    const c1 = await crearCliente({ nombre: 'Cliente Uno' }); const c2 = await crearCliente({ nombre: 'Cliente Dos' });
    const c3 = await crearCliente({ nombre: 'Cliente General' });
    const pr = await crearProducto({ nombre: 'Philip Morris', variante: 'Box 20', precio_caja: pesos(1200), precio_unidad: pesos(125) });
    await comprar(pr.id, 6, pesos(1000));
    await ok(admin, 'PUT', `/api/clientes/${c1.id}/precios/${pr.id}`, { precio_caja: pesos(1100), precio_unidad: pesos(115) });
    await ok(admin, 'PUT', `/api/clientes/${c2.id}/precios/${pr.id}`, { precio_caja: pesos(1250), precio_unidad: null }); // unidad usa el general
    const v1 = (await vender(c1.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }, { producto_id: pr.id, presentacion: 'unidad', cantidad: 2 }])).data.venta;
    const v2 = (await vender(c2.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }, { producto_id: pr.id, presentacion: 'unidad', cantidad: 2 }])).data.venta;
    const v3 = (await vender(c3.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }])).data.venta;
    assert.equal(v1.lineas[0].precio, pesos(1100)); assert.equal(v1.lineas[1].precio, pesos(115));
    assert.equal(v2.lineas[0].precio, pesos(1250)); assert.equal(v2.lineas[1].precio, pesos(125)); // cae al precio general
    assert.equal(v3.lineas[0].precio, pesos(1200));                                                // sin lista propia → general
    // Cambiar las listas y el precio general
    await ok(admin, 'PUT', `/api/clientes/${c1.id}/precios/${pr.id}`, { precio_caja: pesos(900), precio_unidad: pesos(90) });
    await ok(admin, 'PUT', `/api/productos/${pr.id}`, { ...pr, precio_caja: pesos(1500), precio_unidad: pesos(150) });
    const rel = await ok(admin, 'GET', `/api/ventas/${v1.id}`);
    assert.equal(rel.lineas[0].precio, pesos(1100)); assert.equal(rel.total, v1.total);
    const nueva = (await vender(c1.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }])).data.venta;
    assert.equal(nueva.lineas[0].precio, pesos(900));
    const lista = await ok(admin, 'GET', `/api/clientes/${c1.id}/precios`);
    assert.equal(lista.find((x) => x.producto_id === pr.id).especial_caja, pesos(900));
  });
  await prueba('D: descuento y precio modificado quedan registrados y los importes son exactos', async () => {
    const c = await crearCliente({ nombre: 'Con descuento' });
    const pr = await crearProducto({ nombre: 'Lucky', precio_caja: pesos(1000), precio_unidad: pesos(100) });
    await comprar(pr.id, 2, pesos(800));
    const r = await vender(c.id, G, [
      { producto_id: pr.id, presentacion: 'caja', cantidad: 1 },
      { producto_id: pr.id, presentacion: 'unidad', cantidad: 3, precio: pesos(90) },
    ], { descuento: pesos(100) + 1 }); // 100,01 de descuento (repartido sin perder centavos)
    assert.equal(r.status, 201);
    const v = r.data.venta;
    assert.equal(v.total, pesos(1000) + pesos(270) - pesos(100) - 1);
    assert.equal(v.lineas.reduce((s, l) => s + l.ingreso_neto, 0), v.total);
    assert.equal(v.lineas.reduce((s, l) => s + l.descuento_asignado, 0), pesos(100) + 1);
    const aud = await ok(admin, 'GET', '/api/auditoria?entidad=venta');
    assert.ok(aud.some((a) => a.entidad_id === v.id && /precios_modificados/.test(a.detalle)));
  });

  // ============================================================ PRUEBA E
  console.log('\nPrueba E: dos depósitos');
  await prueba('E: transferir entre Galpón y Casa mueve el stock sin generar ventas, cobros ni ganancia', async () => {
    const pr = await crearProducto({ nombre: 'Camel', unidades_por_caja: 20, costo_caja: pesos(2000), precio_caja: pesos(2400), precio_unidad: pesos(125) });
    await comprar(pr.id, 2, pesos(2000), G);              // 40 unidades en el galpón
    await ok(admin, 'POST', '/api/stock/entrada', { producto_id: pr.id, deposito_id: C, presentacion: 'unidad', cantidad: 15, motivo: 'Stock que ya tenía en casa' });
    let p = await producto(pr.id);
    assert.equal(p.stock_galpon, 40); assert.equal(p.stock_casa, 15); assert.equal(p.stock_total, 55);
    const antes = await resumenHoy(); const cajaAntes = await saldoCaja(); const valorAntes = (await ok(admin, 'GET', '/api/dashboard')).general.valor_inventario;
    await ok(admin, 'POST', '/api/stock/transferencia', { producto_id: pr.id, origen: G, destino: C, presentacion: 'caja', cantidad: 1, motivo: 'Reposición de casa' });
    p = await producto(pr.id);
    assert.equal(p.stock_galpon, 20); assert.equal(p.stock_casa, 35); assert.equal(p.stock_total, 55);
    const despues = await resumenHoy();
    assert.equal(despues.ventas_total, antes.ventas_total); assert.equal(despues.ganancia_bruta, antes.ganancia_bruta);
    assert.equal(despues.cobros, antes.cobros); assert.equal(await saldoCaja(), cajaAntes);
    assert.equal((await ok(admin, 'GET', '/api/dashboard')).general.valor_inventario, valorAntes);
    const movs = await ok(admin, 'GET', `/api/stock/movimientos?producto_id=${pr.id}&tipo=transferencia`);
    assert.equal(movs.length, 1); assert.equal(movs[0].origen, 'Galpón'); assert.equal(movs[0].destino, 'Casa');
    // No se puede transferir más de lo que hay ni al mismo depósito
    await falla(admin, 'POST', '/api/stock/transferencia', { producto_id: pr.id, origen: G, destino: C, presentacion: 'unidad', cantidad: 21 }, 400, 'SIN_STOCK');
    await falla(admin, 'POST', '/api/stock/transferencia', { producto_id: pr.id, origen: G, destino: G, presentacion: 'unidad', cantidad: 1 }, 400);
    assert.equal((await producto(pr.id)).stock_total, 55);
    // La venta descuenta del depósito elegido
    const c = await crearCliente({ nombre: 'Compra en casa' });
    await vender(c.id, C, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 5 }]);
    p = await producto(pr.id);
    assert.equal(p.stock_galpon, 20); assert.equal(p.stock_casa, 30);
  });
  await prueba('E: merma y ajuste de inventario quedan registrados y afectan el resultado', async () => {
    const pr = await crearProducto({ nombre: 'Merma Test' });
    await comprar(pr.id, 1, pesos(1000), G); // 10 unidades a $100
    const antes = await resumenHoy();
    await ok(admin, 'POST', '/api/stock/merma', { producto_id: pr.id, deposito_id: G, presentacion: 'unidad', cantidad: 2, motivo: 'Paquetes mojados' });
    assert.equal((await producto(pr.id)).stock_galpon, 8);
    await ok(admin, 'POST', '/api/stock/ajuste', { producto_id: pr.id, deposito_id: G, nuevo_total_unidades: 7, motivo: 'Conteo físico' });
    assert.equal((await producto(pr.id)).stock_galpon, 7);
    await falla(admin, 'POST', '/api/stock/ajuste', { producto_id: pr.id, deposito_id: G, nuevo_total_unidades: 7, motivo: 'Igual' }, 400);
    const despues = await resumenHoy();
    assert.equal(despues.mermas_ajustes - antes.mermas_ajustes, pesos(300)); // 2 + 1 unidades a $100
    assert.equal(despues.resultado_neto - antes.resultado_neto, -pesos(300));
    await falla(admin, 'POST', '/api/stock/merma', { producto_id: pr.id, deposito_id: G, presentacion: 'unidad', cantidad: 99, motivo: 'imposible' }, 400, 'SIN_STOCK');
  });

  // ============================================================ PRUEBA F
  console.log('\nPrueba F: costo promedio y rentabilidad');
  await prueba('F: la rentabilidad de ventas anteriores no cambia al comprar a otro costo', async () => {
    const pr = await crearProducto({ nombre: 'Costo Test', unidades_por_caja: 10, precio_unidad: pesos(120), precio_caja: pesos(1150) });
    const c = await crearCliente({ nombre: 'Para costos' });
    await comprar(pr.id, 1, pesos(1000)); // 10 u a $100
    const v1 = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 4 }])).data.venta;
    assert.equal(v1.lineas[0].costo_total, pesos(400));
    assert.equal(v1.ganancia, pesos(480) - pesos(400));
    assert.equal(v1.margen_pct, Math.round((8000 / 48000) * 10000) / 100); // 16,67 % sobre ventas
    assert.equal(v1.recargo_pct, 20);                                       // 20 % sobre costo (no son lo mismo)
    await comprar(pr.id, 1, pesos(1200)); // 10 u a $120: stock 16 u, valor 600+1200 = 1.800 → promedio $112,50
    const p = await producto(pr.id);
    assert.equal(p.stock_galpon, 16); assert.equal(p.costo_unidad, 11250); assert.equal(p.costo_caja_promedio, 112500);
    const v2 = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 4 }])).data.venta;
    assert.equal(v2.lineas[0].costo_total, pesos(450));
    const v1b = await ok(admin, 'GET', `/api/ventas/${v1.id}`);
    assert.equal(v1b.lineas[0].costo_total, pesos(400)); assert.equal(v1b.ganancia, pesos(80));
    assert.equal((await producto(pr.id)).valor_inventario, pesos(1350)); // 12 u × 112,50
  });
  await prueba('F: el descuento de compra baja el costo y el costo unitario no pierde centavos', async () => {
    const pr = await crearProducto({ nombre: 'Descuento compra', unidades_por_caja: 3, precio_unidad: pesos(500), precio_caja: pesos(1400) });
    await ok(admin, 'POST', '/api/compras', { idem_key: idem(), deposito_id: G, lineas: [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1, costo: 100000 }], descuento: 1, pagado: 99999 });
    const p = await producto(pr.id);
    assert.equal(p.valor_inventario, 99999); // 3 unidades, valor exacto en centavos
    const c = await crearCliente({ nombre: 'Redondeo' });
    let costos = 0;
    for (let i = 0; i < 3; i++) costos += (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1 }])).data.venta.lineas[0].costo_total;
    assert.equal(costos, 99999); // las 3 ventas suman exactamente lo que costó la compra
    assert.equal((await producto(pr.id)).valor_inventario, 0);
  });

  // ============================================================ PRUEBA G
  console.log('\nPrueba G: anulación');
  await prueba('G: anular una venta fiada con pagos revierte stock, deuda y caja, y queda auditada', async () => {
    const pr = await crearProducto({ nombre: 'Anulable' });
    await comprar(pr.id, 3, pesos(1000));
    const c = await crearCliente({ nombre: 'Anulaciones', modalidad: 'fiado' });
    const cajaInicial = await saldoCaja(); const stockInicial = (await producto(pr.id)).stock_galpon;
    const resAntes = await resumenHoy();
    const v = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 2 }], { modalidad_pago: 'mixto', pagado: pesos(1000) })).data.venta;
    assert.equal(v.saldo, pesos(1300));
    await falla(operador, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'Se equivocó' }, 403);
    await falla(admin, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'x' }, 400); // motivo muy corto
    const e = await falla(admin, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'Cliente devolvió todo' }, 409, 'TIENE_PAGOS');
    assert.equal(e.extra.cobrado, pesos(1000));
    const a = await ok(admin, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'Cliente devolvió todo', destino_pagos: 'devolver' });
    assert.equal(a.estado, 'anulada');
    assert.equal((await producto(pr.id)).stock_galpon, stockInicial);   // stock recuperado
    assert.equal(await saldoCaja(), cajaInicial);                        // el dinero devuelto compensó el cobro
    assert.equal((await cliente(c.id)).deuda, 0);                        // sin deuda
    const resDespues = await resumenHoy();
    assert.equal(resDespues.ventas_total, resAntes.ventas_total);        // no cuenta como venta
    assert.equal(resDespues.ganancia_bruta, resAntes.ganancia_bruta);
    assert.equal(resDespues.cobros, resAntes.cobros);
    const lista = await ok(admin, 'GET', `/api/ventas?cliente_id=${c.id}`);
    assert.equal(lista.length, 1); assert.equal(lista[0].estado, 'anulada'); // sigue en el historial
    assert.equal((await producto(pr.id)).valor_inventario, 3 * pesos(1000)); // el costo volvió al inventario
    await falla(admin, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'otra vez', destino_pagos: 'devolver' }, 409);
    const aud = await ok(admin, 'GET', '/api/auditoria?entidad=venta');
    assert.ok(aud.some((x) => x.accion === 'anular' && x.entidad_id === v.id));
  });
  await prueba('G: anular dejando el cobro como saldo a favor', async () => {
    const pr = await crearProducto({ nombre: 'Anulable 2' });
    await comprar(pr.id, 1, pesos(1000));
    const c = await crearCliente({ nombre: 'Saldo a favor' });
    const cajaAntes = await saldoCaja();
    const v = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }])).data.venta;
    await ok(admin, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'Cambio de pedido', destino_pagos: 'saldo_a_favor' });
    assert.equal((await cliente(c.id)).saldo_favor, pesos(1150));
    assert.equal((await saldoCaja()) - cajaAntes, pesos(1150)); // la plata sigue en caja: es saldo a favor del cliente
  });
  await prueba('G: anular una compra devuelve el stock y reintegra el pago', async () => {
    const pr = await crearProducto({ nombre: 'Compra anulable' });
    const cajaAntes = await saldoCaja();
    const comp = (await comprar(pr.id, 2, pesos(1000))).compra;
    assert.equal(await saldoCaja(), cajaAntes - pesos(2000));
    await falla(admin, 'POST', `/api/compras/${comp.id}/anular`, { motivo: 'Error de carga' }, 409, 'TIENE_PAGOS');
    await ok(admin, 'POST', `/api/compras/${comp.id}/anular`, { motivo: 'Error de carga', destino_pagos: 'reintegro' });
    assert.equal(await saldoCaja(), cajaAntes);
    const p = await producto(pr.id);
    assert.equal(p.stock_total, 0); assert.equal(p.valor_inventario, 0);
    // Si ya se vendió la mercadería, no se puede anular la compra
    const comp2 = (await comprar(pr.id, 1, pesos(1000))).compra;
    const c = await crearCliente({ nombre: 'Compró lo de la compra' });
    await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 4 }]);
    await falla(admin, 'POST', `/api/compras/${comp2.id}/anular`, { motivo: 'Tarde', destino_pagos: 'reintegro' }, 400, 'SIN_STOCK');
    assert.equal((await producto(pr.id)).stock_galpon, 6);
  });

  // ============================================================ PRUEBA H
  console.log('\nPrueba H: errores y consistencia');
  await prueba('H: no se vende más de lo disponible y no queda nada a medias', async () => {
    const pr = await crearProducto({ nombre: 'Poco stock' }); const pr2 = await crearProducto({ nombre: 'Otro producto' });
    await comprar(pr.id, 1, pesos(1000)); await comprar(pr2.id, 1, pesos(1000)); // 10 u cada uno
    const c = await crearCliente({ nombre: 'Error test' });
    const db0 = db(); const ventasAntes = db0.prepare('SELECT COUNT(*) n FROM ventas').get().n; const movAntes = db0.prepare('SELECT COUNT(*) n FROM mov_stock').get().n; db0.close();
    const cajaAntes = await saldoCaja();
    // La 1ª línea es válida y la 2ª no tiene stock → se revierte TODO
    const r = await vender(c.id, G, [{ producto_id: pr2.id, presentacion: 'unidad', cantidad: 5 }, { producto_id: pr.id, presentacion: 'unidad', cantidad: 11 }]);
    assert.equal(r.status, 400); assert.equal(r.data.code, 'SIN_STOCK'); assert.match(r.data.error, /hay 10 unidades/);
    assert.equal((await producto(pr2.id)).stock_galpon, 10); assert.equal((await producto(pr.id)).stock_galpon, 10);
    assert.equal(await saldoCaja(), cajaAntes);
    const db1 = db();
    assert.equal(db1.prepare('SELECT COUNT(*) n FROM ventas').get().n, ventasAntes);
    assert.equal(db1.prepare('SELECT COUNT(*) n FROM mov_stock').get().n, movAntes);
    db1.close();
    await falla(admin, 'POST', '/api/ventas', { idem_key: idem(), cliente_id: c.id, deposito_id: C, modalidad_pago: 'contado', lineas: [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1 }] }, 400, 'SIN_STOCK'); // en Casa no hay
  });
  await prueba('H: venta sin productos, cantidades o importes inválidos', async () => {
    const c = await crearCliente({ nombre: 'Validaciones' });
    const base = { idem_key: idem(), cliente_id: c.id, deposito_id: G, modalidad_pago: 'contado' };
    await falla(admin, 'POST', '/api/ventas', { ...base, lineas: [] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem() }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 0 }] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: -2 }] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1.5 }] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1, precio: -5 }] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1, precio: 0 }] }, 400); // total 0
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1 }], descuento: pesos(99999) }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), lineas: [{ producto_id: P.id, presentacion: 'pallet', cantidad: 1 }] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), cliente_id: 99999, lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1 }] }, 400);
    await falla(admin, 'POST', '/api/ventas', { ...base, idem_key: idem(), modalidad_pago: 'mixto', pagado: 0, lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1 }] }, 400);
  });
  await prueba('H: enviar dos veces la misma venta (doble clic) la registra una sola vez', async () => {
    const pr = await crearProducto({ nombre: 'Doble clic' }); await comprar(pr.id, 1, pesos(1000));
    const c = await crearCliente({ nombre: 'Doble' });
    const cuerpo = { idem_key: idem(), cliente_id: c.id, deposito_id: G, modalidad_pago: 'contado', lineas: [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 2 }] };
    const [a, b] = await Promise.all([api(admin, 'POST', '/api/ventas', cuerpo), api(admin, 'POST', '/api/ventas', cuerpo)]);
    assert.ok([a.status, b.status].every((s) => s < 300));
    assert.equal(a.data.venta.id, b.data.venta.id);
    assert.ok(a.data.duplicada || b.data.duplicada);
    assert.equal((await producto(pr.id)).stock_galpon, 8);
    const c2 = await api(admin, 'POST', '/api/ventas', cuerpo); assert.equal(c2.data.duplicada, true);
    assert.equal((await producto(pr.id)).stock_galpon, 8);
    // Lo mismo con un pago y una compra
    const cf = await crearCliente({ nombre: 'Doble pago', modalidad: 'fiado' });
    await vender(cf.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1 }], { modalidad_pago: 'fiado' });
    const pago = { idem_key: idem(), cliente_id: cf.id, monto: pesos(50) };
    await Promise.all([api(admin, 'POST', '/api/pagos', pago), api(admin, 'POST', '/api/pagos', pago)]);
    assert.equal((await cliente(cf.id)).deuda, pesos(120) - pesos(50));
    const compra = { idem_key: idem(), deposito_id: G, lineas: [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1, costo: pesos(100) }], pagado: pesos(100) };
    await Promise.all([api(admin, 'POST', '/api/compras', compra), api(admin, 'POST', '/api/compras', compra)]);
    assert.equal((await producto(pr.id)).stock_galpon, 8 - 1 + 1);
  });
  await prueba('H: ventas simultáneas nunca venden el mismo stock dos veces', async () => {
    const pr = await crearProducto({ nombre: 'Concurrencia' }); await comprar(pr.id, 1, pesos(1000)); // 10 unidades
    const c = await crearCliente({ nombre: 'Carrera' });
    const rs = await Promise.all(Array.from({ length: 6 }, () => vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 4 }])));
    const exitosas = rs.filter((r) => r.status === 201).length;
    assert.equal(exitosas, 2); // 10 unidades alcanzan para 2 ventas de 4
    assert.equal((await producto(pr.id)).stock_galpon, 2);
  });
  await prueba('H: límite de crédito requiere confirmación explícita', async () => {
    const pr = await crearProducto({ nombre: 'Límite' }); await comprar(pr.id, 2, pesos(1000));
    const c = await crearCliente({ nombre: 'Con límite', modalidad: 'fiado', limite_credito: pesos(1000), plazo_dias: 7 });
    const cuerpo = { cliente_id: c.id, deposito_id: G, modalidad_pago: 'fiado', lineas: [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }] };
    const e = await falla(admin, 'POST', '/api/ventas', { ...cuerpo, idem_key: idem() }, 409, 'LIMITE_CREDITO');
    assert.equal(e.extra.pendiente, pesos(1150));
    const r = await ok(admin, 'POST', '/api/ventas', { ...cuerpo, idem_key: idem(), forzar_limite: true });
    assert.ok(r.venta.vencimiento, 'debe calcular el vencimiento con el plazo del cliente');
  });
  await prueba('H: productos y clientes con historial no se pueden borrar, solo desactivar', async () => {
    await falla(admin, 'DELETE', `/api/productos/${P.id}`, undefined, 409, 'CON_HISTORIAL');
    await falla(admin, 'DELETE', `/api/clientes/${cA.id}`, undefined, 409, 'CON_HISTORIAL');
    const vacio = await crearProducto({ nombre: 'Sin uso' }); await ok(admin, 'DELETE', `/api/productos/${vacio.id}`);
    const des = await ok(admin, 'POST', `/api/productos/${P.id}/estado`, { activo: false });
    assert.equal(des.activo, 0);
    await falla(admin, 'POST', '/api/ventas', { idem_key: idem(), cliente_id: cA.id, deposito_id: G, modalidad_pago: 'contado', lineas: [{ producto_id: P.id, presentacion: 'unidad', cantidad: 1 }] }, 400);
    await ok(admin, 'POST', `/api/productos/${P.id}/estado`, { activo: true });
    // No se puede cambiar la cantidad por caja si ya hay movimientos
    await falla(admin, 'PUT', `/api/productos/${P.id}`, { ...P, unidades_por_caja: 20 }, 400);
  });
  await prueba('H: la base de datos impide borrar o dejar stock negativo aunque falle el código', async () => {
    const dbw = new DatabaseSync(dbPath);
    dbw.exec('PRAGMA foreign_keys = ON');
    assert.throws(() => dbw.exec('DELETE FROM ventas'), /no se borran/);
    assert.throws(() => dbw.exec('DELETE FROM caja_mov'), /no se borran|compensan/);
    assert.throws(() => dbw.exec('UPDATE existencias SET cantidad = -1'), /CHECK|constraint/i);
    assert.throws(() => dbw.exec(`INSERT INTO pago_aplicaciones (pago_id, venta_id, monto, fecha) SELECT id, ${ventaB.id}, 999999999, '2026-01-01' FROM pagos LIMIT 1`), /supera/);
    dbw.close();
  });

  // ============================================================ LOTES POR FECHA DE INGRESO
  console.log('\nLotes por fecha de ingreso');
  const lotesDe = async (pid) => (await ok(admin, 'GET', `/api/stock/lotes?producto_id=${pid}`))
    .map((l) => `${l.deposito_id === G ? 'G' : 'C'} ${l.fecha_ingreso} ${l.cantidad}`);
  let prL; let ventaL; let compraMarzo; let clL;
  await prueba('Lotes: mercadería vieja con su fecha real, y al vender se elige de qué fecha sale', async () => {
    prL = await crearProducto({ nombre: 'Con lotes' });
    clL = await crearCliente({ nombre: 'Cliente lotes' });
    await comprar(prL.id, 10, pesos(1000), G, { fecha: '2026-01-15' });
    compraMarzo = (await comprar(prL.id, 5, pesos(1100), G, { fecha: '2026-03-10' })).compra;
    await ok(admin, 'POST', '/api/stock/entrada', { producto_id: prL.id, deposito_id: G, presentacion: 'caja', cantidad: 2, motivo: 'Stock que ya tenía', fecha_ingreso: '2025-12-01' });
    await falla(admin, 'POST', '/api/stock/entrada', { producto_id: prL.id, deposito_id: G, presentacion: 'caja', cantidad: 1, motivo: 'Del futuro', fecha_ingreso: '2099-01-01' }, 400);
    await falla(admin, 'POST', '/api/stock/entrada', { producto_id: prL.id, deposito_id: G, presentacion: 'caja', cantidad: 1, motivo: 'Fecha mala', fecha_ingreso: '2026-02-30' }, 400);
    assert.deepEqual(await lotesDe(prL.id), ['G 2025-12-01 20', 'G 2026-01-15 100', 'G 2026-03-10 50']);
    const linea = (cantidad, fecha_ingreso) => [{ producto_id: prL.id, presentacion: 'caja', cantidad, fecha_ingreso }];
    // Con varias fechas en el depósito hay que elegir; la fecha tiene que existir y alcanzar
    const sin = await vender(clL.id, G, linea(3));
    assert.equal(sin.status, 400); assert.equal(sin.data.code, 'ELEGIR_FECHA');
    assert.equal((await vender(clL.id, G, linea(1, '2026-02-01'))).data.code, 'SIN_STOCK_FECHA');
    assert.equal((await vender(clL.id, G, linea(6, '2026-03-10'))).data.code, 'SIN_STOCK_FECHA');
    assert.deepEqual(await lotesDe(prL.id), ['G 2025-12-01 20', 'G 2026-01-15 100', 'G 2026-03-10 50']); // nada cambió
    // Se vende de marzo aunque haya mercadería más vieja
    ventaL = (await vender(clL.id, G, linea(3, '2026-03-10'))).data.venta;
    assert.equal(ventaL.lineas[0].fecha_ingreso, '2026-03-10');
    assert.deepEqual(await lotesDe(prL.id), ['G 2025-12-01 20', 'G 2026-01-15 100', 'G 2026-03-10 20']);
    // Una misma venta puede sacar de dos fechas
    const r = await vender(clL.id, G, [...linea(1, '2025-12-01'), ...linea(1, '2026-01-15')]);
    assert.ok(r.status < 300, JSON.stringify(r.data));
    assert.deepEqual(await lotesDe(prL.id), ['G 2025-12-01 10', 'G 2026-01-15 90', 'G 2026-03-10 20']);
  });
  await prueba('Lotes: una transferencia conserva la fecha de ingreso; con una sola fecha en el depósito no hace falta elegir', async () => {
    // Transferencias y pérdidas descuentan de lo más viejo
    await ok(admin, 'POST', '/api/stock/transferencia', { producto_id: prL.id, origen: G, destino: C, presentacion: 'caja', cantidad: 4 });
    assert.deepEqual(await lotesDe(prL.id), ['C 2025-12-01 10', 'G 2026-01-15 60', 'C 2026-01-15 30', 'G 2026-03-10 20']);
    await ok(admin, 'POST', '/api/stock/merma', { producto_id: prL.id, deposito_id: C, presentacion: 'unidad', cantidad: 10, motivo: 'Paquetes mojados' });
    assert.deepEqual(await lotesDe(prL.id), ['G 2026-01-15 60', 'C 2026-01-15 30', 'G 2026-03-10 20']);
    const v = (await vender(clL.id, C, [{ producto_id: prL.id, presentacion: 'unidad', cantidad: 1 }])).data.venta;
    assert.equal(v.lineas[0].fecha_ingreso, '2026-01-15');
    assert.deepEqual(await lotesDe(prL.id), ['G 2026-01-15 60', 'C 2026-01-15 29', 'G 2026-03-10 20']);
  });
  await prueba('Lotes: anular una venta devuelve la mercadería a los mismos lotes de los que salió', async () => {
    await ok(admin, 'POST', `/api/ventas/${ventaL.id}/anular`, { motivo: 'Devolvió todo', destino_pagos: 'devolver' });
    assert.deepEqual(await lotesDe(prL.id), ['G 2026-01-15 60', 'C 2026-01-15 29', 'G 2026-03-10 50']);
  });
  await prueba('Lotes: historial de ingresos por fecha con lo que queda de cada uno; anular una compra saca su propio lote', async () => {
    const ing = (await ok(admin, 'GET', `/api/stock/ingresos?producto_id=${prL.id}`)).map((r) => `${r.fecha_ingreso} ${r.origen} ${r.unidades_iniciales}→${r.quedan}`);
    assert.deepEqual(ing, ['2026-03-10 compra 50→50', '2026-01-15 compra 100→89', '2025-12-01 entrada_manual 20→0']);
    await ok(admin, 'POST', `/api/compras/${compraMarzo.id}/anular`, { motivo: 'Error de carga', destino_pagos: 'reintegro' });
    assert.deepEqual(await lotesDe(prL.id), ['G 2026-01-15 60', 'C 2026-01-15 29']);
    const ing2 = await ok(admin, 'GET', `/api/stock/ingresos?producto_id=${prL.id}&desde=2026-01-01`);
    assert.deepEqual(ing2.map((r) => r.fecha_ingreso), ['2026-01-15']); // la compra anulada ya no figura
    const p = await producto(prL.id);
    assert.equal(p.stock_galpon, 60); assert.equal(p.stock_casa, 29);
    const dbw = new DatabaseSync(dbPath);
    assert.throws(() => dbw.exec('DELETE FROM lotes'), /no se borran/);
    assert.throws(() => dbw.exec('UPDATE lotes SET cantidad = -1'), /CHECK|constraint/i);
    dbw.close();
  });

  // ============================================================ SALDO INICIAL (deudas de antes del sistema)
  console.log('\nSaldo inicial de cuenta corriente');
  await prueba('Saldo inicial de un cliente: cuenta como deuda pero no como venta, stock, ganancia ni caja', async () => {
    const c = await crearCliente({ nombre: 'Debía de antes', modalidad: 'fiado' });
    const dashAntes = await ok(admin, 'GET', '/api/dashboard'); const cajaAntes = await saldoCaja();
    const ventasAntes = (await ok(admin, 'GET', '/api/ventas')).length;
    // Validaciones
    await falla(operador, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(100) }, 403);
    await falla(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: 0 }, 400);
    await falla(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(100), fecha: '2099-01-01' }, 400);
    const si = await ok(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(587500), fecha: '2026-10-01' });
    assert.equal(si.tipo, 'saldo_inicial'); assert.ok(si.numero < 0); assert.equal(si.lineas.length, 0); assert.equal(si.saldo, pesos(587500));
    await falla(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(1) }, 409, 'YA_TIENE_SALDO_INICIAL');
    // Es deuda…
    assert.equal((await cliente(c.id)).deuda, pesos(587500));
    const dash = await ok(admin, 'GET', '/api/dashboard');
    assert.equal(dash.general.deuda_total, dashAntes.general.deuda_total + pesos(587500));
    // …pero no venta, ni ganancia, ni caja, ni stock
    assert.equal(dash.hoy.ventas_total, dashAntes.hoy.ventas_total); assert.equal(dash.periodo.ventas_total, dashAntes.periodo.ventas_total);
    assert.equal(dash.periodo.ganancia_bruta, dashAntes.periodo.ganancia_bruta);
    assert.equal(await saldoCaja(), cajaAntes);
    assert.equal((await ok(admin, 'GET', '/api/ventas')).length, ventasAntes);
    assert.equal(dash.general.valor_inventario, dashAntes.general.valor_inventario);
    // La numeración de ventas sigue igual (el saldo inicial no ocupa un número de venta)
    const pr = await crearProducto({ nombre: 'Para saldo inicial' }); await comprar(pr.id, 5, pesos(1000));
    const ultima = Math.max(...(await ok(admin, 'GET', '/api/ventas')).map((v) => v.numero));
    const v = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }], { modalidad_pago: 'fiado' })).data.venta;
    assert.equal(v.numero, ultima + 1);
    // El comprobante de la venta nueva muestra el saldo anterior
    assert.equal(v.saldo_anterior, pesos(587500)); assert.equal(v.saldo_posterior, pesos(587500 + 1150));
    // Un cobro se aplica primero a lo más viejo (el saldo inicial) y entra a la caja
    const cajaPrevia = await saldoCaja();
    await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: c.id, monto: pesos(588000), medio: 'efectivo' });
    assert.equal((await ok(admin, 'GET', `/api/ventas/${si.id}`)).saldo, 0);
    assert.equal((await ok(admin, 'GET', `/api/ventas/${v.id}`)).saldo, pesos(1150 - 500));
    assert.equal(await saldoCaja(), cajaPrevia + pesos(588000));
  });
  await prueba('Saldo inicial: se anula con motivo (queda registrado) y se puede volver a cargar; la base impide que lleve productos', async () => {
    const c = await crearCliente({ nombre: 'Saldo mal cargado', modalidad: 'fiado' });
    const si = await ok(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(1000) });
    await falla(operador, 'POST', `/api/ventas/${si.id}/anular`, { motivo: 'Me equivoqué' }, 403);
    await ok(admin, 'POST', `/api/ventas/${si.id}/anular`, { motivo: 'Era otro importe' });
    assert.equal((await cliente(c.id)).deuda, 0);
    const si2 = await ok(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(1200) });
    assert.equal((await cliente(c.id)).deuda, pesos(1200));
    assert.notEqual(si2.numero, si.numero);
    const dbw = new DatabaseSync(dbPath);
    assert.throws(() => dbw.exec(`INSERT INTO venta_lineas (venta_id, producto_id, presentacion, cantidad, unidades, precio, precio_lista, subtotal, ingreso_neto, costo_total, ganancia) VALUES (${si2.id}, 1, 'unidad', 1, 1, 1, 1, 1, 1, 0, 1)`), /no lleva productos/);
    dbw.close();
  });
  await prueba('Saldo inicial con un proveedor: deuda que se paga normal, sin tocar stock ni costos', async () => {
    const prov = await ok(admin, 'POST', '/api/proveedores', { nombre: 'Proveedor de antes' });
    const dashAntes = await ok(admin, 'GET', '/api/dashboard'); const cajaAntes = await saldoCaja();
    await falla(operador, 'POST', `/api/proveedores/${prov.id}/saldo-inicial`, { monto: pesos(100) }, 403);
    const si = await ok(admin, 'POST', `/api/proveedores/${prov.id}/saldo-inicial`, { monto: pesos(250000) });
    assert.equal(si.tipo, 'saldo_inicial'); assert.equal(si.lineas.length, 0); assert.equal(si.saldo, pesos(250000));
    await falla(admin, 'POST', `/api/proveedores/${prov.id}/saldo-inicial`, { monto: pesos(1) }, 409, 'YA_TIENE_SALDO_INICIAL');
    const lista = await ok(admin, 'GET', '/api/compras');
    assert.equal(lista.deuda_proveedores.find((d) => d.proveedor_id === prov.id).saldo, pesos(250000));
    const dash = await ok(admin, 'GET', '/api/dashboard');
    assert.equal(dash.general.valor_inventario, dashAntes.general.valor_inventario);
    assert.equal(await saldoCaja(), cajaAntes); // cargarlo no mueve la caja…
    await ok(admin, 'POST', `/api/compras/${si.id}/pagos`, { monto: pesos(100000), medio: 'efectivo' });
    assert.equal(await saldoCaja(), cajaAntes - pesos(100000)); // …pagarlo sí
    assert.equal((await ok(admin, 'GET', `/api/compras/${si.id}`)).saldo, pesos(150000));
  });

  // ============================================================ COMPROBANTE IMPRESO
  console.log('\nComprobante de venta');
  await prueba('Comprobante: estado de cuenta del momento (saldo anterior + venta − entrega = saldo) y datos del negocio', async () => {
    await ok(admin, 'PUT', '/api/config', { negocio_direccion: 'Av. Siempre Viva 742', negocio_telefono: '11 5555-0000', comprobante_pie: 'Gracias por su compra' });
    await falla(operador, 'PUT', '/api/config', { negocio_direccion: 'x' }, 403);
    const pr = await crearProducto({ nombre: 'Comprobante' });
    await comprar(pr.id, 10, pesos(1000));
    const c = await crearCliente({ nombre: 'Cuenta corriente', modalidad: 'fiado', documento: '20-12345678-9' });
    const v1 = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1 }], { modalidad_pago: 'fiado' })).data.venta;
    assert.equal(v1.saldo_anterior, 0); assert.equal(v1.saldo_posterior, pesos(1150));
    // Segunda venta: 2 cajas ($2.300) y entrega $500 → saldo 1.150 + 2.300 − 500 = 2.950
    const v2 = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 2 }], { modalidad_pago: 'mixto', pagado: pesos(500) })).data.venta;
    assert.equal(v2.saldo_anterior, pesos(1150)); assert.equal(v2.saldo_posterior, pesos(2950));
    assert.equal(v2.saldo_anterior + v2.total - v2.pagado, v2.saldo_posterior);
    // Un cobro posterior no cambia lo que dice el comprobante de esa venta, pero sí el saldo de hoy
    await ok(admin, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: c.id, monto: pesos(1000), medio: 'efectivo' });
    const comp = await ok(operador, 'GET', `/api/ventas/${v2.id}/comprobante`);
    assert.equal(comp.venta.saldo_anterior, pesos(1150)); assert.equal(comp.venta.saldo_posterior, pesos(2950));
    assert.equal(comp.saldo_hoy, pesos(1950));
    assert.equal(comp.cliente.documento, '20-12345678-9');
    assert.deepEqual(comp.negocio, { nombre: comp.negocio.nombre, direccion: 'Av. Siempre Viva 742', telefono: '11 5555-0000', pie: 'Gracias por su compra' });
  });

  await prueba('Comprobante en PDF para compartir: requiere sesión, dice que no es factura y no existe para un saldo inicial', async () => {
    const pr = await crearProducto({ nombre: 'Comprobante PDF' });
    await comprar(pr.id, 5, pesos(1000));
    const c = await crearCliente({ nombre: 'Señor Peña', modalidad: 'fiado' });
    const v = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 2 }], { modalidad_pago: 'fiado' })).data.venta;
    const url = `/api/ventas/${v.id}/comprobante.pdf`;
    assert.equal((await fetch(base + url)).status, 401);
    const r = await fetch(base + url, { headers: { cookie: operador.cookie } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.match(r.headers.get('content-disposition'), new RegExp(`Comprobante-venta-${v.numero}\\.pdf`));
    const pdf = Buffer.from(await r.arrayBuffer()).toString('latin1');
    assert.ok(pdf.startsWith('%PDF-1.4') && pdf.trimEnd().endsWith('%%EOF'));
    assert.ok(pdf.includes('COMPROBANTE DE VENTA'));
    assert.ok(pdf.includes('NO V\xc1LIDO COMO FACTURA'));   // "Á" en WinAnsi
    assert.ok(pdf.includes('Se\xf1or Pe\xf1a'));            // acentos y ñ bien codificados
    assert.ok(pdf.includes('SALDO \x97 DEBE'));
    const c2 = await crearCliente({ nombre: 'Con deuda vieja', modalidad: 'fiado' });
    const si = await ok(admin, 'POST', `/api/clientes/${c2.id}/saldo-inicial`, { monto: pesos(100) });
    assert.equal((await fetch(base + `/api/ventas/${si.id}/comprobante.pdf`, { headers: { cookie: operador.cookie } })).status, 400);
    assert.equal((await fetch(base + '/api/ventas/999999/comprobante.pdf', { headers: { cookie: operador.cookie } })).status, 404);
  });

  // ============================================================ PRECIO POR UNIDAD DESDE LA CAJA
  console.log('\nPrecio por unidad calculado desde la caja');
  await prueba('Unidad = caja ÷ unidades, redondeada al centavo más cercano (nunca $0) y aviso con la cuenta', async () => {
    const { unidadDesdeCaja, avisoUnidad } = await import(new URL('../public/js/precios.js', import.meta.url));
    assert.equal(unidadDesdeCaja(pesos(1150), 20), 5750);        // $57,50 exacto
    assert.equal(unidadDesdeCaja(pesos(960), 20), pesos(48));    // exacto
    assert.equal(unidadDesdeCaja(pesos(1000), 3), 33333);        // 333,333… → 333,33
    assert.equal(unidadDesdeCaja(pesos(2000), 3), 66667);        // 666,666… → 666,67
    assert.equal(unidadDesdeCaja(pesos(1234.56), 7), 17637);     // 176,365… → 176,37
    assert.equal(unidadDesdeCaja(1, 2), 1);                      // medio centavo sube
    assert.equal(unidadDesdeCaja(pesos(1600), 1), pesos(1600));  // caja de 1
    for (const malo of [[0, 20], [-100, 20], [null, 20], [pesos(100), 0], [pesos(100), 2.5], [10.5, 20], [1, 3]]) assert.equal(unidadDesdeCaja(...malo), null);
    for (let i = 0; i < 10000; i++) {
      const caja = 1 + Math.floor(Math.random() * 50_000_000); const n = 1 + Math.floor(Math.random() * 500);
      const u = unidadDesdeCaja(caja, n);
      if (u === null) { assert.ok(caja * 2 < n, `null sin motivo: ${caja}/${n}`); continue; } // solo si daría $0
      assert.ok(Number.isInteger(u) && u >= 1, `no es un centavo entero: ${caja}/${n} → ${u}`);
      // Es el centavo más cercano: la diferencia con la división exacta es como mucho medio centavo
      assert.ok(2 * Math.abs(u * n - caja) <= n, `no es el más cercano: ${caja}/${n} → ${u}`);
      assert.ok(2 * (caja - u * n) < n, `redondeó para abajo un medio centavo: ${caja}/${n} → ${u}`);
    }
    assert.equal(avisoUnidad(pesos(1150), 20, 5750), 'Unidad recalculada: $ 1.150 ÷ 20 = $ 57,50. Podés cambiarla.');
    assert.equal(avisoUnidad(pesos(1000), 3, 33333), 'Unidad recalculada: $ 1.000 ÷ 3 = $ 333,333… → $ 333,33 (redondeado al centavo). Podés cambiarla.');
  });

  // ============================================================ ENTREGA PARA LA DEUDA EN LA VENTA
  console.log('\nVenta con entrega para la deuda');
  await prueba('Entrega para la deuda: paga la venta y parte de la deuda vieja; caja separada, ventas sin inflar y comprobante detallado', async () => {
    const pr = await crearProducto({ nombre: 'Entrega deuda' });
    await comprar(pr.id, 10, pesos(1000));
    const c = await crearCliente({ nombre: 'Kiosco Entrega', modalidad: 'ambas' });
    const si = await ok(admin, 'POST', `/api/clientes/${c.id}/saldo-inicial`, { monto: pesos(1500) });
    const vieja = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1, precio: pesos(2000) }], { modalidad_pago: 'fiado' })).data.venta;
    // Debe 1.500 (saldo inicial) + 2.000 (venta vieja) = 3.500. Compra 800 y entrega 800 + 2.000 para la deuda.
    const caja0 = await saldoCaja(); const r0 = await resumenHoy();
    const r = await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 10, precio: pesos(80) }], { entrega_deuda: pesos(2000), medio: 'transferencia' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const v = r.data.venta;
    assert.equal(v.total, pesos(800)); assert.equal(v.pagado, pesos(800)); assert.equal(v.saldo, 0);
    assert.equal(v.entrega_deuda, pesos(2000));
    assert.equal(v.saldo_anterior, pesos(3500)); assert.equal(v.saldo_posterior, pesos(1500));
    // Se aplica primero a lo más viejo: saldo inicial completo (1.500) y 500 a la venta vieja
    assert.deepEqual(v.entregas_deuda[0].aplicaciones.map((a) => [a.venta_id, a.monto]), [[si.id, pesos(1500)], [vieja.id, pesos(500)]]);
    assert.equal(v.entregas_deuda[0].a_favor, 0); assert.equal(v.entregas_deuda[0].medio, 'transferencia');
    assert.equal((await cliente(c.id)).deuda, pesos(1500));
    // Caja: entra todo (2.800), separado en venta y cobro de deuda
    assert.equal((await saldoCaja()) - caja0, pesos(2800));
    const movs = (await ok(admin, 'GET', '/api/caja?categoria=cobro_deuda')).movimientos.filter((m) => m.concepto.includes('Kiosco Entrega'));
    assert.equal(movs.length, 1); assert.equal(movs[0].monto, pesos(2000)); assert.ok(movs[0].concepto.includes(`venta N° ${v.numero}`));
    // Ventas y ganancias cuentan solo los 800 de la venta; la entrega es cobro de deuda
    const r1 = await resumenHoy();
    assert.equal(r1.ventas_total - r0.ventas_total, pesos(800));
    assert.equal(r1.cobros_deudas - r0.cobros_deudas, pesos(2000));
    // En el historial de cobros figura con su nota
    const pagos = await ok(admin, 'GET', `/api/pagos?cliente_id=${c.id}`);
    assert.ok(pagos.some((p) => p.origen === 'cobro' && p.monto === pesos(2000) && p.nota.includes(`venta N° ${v.numero}`)));
    // Comprobante (datos y PDF)
    const comp = await ok(operador, 'GET', `/api/ventas/${v.id}/comprobante`);
    assert.equal(comp.venta.entrega_deuda, pesos(2000));
    const pdf = await textoPdf(`/api/ventas/${v.id}/comprobante.pdf`, operador);
    for (const t of ['Pagó esta compra (transferencia)', 'Entregó a cuenta de deuda (transferencia)', 'PAGO A CUENTA DE DEUDA', 'Deuda anterior al sistema (saldo inicial)',
      `Venta N\xb0 ${vieja.numero} del`, 'Entregó hoy en total: $ 2.800 (compra $ 800 + deuda $ 2.000)', 'SALDO \x97 DEBE']) {
      assert.ok(pdf.includes(t.replaceAll('ó', '\xf3')), `el PDF no dice: ${t}`);
    }
    // Reintentar la misma venta (misma llave) no cobra dos veces
    const idemVenta = idem();
    const a = await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1, precio: pesos(80) }], { idem_key: idemVenta, entrega_deuda: pesos(100) });
    const caja1 = await saldoCaja();
    const b = await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1, precio: pesos(80) }], { idem_key: idemVenta, entrega_deuda: pesos(100) });
    assert.equal(b.data.duplicada, true); assert.equal(b.data.venta.id, a.data.venta.id);
    assert.equal(await saldoCaja(), caja1); assert.equal((await cliente(c.id)).deuda, pesos(1400));
  });

  await prueba('Entrega para la deuda: si entrega de más queda a favor; anular la venta no anula el cobro de deuda', async () => {
    const pr = await crearProducto({ nombre: 'Entrega de más' });
    await comprar(pr.id, 5, pesos(1000));
    const c = await crearCliente({ nombre: 'Almacén A Favor', modalidad: 'ambas' });
    await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1, precio: pesos(3000) }], { modalidad_pago: 'fiado' });
    const v = (await vender(c.id, G, [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 5, precio: pesos(100) }], { entrega_deuda: pesos(4000) })).data.venta;
    assert.equal(v.saldo_anterior, pesos(3000)); assert.equal(v.saldo_posterior, -pesos(1000));
    assert.equal(v.entregas_deuda[0].aplicado, pesos(3000)); assert.equal(v.entregas_deuda[0].a_favor, pesos(1000));
    let cl = await cliente(c.id); assert.equal(cl.deuda, 0); assert.equal(cl.saldo_favor, pesos(1000));
    const pdf = await textoPdf(`/api/ventas/${v.id}/comprobante.pdf`, operador);
    assert.ok(pdf.includes('Qued\xf3 a favor del cliente')); assert.ok(pdf.includes('SALDO \x97 A FAVOR'));
    // Anular la venta: se devuelve lo cobrado por la venta (500), el cobro de deuda sigue
    const caja0 = await saldoCaja();
    await ok(admin, 'POST', `/api/ventas/${v.id}/anular`, { motivo: 'Prueba de anulación', destino_pagos: 'devolver' });
    assert.equal((await saldoCaja()) - caja0, -pesos(500));
    cl = await cliente(c.id); assert.equal(cl.deuda, 0); assert.equal(cl.saldo_favor, pesos(1000));
    const det = await ok(admin, 'GET', `/api/ventas/${v.id}`);
    assert.equal(det.entrega_deuda, pesos(4000)); assert.equal(det.entregas_deuda[0].anulado, 0);
  });

  await prueba('Entrega para la deuda: solo con la venta paga completa, con deuda y con importe válido', async () => {
    const pr = await crearProducto({ nombre: 'Entrega reglas' });
    await comprar(pr.id, 5, pesos(1000));
    const sinDeuda = await crearCliente({ nombre: 'Sin deuda', modalidad: 'ambas' });
    const l = [{ producto_id: pr.id, presentacion: 'unidad', cantidad: 1, precio: pesos(100) }];
    const cajaAntes = await saldoCaja();
    let r = await vender(sinDeuda.id, G, l, { entrega_deuda: pesos(100) });
    assert.equal(r.status, 400); assert.match(r.data.error, /no tiene deuda/);
    const conDeuda = await crearCliente({ nombre: 'Con deuda', modalidad: 'ambas' });
    await vender(conDeuda.id, G, l, { modalidad_pago: 'fiado' });
    r = await vender(conDeuda.id, G, l, { modalidad_pago: 'fiado', entrega_deuda: pesos(50) });
    assert.equal(r.status, 400); assert.match(r.data.error, /pagarse completa/);
    r = await vender(conDeuda.id, G, l, { modalidad_pago: 'mixto', pagado: pesos(50), entrega_deuda: pesos(50) });
    assert.equal(r.status, 400);
    for (const malo of [0, -100, 10.5, '100']) {
      r = await vender(conDeuda.id, G, l, { entrega_deuda: malo });
      assert.equal(r.status, 400, `entrega_deuda=${malo} debía rechazarse`);
    }
    // Si la deuda cambió en otro dispositivo (la pantalla mostraba otra), se frena sin guardar nada
    r = await vender(conDeuda.id, G, l, { entrega_deuda: pesos(100), deuda_vista: pesos(999) });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'DEUDA_CAMBIO'); assert.match(r.data.error, /cambió/);
    // Nada de lo rechazado movió la caja ni el stock (solo la venta fiada válida descontó 1 unidad)
    assert.equal(await saldoCaja(), cajaAntes);
    assert.equal((await cliente(conDeuda.id)).deuda, pesos(100));
  });

  // ============================================================ CAJA / GASTOS
  console.log('\nCaja, gastos y reportes');
  await prueba('Caja: saldo inicial, gastos, retiros y movimientos manuales', async () => {
    await ok(admin, 'PUT', '/api/config', { saldo_inicial_caja: pesos(10000) });
    await falla(operador, 'PUT', '/api/config', { saldo_inicial_caja: 0 }, 403);
    const s0 = await saldoCaja(); const r0 = await resumenHoy();
    const g = await ok(admin, 'POST', '/api/gastos', { categoria: 'transporte', descripcion: 'Flete', monto: pesos(300), medio: 'efectivo' });
    await ok(admin, 'POST', '/api/caja/movimientos', { categoria: 'retiro', monto: pesos(500), concepto: 'Retiro personal' });
    await ok(admin, 'POST', '/api/caja/movimientos', { categoria: 'otro_ingreso', monto: pesos(50), concepto: 'Vuelto a favor', medio: 'transferencia' });
    assert.equal((await saldoCaja()) - s0, -pesos(300) - pesos(500) + pesos(50));
    const r1 = await resumenHoy();
    assert.equal(r1.gastos - r0.gastos, pesos(300));            // el gasto resta del resultado
    assert.equal(r1.retiros - r0.retiros, pesos(500));          // el retiro NO es gasto
    assert.equal(r1.resultado_neto - r0.resultado_neto, -pesos(300));
    await falla(admin, 'POST', '/api/gastos', { categoria: 'comida', descripcion: 'x', monto: 100 }, 400);
    await falla(admin, 'POST', '/api/gastos', { categoria: 'otros', descripcion: 'x', monto: -100 }, 400);
    await ok(admin, 'POST', `/api/gastos/${g.id}/anular`, { motivo: 'Cargado dos veces' });
    assert.equal((await resumenHoy()).gastos, r0.gastos);
    const caja = await ok(admin, 'GET', '/api/caja');
    assert.ok(caja.saldo.porMedio.transferencia > 0);
  });
  await prueba('Compra con saldo pendiente al proveedor y pago posterior', async () => {
    const prov = await ok(admin, 'POST', '/api/proveedores', { nombre: 'Proveedor SA' });
    const pr = await crearProducto({ nombre: 'Compra a crédito' });
    const caja0 = await saldoCaja();
    const r = await ok(admin, 'POST', '/api/compras', { idem_key: idem(), proveedor_id: prov.id, deposito_id: G, lineas: [{ producto_id: pr.id, presentacion: 'caja', cantidad: 2, costo: pesos(1000) }], pagado: pesos(500) });
    assert.equal(r.compra.saldo, pesos(1500)); assert.equal(await saldoCaja(), caja0 - pesos(500));
    const l = await ok(admin, 'GET', '/api/compras');
    assert.equal(l.deuda_proveedores.find((d) => d.proveedor_id === prov.id).saldo, pesos(1500));
    await falla(admin, 'POST', `/api/compras/${r.compra.id}/pagos`, { monto: pesos(2000) }, 400);
    const pg = await ok(admin, 'POST', `/api/compras/${r.compra.id}/pagos`, { monto: pesos(1500), medio: 'transferencia' });
    assert.equal(pg.saldo, 0); assert.equal(await saldoCaja(), caja0 - pesos(2000));
    await falla(admin, 'POST', '/api/compras', { idem_key: idem(), deposito_id: G, lineas: [{ producto_id: pr.id, presentacion: 'caja', cantidad: 1, costo: pesos(1000) }], pagado: 0 }, 400); // saldo sin proveedor
  });
  await prueba('Reportes: ganancia por producto, cliente, período y margen vs recargo', async () => {
    const g = await ok(admin, 'GET', '/api/ganancias');
    assert.ok(g.por_producto.length > 3 && g.por_cliente.length > 3);
    const fila = g.por_producto.find((x) => x.producto_id === P.id);
    assert.ok(fila.margen_pct < fila.recargo_pct); // margen sobre ventas siempre menor que recargo sobre costo
    assert.equal(g.por_producto.reduce((s, x) => s + x.ganancia, 0), g.actual.ganancia_bruta);
    assert.equal(g.por_cliente.reduce((s, x) => s + x.ganancia, 0), g.actual.ganancia_bruta);
    assert.equal(g.serie.puntos.reduce((s, x) => s + x.ganancia, 0), g.actual.ganancia_bruta);
    assert.equal(g.serie.puntos.reduce((s, x) => s + x.ventas, 0), g.actual.ventas_total);
    assert.ok(g.anterior && 'ganancia_bruta' in g.variacion);
    await falla(admin, 'GET', '/api/ganancias?desde=2026-12-01&hasta=2026-01-01', undefined, 400);
    const s = await ok(admin, 'GET', '/api/ganancias?agrupar=mes&desde=2026-01-01&hasta=2026-12-31');
    assert.equal(s.serie.puntos.length, 12);
  });
  await prueba('Stock bajo y agotados', async () => {
    const pr = await crearProducto({ nombre: 'Casi agotado', stock_minimo: 15 });
    await comprar(pr.id, 1, pesos(1000)); // 10 unidades <= mínimo 15
    const al = await ok(admin, 'GET', '/api/stock/alertas');
    assert.ok(al.bajo.some((x) => x.id === pr.id));
    assert.ok(al.agotados.some((x) => x.id !== pr.id));
    const lista = await ok(admin, 'GET', '/api/productos?estado_stock=bajo');
    assert.ok(lista.every((x) => x.estado_stock === 'bajo'));
  });
  await prueba('Copias de seguridad: crear, listar y descargar un archivo SQLite válido', async () => {
    const r = await ok(admin, 'POST', '/api/backups');
    assert.ok(r.backups.length >= 1);
    const resp = await fetch(base + '/api/backups/descargar', { headers: { cookie: admin.cookie } });
    assert.equal(resp.status, 200);
    const buf = Buffer.from(await resp.arrayBuffer());
    assert.equal(buf.subarray(0, 15).toString(), 'SQLite format 3');
    const f = path.join(tmp, 'descargada.db'); fs.writeFileSync(f, buf);
    const copia = new DatabaseSync(f, { readOnly: true });
    assert.ok(copia.prepare('SELECT COUNT(*) n FROM ventas').get().n > 10);
    copia.close();
  });
  await prueba('Copia automática: solo con el token del servidor, sin usuario ni contraseña', async () => {
    const pedir = (token) => fetch(base + '/api/backups/automatica', { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal((await pedir()).status, 401);
    assert.equal((await pedir('x'.repeat(64))).status, 401);
    assert.equal((await pedir(TOKEN_COPIAS.slice(0, -1) + 'z')).status, 401);
    const resp = await pedir(TOKEN_COPIAS);
    assert.equal(resp.status, 200);
    assert.equal(Buffer.from(await resp.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');
    // El archivo temporal de la descarga no queda en el servidor
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(fs.readdirSync(path.join(tmp, 'backups')).filter((f) => f.startsWith('descarga-')).length, 0);
  });
  await prueba('Versión y última copia externa: la versión pide token y la fecha pide administrador', async () => {
    const version = (token) => fetch(base + '/api/backups/version', { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.equal((await version()).status, 401);
    assert.equal((await version('x'.repeat(64))).status, 401);
    assert.deepEqual(await (await version(TOKEN_COPIAS)).json(), { commit: null });
    assert.equal((await fetch(base + '/api/backups/ultima-externa')).status, 401);
    const { fecha, dias } = await ok(admin, 'GET', '/api/backups/ultima-externa');
    assert.ok(fecha, 'la prueba anterior ya bajó una copia automática');
    assert.ok(dias >= 0 && dias < 1);
  });
  await prueba('Subir copia: rechaza llave equivocada, copias rotas, huella distinta y versiones anteriores sin tocar nada', async () => {
    const subir = (buf, token, huella) => fetch(base + '/api/backups/restaurar', { method: 'POST', body: buf,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-sha256': huella ?? crypto.createHash('sha256').update(buf).digest('hex') } });
    const resumen = await (await fetch(base + '/api/backups/resumen', { headers: { authorization: `Bearer ${TOKEN_COPIAS}` } })).json();
    assert.ok(resumen.ventas > 10 && typeof resumen.stock_detalle === 'string');
    assert.equal((await fetch(base + '/api/backups/resumen')).status, 401);
    const copia = Buffer.from(await (await fetch(base + '/api/backups/automatica', { headers: { authorization: `Bearer ${TOKEN_COPIAS}` } })).arrayBuffer());
    assert.equal((await subir(copia, 'x'.repeat(64))).status, 401);
    const rota = copia.subarray(0, Math.floor(copia.length / 3));
    const r1 = await subir(rota, TOKEN_COPIAS); assert.equal(r1.status, 400); assert.equal((await r1.json()).code, 'COPIA_INVALIDA');
    const r2 = await subir(copia, TOKEN_COPIAS, '0'.repeat(64)); assert.equal(r2.status, 400); assert.match((await r2.json()).error, /huella/);
    // Copia de una versión anterior (le falta una migración)
    const f = path.join(tmp, 'vieja.db'); fs.writeFileSync(f, copia);
    const dv = new DatabaseSync(f); dv.exec("DELETE FROM schema_migrations WHERE nombre = '004_venta_saldos.sql'"); dv.close();
    const r3 = await subir(fs.readFileSync(f), TOKEN_COPIAS); assert.equal(r3.status, 400); assert.match((await r3.json()).error, /versión anterior/);
    // Nada quedó pendiente ni a medio subir, y los datos siguen iguales
    assert.deepEqual(fs.readdirSync(tmp).filter((x) => /\.(restaurar|subiendo)$/.test(x)), []);
    assert.deepEqual(await (await fetch(base + '/api/backups/resumen', { headers: { authorization: `Bearer ${TOKEN_COPIAS}` } })).json(), resumen);
  });
  await prueba('Patrón Strategy: cada canal de recuperación funciona solo y un canal desconocido es un error', async () => {
    const { CanalConsola, CanalArchivoEmail, crearCanal, CANALES_DISPONIBLES } = await import('../server/notificaciones/canales-recuperacion.js');
    assert.deepEqual(CANALES_DISPONIBLES, ['consola', 'archivo']);
    assert.ok(crearCanal() instanceof CanalConsola); // por defecto, consola
    assert.ok(crearCanal(' ARCHIVO ', { carpeta: tmp }) instanceof CanalArchivoEmail);
    assert.throws(() => crearCanal('paloma-mensajera'), /desconocido/);
    assert.throws(() => crearCanal('archivo'), /carpeta/);
    // Las dos estrategias cumplen la misma interfaz: enviar({ nombre, usuario, codigo, minutos })
    const datos = { nombre: 'Ana Pérez', usuario: 'ana', codigo: '123456', minutos: 15 };
    const original = console.log; const lineas = [];
    console.log = (...a) => lineas.push(a.join(' '));
    try {
      assert.equal(new CanalConsola().enviar(datos).canal, 'consola');
      const r = new CanalArchivoEmail(path.join(tmp, 'bandeja-prueba')).enviar(datos);
      assert.equal(r.canal, 'archivo');
      const eml = fs.readFileSync(r.archivo, 'utf8');
      assert.match(eml, /^From: .*\r\nTo: Ana Pérez <ana@sistema\.local>\r\n/);
      assert.match(eml, /Tu código para recuperar la contraseña es: 123456/);
    } finally { console.log = original; }
    assert.ok(lineas.some((l) => l.includes('Código de recuperación: 123456')));
  });
  await prueba('Patrón Strategy en el sistema: con CANAL_RECUPERACION=archivo el código llega como correo .eml y sirve', async () => {
    // Un segundo servidor, con otra base y el canal "archivo": auth.js es el mismo, solo cambia la estrategia.
    const dir = fs.mkdtempSync(path.join(tmp, 'canal-archivo-'));
    const p2 = puerto + 600; const b2 = `http://127.0.0.1:${p2}`;
    const s2 = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(raiz, 'server/index.js')], {
      env: { ...process.env, PORT: String(p2), HOST: '127.0.0.1', DB_PATH: path.join(dir, 'base.db'), CANAL_RECUPERACION: 'archivo' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log2 = ''; s2.stdout.on('data', (d) => { log2 += d; }); s2.stderr.on('data', (d) => { log2 += d; });
    const pedir = (url, body) => fetch(b2 + url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify(body) });
    try {
      for (let i = 0; i < 50 && !log2.includes('iniciado'); i++) await new Promise((r) => setTimeout(r, 100));
      assert.match(log2, /canal "archivo"/);
      assert.equal((await pedir('/api/configuracion-inicial', { usuario: 'duenia', nombre: 'Dueña', pass: 'clave-inicial-1' })).status, 200);
      assert.equal((await pedir('/api/recuperar-clave/pedir', { usuario: 'duenia' })).status, 200);
      const bandeja = path.join(dir, 'bandeja-salida');
      const archivos = fs.readdirSync(bandeja).filter((f) => f.endsWith('.eml'));
      assert.equal(archivos.length, 1);
      const codigo = fs.readFileSync(path.join(bandeja, archivos[0]), 'utf8').match(/es: (\d{6})/)[1];
      assert.ok(!log2.includes(`Código de recuperación: ${codigo}`)); // por consola ya no sale el código
      assert.equal((await pedir('/api/recuperar-clave/confirmar', { usuario: 'duenia', codigo, nueva: 'clave-por-mail-2' })).status, 200);
      assert.equal((await pedir('/api/login', { usuario: 'duenia', pass: 'clave-por-mail-2' })).status, 200);
    } finally {
      s2.kill();
      if (s2.exitCode === null) await new Promise((r) => s2.once('exit', r));
    }
  });
  await prueba('Empleado: vende, cobra y consulta; no ve costos ni ganancias ni maneja compras, caja, stock o precios', async () => {
    // El "operador" tiene rol 'usuario', que en pantalla se llama "Empleado".
    for (const [m, u] of [['GET', '/api/dashboard'], ['GET', '/api/ganancias'], ['GET', '/api/compras'], ['GET', '/api/proveedores'], ['GET', '/api/caja'], ['GET', '/api/gastos']]) {
      await falla(operador, m, u, undefined, 403);
    }
    const p = (await ok(admin, 'GET', '/api/productos'))[0];
    await falla(operador, 'POST', '/api/stock/entrada', { producto_id: p.id, deposito_id: 1, unidades: 1 }, 403);
    await falla(operador, 'POST', '/api/stock/transferencia', { producto_id: p.id, origen: 1, destino: 2, unidades: 1 }, 403);
    await falla(operador, 'PUT', `/api/productos/${p.id}`, { precio_caja: 1 }, 403);
    await falla(operador, 'POST', '/api/gastos', { categoria: 'otros', descripcion: 'x', monto: 100 }, 403);
    // Consulta sin costos ni ganancias (el servidor no los manda)
    const prods = await ok(operador, 'GET', '/api/productos');
    assert.ok(prods.length > 0 && prods.every((x) => !('costo_caja' in x) && !('valor_inventario' in x) && 'precio_caja' in x && 'stock_total' in x));
    const vts = await ok(operador, 'GET', '/api/ventas');
    assert.ok(vts.length > 0 && vts.every((v) => !('ganancia' in v)) && 'total' in vts[0]);
    const det = await ok(operador, 'GET', `/api/ventas/${vts[0].id}`);
    assert.ok(!('ganancia' in det) && det.lineas.every((l) => !('costo_total' in l) && !('ganancia' in l)));
    assert.ok('ganancia' in (await ok(admin, 'GET', `/api/ventas/${vts[0].id}`))); // el administrador sí la ve
    // Clientes: el empleado los crea y corrige, pero el crédito lo define el administrador
    const c = await ok(operador, 'POST', '/api/clientes', { nombre: 'Kiosco del Empleado', modalidad: 'fiado', limite_credito: pesos(999999) });
    assert.equal(c.modalidad, 'contado'); assert.equal(c.limite_credito, 0);
    await ok(admin, 'PUT', `/api/clientes/${c.id}`, { nombre: 'Kiosco del Empleado', modalidad: 'fiado', limite_credito: pesos(5000), plazo_dias: 10 });
    const c2 = await ok(operador, 'PUT', `/api/clientes/${c.id}`, { nombre: 'Kiosco del Empleado SRL', telefono: '123', modalidad: 'contado', limite_credito: 0 });
    assert.equal(c2.nombre, 'Kiosco del Empleado SRL'); assert.equal(c2.modalidad, 'fiado'); assert.equal(c2.limite_credito, pesos(5000)); assert.equal(c2.plazo_dias, 10);
    await falla(operador, 'PUT', `/api/clientes/${c.id}/precios/${p.id}`, { precio_caja: 1 }, 403);
    await falla(operador, 'POST', `/api/clientes/${c.id}/estado`, { activo: false }, 403);
    // Vender y cobrar sí puede
    const st = await ok(admin, 'GET', `/api/productos/${p.id}`);
    const dep = st.stock_galpon > 0 ? 1 : 2;
    const lote = (await ok(admin, 'GET', `/api/stock/lotes?producto_id=${p.id}&deposito_id=${dep}`)).find((l) => l.cantidad > 0);
    const v = await ok(operador, 'POST', '/api/ventas', { idem_key: idem(), cliente_id: c.id, deposito_id: dep, modalidad_pago: 'fiado',
      lineas: [{ producto_id: p.id, presentacion: 'unidad', cantidad: 1, ...(lote ? { fecha_ingreso: lote.fecha_ingreso } : {}) }] });
    assert.ok(!('ganancia' in (v.venta ?? v)));
    await ok(operador, 'POST', '/api/pagos', { idem_key: idem(), cliente_id: c.id, monto: 100, medio: 'efectivo' });
  });
  await prueba('Integridad contable global (stock, caja y deudas cuadran con sus movimientos)', async () => {
    const d = db();
    // 1) Stock de cada producto/depósito = suma de sus movimientos
    const filas = d.prepare(`
      SELECT e.producto_id, e.deposito_id, e.cantidad,
        COALESCE((SELECT SUM(unidades) FROM mov_stock WHERE producto_id = e.producto_id AND deposito_destino = e.deposito_id), 0) -
        COALESCE((SELECT SUM(unidades) FROM mov_stock WHERE producto_id = e.producto_id AND deposito_origen = e.deposito_id), 0) AS calculado
      FROM existencias e`).all();
    for (const f of filas) assert.equal(f.cantidad, f.calculado, `stock descuadrado en producto ${f.producto_id} depósito ${f.deposito_id}`);
    // 1b) Los lotes de cada producto/depósito suman exactamente su stock
    const lotes = d.prepare(`
      SELECT e.producto_id, e.deposito_id, e.cantidad,
        COALESCE((SELECT SUM(cantidad) FROM lotes WHERE producto_id = e.producto_id AND deposito_id = e.deposito_id), 0) AS en_lotes
      FROM existencias e`).all();
    for (const f of lotes) assert.equal(f.cantidad, f.en_lotes, `lotes descuadrados en producto ${f.producto_id} depósito ${f.deposito_id}`);
    // 2) Cada venta confirmada: suma de líneas = total y pagado ≤ total
    // (los saldos iniciales no tienen productos: no se controlan contra líneas)
    const malas = d.prepare(`SELECT v.id FROM ventas v WHERE v.tipo = 'venta' AND v.total <> (SELECT SUM(ingreso_neto) FROM venta_lineas WHERE venta_id = v.id)`).all();
    const siConLineas = d.prepare(`SELECT v.id FROM ventas v WHERE v.tipo = 'saldo_inicial' AND EXISTS (SELECT 1 FROM venta_lineas WHERE venta_id = v.id)`).all();
    assert.equal(siConLineas.length, 0);
    assert.equal(malas.length, 0);
    const sobrepagadas = d.prepare(`SELECT venta_id FROM v_ventas_saldo WHERE pagado > total`).all();
    assert.equal(sobrepagadas.length, 0);
    // 3) El valor del inventario = suma de costos de entradas - salidas, y nunca negativo
    const neg = d.prepare('SELECT id FROM productos WHERE valor_inventario < 0').all(); assert.equal(neg.length, 0);
    // 4) Saldo de caja = saldo inicial + ingresos - egresos
    const sc = d.prepare(`SELECT SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END) AS t FROM caja_mov`).get().t;
    assert.equal(pesos(10000) + sc, await saldoCaja());
    // 5) La suma de lo cobrado en caja por ventas/cobros = pagos vigentes menos devoluciones
    const pagosVigentes = d.prepare(`SELECT COALESCE(SUM(monto - devuelto), 0) AS t FROM pagos WHERE anulado = 0`).get().t;
    const cajaCobros = d.prepare(`SELECT COALESCE(SUM(CASE WHEN tipo='ingreso' THEN monto ELSE -monto END), 0) AS t FROM caja_mov WHERE categoria IN ('venta','cobro_deuda')`).get().t;
    assert.equal(cajaCobros, pagosVigentes);
    d.close();
  });
}

let fallo = false;
try { await main(); } catch (e) { console.error('\nERROR GENERAL:', e); fallo = true; }
srv.kill();
// En Windows la base sigue bloqueada hasta que el servidor termina de cerrarse.
if (srv.exitCode === null) await new Promise((r) => srv.once('exit', r));
const pasaron = resultados.filter((r) => r[0]).length;
console.log(`\n${pasaron}/${resultados.length} pruebas OK`);
if (resultados.some((r) => !r[0]) || fallo) {
  console.log('\n--- Log del servidor ---\n' + logSrv.split('\n').filter((l) => /error|restricci/i.test(l)).slice(-15).join('\n'));
  process.exitCode = 1;
}
fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
