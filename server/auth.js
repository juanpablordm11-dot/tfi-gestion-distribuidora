// Usuarios, contraseñas (scrypt) y sesiones con cookie HttpOnly.
import crypto from 'node:crypto';
import path from 'node:path';
import { get, all, run, tx, auditar, DB_PATH } from './db.js';
import { crearCanal } from './notificaciones/canales-recuperacion.js';
import { HttpError, bad, texto, opcion, booleano, ahora } from './util.js';

const COOKIE = 'sid';
const DURACION_MS = 14 * 24 * 3600 * 1000;

export function hashPass(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pass, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verificarPass(pass, guardado) {
  const [alg, saltB64, hashB64] = String(guardado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = crypto.scryptSync(pass, Buffer.from(saltB64, 'base64'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function validarPass(p) {
  if (typeof p !== 'string' || p.length < 8) throw bad('La contraseña tiene que tener al menos 8 caracteres.');
  if (p.length > 200) throw bad('La contraseña es demasiado larga.');
  if (/^(12345678|password|contraseña|11111111)$/i.test(p)) throw bad('Esa contraseña es demasiado fácil de adivinar.');
}

export function cantidadUsuarios() { return get('SELECT COUNT(*) AS n FROM usuarios').n; }

// Nombre con el que se entra al sistema (el mismo control al crear y al cambiarlo).
function nombreDeUsuario(v) {
  const usuario = texto(v, 'Usuario', { requerido: true, min: 3, max: 40 });
  if (!/^[a-zA-Z0-9._-]+$/.test(usuario)) throw bad('El usuario solo puede tener letras, números, punto, guion y guion bajo.');
  return usuario;
}

export function crearUsuario({ usuario, nombre, rol, pass }, quien = null) {
  usuario = nombreDeUsuario(usuario);
  nombre = texto(nombre, 'Nombre', { requerido: true, max: 80 });
  rol = opcion(rol, 'Rol', ['admin', 'usuario']);
  validarPass(pass);
  if (get('SELECT 1 FROM usuarios WHERE usuario = ?', usuario)) throw bad('Ya existe un usuario con ese nombre.');
  const id = run('INSERT INTO usuarios (usuario, nombre, rol, pass_hash, creado) VALUES (?, ?, ?, ?, ?)', usuario, nombre, rol, hashPass(pass), ahora()).id;
  auditar(quien, 'crear', 'usuario', id, { usuario, rol });
  return publico(get('SELECT * FROM usuarios WHERE id = ?', id));
}

export const publico = (u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: !!u.activo });

// ---- Sesiones
function crearSesion(usuarioId, ctx) {
  const token = crypto.randomBytes(32).toString('hex');
  run('DELETE FROM sesiones WHERE expira < ?', Date.now());
  run('INSERT INTO sesiones (token_hash, usuario_id, creada, expira) VALUES (?, ?, ?, ?)', sha(token), usuarioId, ahora(), Date.now() + DURACION_MS);
  ctx.setCookie(`${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DURACION_MS / 1000}${ctx.seguro ? '; Secure' : ''}`);
}
export function cerrarSesion(ctx) {
  const t = ctx.cookies[COOKIE];
  if (t) run('DELETE FROM sesiones WHERE token_hash = ?', sha(t));
  ctx.setCookie(`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${ctx.seguro ? '; Secure' : ''}`);
}
export function usuarioDeSesion(ctx) {
  const t = ctx.cookies[COOKIE];
  if (!t) return null;
  const s = get('SELECT * FROM sesiones WHERE token_hash = ?', sha(t));
  if (!s || s.expira < Date.now()) return null;
  const u = get('SELECT * FROM usuarios WHERE id = ?', s.usuario_id);
  return u && u.activo ? u : null;
}

// ---- Protección contra adivinar contraseñas: 5 errores seguidos bloquean 15 minutos.
const intentos = new Map();
const MAX_INTENTOS = 5; const BLOQUEO_MS = 15 * 60 * 1000;
function claveIntento(ctx, usuario) { return `${ctx.ip}|${String(usuario).toLowerCase()}`; }

export function iniciarSesion(ctx, usuario, pass) {
  const clave = claveIntento(ctx, usuario);
  const reg = intentos.get(clave);
  if (reg && reg.hasta > Date.now()) {
    throw new HttpError(429, `Demasiados intentos fallidos. Esperá ${Math.ceil((reg.hasta - Date.now()) / 60000)} minutos e intentá de nuevo.`);
  }
  const u = typeof usuario === 'string' ? get('SELECT * FROM usuarios WHERE usuario = ?', usuario.trim()) : null;
  // Siempre se calcula el hash para que el tiempo de respuesta no revele si el usuario existe.
  const ok = u && u.activo && typeof pass === 'string' && verificarPass(pass, u.pass_hash);
  if (!u) crypto.scryptSync(String(pass ?? ''), 'x'.repeat(16), 64);
  if (!ok) {
    const n = (reg && reg.hasta > 0 && reg.hasta <= Date.now() ? 0 : reg?.n ?? 0) + 1;
    intentos.set(clave, { n, hasta: n >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : 0 });
    auditar(u?.id ?? null, 'login_fallido', 'usuario', u?.id ?? null, { usuario: String(usuario).slice(0, 40) });
    throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  }
  intentos.delete(clave);
  crearSesion(u.id, ctx);
  auditar(u.id, 'login', 'usuario', u.id);
  return publico(u);
}

// ---- Guardias de rutas
export function requiereLogin(ctx) {
  const u = usuarioDeSesion(ctx);
  if (!u) throw new HttpError(401, 'Tu sesión venció. Volvé a iniciar sesión.', 'NO_AUTH');
  ctx.user = u;
}
export function requiereAdmin(ctx) {
  requiereLogin(ctx);
  if (ctx.user.rol !== 'admin') throw new HttpError(403, 'Solo el administrador puede hacer esto.');
}

export function listarUsuarios() {
  return all('SELECT id, usuario, nombre, rol, activo, creado FROM usuarios ORDER BY id').map((u) => ({ ...u, activo: !!u.activo }));
}

export function editarUsuario(id, b, quien) {
  const u = get('SELECT * FROM usuarios WHERE id = ?', id);
  if (!u) throw new HttpError(404, 'No existe ese usuario.');
  const sets = []; const par = [];
  let usuarioNuevo = null;
  if (b.usuario !== undefined && b.usuario !== u.usuario) {
    usuarioNuevo = nombreDeUsuario(b.usuario);
    if (get('SELECT 1 FROM usuarios WHERE usuario = ? AND id <> ?', usuarioNuevo, id)) throw bad('Ya existe un usuario con ese nombre.');
    sets.push('usuario = ?'); par.push(usuarioNuevo);
  }
  if (b.nombre !== undefined) { sets.push('nombre = ?'); par.push(texto(b.nombre, 'Nombre', { requerido: true, max: 80 })); }
  if (b.rol !== undefined) { sets.push('rol = ?'); par.push(opcion(b.rol, 'Rol', ['admin', 'usuario'])); }
  if (b.activo !== undefined) { sets.push('activo = ?'); par.push(booleano(b.activo) ? 1 : 0); }
  if (b.pass) { validarPass(b.pass); sets.push('pass_hash = ?'); par.push(hashPass(b.pass)); }
  if (!sets.length) throw bad('No hay cambios para guardar.');
  // Nunca dejar el sistema sin un administrador activo
  const quedaAdmin = (rolNuevo, activoNuevo) =>
    get("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?", id).n + (rolNuevo === 'admin' && activoNuevo ? 1 : 0) > 0;
  const rolN = b.rol ?? u.rol; const actN = b.activo === undefined ? !!u.activo : booleano(b.activo);
  if (!quedaAdmin(rolN, actN)) throw bad('Tiene que quedar al menos un administrador activo.');
  run(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, ...par, id);
  if (b.pass || actN === false) run('DELETE FROM sesiones WHERE usuario_id = ?', id);
  auditar(quien, 'editar', 'usuario', id, { campos: Object.keys(b).filter((k) => k !== 'pass'), clave_cambiada: !!b.pass,
    ...(usuarioNuevo ? { usuario_antes: u.usuario, usuario_despues: usuarioNuevo } : {}) });
  return publico(get('SELECT * FROM usuarios WHERE id = ?', id));
}

// ---- Recuperación de contraseña (requisito del TFI: "mecanismo de recuperación, real o simulado").
// 1) El usuario pide un código de 6 números con su nombre de usuario.
// 2) El código se envía por un CANAL intercambiable (patrón Strategy, server/notificaciones/canales-recuperacion.js):
//    por defecto la consola del servidor (envío simulado); con CANAL_RECUPERACION=archivo, un correo .eml en
//    data/bandeja-salida. Esta función no sabe cómo se envía: solo le pide al canal elegido que lo haga.
// 3) El usuario ingresa el código y su nueva contraseña. El código vence a los 15 minutos, sirve una sola vez
//    y se bloquea después de 5 intentos fallidos. En la base se guarda solo el hash del código.
const CODIGO_DURACION_MS = 15 * 60 * 1000;
const CODIGO_MAX_INTENTOS = 5;
const MAX_PEDIDOS = 3; // por usuario e IP cada 15 minutos, para que no se use para llenar la consola
const pedidos = new Map();
const hashCodigo = (usuarioId, codigo) => sha(`${usuarioId}:${codigo}`);
const ERROR_CODIGO = 'El código no es válido o ya venció. Pedí uno nuevo.';

// Estrategia en uso. Se elige al arrancar por configuración y se puede reemplazar (por ejemplo, en pruebas).
let canal = crearCanal(process.env.CANAL_RECUPERACION || 'consola', { carpeta: path.join(path.dirname(DB_PATH), 'bandeja-salida') });
export const canalRecuperacion = () => canal;
export function usarCanalRecuperacion(nuevo) {
  if (!nuevo || typeof nuevo.enviar !== 'function') throw new Error('El canal tiene que tener un método enviar().');
  canal = nuevo;
}

function enviarCodigo(u, codigo) {
  try {
    canal.enviar({ nombre: u.nombre, usuario: u.usuario, codigo, minutos: CODIGO_DURACION_MS / 60000 });
  } catch (e) {
    // El código ya quedó guardado (hasheado), pero si no llegó al usuario no sirve: se avisa en vez de fingir que salió.
    console.error(`No se pudo enviar el código de recuperación por "${canal.nombre}": ${e.message}`);
    throw new HttpError(500, 'No se pudo enviar el código de recuperación. Avisale al administrador del sistema.');
  }
}

export function pedirRecuperacion(ctx, usuario) {
  if (typeof usuario !== 'string' || !usuario.trim()) throw bad('Escribí tu nombre de usuario.');
  const clave = claveIntento(ctx, usuario.trim());
  const recientes = (pedidos.get(clave) || []).filter((t) => t > Date.now() - CODIGO_DURACION_MS);
  if (recientes.length >= MAX_PEDIDOS) throw new HttpError(429, 'Ya pediste varios códigos. Esperá unos minutos e intentá de nuevo.');
  pedidos.set(clave, [...recientes, Date.now()]);

  const u = get('SELECT * FROM usuarios WHERE usuario = ?', usuario.trim());
  if (u && u.activo) {
    const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    tx(() => {
      run("UPDATE recuperaciones_clave SET estado = 'reemplazada', cerrada = ? WHERE usuario_id = ? AND estado = 'pendiente'", ahora(), u.id);
      run('INSERT INTO recuperaciones_clave (usuario_id, codigo_hash, creada, expira) VALUES (?, ?, ?, ?)',
        u.id, hashCodigo(u.id, codigo), ahora(), Date.now() + CODIGO_DURACION_MS);
      auditar(null, 'pedir_recuperacion', 'usuario', u.id);
    });
    enviarCodigo(u, codigo);
  }
  // La respuesta es la misma exista o no el usuario: así no sirve para averiguar qué usuarios hay.
  return { ok: true };
}

export function confirmarRecuperacion(ctx, usuario, codigo, nueva) {
  const u = typeof usuario === 'string' ? get('SELECT * FROM usuarios WHERE usuario = ?', usuario.trim()) : null;
  const r = u && u.activo
    ? get("SELECT * FROM recuperaciones_clave WHERE usuario_id = ? AND estado = 'pendiente' ORDER BY id DESC LIMIT 1", u.id)
    : null;
  if (!r || r.expira < Date.now()) throw bad(ERROR_CODIGO);
  const limpio = String(codigo ?? '').trim();
  const correcto = /^\d{6}$/.test(limpio)
    && crypto.timingSafeEqual(Buffer.from(hashCodigo(u.id, limpio)), Buffer.from(r.codigo_hash));
  if (!correcto) {
    const n = r.intentos + 1;
    if (n >= CODIGO_MAX_INTENTOS) {
      run("UPDATE recuperaciones_clave SET intentos = ?, estado = 'bloqueada', cerrada = ? WHERE id = ?", n, ahora(), r.id);
      throw bad('Ingresaste mal el código demasiadas veces. Pedí uno nuevo.');
    }
    run('UPDATE recuperaciones_clave SET intentos = ? WHERE id = ?', n, r.id);
    throw bad(ERROR_CODIGO);
  }
  validarPass(nueva); // si la contraseña nueva no sirve, el código sigue vigente para reintentar
  tx(() => {
    run('UPDATE usuarios SET pass_hash = ? WHERE id = ?', hashPass(nueva), u.id);
    run("UPDATE recuperaciones_clave SET estado = 'usada', cerrada = ? WHERE id = ?", ahora(), r.id);
    run('DELETE FROM sesiones WHERE usuario_id = ?', u.id); // cierra las sesiones abiertas con la contraseña vieja
    auditar(u.id, 'recuperar_clave', 'usuario', u.id);
  });
  intentos.delete(claveIntento(ctx, u.usuario)); // si estaba bloqueado por errores de login, ya puede entrar
}

export function cambiarMiClave(ctx, actual, nueva) {
  if (typeof actual !== 'string' || !verificarPass(actual, ctx.user.pass_hash)) throw bad('La contraseña actual no es correcta.');
  validarPass(nueva);
  run('UPDATE usuarios SET pass_hash = ? WHERE id = ?', hashPass(nueva), ctx.user.id);
  // Cierra las demás sesiones, deja la actual
  const t = ctx.cookies[COOKIE];
  run('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?', ctx.user.id, t ? sha(t) : '');
  auditar(ctx.user.id, 'cambiar_clave', 'usuario', ctx.user.id);
}
