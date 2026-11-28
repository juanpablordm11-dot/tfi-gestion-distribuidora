# Manual de usuario – Gestión para Distribuidoras/Negocios

**Versión 1.0 · Noviembre 2026 · Juan Pablo Romagnoli · Guillermo Jiménez**

> Cada recuadro **📷 CAPTURA** indica la imagen real del sistema que va en ese lugar. Sacala con **Windows + Shift + S** y pegala en el documento. *(Borrar estas indicaciones en la versión final.)*

## 1. Introducción
Este manual explica, pantalla por pantalla, cómo usar el sistema para el trabajo diario de la distribuidora: vender, cobrar, controlar el stock, registrar compras y gastos, y consultar las ganancias.

**Usuarios del sistema:**
- **Administrador** (el dueño): acceso total.
- **Empleado** (quien vende y cobra): vende, cobra, da de alta clientes y consulta ventas, deudas y stock. No ve costos ni ganancias, y no maneja compras, caja, precios ni anulaciones.

Todas las pantallas tienen arriba el botón **"? Cómo se usa"**, con los pasos de esa pantalla.

## 2. Requisitos y acceso
- Una computadora o celular con navegador actualizado (Chrome o Edge).
- El sistema en funcionamiento: en la computadora del negocio se inicia con `npm start` y se abre en **http://localhost:3000**.
- Un usuario y una contraseña entregados por el administrador.

## 3. Inicio de sesión
1. Escribí tu **Usuario** y tu **Contraseña**.
2. Tocá **Entrar**.

Si te equivocás 5 veces seguidas, el sistema bloquea ese usuario por 15 minutos, para protegerlo.

> 📷 **CAPTURA 1:** pantalla de inicio de sesión.

### 3.1 Primera vez (configuración inicial)
La primera vez que se abre el sistema, pide crear el **administrador** (el dueño): nombre del negocio, nombre, usuario y contraseña (mínimo 8 caracteres).

### 3.2 Recuperar la contraseña
1. En el inicio de sesión tocá **"¿Olvidaste tu contraseña?"**.
2. Escribí tu usuario y tocá **"Enviarme un código"**.
3. Vas a recibir un **código de 6 números**, que vence a los 15 minutos y sirve una sola vez.
4. Escribí el código y tu contraseña nueva dos veces, y tocá **"Guardar contraseña nueva"**.

> 📷 **CAPTURA 2:** ventana "Recuperar contraseña" con el código y la contraseña nueva.
> 📷 **CAPTURA 3:** la terminal con la línea "[ENVÍO SIMULADO] … Código de recuperación: ……" *(el envío del código está simulado: aparece en la consola del sistema o, en modo correo, como archivo .eml)*.

## 4. Pantalla principal y menú
A la izquierda está el menú, agrupado en **Día a día**, **Mercadería** y **Administración**. Arriba de todo está el botón **Nueva venta**. Abajo aparecen tu nombre, tu rol y **Cerrar sesión**.

> 📷 **CAPTURA 4:** pantalla de **Inicio** del administrador (accesos rápidos y resumen del día).
> 📷 **CAPTURA 5:** el menú del **Empleado** (menú reducido, dice "Empleado" abajo).

## 5. Nueva venta
1. **¿A quién le vendés?** Buscá el cliente por nombre o documento. Si es nuevo, tocá **+ Nuevo**.
2. **¿De dónde sale la mercadería?** Elegí **Galpón** o **Casa**.
3. **Productos:** buscá el producto. Si hay mercadería de varias fechas, elegí la **fecha de ingreso** y tocá **+ Caja** o **+ Unidad**.
4. A la derecha se arma el **Ticket** con el total. Podés cargar un descuento.
5. **¿Cómo paga?** Elegí **Contado**, **Fiado** o **Paga una parte**.
6. Tocá **Confirmar venta**. Después podés imprimir o compartir el comprobante.

El sistema no deja vender más de lo que hay en el depósito, ni dejar deuda a un cliente "de contado". Si un cliente pasaría su límite de crédito, pide confirmación.

> 📷 **CAPTURA 6:** pantalla Nueva venta con productos cargados y el ticket con el total.
> 📷 **CAPTURA 7:** el comprobante de venta.

## 6. Ventas
Lista de todas las ventas. Arriba:
- **Período:** Hoy, Semana, Mes, Mes pasado, Todo o Fechas…
- **Filtros:** cliente, producto, forma de pago, estado y N° de venta.
- **Limpiar filtros**, la cantidad de resultados y **Exportar** (descarga un CSV con lo filtrado).

Tocá una venta para ver el detalle, **cobrar** lo que falta, ver el comprobante o **anularla** (solo el administrador, con motivo; el stock y la deuda vuelven atrás y la venta queda como anulada).

> 📷 **CAPTURA 8:** lista de Ventas con un filtro aplicado.
> 📷 **CAPTURA 9:** detalle de una venta (como administrador, con la ganancia).

