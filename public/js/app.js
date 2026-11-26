// Arranque de la aplicación: configuración inicial, inicio de sesión, menú y rutas.
import { get, post, ApiError } from './api.js';
import { h, icon, vaciar, toast, errorMsg, campo, cargando, modal, cerrarVentanas } from './ui.js';

export const app = { usuario: null, config: null, negocio: 'Mi distribuidora', hoy: null };
const raiz = document.getElementById('app');

const RUTAS = {
  inicio: { titulo: 'Inicio', modulo: './pages/dashboard.js' },
  venta: { titulo: 'Nueva venta', modulo: './pages/venta.js' },
  ventas: { titulo: 'Ventas', modulo: './pages/ventas.js' },
  clientes: { titulo: 'Clientes', modulo: './pages/clientes.js' },
  deudas: { titulo: 'Deudas', modulo: './pages/deudas.js' },
  productos: { titulo: 'Productos', modulo: './pages/productos.js' },
  stock: { titulo: 'Stock', modulo: './pages/stock.js' },
  compras: { titulo: 'Compras', modulo: './pages/compras.js' },
  caja: { titulo: 'Caja y gastos', modulo: './pages/caja.js' },
  ganancias: { titulo: 'Ganancias', modulo: './pages/ganancias.js' },
  config: { titulo: 'Configuración', modulo: './pages/config.js' },
};
// Menú en grupos. Cada opción: [ruta, ícono, texto, qué hace (se ve al pasar el mouse), clase]
const MENU = [
  ['venta', 'vender', 'Nueva venta', 'Registrar una venta: cliente, depósito, productos y forma de pago', 'vender'],
  { grupo: 'Día a día' },
  ['inicio', 'inicio', 'Inicio', 'Resumen del día: ventas, cobros, ganancia, deudas y stock'],
  ['ventas', 'ventas', 'Ventas', 'Historial de ventas: ver detalle, cobrar, imprimir comprobante o anular'],
  ['clientes', 'clientes', 'Clientes', 'Datos de cada cliente, contado o fiado, y sus precios especiales'],
  ['deudas', 'deudas', 'Deudas', 'Quién debe, cuánto y desde cuándo; registrar cobros'],
  { grupo: 'Mercadería' },
  ['productos', 'productos', 'Productos', 'Costos, precios por caja y por unidad, margen y recargo'],
  ['stock', 'stock', 'Stock', 'Qué hay en el Galpón y en la Casa, por fecha de ingreso; transferencias y conteos'],
  ['compras', 'compras', 'Compras', 'Mercadería que entra de proveedores y lo que se les debe'],
  { grupo: 'Administración' },
  ['caja', 'caja', 'Caja y gastos', 'Todo lo que entra y sale de la caja, gastos y retiros'],
  ['ganancias', 'ganancias', 'Ganancias', 'Ganancia por período, producto, cliente y venta'],
  ['config', 'config', 'Configuración', 'Datos del negocio, usuarios, contraseñas y copias de seguridad'],
];

// Roles. En la base: 'admin' y 'usuario'; en pantalla, "Administrador" y "Empleado".
// El empleado vende, cobra y consulta; no ve costos ni ganancias. El servidor es el que realmente lo controla
// (server/routes.js); acá solo se esconde lo que no puede usar.
export const esAdmin = () => app.usuario?.rol === 'admin';
export const nombreRol = (rol) => (rol === 'admin' ? 'Administrador' : 'Empleado');
const SOLO_ADMIN = new Set(['inicio', 'productos', 'compras', 'caja', 'ganancias']);
const puedeVer = (ruta) => esAdmin() || !SOLO_ADMIN.has(ruta);
const PANTALLA_INICIAL = () => (esAdmin() ? 'inicio' : 'venta');

