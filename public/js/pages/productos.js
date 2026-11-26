// Productos: precios, costo promedio y porcentaje de ganancia sobre lo que costó.
import { get, post, put, del, qs } from '../api.js';
import { h, icon, vaciar, money, moneyFull, num, pct, norm, debounce, toast, errorMsg, confirmar, formModal, dataTable, badge, segmentado,
  stockTxt, nombreProducto, estadoVacio, cargando, parseMoney, centavosATexto, descargar, aCSV } from '../ui.js';
import { app } from '../app.js';
import { unidadDesdeCaja, avisoUnidad } from '../precios.js';

export default async function (root) {
  let productos = []; let estado = '1'; let stockF = '';
  const buscar = h('input', { class: 'input buscar', type: 'search', placeholder: 'Buscar por nombre, marca o código…', 'aria-label': 'Buscar' });
  const resumen = h('div', { class: 'pie-tabla' });
  const cont = h('div');

  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Productos'), h('p', null, 'Precios generales, costo promedio y cuánto ganás por caja y por unidad.')),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: exportar }, icon('descargar'), 'Exportar'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => abrirForm() }, icon('plus'), 'Nuevo producto'))),
    h('div', { class: 'card flush' },
      h('div', { class: 'toolbar' }, buscar,
        segmentado([{ value: '1', label: 'Activos' }, { value: '0', label: 'Inactivos' }, { value: '', label: 'Todos' }], estado, (v) => { estado = v; cargar(); }),
        segmentado([{ value: '', label: 'Todo el stock' }, { value: 'bajo', label: 'Stock bajo' }, { value: 'agotado', label: 'Agotados' }], stockF, (v) => { stockF = v; cargar(); })),
      cont, resumen));
  buscar.addEventListener('input', debounce(() => cargar(), 200));

  const tabla = dataTable({
    columnas: [
      // 5 columnas claras; el detalle (costo por unidad, margen) queda en letra chica y en la ficha del producto.
      { key: 'nombre', label: 'Producto', class: 'col-principal', sort: (r) => r.nombre.toLowerCase(), render: (r) => h('div', null, h('b', null, r.nombre),
        h('div', { class: 'small muted' }, [r.marca && r.marca !== r.nombre ? r.marca : null, r.variante, `caja de ${r.unidades_por_caja}`, r.codigo && `cód. ${r.codigo}`].filter(Boolean).join(' · ')),
        r.activo ? null : badge('Inactivo')) },
      { key: 'precio', label: 'Precio de venta', num: true, sort: (r) => r.precio_caja, render: (r) => h('div', null, h('div', null, h('b', null, money(r.precio_caja)), h('span', { class: 'small muted' }, ' la caja')),
        h('div', { class: 'small muted' }, `${money(r.precio_unidad)} la unidad`)) },
      { key: 'gan', label: 'Ganás por caja', num: true, sort: (r) => r.recargo_caja_pct ?? -1e9, render: (r) => r.sin_costo ? badge('Falta el costo', 'warn') : h('div', null,
        h('div', null, h('b', null, money(r.ganancia_caja)), ' ', badge(`${(r.recargo_caja_pct ?? 0) >= 0 ? '+' : ''}${pct(r.recargo_caja_pct)}`, (r.recargo_caja_pct ?? 0) < 0 ? 'bad' : 'ok')),
        h('div', { class: 'small muted', title: 'Margen = ganancia ÷ precio de venta. Recargo = ganancia ÷ costo. Son números distintos.' }, `costo ${money(r.costo_caja_promedio)} · margen ${pct(r.margen_caja_pct)}`)) },
      { key: 't', label: 'Stock', num: true, sort: (r) => r.stock_total, render: (r) => h('div', null, h('b', null, stockTxt(r.stock_total, r.unidades_por_caja)),
        h('div', { class: 'small muted' }, `Galpón ${stockTxt(r.stock_galpon, r.unidades_por_caja)} · Casa ${stockTxt(r.stock_casa, r.unidades_por_caja)}`),
        r.estado_stock === 'agotado' ? badge('Agotado', 'bad') : r.estado_stock === 'bajo' ? badge('Poco stock', 'warn') : null) },
      { key: 'a', label: '', class: 'acciones', render: (r) => h('div', { class: 'row', style: { justifyContent: 'flex-end', flexWrap: 'nowrap' } },
        h('button', { class: 'btn sm', type: 'button', title: 'Cambiar precios, costo y datos del producto', onclick: (e) => { e.stopPropagation(); abrirForm(r); } }, icon('editar'), 'Editar'),
        h('button', { class: 'btn sm ghost', type: 'button', title: r.activo ? 'Ocultarlo de las ventas sin borrar su historial' : 'Volver a mostrarlo en las ventas', onclick: (e) => { e.stopPropagation(); alternar(r); } }, r.activo ? 'Desactivar' : 'Activar')) },
    ],
    onClick: (r) => abrirForm(r),
    claseFila: (r) => (r.activo ? '' : 'anulada'),
    vacio: estadoVacio('Todavía no hay productos', 'Cargá tu primer producto con su costo y precio. Después sumás la mercadería con una compra.', h('button', { class: 'btn primary', onclick: () => abrirForm() }, icon('plus'), 'Nuevo producto')),
  });
  cont.append(tabla.el);

  async function cargar() {
    try {
      productos = await get('/api/productos' + qs({ q: buscar.value.trim(), activos: estado, estado_stock: stockF }));
      tabla.setFilas(productos);
      const valor = productos.reduce((s, p) => s + p.valor_inventario, 0);
      resumen.textContent = `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} · valor del stock al costo: ${money(valor)}`;
    } catch (e) { toast(errorMsg(e), 'error'); }
  }

  function exportar() {
    descargar('productos.csv', aCSV([['Producto', 'Marca', 'Variante', 'Código', 'Unidades por caja', 'Costo caja', 'Costo unidad', 'Precio caja', 'Precio unidad', 'Ganancia caja %', 'Margen caja %', 'Stock galpón (u)', 'Stock casa (u)', 'Stock total (u)'],
      ...productos.map((p) => [p.nombre, p.marca, p.variante, p.codigo, p.unidades_por_caja, centavosATexto(p.costo_caja_promedio), centavosATexto(p.costo_unidad), centavosATexto(p.precio_caja), centavosATexto(p.precio_unidad),
        p.recargo_caja_pct ?? '', p.margen_caja_pct ?? '', p.stock_galpon, p.stock_casa, p.stock_total])]));
  }

  async function alternar(p) {
    if (p.activo) {
      const ok = await confirmar({ titulo: 'Desactivar producto', mensaje: `"${nombreProducto(p)}" deja de aparecer para vender, pero se conserva todo su historial. Podés volver a activarlo cuando quieras.`, textoOk: 'Desactivar' });
      if (!ok) return;
    }
    try { await post(`/api/productos/${p.id}/estado`, { activo: !p.activo }); toast(p.activo ? 'Producto desactivado.' : 'Producto activado.'); cargar(); } catch (e) { toast(errorMsg(e), 'error'); }
  }

  async function abrirForm(p = null) {
    const nuevo = !p;
    const analisis = h('div', { class: 'alert' });
    const campos = [
      { name: 'nombre', label: 'Nombre', required: true, full: true, autofocus: true, placeholder: 'Ej.: Marlboro Rojo' },
      { name: 'marca', label: 'Marca' }, { name: 'variante', label: 'Presentación / variante', placeholder: 'Ej.: Box 20' },
      { name: 'codigo', label: 'Código interno o de barras' },
      { name: 'unidades_por_caja', label: 'Unidades por caja / cartón', type: 'int', min: 1, required: true, value: 10, hint: nuevo ? '' : (p.stock_total || p.valor_inventario ? 'No se puede cambiar si el producto ya tiene movimientos.' : '') },
      { type: 'separador', label: 'Costo (lo que pagás)' },
      { name: 'costo_caja', label: 'Costo por caja', type: 'money', prefix: '$' },
      { name: 'costo_unidad', label: 'Costo por unidad', type: 'money', prefix: '$', hint: 'Se calcula solo: caja ÷ unidades. Si escribís uno, el otro se completa.' },
      { type: 'separador', label: 'Precio general de venta' },
      { name: 'precio_caja', label: 'Precio por caja', type: 'money', prefix: '$' },
      { name: 'precio_unidad', label: 'Precio por unidad', type: 'money', prefix: '$' },
      { name: 'stock_minimo', label: 'Avisarme cuando queden menos de (unidades)', type: 'int', min: 0, value: 0, hint: '0 = no avisar.' },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
    ];
    if (nuevo) campos.splice(campos.length - 1, 0,
      { type: 'separador', label: 'Stock que ya tenés (opcional)' },
      { name: 'stock_galpon', label: 'En el Galpón (unidades)', type: 'int', min: 0, hint: 'Podés cargarlo después con una compra o una entrada.' },
      { name: 'stock_casa', label: 'En la Casa (unidades)', type: 'int', min: 0 });
    const valores = nuevo ? {} : { ...p, costo_caja: p.costo_caja, costo_unidad: p.costo_unidad, codigo: p.codigo ?? '' };
    if (!nuevo) { valores.costo_caja = p.sin_costo ? null : p.costo_caja_promedio; valores.costo_unidad = p.sin_costo ? null : p.costo_unidad; }

    const extra = h('div', { class: 'stack' }, analisis,
      !nuevo && !p.sin_costo ? h('div', { class: 'small muted' }, `Costo promedio actual: ${moneyFull(p.costo_unidad)} por unidad (${moneyFull(p.costo_caja_promedio)} por caja). Se actualiza solo con cada compra.`) : null,
      !nuevo && app.usuario.rol === 'admin' ? h('div', null, h('button', { class: 'btn danger sm', type: 'button', onclick: () => eliminar(p, () => dlg.cerrar(true)) }, 'Eliminar producto…')) : null);
    let dlg; let costoTocado = false;
    const r = await formModal({
      titulo: nuevo ? 'Nuevo producto' : `Editar: ${p.nombre}`, tamano: 'wide', campos, valores, extra,
      textoOk: nuevo ? 'Crear producto' : 'Guardar cambios',
      alAbrir: (inp, m) => {
        dlg = m;
        const N = () => Math.max(1, Math.floor(Number(inp.unidades_por_caja.value)) || 1);
        const calcular = () => {
          const costo = inp.costo_caja.cents(); const cu = N() ? (costo || 0) / N() : 0;
          const pc = inp.precio_caja.cents() || 0; const pu = inp.precio_unidad.cents() || 0;
          vaciar(analisis);
          if (!costo || Number.isNaN(costo)) { analisis.append(icon('info'), h('div', null, 'Cargá el costo para ver cuánto ganás.')); return; }
          const linea = (nom, precio, c) => precio ? `${nom}: ganás ${money(Math.round(precio - c))} (${pct(((precio - c) / c) * 100)} sobre el costo · ${pct(((precio - c) / precio) * 100)} de margen)` : null;
          analisis.append(icon('info'), h('div', null, [linea('Caja', pc, costo), linea('Unidad', pu, cu)].filter(Boolean).map((t) => h('div', null, t)).concat(!pc && !pu ? ['Cargá los precios para ver tu ganancia.'] : [])));
        };
        inp.costo_caja.addEventListener('input', () => { costoTocado = true; const c = inp.costo_caja.cents(); if (c !== null && !Number.isNaN(c)) { inp.costo_unidad.value = centavosATexto(Math.round(c / N())); } else if (c === null) inp.costo_unidad.value = ''; calcular(); });
        inp.costo_unidad.addEventListener('input', () => { costoTocado = true; const c = inp.costo_unidad.cents(); if (c !== null && !Number.isNaN(c)) { inp.costo_caja.value = centavosATexto(c * N()); } else if (c === null) inp.costo_caja.value = ''; calcular(); });
        inp.unidades_por_caja.addEventListener('input', () => { const c = inp.costo_caja.cents(); if (c !== null && !Number.isNaN(c)) inp.costo_unidad.value = centavosATexto(Math.round(c / N())); calcular(); });
        for (const k of ['precio_caja', 'precio_unidad']) inp[k].addEventListener('input', calcular);
        // Precio por unidad calculado desde la caja: caja ÷ unidades, redondeado al centavo (se puede corregir a mano)
        const nu = h('div', { class: 'small calc-aviso', hidden: true });
        inp.precio_unidad.closest('.field')?.append(nu);
        const recalcularUnidad = () => {
          const a = inp.precio_caja.cents(); const n = N();
          nu.hidden = true;
          if (a === null || Number.isNaN(a)) return;
          const u = unidadDesdeCaja(a, n);
          if (u === null || u === inp.precio_unidad.cents()) return;
          inp.precio_unidad.value = centavosATexto(u);
          nu.textContent = avisoUnidad(a, n, u);
          nu.hidden = false; calcular();
        };
        inp.precio_caja.addEventListener('change', recalcularUnidad);
        inp.unidades_por_caja.addEventListener('change', recalcularUnidad);
        inp.precio_unidad.addEventListener('input', () => { nu.hidden = true; });
        calcular();
        if (!nuevo && (p.stock_total > 0 || p.valor_inventario > 0)) inp.unidades_por_caja.disabled = true;
      },
      onSubmit: (v) => {
        const cuerpo = { ...v };
        // Se manda siempre el costo de la caja; el de la unidad es solo ayuda para cargar.
        delete cuerpo.costo_unidad;
        if (cuerpo.costo_caja === null || (!nuevo && !costoTocado)) delete cuerpo.costo_caja;
        if (nuevo) { cuerpo.stock_inicial = { 1: v.stock_galpon || 0, 2: v.stock_casa || 0 }; delete cuerpo.stock_galpon; delete cuerpo.stock_casa; }
        if (!nuevo && inpUnidadesBloqueada(p)) delete cuerpo.unidades_por_caja;
        cuerpo.precio_caja = v.precio_caja ?? 0; cuerpo.precio_unidad = v.precio_unidad ?? 0;
        return nuevo ? post('/api/productos', cuerpo) : put(`/api/productos/${p.id}`, cuerpo);
      },
    });
    if (r) { toast(nuevo ? 'Producto creado.' : 'Cambios guardados.'); cargar(); }
  }
  const inpUnidadesBloqueada = (p) => p.stock_total > 0 || p.valor_inventario > 0;

  async function eliminar(p, cerrar) {
    const ok = await confirmar({ titulo: 'Eliminar producto', mensaje: `¿Eliminar "${nombreProducto(p)}"? Solo se puede si nunca tuvo movimientos. Si ya tiene historial, desactivalo.`, textoOk: 'Eliminar', peligro: true });
    if (!ok) return;
    try { await del(`/api/productos/${p.id}`); toast('Producto eliminado.'); cerrar(); cargar(); } catch (e) { toast(errorMsg(e), 'error'); }
  }

  await cargar();
}