## 7. Clientes
- **Nuevo cliente:** nombre, documento, teléfono y dirección. El administrador define además si compra de **contado o fiado**, el **límite de crédito** y el **plazo de pago**. Un cliente creado por un empleado queda "de contado".
- **Ficha del cliente:** cuánto debe, saldo a favor, historial de ventas y pagos.
- **Precios especiales:** precio propio por caja y por unidad para ese cliente. Solo el administrador los cambia.

> 📷 **CAPTURA 10:** lista de clientes con el buscador.
> 📷 **CAPTURA 11:** ficha de un cliente con su deuda y sus precios especiales.

## 8. Deudas y cobros
Tres pestañas:
- **Deudas pendientes:** cada venta con saldo, su vencimiento y estado. Se filtra por cliente y por estado (vencidas, parcialmente pagadas, sin pagos). Tiene botón **Exportar**.
- **Por cliente:** cuánto debe cada uno, con buscador.
- **Historial de cobros:** todos los cobros, con filtros por período, medio de pago y estado.

**Registrar un cobro:** tocá **Cobrar** en la fila (o **Registrar cobro** arriba), escribí el importe y el medio. El cobro baja la deuda y entra a la caja. Si paga de más, queda como saldo a favor.

> 📷 **CAPTURA 12:** Deudas pendientes con el filtro "Vencidas".
> 📷 **CAPTURA 13:** la ventana de registrar un cobro.

## 9. Productos *(administrador)*
Alta y edición de productos: nombre, marca, variante, código, **unidades por caja**, costo, precio por caja y por unidad, y **stock mínimo**. Un producto con historial no se borra: se desactiva. Tiene buscador, filtros y **Exportar**.

> 📷 **CAPTURA 14:** lista de productos.

## 10. Stock
Muestra cuánto hay en el **Galpón** y en la **Casa**, con avisos de **stock bajo** y **agotado**. Pestañas: Existencias, Por lugar, Por fecha de ingreso, Ingresos por mes e Historial de movimientos.

El administrador además puede **Transferir** entre depósitos, cargar una **Entrada manual**, **Contar** (ajuste de inventario) y registrar una **Pérdida**, siempre con motivo. El empleado solo consulta.

> 📷 **CAPTURA 15:** Stock, pestaña Existencias.

## 11. Compras y proveedores *(administrador)*
**Nueva compra:** proveedor, depósito y productos con cantidad y costo. La compra suma el stock y actualiza el costo. Si no se paga toda, queda como deuda con el proveedor.

La lista se filtra con buscador, proveedor, estado (con saldo, pagada, anulada) y período, y tiene **Exportar**. En la pestaña **Proveedores** se buscan y se ve a quiénes se les debe.

> 📷 **CAPTURA 16:** lista de compras con filtros.

## 12. Caja y gastos *(administrador)*
Todo lo que entra y sale de la caja: ventas cobradas, cobros de deudas, pagos a proveedores, gastos y retiros. Con **Nuevo gasto** se cargan fletes, alquiler, servicios, sueldos, etc. (se descuentan de la ganancia), y con **Retiro personal** y los demás botones, los movimientos manuales de caja.

> 📷 **CAPTURA 17:** pantalla Caja y gastos.

## 13. Ganancias *(administrador)*
Ganancia por período (Hoy, Semana, Mes, Mes pasado, Año o Fechas…), por producto y por cliente, calculada con el costo de cada venta.

> 📷 **CAPTURA 18:** pantalla Ganancias.

## 14. Configuración
- **Mi cuenta:** ver tu usuario y **Cambiar mi contraseña** (todos los usuarios).
- **Negocio:** datos que salen en el comprobante *(administrador)*.
- **Usuarios:** **Nuevo usuario**, editar, cambiar el rol (Empleado o Administrador) o desactivar *(administrador)*. Siempre tiene que quedar al menos un administrador activo.
- **Copias de seguridad** y **Registro de actividad** *(administrador)*.

> 📷 **CAPTURA 19:** Configuración → Usuarios.

## 15. Cerrar sesión
Tocá **Cerrar sesión** abajo a la izquierda. Si te olvidás, la sesión vence sola a los 14 días.

## 16. Preguntas frecuentes
- **Me equivoqué en una venta, ¿la borro?** No se borra: el administrador la **anula** con un motivo y el sistema devuelve el stock y corrige la deuda y la caja.
- **No me deja vender un producto.** No hay stock suficiente en ese depósito: elegí el otro depósito o cargá la compra.
- **No me deja fiarle a un cliente.** El cliente es "de contado" o pasaría su límite de crédito: lo cambia el administrador desde la ficha del cliente.
- **Olvidé la contraseña.** Usá "¿Olvidaste tu contraseña?" o pedile al administrador que te ponga una nueva.
