---
name: diseno-sistema
description: Reglas de diseño de la interfaz del sistema de gestión (pantallas, listados, filtros, formularios, ventanas, avisos y textos). Usar SIEMPRE antes de crear o modificar cualquier archivo de public/ (pages/*.js, ui.js, app.js, styles.css), y para revisar si una pantalla es intuitiva. Pedido de la profesora: el sistema tiene que ser muy intuitivo y tener filtros.
---

# Diseño del sistema: intuitivo, profesional y claro

Estas reglas salen de 5 referencias de paneles de gestión elegidas por el equipo (un listado de proyectos oscuro, el listado de facturas de Square, el panel de clientes de RevenueCat, una ventana "Agregar recurso" y un checkout con resumen de pedido). Se aplican **sobre el estilo actual** (oscuro con rojo, variables de `public/css/styles.css`): no se cambia la identidad, se ordena y se aclara.

Quien usa el sistema es el dueño de una distribuidora y su ayudante: saben de su negocio, no de computación. **Si hay que explicar una pantalla, la pantalla está mal.**

## 1. Principios (en orden de importancia)
1. **Una acción principal por pantalla.** Un solo botón rojo (`btn primary`), arriba a la derecha (ej.: "Nueva venta", "Registrar cobro", "Nueva compra"). Lo demás es secundario (`btn`) o fantasma (`btn ghost`).
2. **Lo importante, grande y arriba.** El número que el usuario viene a mirar (total vendido, deuda, saldo de caja) va en una tarjeta KPI con etiqueta chica arriba, número grande y aclaración abajo ("Pagado (últimos 30 días) **$0,00**").
3. **Todo listado se puede buscar, filtrar y exportar** (ver sección 3).
4. **Nada se hace "a ciegas":** cada acción muestra qué pasó (aviso) y las que no se pueden deshacer piden confirmación diciendo las consecuencias.
5. **Lenguaje del negocio, no de sistemas:** "Cobrar", "Le debés", "Sale de: Galpón". Nunca "registro", "entidad", "ID", "submit".

## 2. Estructura de cada pantalla
```
[Título]  [? Cómo se usa]                     [Secundarios] [Acción principal]
Una línea que explica para qué sirve la pantalla.
[KPI] [KPI] [KPI]                      ← solo si hay números para mirar
[Pestañas]                             ← si la pantalla tiene varias vistas
┌ Tarjeta ───────────────────────────────────────────────────────────┐
│ [Buscador……………] [Filtro: valor ▾] [Período ▾] [Limpiar]  [Exportar] │
│ Tabla                                                               │
│ Pie: "12 de 40" · totales                                           │
└─────────────────────────────────────────────────────────────────────┘
```
- Menú lateral **agrupado con títulos chicos** (Día a día / Mercadería / Administración); el ítem activo con fondo lleno.
- Máximo 3–4 KPI por fila.

## 3. Listados: búsqueda, filtros y exportación (pedido de la profesora)
- **Barra de filtros arriba de la tabla, siempre en el mismo orden:** buscador (el más ancho, a la izquierda) → filtros desplegables → período → "Limpiar filtros" → contador → a la derecha "Exportar".
- **Buscador:** placeholder que diga *qué* busca ("Buscar por cliente o N° de venta…"); filtra mientras se escribe; ignora mayúsculas y tildes. Usar `campoBuscar()` y `coincide()` de `ui.js`.
- **Filtros desplegables:** la primera opción dice el valor por defecto en lenguaje claro ("Todos los clientes", "Todos los estados"). Usar `selectFiltro()`.
- **Período:** botones rápidos (Hoy, Semana, Mes, Mes pasado, Todo, Fechas…) con `selectorPeriodo()` de `pages/_periodo.js`. No obligar a escribir fechas.
- **Siempre** botón "Limpiar filtros" (`botonLimpiar()`) y contador "12 de 40" (`contadorResultados()`).
- **Segmentos predefinidos** cuando hay estados típicos (como las listas Active / Expired de RevenueCat): usar un desplegable o pestañas con los casos que el negocio mira ("Vencidas", "Con saldo", "Solo los que me deben").
- **Tabla:**
  - Encabezados cortos; los ordenables muestran ▲/▼ y se ordenan al tocar.
  - Números alineados a la derecha (`num: true`), con `font-variant-numeric: tabular-nums`.
  - **Estado como etiqueta de color** (`badge`): verde = al día/vigente, amarillo = parcial/con saldo, rojo = vencido, gris = anulado/inactivo. Las anuladas se ven tachadas o atenuadas, nunca desaparecen.
  - Si una fila tiene una acción obvia, va como botón chico al final ("Cobrar"); tocar la fila abre el detalle.
  - Pie con totales de lo filtrado.
- **Exportar** exporta **lo que se está viendo** (con los filtros aplicados), no todo.

## 4. Estados vacíos y de carga
- **Sin datos todavía:** explicar qué va a aparecer y ofrecer la acción para empezar ("Todavía no cargaste compras" + botón "Nueva compra").
- **Sin resultados por filtros:** decirlo así ("No hay compras con estos filtros") y ofrecer "Limpiar filtros". Nunca dar a entender que no hay datos.
- **Cargando:** spinner o filas fantasma; nunca una pantalla en blanco.

## 5. Ventanas (modales) y formularios
Como la referencia "Add resource":
- **Título** que diga la acción ("Registrar cobro") + **una línea** que explique qué va a pasar.
- **Etiqueta arriba de cada campo**, nunca solo placeholder. El placeholder da un ejemplo ("Ej.: Flete de la mercadería").
- Campos relacionados en la misma fila (nombre + cantidad); el resto, uno abajo del otro.
- **Un solo botón principal**, con verbo concreto ("Crear cliente", "Confirmar venta", "Anular venta"). Nunca "Aceptar" u "OK". Cancelar a la izquierda.
- Cruz para cerrar y la tecla Esc; no se pierde lo escrito sin avisar.
- **Errores al lado del campo** y en lenguaje humano ("La contraseña tiene que tener al menos 8 caracteres"), no arriba de todo ni con códigos.

## 6. Pantallas de "armar y confirmar" (Nueva venta, Nueva compra)
Como el checkout de referencia:
- **Izquierda:** lo que se va cargando (cliente, depósito, productos). **Derecha:** el resumen fijo con subtotal, descuento y **TOTAL grande**.
- Cada dato elegido se puede cambiar en el lugar ("Cambiar"), sin volver a empezar.
- Avisos en línea junto al dato que los causa (ej.: "Con esta venta pasa su límite de crédito"), no en una ventana aparte.
- Botón principal ancho, abajo del resumen ("Confirmar venta").

## 7. Avisos y confirmaciones
- **Aviso (toast)** abajo, con ícono ✓ y texto en pasado que diga qué pasó: "Cobro registrado.", "Venta anulada." Se cierra solo o con la cruz.
- **Confirmación** solo para lo que no se deshace o mueve plata/stock: el título dice la acción y el texto dice las consecuencias ("La deuda vuelve a subir $X y la caja resta ese importe"). Botón rojo con el verbo ("Anular cobro"); pedir el motivo cuando corresponde.

## 8. Textos
- Español rioplatense con voseo: "Tocá", "Elegí", "Le debés".
- Frases cortas, sin tecnicismos ni siglas. Montos siempre con `money()` ($ 1.234,56); fechas `dd/mm/aaaa`.
- Botones con verbo + objeto. Títulos de pantalla con sustantivo ("Deudas de clientes").

## 9. Accesibilidad mínima
- Contraste suficiente (texto rojo sobre negro: `--primary-text`, no `--primary`).
- Todo control con etiqueta o `aria-label`; foco visible; se puede usar con teclado (Enter abre la fila).
- Botones de al menos 40 px de alto (`.btn`), 32 px los chicos (`.btn.sm`). Usable en celular.

## 10. Cómo trabajar con esta skill
1. Reutilizar lo que ya existe en `public/js/ui.js` (`dataTable`, `modal`, `formModal`, `confirmar`, `toast`, `estadoVacio`, `badge`, filtros) antes de crear algo nuevo. Si un patrón se repite en dos pantallas, va a `ui.js`.
2. Colores y medidas **solo** con las variables de `styles.css` (`--primary`, `--ok`, `--warn`, `--bad`, `--radius`…); no inventar colores.
3. Después de cambiar una pantalla: `node --check` del archivo, `npm test`, y pedirle al usuario que la mire en el navegador (Ctrl + F5). Las pruebas no cubren la interfaz.
4. Explicarle al usuario qué se cambió y qué regla de esta skill aplica, para que lo pueda defender en el parcial.

## Checklist rápido por pantalla
- [ ] ¿Se entiende para qué sirve sin leer la ayuda?
- [ ] ¿Hay una sola acción principal, arriba a la derecha?
- [ ] ¿El listado tiene buscador, filtros, período, "Limpiar filtros", contador y exportar?
- [ ] ¿Los estados tienen color y texto?
- [ ] ¿El estado vacío explica y ofrece una acción?
- [ ] ¿Las acciones que no se deshacen piden confirmación con sus consecuencias?
- [ ] ¿Los textos están en voseo, sin tecnicismos?
