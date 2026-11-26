// Inicio: indicadores reales del negocio. Distingue ventas (lo registrado), cobros (plata que entró), deudas y ganancia.
import { get, qs } from '../api.js';
import { h, icon, vaciar, money, num, pct, fdate, stockTxt, nombreProducto, estadoVacio, cargando, errorMsg, dataTable } from '../ui.js';
import { lineChart, columnChart, barrasH, apiladasH, dona, etiquetaPeriodo, SERIE } from '../charts.js';
import { selectorPeriodo } from './_periodo.js';
import { app } from '../app.js';

const kpi = (titulo, valor, sub, tipo = '', ayuda) => h('div', { class: `kpi ${tipo}`, title: ayuda || '' }, h('div', { class: 't' }, titulo), h('div', { class: 'v' }, valor), sub ? h('div', { class: 's' }, sub) : null);

// Botones grandes de lo que más se hace en el día (como la pantalla principal de un punto de venta).
const accion = (href, ic, titulo, texto, principal = false) => h('a', { class: `accion${principal ? ' principal' : ''}`, href },
  h('span', { class: 'accion-ic' }, icon(ic)), h('span', null, h('b', null, titulo), h('span', null, texto)));

// El detalle (períodos, gráficos, rankings) se abre con un botón; se recuerda en este navegador.
const DETALLE = 'inicio-detalle';
const leerDetalle = () => { try { return localStorage.getItem(DETALLE) === '1'; } catch { return false; } };
const guardarDetalle = (v) => { try { localStorage.setItem(DETALLE, v ? '1' : '0'); } catch { /* sin almacenamiento */ } };