// Ayuda de cada pantalla: pocos pasos, con las mismas palabras que se ven en los botones.
const AYUDA = {
  inicio: [
    'Los 4 botones grandes de arriba son lo que más se hace: Vender, Cobrar, Cargar mercadería y Ver stock.',
    'Debajo ves cómo va el día: cuánto vendiste, cuánto cobraste, cuánto te deben y cuánta plata debería haber en la caja.',
    'Si aparece un aviso amarillo, tocalo: te lleva a lo que hay que atender (deudas vencidas o productos que se acaban).',
    'Con "Ver más detalle" aparecen las ganancias, los gastos, los gráficos y lo más vendido.',
  ],
  venta: [
    'Escribí el nombre del cliente y elegilo de la lista. Si es nuevo, tocá "Nuevo".',
    'Elegí de dónde sale la mercadería: Galpón o Casa.',
    'En cada producto tocá "+ Caja" o "+ Unidad". Si hay mercadería de varias fechas, primero elegí la fecha.',
    'A la derecha se arma el ticket con el total. Elegí cómo paga: Contado, Fiado o Paga una parte.',
    'Tocá "Confirmar venta". Después podés imprimir el comprobante para darle al cliente.',
  ],
  ventas: [
    'Acá están todas las ventas. Arriba elegí el período (Hoy, Semana, Mes…) y, si querés, filtrá por cliente, producto, forma de pago o estado.',
    '"Limpiar filtros" vuelve a mostrar las ventas del mes. Al costado ves cuántas ventas hay con esos filtros.',
    'Tocá una venta para ver el detalle, cobrar lo que falta, imprimir el comprobante o anularla.',
    'Una venta mal cargada no se borra: se anula con un motivo, y el sistema devuelve el stock y corrige la deuda.',
  ],
  clientes: [
    'Cada cliente puede ser de Contado, Fiado o Ambas.',
    'Tocá un cliente para ver sus datos, sus compras y cargarle precios especiales por producto.',
    'Con "Vender" arrancás una venta para ese cliente; con "Cobrar" registrás un pago de su deuda.',
  ],
  deudas: [
    'Acá ves quién te debe, cuánto y cuándo vence.',
    'Para registrar un pago tocá "Cobrar" en la fila, o "Registrar cobro" arriba.',
    'El cobro baja la deuda y suma la plata a la caja. Si paga de más, queda como saldo a favor del cliente.',
    'En cada pestaña podés filtrar: por cliente y estado (vencidas, con pagos parciales), buscar un cliente, o ver los cobros de un período o medio de pago.',
  ],
  productos: [
    'Cada producto tiene su precio por caja y por unidad. "Ganás por caja" muestra cuánto te queda en cada caja.',
    'Tocá "Editar" para cambiar precios o datos. Si un producto ya no se vende, desactivalo: no se borra su historial.',
    'La mercadería no se suma acá: se carga en Compras, o en Stock con "Entrada manual".',
  ],
  stock: [
    'Existencias: cuánto hay de cada producto en Galpón, en Casa y en total.',
    'Por lugar: lo que hay en cada depósito por separado. Por fecha de ingreso: lo más viejo primero.',
    '"Transferir" pasa mercadería de un depósito al otro. "Contar" corrige el stock si lo que hay no coincide. "Pérdida" registra roturas o faltantes.',
  ],
  compras: [
    'Cuando llega mercadería del proveedor, tocá "Nueva compra" y cargá productos, cantidades y costo.',
    'La compra suma el stock y actualiza el costo de los productos.',
    'Si no la pagaste toda, queda como deuda con el proveedor y la podés pagar después.',
    'Para encontrar una compra usá el buscador, el proveedor, el estado (con saldo, pagada, anulada) o el período. En "Proveedores" podés buscar y ver solo a los que les debés.',
  ],
  caja: [
    'Acá está todo lo que entró y salió. Las ventas cobradas y los cobros de deudas entran solos.',
    'Cargá los gastos con "Nuevo gasto". Si sacás plata para vos, usá "Retiro personal": no baja la ganancia.',
    '"Debería haber" es lo que dice el sistema según lo cargado. Si contás la caja y no coincide, revisá los movimientos.',
  ],
  ganancias: [
    'Elegí el período arriba: hoy, semana, mes…',
    'Ganancia bruta = lo vendido menos lo que te costó la mercadería. Resultado neto = además se restan los gastos.',
    'Más abajo ves qué productos y qué clientes te dejan más ganancia.',
  ],
  config: [
    'Datos del negocio: el nombre, la dirección y el teléfono que salen en el comprobante de venta.',
    'Usuarios: creá un usuario para cada persona. Solo el administrador puede anular operaciones y entrar acá.',
    'Copias de seguridad: tocá "Descargar copia ahora" de vez en cuando y guardala fuera de la computadora.',
  ],
};

