// Configuración: negocio, usuarios, mi contraseña, copias de seguridad y registro de actividad.
import { get, post, put, qs } from '../api.js';
import { h, icon, vaciar, fdt, badge, dataTable, tabs, toast, errorMsg, estadoVacio, formModal, confirmar, cargando } from '../ui.js';
import { app, nombreRol } from '../app.js';

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function (root) {
  const admin = app.usuario.rol === 'admin';
  const items = [{ value: 'cuenta', label: 'Mi cuenta' }];
  if (admin) items.push({ value: 'negocio', label: 'Negocio' }, { value: 'usuarios', label: 'Usuarios' }, { value: 'copias', label: 'Copias de seguridad' }, { value: 'actividad', label: 'Registro de actividad' });
  let pestana = items[0].value; const cuerpo = h('div');
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Configuración'))), tabs(items, pestana, (v) => { pestana = v; mostrar(); }), cuerpo);

  async function mostrar() {
    vaciar(cuerpo).append(cargando());
    try { vaciar(cuerpo); await ({ cuenta, negocio, usuarios, copias, actividad })[pestana](); } catch (e) { vaciar(cuerpo).append(h('div', { class: 'alert bad' }, icon('alerta'), errorMsg(e))); }
  }

  async function cuenta() {
    cuerpo.append(h('section', { class: 'card' }, h('h2', null, app.usuario.nombre), h('p', { class: 'muted' }, `Usuario: ${app.usuario.usuario} · Rol: ${nombreRol(app.usuario.rol)}`),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', type: 'button', onclick: cambiarClave }, 'Cambiar mi contraseña'))));
  }
  async function cambiarClave() {
    const r = await formModal({
      titulo: 'Cambiar mi contraseña', textoOk: 'Cambiar contraseña', intro: 'Mínimo 8 caracteres. Se cierran tus otras sesiones abiertas.',
      campos: [{ name: 'actual', label: 'Contraseña actual', type: 'password', required: true, autofocus: true, full: true }, { name: 'nueva', label: 'Contraseña nueva', type: 'password', required: true, full: true }],
      onSubmit: (v) => post('/api/cambiar-clave', v),
    });
    if (r) toast('Contraseña actualizada.');
  }

  async function negocio() {
    const c = await get('/api/config');
    cuerpo.append(h('section', { class: 'card' }, h('h2', null, c.negocio_nombre),
      h('p', { class: 'muted' }, [c.negocio_direccion, c.negocio_telefono && `Tel.: ${c.negocio_telefono}`].filter(Boolean).join(' · ') || 'Sin dirección ni teléfono cargados (salen en el comprobante de venta).'),
      h('p', { class: 'muted' }, `Depósitos: ${c.depositos.map((x) => x.nombre).join(' y ')}.`),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', type: 'button', onclick: async () => {
        const valores = { negocio_nombre: c.negocio_nombre, negocio_direccion: c.negocio_direccion, negocio_telefono: c.negocio_telefono, comprobante_pie: c.comprobante_pie };
        const r = await formModal({ titulo: 'Datos del negocio', textoOk: 'Guardar', valores,
          intro: 'Estos datos salen en el encabezado del comprobante de venta que se imprime para el cliente.',
          campos: [{ name: 'negocio_nombre', label: 'Nombre del negocio', required: true, full: true, autofocus: true },
            { name: 'negocio_direccion', label: 'Dirección', full: true }, { name: 'negocio_telefono', label: 'Teléfono' },
            { name: 'comprobante_pie', label: 'Texto al pie del comprobante (opcional)', full: true, placeholder: 'Ej.: Gracias por su compra' }],
          onSubmit: async (v) => { await put('/api/config', v); return v; } });
        if (r) { app.negocio = r.negocio_nombre || app.negocio; toast('Guardado.'); mostrar(); }
      } }, 'Editar datos del negocio'))),
    h('div', { class: 'alert info', style: { marginTop: '12px' } }, icon('info'), 'El saldo inicial de caja se cambia desde la pantalla Caja.'));
  }

  async function usuarios() {
    const lista = await get('/api/usuarios');
    const t = dataTable({
      columnas: [
        { key: 'nombre', label: 'Nombre', sort: true, render: (u) => h('b', null, u.nombre) }, { key: 'usuario', label: 'Usuario', render: (u) => u.usuario },
        { key: 'rol', label: 'Rol', render: (u) => badge(nombreRol(u.rol), u.rol === 'admin' ? 'info' : '') },
        { key: 'activo', label: 'Estado', render: (u) => (u.activo ? badge('Activo', 'ok') : badge('Desactivado')) },
        { key: 'a', label: '', class: 'acciones', render: (u) => h('button', { class: 'btn sm', type: 'button', onclick: () => editar(u) }, 'Editar') },
      ], filas: lista, claseFila: (u) => (u.activo ? '' : 'anulada'),
    });
    cuerpo.append(h('div', { class: 'row between', style: { marginBottom: '10px' } }, h('p', { class: 'muted' }, 'Cada persona entra con su propio usuario. El "Empleado" vende, cobra, da de alta clientes y consulta stock y ventas; no ve costos ni ganancias, ni maneja compras, caja, precios o anulaciones. El "Administrador" puede todo.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => editar(null) }, icon('plus'), 'Nuevo usuario')), h('div', { class: 'card flush' }, t.el));
    async function editar(u) {
      // En la base el rol se sigue llamando 'usuario' (no hace falta migración); en pantalla es "Empleado".
      const roles = [{ value: 'usuario', label: 'Empleado (vende y cobra)' }, { value: 'admin', label: 'Administrador (acceso total)' }];
      const r = await formModal({
        titulo: u ? `Editar: ${u.nombre}` : 'Nuevo usuario', textoOk: u ? 'Guardar' : 'Crear usuario', valores: u || { rol: 'usuario' },
        campos: [{ name: 'usuario', label: 'Usuario (para entrar)', required: true, autofocus: !u, hint: u ? 'Si lo cambiás, desde la próxima vez se entra con el nombre nuevo.' : 'Letras y números, sin espacios.' },
          { name: 'nombre', label: 'Nombre', required: true, hint: 'El que se ve en el sistema y en el comprobante ("Atendió").' }, { name: 'rol', label: 'Rol', type: 'select', options: roles },
          ...(u ? [{ name: 'activo', label: 'Activo', type: 'check', value: !!u.activo }] : []), { name: 'pass', label: u ? 'Contraseña nueva (dejar vacío para no cambiar)' : 'Contraseña (mín. 8 caracteres)', type: 'password', required: !u, full: true }],
        onSubmit: (v) => { const b = { ...v }; if (!b.pass) delete b.pass; return u ? put(`/api/usuarios/${u.id}`, b) : post('/api/usuarios', b); },
      });
      if (r) { toast('Usuario guardado.'); mostrar(); }
    }
  }

  async function copias() {
    const [lista, externa] = await Promise.all([get('/api/backups'), get('/api/backups/ultima-externa')]);
    const avisoExterna = !externa.fecha
      ? h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, 'Todavía no se bajó ninguna copia automática a la PC.'))
      : externa.dias > 3
        ? h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, h('b', null, `Hace ${Math.floor(externa.dias)} días que no se baja una copia a la PC`), ` (última: ${fdt(externa.fecha)}). Revisá que la PC se haya prendido y el archivo registro.txt.`))
        : h('p', { class: 'small muted', style: { marginBottom: '10px' } }, `Última copia automática bajada a la PC: ${fdt(externa.fecha)}.`);
    const t = dataTable({ columnas: [{ key: 'nombre', label: 'Archivo', render: (b) => b.nombre }, { key: 'fecha', label: 'Fecha', render: (b) => new Date(b.fecha).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }) }, { key: 'tamano', label: 'Tamaño', num: true, render: (b) => kb(b.tamano) }], filas: lista,
      vacio: estadoVacio('Todavía no hay copias', 'Se crea una automática por día; también podés crearla ahora.') });
    cuerpo.append(
      avisoExterna,
      h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, 'Las copias automáticas se guardan en el mismo equipo que la base de datos. Si ese equipo se rompe, se pierden las dos. ', h('b', null, 'Descargá una copia seguido y guardala en otro lado'), ' (Google Drive, un pendrive, tu mail).')),
      h('div', { class: 'row', style: { margin: '12px 0' } },
        h('a', { class: 'btn primary', href: '/api/backups/descargar', download: '' }, icon('descargar'), 'Descargar copia ahora'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { try { await post('/api/backups'); toast('Copia creada.'); mostrar(); } catch (e) { toast(errorMsg(e), 'error'); } } }, 'Crear copia en el servidor')),
      h('div', { class: 'card flush' }, t.el),
      h('p', { class: 'small muted', style: { marginTop: '10px' } }, 'Para restaurar una copia: detené el sistema y ejecutá npm run restore -- ruta/al/archivo.db (ver docs/BACKUPS.md). Se guarda una copia de seguridad de lo que había antes.'));
  }

  async function actividad() {
    const lista = await get('/api/auditoria');
    const t = dataTable({
      columnas: [{ key: 'fecha', label: 'Fecha', render: (a) => fdt(a.fecha) }, { key: 'usuario', label: 'Usuario', render: (a) => a.usuario || 'Sistema' }, { key: 'accion', label: 'Acción', render: (a) => badge(a.accion) },
        { key: 'entidad', label: 'Sobre', render: (a) => `${a.entidad}${a.entidad_id ? ` N° ${a.entidad_id}` : ''}` }, { key: 'detalle', label: 'Detalle', render: (a) => h('span', { class: 'small muted', style: { wordBreak: 'break-word' } }, a.detalle || '') }],
      filas: lista, vacio: estadoVacio('Sin actividad registrada', 'Altas, anulaciones y cambios importantes quedan acá.'),
    });
    cuerpo.append(h('div', { class: 'card flush' }, t.el, h('div', { class: 'pie-tabla' }, 'Últimos 500 eventos. Este registro no se puede editar ni borrar.')));
  }

  await mostrar();
}
