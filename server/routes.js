// Definición de todas las rutas de la API.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { get, all, run, config, auditar, db, tx, DB_PATH } from './db.js';
import { bad, texto, dinero, entero, booleano, esFecha, hoy, ahora, setZona, HttpError } from './util.js';
import * as auth from './auth.js';
import * as catalogo from './services/catalogo.js';
import * as inventario from './services/inventario.js';
import * as ventas from './services/ventas.js';
import * as deudas from './services/deudas.js';
import * as compras from './services/compras.js';
import * as finanzas from './services/finanzas.js';
import * as reportes from './services/reportes.js';
import * as caja from './services/caja.js';
import * as backup from './backup.js';
import * as restaurar from './restaurar.js';
import { comprobantePdf } from './comprobante-pdf.js';
import * as stock from './services/stock.js';

export function registrarRutas(app) {
  const login = auth.requiereLogin; const admin = auth.requiereAdmin;
  const id = (ctx) => entero(Number(ctx.params.id), 'Identificador', { min: 1 });

  // ---- Rol "Empleado" (en la base el rol se llama 'usuario'): vende, cobra y consulta.
  // No gestiona compras, stock, caja, precios ni usuarios, y NO ve costos ni ganancias (información del dueño).
  // El control está acá, en el servidor: esconder botones en la pantalla no alcanza.
  const esAdmin = (ctx) => ctx.user?.rol === 'admin';
  const CAMPO_RESERVADO = /^(costo|valor_inventario|ganancia|margen|recargo)/;
  const sinCostos = (x) => (Array.isArray(x) ? x.map(sinCostos)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => !CAMPO_RESERVADO.test(k)).map(([k, v]) => [k, sinCostos(v)]))
      : x);
  const segunRol = (ctx, datos) => (esAdmin(ctx) ? datos : sinCostos(datos));
  // El empleado no define el crédito de un cliente: al crear queda "contado"; al editar se conserva lo que había.
  const creditoSegunRol = (ctx, actual) => (esAdmin(ctx) ? ctx.body : {
    ...ctx.body, modalidad: actual?.modalidad ?? 'contado', limite_credito: actual?.limite_credito ?? 0, plazo_dias: actual?.plazo_dias ?? 0,
  });

  // ------------------------------------------------------------ SESIÓN
  app.get('/api/estado', (ctx) => ({
    necesita_configuracion: auth.cantidadUsuarios() === 0,
    usuario: auth.usuarioDeSesion(ctx) ? auth.publico(auth.usuarioDeSesion(ctx)) : null,
    negocio: config.get('negocio_nombre'),
    hoy: hoy(),
    demo: /demo\.db$/i.test(DB_PATH), // la interfaz muestra un cartel fijo para no cargar datos reales en la demo
  }));
  // Solo funciona mientras no existe ningún usuario: crea al primer administrador.
  app.post('/api/configuracion-inicial', (ctx) => {
    if (auth.cantidadUsuarios() > 0) throw new HttpError(403, 'El sistema ya está configurado.');
    const b = ctx.body;
    return tx(() => {
      const u = auth.crearUsuario({ usuario: b.usuario, nombre: b.nombre, rol: 'admin', pass: b.pass });
      if (b.negocio_nombre) config.set('negocio_nombre', texto(b.negocio_nombre, 'Nombre del negocio', { max: 80 }));
      return auth.iniciarSesion(ctx, b.usuario, b.pass) && { usuario: u };
    });
  });
  app.post('/api/login', (ctx) => ({ usuario: auth.iniciarSesion(ctx, ctx.body.usuario, ctx.body.pass) }));
  app.post('/api/logout', (ctx) => { auth.cerrarSesion(ctx); return { ok: true }; });
  app.post('/api/cambiar-clave', login, (ctx) => { auth.cambiarMiClave(ctx, ctx.body.actual, ctx.body.nueva); return { ok: true }; });
  // Recuperación de contraseña: no piden sesión porque el usuario justamente no puede entrar.
  app.post('/api/recuperar-clave/pedir', (ctx) => auth.pedirRecuperacion(ctx, ctx.body.usuario));
  app.post('/api/recuperar-clave/confirmar', (ctx) => {
    auth.confirmarRecuperacion(ctx, ctx.body.usuario, ctx.body.codigo, ctx.body.nueva);
    return { ok: true };
  });

  // ---------------------------------------------------------- USUARIOS
  app.get('/api/usuarios', admin, () => auth.listarUsuarios());
  app.post('/api/usuarios', admin, (ctx) => auth.crearUsuario(ctx.body, ctx.user.id));
  app.put('/api/usuarios/:id', admin, (ctx) => auth.editarUsuario(id(ctx), ctx.body, ctx.user.id));

  // ------------------------------------------------------ CONFIGURACIÓN
  app.get('/api/config', login, () => ({
    negocio_nombre: config.get('negocio_nombre'),
    negocio_direccion: config.get('negocio_direccion') || '',
    negocio_telefono: config.get('negocio_telefono') || '',
    comprobante_pie: config.get('comprobante_pie') || '',
    saldo_inicial_caja: Number(config.get('saldo_inicial_caja') || 0),
    depositos: all('SELECT * FROM depositos ORDER BY id'),
  }));
  app.put('/api/config', admin, (ctx) => {
    const b = ctx.body;
    if (b.negocio_nombre !== undefined) config.set('negocio_nombre', texto(b.negocio_nombre, 'Nombre del negocio', { requerido: true, max: 80 }));
    if (b.negocio_direccion !== undefined) config.set('negocio_direccion', texto(b.negocio_direccion, 'Dirección', { max: 120 }) ?? '');
    if (b.negocio_telefono !== undefined) config.set('negocio_telefono', texto(b.negocio_telefono, 'Teléfono', { max: 60 }) ?? '');
    if (b.comprobante_pie !== undefined) config.set('comprobante_pie', texto(b.comprobante_pie, 'Texto al pie del comprobante', { max: 200 }) ?? '');
    if (b.saldo_inicial_caja !== undefined) {
      const nuevo = dinero(b.saldo_inicial_caja, 'Saldo inicial de caja', { min: -9_000_000_000_000 });
      auditar(ctx.user.id, 'config', 'saldo_inicial_caja', null, { antes: Number(config.get('saldo_inicial_caja')), despues: nuevo });
      config.set('saldo_inicial_caja', nuevo);
    }
    return { ok: true };
  });

  // ---------------------------------------------------------- PRODUCTOS
  app.get('/api/productos', login, (ctx) => segunRol(ctx, catalogo.listarProductos(ctx.query)));
  app.get('/api/productos/:id', login, (ctx) => segunRol(ctx, catalogo.obtenerProducto(id(ctx))));
  app.post('/api/productos', admin, (ctx) => { ctx.status = 201; return catalogo.crearProducto(ctx.body, ctx.user); });
  app.put('/api/productos/:id', admin, (ctx) => catalogo.editarProducto(id(ctx), ctx.body, ctx.user));
  app.post('/api/productos/:id/estado', admin, (ctx) => catalogo.estadoProducto(id(ctx), booleano(ctx.body.activo), ctx.user));
  app.delete('/api/productos/:id', admin, (ctx) => catalogo.eliminarProducto(id(ctx), ctx.user));

  // ------------------------------------------------------------- STOCK
  // Consultar: todos (el empleado sin costos). Mover mercadería: solo el administrador.
  app.get('/api/stock/movimientos', login, (ctx) => segunRol(ctx, inventario.listarMovimientos(ctx.query)));
  app.get('/api/stock/lotes', login, (ctx) => segunRol(ctx, inventario.listarLotes(ctx.query)));
  app.get('/api/stock/ingresos', login, (ctx) => segunRol(ctx, inventario.listarIngresos(ctx.query)));
  app.post('/api/stock/entrada', admin, (ctx) => inventario.entradaManual(ctx.body, ctx.user));
  app.post('/api/stock/merma', admin, (ctx) => inventario.merma(ctx.body, ctx.user));
  app.post('/api/stock/ajuste', admin, (ctx) => inventario.ajuste(ctx.body, ctx.user));
  app.post('/api/stock/transferencia', admin, (ctx) => inventario.transferencia(ctx.body, ctx.user));

  // ----------------------------------------------------------- CLIENTES
  app.get('/api/clientes', login, (ctx) => segunRol(ctx, catalogo.listarClientes(ctx.query)));
  app.post('/api/clientes', login, (ctx) => { ctx.status = 201; return catalogo.crearCliente(creditoSegunRol(ctx, null), ctx.user); });
  app.get('/api/clientes/:id', login, (ctx) => segunRol(ctx, catalogo.fichaCliente(id(ctx))));
  app.put('/api/clientes/:id', login, (ctx) =>
    catalogo.editarCliente(id(ctx), creditoSegunRol(ctx, get('SELECT modalidad, limite_credito, plazo_dias FROM clientes WHERE id = ?', id(ctx))), ctx.user));
  app.post('/api/clientes/:id/estado', admin, (ctx) => catalogo.estadoCliente(id(ctx), booleano(ctx.body.activo), ctx.user));
  app.delete('/api/clientes/:id', admin, (ctx) => catalogo.eliminarCliente(id(ctx), ctx.user));
  app.get('/api/clientes/:id/precios', login, (ctx) => segunRol(ctx, catalogo.preciosDeCliente(id(ctx))));
  app.put('/api/clientes/:id/precios/:productoId', admin, (ctx) =>
    catalogo.fijarPrecioCliente(id(ctx), entero(Number(ctx.params.productoId), 'Producto', { min: 1 }), ctx.body, ctx.user));

  // ------------------------------------------------------------- VENTAS
  app.get('/api/ventas', login, (ctx) => segunRol(ctx, ventas.listarVentas(ctx.query)));
  app.post('/api/ventas', login, (ctx) => { const r = ventas.crearVenta(ctx.body, ctx.user); ctx.status = r.duplicada ? 200 : 201; return segunRol(ctx, r); });
  app.get('/api/ventas/:id', login, (ctx) => segunRol(ctx, ventas.detalleVenta(id(ctx))));
  app.get('/api/ventas/:id/comprobante', login, (ctx) => ventas.comprobanteVenta(id(ctx)));
  // El mismo comprobante en PDF, para compartirlo (WhatsApp) desde el celular o la PC.
  app.get('/api/ventas/:id/comprobante.pdf', login, (ctx) => {
    const { buffer, nombreArchivo } = comprobantePdf(id(ctx));
    ctx.binario = { buffer, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombreArchivo}"`, 'Cache-Control': 'no-store' } };
  });
  app.post('/api/ventas/:id/anular', admin, (ctx) => ventas.anularVenta(id(ctx), ctx.body, ctx.user));

  // ------------------------------------------------------ DEUDAS Y PAGOS
  app.get('/api/deudas', login, (ctx) => deudas.listarDeudas({
    cliente_id: ctx.query.cliente_id ? Number(ctx.query.cliente_id) : null, estado: ctx.query.estado || null, incluirPagadas: ctx.query.historial === '1',
  }));
  app.get('/api/clientes/:id/deudas', login, (ctx) => ({ abiertas: deudas.ventasAbiertas(id(ctx)), saldo: deudas.saldoCliente(id(ctx)) }));
  app.get('/api/pagos', login, (ctx) => deudas.listarPagos({ ...ctx.query, cliente_id: ctx.query.cliente_id ? Number(ctx.query.cliente_id) : null }));
  app.post('/api/pagos', login, (ctx) => { const r = deudas.cobrar(ctx.body, ctx.user); ctx.status = r.duplicado ? 200 : 201; return r; });
  app.get('/api/pagos/:id', login, (ctx) => deudas.resumenPago(id(ctx)));
  app.post('/api/pagos/:id/anular', admin, (ctx) => deudas.anularPago(id(ctx), ctx.body, ctx.user));
  app.post('/api/clientes/:id/aplicar-saldo-favor', login, (ctx) => deudas.aplicarSaldoFavor(id(ctx), ctx.user));
  // Saldo inicial (deuda de antes del sistema). Solo administradores; se anula con la anulación de venta / compra.
  app.post('/api/clientes/:id/saldo-inicial', admin, (ctx) => { ctx.status = 201; return ventas.crearSaldoInicialCliente(id(ctx), ctx.body, ctx.user); });

  // ------------------------------------------------ PROVEEDORES Y COMPRAS
  // Compras, proveedores, caja, gastos y reportes de ganancia: solo el administrador.
  app.get('/api/proveedores', admin, () => catalogo.listarProveedores());
  app.post('/api/proveedores', admin, (ctx) => { ctx.status = 201; return catalogo.guardarProveedor(null, ctx.body, ctx.user); });
  app.post('/api/proveedores/:id/saldo-inicial', admin, (ctx) => { ctx.status = 201; return compras.crearSaldoInicialProveedor(id(ctx), ctx.body, ctx.user); });
  app.put('/api/proveedores/:id', admin, (ctx) => catalogo.guardarProveedor(id(ctx), ctx.body, ctx.user));
  app.get('/api/compras', admin, (ctx) => ({ compras: compras.listarCompras(ctx.query), deuda_proveedores: compras.deudaProveedores() }));
  app.post('/api/compras', admin, (ctx) => { const r = compras.crearCompra(ctx.body, ctx.user); ctx.status = r.duplicada ? 200 : 201; return r; });
  app.get('/api/compras/:id', admin, (ctx) => compras.detalleCompra(id(ctx)));
  app.post('/api/compras/:id/pagos', admin, (ctx) => compras.pagarCompra(id(ctx), ctx.body, ctx.user));
  app.post('/api/compras/:id/anular', admin, (ctx) => compras.anularCompra(id(ctx), ctx.body, ctx.user));

  // ------------------------------------------------------ CAJA Y GASTOS
  app.get('/api/caja', admin, (ctx) => finanzas.listarCaja(ctx.query));
  app.post('/api/caja/movimientos', admin, (ctx) => { ctx.status = 201; return finanzas.movimientoManual(ctx.body, ctx.user); });
  app.get('/api/gastos', admin, (ctx) => finanzas.listarGastos(ctx.query));
  app.post('/api/gastos', admin, (ctx) => { ctx.status = 201; return finanzas.crearGasto(ctx.body, ctx.user); });
  app.post('/api/gastos/:id/anular', admin, (ctx) => finanzas.anularGasto(id(ctx), ctx.body, ctx.user));

  // ------------------------------------------------------------ REPORTES
  app.get('/api/dashboard', admin, (ctx) => reportes.dashboard(ctx.query));
  app.get('/api/ganancias', admin, (ctx) => reportes.ganancias(ctx.query));
  app.get('/api/stock/alertas', login, () => {
    const g = reportes.estadoGeneral();
    return { bajo: g.stock_bajo, agotados: g.agotados };
  });

  // ---------------------------------------------- AUDITORÍA Y COPIAS
  app.get('/api/auditoria', admin, (ctx) => {
    const cond = []; const par = [];
    if (ctx.query.entidad) { cond.push('a.entidad = ?'); par.push(ctx.query.entidad); }
    if (ctx.query.desde && esFecha(ctx.query.desde)) { cond.push('substr(a.fecha, 1, 10) >= ?'); par.push(ctx.query.desde); }
    if (ctx.query.hasta && esFecha(ctx.query.hasta)) { cond.push('substr(a.fecha, 1, 10) <= ?'); par.push(ctx.query.hasta); }
    return all(
      `SELECT a.*, u.nombre AS usuario FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
        ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 500`, ...par);
  });
  app.get('/api/backups', admin, () => backup.listarBackups());
  app.post('/api/backups', admin, (ctx) => {
    const f = backup.crearBackup();
    auditar(ctx.user.id, 'backup', 'sistema', null, { archivo: f.split(/[\\/]/).pop() });
    return { ok: true, backups: backup.listarBackups() };
  });
  // Copia automática desde la PC del dueño o del desarrollador (scripts/descargar-copia.js).
  // Usa un token largo guardado en la variable BACKUP_TOKEN del servidor, no la contraseña de un usuario.
  // Sin BACKUP_TOKEN configurado (mínimo 32 caracteres) la ruta no existe.
  const tokenCopias = (ctx) => {
    const esperado = Buffer.from(process.env.BACKUP_TOKEN || '');
    if (esperado.length < 32) throw new HttpError(404, 'No existe esa ruta');
    const dado = Buffer.from(String(ctx.req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    if (dado.length !== esperado.length || !crypto.timingSafeEqual(dado, esperado)) throw new HttpError(401, 'Token de copias inválido.');
  };
  // Resumen verificable de los datos actuales (para comparar antes y después de una mudanza).
  app.get('/api/backups/resumen', (ctx) => { tokenCopias(ctx); return restaurar.resumenDatos(db); });
  // Qué versión corre el servidor (Railway informa el commit): npm run publicar espera a ver la nueva.
  app.get('/api/backups/version', (ctx) => { tokenCopias(ctx); return { commit: process.env.RAILWAY_GIT_COMMIT_SHA || null }; });
  // Cuándo se bajó por última vez la copia automática fuera del servidor (se muestra en Configuración).
  app.get('/api/backups/ultima-externa', admin, () => get(`SELECT MAX(fecha) AS fecha, julianday(?) - julianday(MAX(fecha)) AS dias FROM auditoria WHERE accion = 'backup_automatico'`, ahora()));
  // Subir una copia y reemplazar la base (mudanza o volver atrás). Se aplica al reiniciar; la base actual no se borra.
  app.subida('/api/backups/restaurar', 500_000_000, (ctx) => {
    tokenCopias(ctx);
    let resumen;
    try { resumen = restaurar.prepararRestauracion(DB_PATH, ctx.archivoSubido, ctx.req.headers['x-sha256']); }
    catch (e) { throw new HttpError(400, e.message, 'COPIA_INVALIDA'); }
    const previa = backup.crearBackup('antes-de-restaurar');
    auditar(null, 'restauracion_subida', 'sistema', null, { ip: ctx.ip, copia_previa: previa.split(/[\\/]/).pop() });
    console.log(`Copia recibida y verificada. Copia de lo anterior: ${previa}. Reiniciando para aplicarla…`);
    // Se responde primero y después el proceso termina con código distinto de 0: el proveedor (Railway) lo vuelve a levantar.
    setTimeout(() => { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* igual se aparta con su -wal */ } process.exit(75); }, 800);
    ctx.status = 202;
    return { ok: true, reinicia: true, resumen, copia_previa_en_servidor: previa.split(/[\\/]/).pop() };
  });

  app.get('/api/backups/automatica', (ctx) => {
    tokenCopias(ctx);
    const f = backup.crearBackup('descarga');
    auditar(null, 'backup_automatico', 'sistema', null, { ip: ctx.ip });
    ctx.archivo = {
      path: f,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="copia-${ahora().slice(0, 10)}.db"`, 'Cache-Control': 'no-store' },
      alCerrar: () => { try { fs.unlinkSync(f); } catch { /* ya no está */ } },
    };
  });

  // Descarga una copia nueva y consistente de toda la base de datos
  app.get('/api/backups/descargar', admin, (ctx) => {
    const f = backup.crearBackup('descarga');
    auditar(ctx.user.id, 'backup_descarga', 'sistema');
    ctx.archivo = {
      path: f,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="copia-${ahora().slice(0, 10)}.db"`, 'Cache-Control': 'no-store' },
      alCerrar: () => { try { fs.unlinkSync(f); } catch { /* ya no está */ } },
    };
  });
}