function agregarAyuda(clave) {
  const titulo = contenido.querySelector('.page-head h1');
  if (!AYUDA[clave] || !titulo) return;
  titulo.append(h('button', { class: 'btn sm btn-ayuda', type: 'button', title: 'Cómo se usa esta pantalla', onclick: () => {
    const m = modal({ titulo: `Cómo se usa: ${RUTAS[clave].titulo}`, contenido: h('ol', { class: 'ayuda-pasos' }, AYUDA[clave].map((p) => h('li', null, p))),
      pie: [h('button', { class: 'btn primary', type: 'button', onclick: () => m.cerrar() }, 'Entendido')] });
  } }, '? Cómo se usa'));
}

// Cartel fijo cuando se usa la base de demostración: así nunca se cargan datos reales ahí por error.
const cartelDemo = () => (app.demo ? h('div', { class: 'cartel-demo', role: 'status' }, icon('alerta'), h('span', null, h('b', null, 'MODO DEMOSTRACIÓN. '), 'Los datos son ficticios: no cargues información real acá.')) : null);

// ---------------------------------------------------------- Pantallas previas
function marca() {
  return h('div', { class: 'brand' },
    (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('width', 36); s.setAttribute('height', 36);
      s.innerHTML = '<rect width="32" height="32" rx="9" fill="#c9303e"/><rect x="6" y="13" width="15" height="6" rx="1.5" fill="#ffffff"/><rect x="21" y="13" width="5" height="6" rx="1.5" fill="#0a0a0a"/>'; return s; })(),
    h('div', null, h('b', null, app.negocio), h('span', null, 'Gestión del negocio')));
}

function pantallaAcceso({ inicial }) {
  vaciar(raiz);
  const error = h('div', { class: 'alert bad', hidden: true, role: 'alert' });
  const u = h('input', { class: 'input', autocomplete: 'username', required: true, autofocus: true });
  const n = h('input', { class: 'input', autocomplete: 'name' });
  const neg = h('input', { class: 'input', placeholder: 'Ej.: Distribuidora López' });
  const p = h('input', { class: 'input', type: 'password', autocomplete: inicial ? 'new-password' : 'current-password', required: true });
  const btn = h('button', { class: 'btn primary lg block', type: 'submit' }, inicial ? 'Crear acceso y entrar' : 'Entrar');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); error.hidden = true; btn.disabled = true;
    try {
      if (inicial) await post('/api/configuracion-inicial', { usuario: u.value.trim(), nombre: n.value.trim() || u.value.trim(), pass: p.value, negocio_nombre: neg.value.trim() || undefined });
      else await post('/api/login', { usuario: u.value.trim(), pass: p.value });
      await arrancar();
    } catch (err) { error.textContent = errorMsg(err); error.hidden = false; btn.disabled = false; p.focus(); }
  } },
  inicial ? h('p', { class: 'muted' }, 'Es la primera vez que se abre el sistema. Creá el usuario administrador (el dueño). Después podés agregar más usuarios desde Configuración.') : null,
  error,
  inicial ? campo('Nombre del negocio', neg) : null,
  inicial ? campo('Tu nombre', n) : null,
  campo('Usuario', u, inicial ? { hint: 'Letras y números, sin espacios. Ej.: dueño, juan.' } : {}),
  campo('Contraseña', p, inicial ? { hint: 'Mínimo 8 caracteres. Usá algo que no uses en otros sitios.' } : {}),
  btn,
  inicial ? null : h('button', { class: 'btn ghost block', type: 'button', onclick: () => recuperarClave(u.value.trim()) }, '¿Olvidaste tu contraseña?'));
  raiz.append(cartelDemo() || '', h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card' }, marca(), h('h1', { style: { fontSize: '1.3rem', marginBottom: '14px' } }, inicial ? 'Configuración inicial' : 'Iniciar sesión'), form)));
}