export default async function (root, ctx) {
  const saludo = h('p', null, '');
  root.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Inicio'), saludo)),
    h('div', { class: 'acciones-inicio' },
      accion('#/venta', 'vender', 'Vender', 'Registrar una venta nueva', true),
      accion('#/deudas', 'deudas', 'Cobrar', 'Un cliente te paga una deuda'),
      accion('#/compras', 'compras', 'Cargar mercadería', 'Llegó una compra del proveedor'),
      accion('#/stock', 'stock', 'Ver stock', 'Qué hay en el Galpón y en la Casa')));
  const cuerpo = h('div', { class: 'stack' });
  root.append(cuerpo);
  let verDetalle = leerDetalle();

  const sel = selectorPeriodo({ inicial: 'mes', alCambiar: () => cargar() });
  const hora = new Date().getHours();
  saludo.textContent = `${hora < 12 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'}, ${app.usuario.nombre.split(' ')[0]}. Así viene ${app.negocio}.`;

  async function cargar() {
    vaciar(cuerpo).append(cargando());
    let d;
    try { d = await get('/api/dashboard' + qs(sel.rango())); } catch (e) { vaciar(cuerpo).append(h('div', { class: 'alert bad' }, icon('alerta'), errorMsg(e))); return; }
    vaciar(cuerpo);
    const g = d.general; const p = d.periodo; const hoy = d.hoy;

    // Primeros pasos mientras el negocio está vacío
    if (!d.vacio.hay_ventas) {
      const hecho = { prod: d.vacio.hay_productos, merc: g.valor_inventario > 0, cli: d.vacio.hay_clientes, venta: d.vacio.hay_ventas };
      cuerpo.append(h('section', { class: 'card' }, h('h2', null, 'Para empezar'),
        h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Todavía no hay ventas registradas, así que los gráficos están vacíos. Seguí estos pasos y se van llenando solos:'),
        h('div', { class: 'pasos' },
          h('a', { href: '#/productos', class: hecho.prod ? 'hecho' : '' }, h('div', null, h('b', null, 'Cargá tus productos'), h('div', { class: 'small muted' }, 'Nombre, unidades por caja, costo y precios.'))),
          h('a', { href: '#/compras', class: hecho.merc ? 'hecho' : '' }, h('div', null, h('b', null, 'Cargá la mercadería que tenés'), h('div', { class: 'small muted' }, 'Con una compra o con stock inicial, en Galpón y en Casa.'))),
          h('a', { href: '#/clientes', class: hecho.cli ? 'hecho' : '' }, h('div', null, h('b', null, 'Cargá tus clientes'), h('div', { class: 'small muted' }, 'De contado y fiados, con sus precios especiales.'))),
          h('a', { href: '#/venta', class: hecho.venta ? 'hecho' : '' }, h('div', null, h('b', null, 'Registrá tu primera venta'), h('div', { class: 'small muted' }, 'El stock, las deudas y las ganancias se actualizan solos.'))))));
    }

    // Lo esencial del día: 4 números que se entienden solos.
    cuerpo.append(
      h('h2', { class: 'titulo-seccion' }, 'Hoy'),
      h('div', { class: 'grid c4' },
        kpi('Vendí hoy', money(hoy.ventas_total), `${hoy.ventas_cantidad} ${hoy.ventas_cantidad === 1 ? 'venta' : 'ventas'}`, '', 'Total de las ventas registradas hoy, estén cobradas o no.'),
        kpi('Cobré hoy', money(hoy.cobros), 'Plata que entró hoy (ventas y deudas)', 'ok', 'Dinero que realmente entró hoy: ventas al contado, parte pagada y cobros de deudas.'),
        kpi('Me deben', money(g.deuda_total), g.deuda_vencida > 0 ? `${money(g.deuda_vencida)} ya vencido` : `${g.clientes_con_deuda} ${g.clientes_con_deuda === 1 ? 'cliente debe' : 'clientes deben'}`, g.deuda_vencida > 0 ? 'bad' : '', 'Lo que te deben hoy por ventas fiadas.'),
        kpi('Plata en caja', money(d.caja.total), d.caja.total < 0 ? 'Da negativo: cargá en Caja la plata que había al empezar' : `Efectivo ${money(d.caja.porMedio.efectivo)}`, d.caja.total < 0 ? 'warn' : '',
          'Lo que debería haber según lo registrado en el sistema (no es una conciliación bancaria). Si da negativo, falta cargar el saldo inicial en Caja.')));

    // Avisos: solo aparecen si hay algo para atender.
    const avisos = [];
    if (g.deuda_vencida > 0) avisos.push(h('a', { class: 'aviso', href: '#/deudas' }, icon('alerta'), h('span', null, h('b', null, 'Deudas vencidas: '), `${money(g.deuda_vencida)} para cobrar.`), h('span', { class: 'aviso-ir' }, 'Ver deudas')));
    if (g.agotados.length) avisos.push(h('a', { class: 'aviso', href: '#/stock' }, icon('alerta'), h('span', null, h('b', null, `${g.agotados.length} ${g.agotados.length === 1 ? 'producto agotado' : 'productos agotados'}: `), g.agotados.slice(0, 3).map(nombreProducto).join(', ') + (g.agotados.length > 3 ? '…' : '')), h('span', { class: 'aviso-ir' }, 'Ver stock')));
    if (g.stock_bajo.length) avisos.push(h('a', { class: 'aviso', href: '#/stock' }, icon('info'), h('span', null, h('b', null, `${g.stock_bajo.length} ${g.stock_bajo.length === 1 ? 'producto con poco stock' : 'productos con poco stock'}: `), g.stock_bajo.slice(0, 3).map(nombreProducto).join(', ') + (g.stock_bajo.length > 3 ? '…' : '')), h('span', { class: 'aviso-ir' }, 'Ver stock')));
    if (avisos.length) cuerpo.append(h('div', { class: 'avisos' }, avisos));

    const detalle = h('div', { class: 'stack', hidden: !verDetalle });
    const btnDetalle = h('button', { class: 'btn block ver-detalle', type: 'button', 'aria-expanded': String(verDetalle) });
    const pintarBoton = () => btnDetalle.replaceChildren(verDetalle ? 'Ocultar el detalle' : 'Ver más detalle: ganancias, gastos, gráficos y lo más vendido', h('span', { class: 'flecha' }, verDetalle ? '▲' : '▼'));
    btnDetalle.addEventListener('click', () => { verDetalle = !verDetalle; guardarDetalle(verDetalle); detalle.hidden = !verDetalle; btnDetalle.setAttribute('aria-expanded', String(verDetalle)); pintarBoton(); });
    pintarBoton();
    cuerpo.append(btnDetalle, detalle);

    detalle.append(
      h('div', { class: 'grid c4' },
        kpi('Ganancia bruta de hoy', money(hoy.ganancia_bruta), hoy.margen_pct !== null ? `${pct(hoy.margen_pct)} de margen` : 'Sin ventas hoy', '', 'Ventas menos el costo de la mercadería vendida.'),
        kpi('Valor del inventario', money(g.valor_inventario), 'Al costo promedio', '', 'Cuánto te costó la mercadería que hoy tenés en stock.'),
        ...g.stock_por_deposito.map((s) => kpi(`Stock en ${s.nombre}`, `${num(s.unidades)} u.`, 'unidades'))),
      h('div', { class: 'row between' }, h('h2', null, 'Período'), sel.el),
      h('div', { class: 'grid c4' },
        kpi('Ventas del período', money(p.ventas_total), `${p.ventas_cantidad} ventas · ${fdate(p.desde)} al ${fdate(p.hasta)}`),
        kpi('Cobros del período', money(p.cobros), `Ventas ${money(p.cobros_ventas)} · Deudas ${money(p.cobros_deudas)}`, 'ok'),
        kpi('Ganancia bruta', money(p.ganancia_bruta), p.margen_pct !== null ? `${pct(p.margen_pct)} margen · ${pct(p.recargo_pct)} sobre costo` : '—', '', 'Margen = ganancia sobre lo vendido. Sobre costo = ganancia sobre lo que te costó.'),
        kpi('Gastos', money(p.gastos), p.retiros > 0 ? `Retiros personales: ${money(p.retiros)} (aparte)` : 'Gastos operativos registrados')),
      h('div', { class: 'grid c4' },
        kpi('Resultado neto estimado', money(p.resultado_neto), 'Ganancia bruta − gastos − mermas', p.resultado_neto < 0 ? 'bad' : 'ok', 'No resta compras de mercadería (ya están en el costo de lo vendido) ni retiros personales.')),
      p.lineas_sin_costo > 0 ? h('div', { class: 'alert warn' }, icon('alerta'), h('div', null, h('b', null, 'Ganancia incompleta. '), `${p.lineas_sin_costo} ${p.lineas_sin_costo === 1 ? 'producto vendido no tenía' : 'productos vendidos no tenían'} costo cargado, así que esa ganancia está sobreestimada. Cargá el costo en Productos o registrá una compra.`)) : "",
    );

    const etq = d.serie.puntos.map((x) => etiquetaPeriodo(x.periodo, d.serie.agrupar));
    detalle.append(
      h('div', { class: 'grid c2' },
        h('section', { class: 'card' }, h('h2', null, 'Ventas y cobros'), h('p', { class: 'muted small', style: { marginBottom: '8px' } }, 'Lo vendido no siempre es lo cobrado: lo fiado se cobra después.'),
          lineChart({ etiquetas: etq, series: [{ nombre: 'Ventas', valores: d.serie.puntos.map((x) => x.ventas) }, { nombre: 'Cobros', valores: d.serie.puntos.map((x) => x.cobros) }] })),
        h('section', { class: 'card' }, h('h2', null, 'Ganancia bruta'), h('p', { class: 'muted small', style: { marginBottom: '8px' } }, 'Se cuenta el día de la venta, no el día en que se cobra.'),
          columnChart({ etiquetas: etq, valores: d.serie.puntos.map((x) => x.ganancia), nombre: 'Ganancia bruta', color: 'var(--ok)' }))),
      h('div', { class: 'grid c2' },
        h('section', { class: 'card' }, h('h2', null, 'Productos más vendidos'),
          barrasH({ items: d.top_productos.map((x) => ({ etiqueta: nombreProducto(x), valor: x.unidades, extra: `${money(x.ingreso)} vendidos` })), formato: (n) => `${num(n)} u.`, vacio: 'Cuando vendas, acá vas a ver cuáles salen más.' })),
        h('section', { class: 'card' }, h('h2', null, 'Clientes que más compran'),
          barrasH({ items: d.top_clientes.map((x) => ({ etiqueta: x.nombre, valor: x.total, extra: `${x.ventas} ventas` })), color: SERIE[2], vacio: 'Todavía no hay compras de clientes en este período.' }))),
      h('div', { class: 'grid c2' },
        h('section', { class: 'card' }, h('h2', null, 'Quién te debe'),
          dona({ items: d.deuda_por_cliente.map((x) => ({ etiqueta: x.nombre, valor: x.saldo })), centro: { titulo: 'Total', valor: money(g.deuda_total) }, vacio: 'Nadie te debe plata ahora mismo.' })),
        h('section', { class: 'card' }, h('h2', null, 'Gastos por categoría'),
          barrasH({ items: d.gastos_por_categoria.map((x) => ({ etiqueta: x.categoria[0].toUpperCase() + x.categoria.slice(1), valor: x.total })), color: 'var(--warn)', vacio: 'No cargaste gastos en este período.' }))),
      h('div', { class: 'grid c2' },
        h('section', { class: 'card' }, h('h2', null, 'Existencias: Galpón y Casa'),
          apiladasH({ items: d.existencias.map((x) => ({ etiqueta: nombreProducto(x), partes: [x.galpon, x.casa] })), nombres: ['Galpón', 'Casa'], formato: (n) => `${num(n)} u.` })),
        h('section', { class: 'card flush' }, h('div', { class: 'card-head' }, h('h2', null, 'Necesitan reposición'), h('a', { href: '#/stock', class: 'small' }, 'Ver stock')),
          (g.stock_bajo.length || g.agotados.length)
            ? dataTable({
              columnas: [
                { key: 'nombre', label: 'Producto', render: (r) => nombreProducto(r) },
                { key: 'total', label: 'Queda', num: true, render: (r) => r.total === 0 ? h('span', { class: 'badge bad' }, 'Agotado') : h('span', { class: 'badge warn' }, stockTxt(r.total, r.unidades_por_caja)) },
              ], filas: [...g.agotados, ...g.stock_bajo].slice(0, 8),
            }).el
            : estadoVacio('Todo en orden', 'Ningún producto está por debajo de su stock mínimo.'))),
    );
  }
  await cargar();
}