// Recuperación de contraseña en dos pasos: 1) pedir un código con el usuario; 2) ingresar el código y la clave nueva.
// El envío del código es simulado: aparece en la consola donde corre el sistema (ver server/auth.js).
function recuperarClave(usuarioInicial = '') {
  const error = h('div', { class: 'alert bad', hidden: true, role: 'alert' });
  const aviso = h('div', { class: 'alert', hidden: true, role: 'status' });
  const u = h('input', { class: 'input', autocomplete: 'username', value: usuarioInicial, autofocus: true });
  const cod = h('input', { class: 'input', inputMode: 'numeric', maxLength: 6, autocomplete: 'one-time-code', placeholder: '6 números' });
  const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const paso2 = h('div', { class: 'stack', hidden: true },
    campo('Código recibido', cod),
    campo('Contraseña nueva', p1, { hint: 'Mínimo 8 caracteres.' }),
    campo('Repetí la contraseña nueva', p2));
  const btnPedir = h('button', { class: 'btn', type: 'button' }, 'Enviarme un código');
  const btnGuardar = h('button', { class: 'btn primary', type: 'button', hidden: true }, 'Guardar contraseña nueva');
  const mostrarError = (msg) => { error.textContent = msg; error.hidden = false; };

  btnPedir.onclick = async () => {
    error.hidden = true;
    if (!u.value.trim()) return mostrarError('Escribí tu nombre de usuario.');
    btnPedir.disabled = true;
    try {
      await post('/api/recuperar-clave/pedir', { usuario: u.value.trim() });
      aviso.textContent = 'Si el usuario existe, se envió un código de 6 números que vence en 15 minutos. '
        + '(Envío simulado: el código aparece en la consola donde corre el sistema.)';
      aviso.hidden = false; paso2.hidden = false; btnGuardar.hidden = false; btnPedir.textContent = 'Enviar otro código';
      cod.focus();
    } catch (err) { mostrarError(errorMsg(err)); }
    btnPedir.disabled = false;
  };
  btnGuardar.onclick = async () => {
    error.hidden = true;
    if (p1.value !== p2.value) return mostrarError('Las dos contraseñas nuevas no coinciden.');
    btnGuardar.disabled = true;
    try {
      await post('/api/recuperar-clave/confirmar', { usuario: u.value.trim(), codigo: cod.value.trim(), nueva: p1.value });
      m.cerrar();
      toast('Listo: ya podés entrar con tu contraseña nueva.');
    } catch (err) { mostrarError(errorMsg(err)); btnGuardar.disabled = false; }
  };
  const m = modal({ titulo: 'Recuperar contraseña',
    contenido: h('div', { class: 'stack' }, error, aviso, campo('Usuario', u), paso2),
    pie: [h('button', { class: 'btn', type: 'button', onclick: () => m.cerrar() }, 'Cancelar'), btnPedir, btnGuardar] });
}

// ------------------------------------------------------------ Estructura
let contenido; let tituloTop; let limpiar = null; let navToken = 0;

function armarEstructura() {
  vaciar(raiz);
  const cerrarMenu = () => document.body.classList.remove('menu-abierto');
  const enlace = ([ruta, ic, texto, ayuda, clase = '']) => h('a', { href: `#/${ruta}`, class: clase, 'data-ruta': ruta, title: ayuda, onclick: cerrarMenu }, icon(ic), texto);
  // El empleado solo ve lo que puede usar; un grupo sin opciones no se muestra.
  const visibles = MENU.filter((m) => m.grupo || puedeVer(m[0]));
  const items = visibles.filter((m, i) => !m.grupo || (visibles[i + 1] && !visibles[i + 1].grupo));
  const nav = h('nav', { class: 'nav', 'aria-label': 'Principal' }, items.map((m) => (m.grupo ? h('div', { class: 'grupo' }, m.grupo) : enlace(m))));
  const side = h('aside', { class: 'sidebar' }, marca(), nav,
    h('div', { class: 'side-foot' }, h('b', null, app.usuario.nombre), h('span', null, nombreRol(app.usuario.rol)),
      h('button', { class: 'btn sm block', type: 'button', onclick: async () => { try { await post('/api/logout'); } catch { /* igual salimos */ } location.hash = ''; location.reload(); } }, icon('salir'), 'Cerrar sesión')));
  tituloTop = h('b', null, '');
  const top = h('header', { class: 'topbar' }, h('button', { class: 'btn ghost sm', type: 'button', 'aria-label': 'Abrir menú', onclick: () => document.body.classList.add('menu-abierto') }, icon('mas')), tituloTop,
    h('a', { class: 'btn primary sm', href: '#/venta' }, icon('plus'), 'Vender'));
  const bn = (ruta, ic, txt) => h('a', { href: `#/${ruta}`, 'data-ruta': ruta }, icon(ic), txt);
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Acceso rápido' }, esAdmin() ? bn('inicio', 'inicio', 'Inicio') : bn('ventas', 'ventas', 'Ventas'), bn('venta', 'vender', 'Vender'), bn('clientes', 'clientes', 'Clientes'), bn('deudas', 'deudas', 'Deudas'),
    h('button', { type: 'button', onclick: () => document.body.classList.add('menu-abierto') }, icon('mas'), 'Más'));
  contenido = h('main', { class: 'content', id: 'contenido', tabIndex: -1 });
  raiz.append(h('div', { class: 'layout' }, side, h('div', { class: 'main' }, cartelDemo(), top, contenido)), bottom,
    h('div', { class: 'velo', hidden: true, id: 'velo', onclick: cerrarMenu }));
  new MutationObserver(() => { document.getElementById('velo').hidden = !document.body.classList.contains('menu-abierto'); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

async function navegar() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [nombre, ...resto] = hash.split('/');
  const clave = RUTAS[nombre] ? nombre : PANTALLA_INICIAL();
  if (!RUTAS[nombre] && hash) { location.replace(`#/${PANTALLA_INICIAL()}`); return; }
  // Si el empleado llega a una pantalla del administrador (por un enlace o escribiendo la dirección), va a Nueva venta.
  if (!puedeVer(clave)) { location.replace('#/venta'); return; }
  const token = ++navToken;
  document.body.classList.remove('menu-abierto');
  // Al cambiar de pantalla (menú o botón "atrás") no puede quedar una ventana abierta tapando la pantalla nueva.
  cerrarVentanas();
  for (const a of document.querySelectorAll('[data-ruta]')) {
    if (a.dataset.ruta === clave) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  tituloTop.textContent = RUTAS[clave].titulo; document.title = `${RUTAS[clave].titulo} · ${app.negocio}`;
  if (limpiar) { try { limpiar(); } catch { /* nada */ } limpiar = null; }
  vaciar(contenido).append(cargando());
  try {
    const mod = await import(RUTAS[clave].modulo);
    if (token !== navToken) return;
    vaciar(contenido);
    const ctx = { params: resto, app, titulo: (t) => { tituloTop.textContent = t; document.title = `${t} · ${app.negocio}`; } };
    const r = await mod.default(contenido, ctx);
    if (token === navToken && typeof r === 'function') limpiar = r;
    if (token === navToken) agregarAyuda(clave);
    window.scrollTo(0, 0);
  } catch (e) {
    if (token !== navToken) return;
    vaciar(contenido).append(h('div', { class: 'card' }, h('div', { class: 'alert bad' }, icon('alerta'), h('div', null, h('b', null, 'No se pudo cargar esta pantalla.'), h('div', null, errorMsg(e)))),
      h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn', onclick: navegar }, 'Reintentar'))));
    console.error(e);
  }
}

export async function recargarConfig() { app.config = await get('/api/config'); app.negocio = app.config.negocio_nombre; }

async function arrancar() {
  try {
    const e = await get('/api/estado');
    app.negocio = e.negocio; app.hoy = e.hoy; app.demo = !!e.demo; document.title = e.negocio;
    if (e.necesita_configuracion) return pantallaAcceso({ inicial: true });
    if (!e.usuario) return pantallaAcceso({ inicial: false });
    app.usuario = e.usuario; await recargarConfig();
    armarEstructura();
    if (!location.hash) location.hash = `#/${PANTALLA_INICIAL()}`;
    await navegar();
  } catch (err) {
    vaciar(raiz).append(h('div', { class: 'login-wrap' }, h('div', { class: 'card login-card' }, h('div', { class: 'alert bad' }, icon('alerta'), h('div', null, errorMsg(err))),
      h('button', { class: 'btn primary block', style: { marginTop: '14px' }, onclick: () => location.reload() }, 'Reintentar'))));
  }
}

window.addEventListener('hashchange', () => { if (app.usuario) navegar(); });
window.addEventListener('sesion-vencida', () => { if (app.usuario) { app.usuario = null; toast('Tu sesión venció. Volvé a iniciar sesión.', 'warn'); pantallaAcceso({ inicial: false }); } });
arrancar();
