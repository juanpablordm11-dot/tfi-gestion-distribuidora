# Decisiones técnicas, seguridad y límites

## Por qué este stack
- **Node + SQLite (módulo `node:sqlite`) + interfaz sin librerías.** Sin `npm install`, sin cadena de dependencias que mantener ni vulnerabilidades de terceros; para quien aprende, menos piezas que se rompen. En el entorno de construcción el registro de npm estaba bloqueado, y se decidió diseñar sin dependencias en lugar de forzar una salida.
- **SQLite** alcanza de sobra para un negocio de un dueño y pocos usuarios: un archivo, transacciones reales, copias simples. Límite: una sola instancia de servidor. Si el negocio creciera a muchos usuarios simultáneos o varias sucursales, se migra a PostgreSQL (el SQL está concentrado en `server/services/`).
- `node:sqlite` figura como API en evolución en Node; por eso `engines` pide ≥ 22.13 y se silencia su aviso. Si en una versión futura cambiara, el cambio estaría acotado a `server/db.js`.

## Exactitud del dinero y el stock
- Dinero en **centavos enteros**, stock en **unidades enteras** (una caja = `unidades_por_caja`). Nunca decimales flotantes.
- **Costo promedio ponderado** con el valor del inventario guardado como entero: el costo de cada venta es exacto y la suma de los costos reparte el valor del lote sin perder ni inventar centavos (hay un test con compras que no dividen exacto). Los descuentos se reparten por línea con el método del mayor resto.
- Cada línea de venta **congela** precio, precio de lista, costo y ganancia.
- **Lotes por fecha de ingreso** (migración `002_lotes.sql`): cada compra o entrada manual crea un lote con la fecha en que entró la mercadería (la de la compra, o la que se cargue en la entrada manual para stock de meses pasados). **En cada venta se elige de qué fecha de ingreso sale cada producto** (obligatorio si en ese depósito hay más de una fecha; si hay una sola, se usa esa) y la fecha queda guardada en la línea de venta (migración `003_venta_fecha_ingreso.sql`). Una misma venta puede sacar de varias fechas con líneas separadas. Las pérdidas, ajustes y transferencias descuentan primero lo más viejo (FIFO); una transferencia conserva la fecha original; anular una venta devuelve la mercadería a los mismos lotes; anular una compra saca primero su propio lote. Los lotes llevan **solo cantidades**: la ganancia sigue con el costo promedio ponderado. La suma de los lotes es igual al stock de cada depósito (lo verifica la prueba de integridad).
  - Límite: en transferencias, pérdidas y ajustes el sistema supone que sale lo más viejo. Si físicamente sale otra cosa, las fechas que muestra pueden no coincidir con lo real.
  - Datos anteriores a esta migración: los lotes se reconstruyeron desde el historial de movimientos (lo que hay hoy se asignó a las entradas más recientes). La mercadería que había llegado a un depósito por transferencia quedó con la fecha de la transferencia, porque antes no se guardaba de qué ingreso venía.
- **Saldo inicial de cuenta corriente** (migración `005_saldo_inicial.sql`): lo que un cliente ya debía (o lo que se le debía a un proveedor) al empezar a usar el sistema se carga desde la ficha del cliente / la lista de proveedores (solo administradores, uno vigente por cliente o proveedor). Se guarda como venta / compra de `tipo = 'saldo_inicial'` **sin líneas** (la base lo impide con triggers) y con número de venta negativo (no ocupa números de venta). Cuenta como deuda: aparece en Deudas, se cobra primero por ser lo más viejo, y sale como "saldo anterior" en el comprobante. No cuenta en ventas, ganancias, rankings, compras del mes, stock, costos ni caja. Se corrige anulándolo con motivo y cargándolo de nuevo. **Regla para cambios futuros:** toda consulta de ventas o compras que mida actividad comercial tiene que filtrar `tipo = 'venta'` / `tipo = 'compra'`.
- La deuda **no se guarda**: se calcula como `total − pagos aplicados`. Todo cobro (incluido lo pagado al vender) es un pago aplicado a ventas; no hay forma de que la deuda y los pagos se desincronicen.
- Una venta es **atómica**: las escrituras se serializan (`BEGIN IMMEDIATE`); dos ventas simultáneas no pueden vender el mismo stock (probado con ventas en paralelo). Reintentar un envío no duplica (claves de idempotencia).

## Entrega para la deuda dentro de la venta
- Solo con la venta pagada completa (contado). Se guarda como un **cobro aparte** (pagos.origen = 'cobro', caja 'cobro_deuda'), en la misma transacción que la venta, aplicado a las deudas más viejas; lo que pasa de la deuda queda a favor. pagos.venta_entrega_id lo vincula con la venta solo para mostrarlo en el comprobante (migración 006).
- No es parte de la venta: no suma a ventas ni ganancias. Anular la venta NO anula ese cobro (es plata de deuda vieja); si hace falta se anula desde Deudas → Historial de cobros.
- El comprobante muestra el estado de cuenta del momento: saldo anterior + venta − pagó esta compra − entregó a cuenta de deuda = saldo, y un recuadro con a qué deudas se aplicó.

## Precio por unidad calculado desde la caja
- En la lista de precios del cliente y en el producto: al cargar el precio de la caja, la unidad se completa con caja ÷ unidades por caja, **redondeado al centavo más cercano** ($1.000 ÷ 3 = $333,33; $2.000 ÷ 3 = $666,67). Por eso, cuando no da justo, unidad × cantidad puede diferir de la caja en menos de medio centavo por unidad (3 × $333,33 = $999,99). Nunca completa un precio en $0. Se puede corregir a mano; si cambia la caja, se recalcula y avisa.
- Cálculo en public/js/precios.js (enteros en centavos, sin decimales), probado con 10.000 combinaciones al azar. Es una ayuda de carga: el precio que se guarda es el que queda en el casillero, validado por el servidor como cualquier precio.

## Seguridad implementada
- Contraseñas con scrypt; sesiones en base de datos (cookie `HttpOnly`, `SameSite=Strict`, `Secure` con HTTPS); bloqueo por intentos fallidos.
- Defensa CSRF (verificación de origen y cabecera propia), CSP y cabeceras de seguridad; la interfaz nunca inserta datos como HTML.
- Roles: solo el administrador anula, borra, ve usuarios, configuración, copias y auditoría.
- Validación de todo en el servidor; la interfaz es solo comodidad.
- Triggers en la base que impiden borrar tablas financieras y aplicar de más un pago.
- Auditoría de altas, anulaciones, cambios de precio y de configuración.

## Recuperación de contraseña (TFI, sprint 3, 25/11/2026)
- Requisito técnico de la cátedra: "mecanismo de recuperación (real o simulado)". Desde el login, "¿Olvidaste tu contraseña?" pide un **código de 6 números** con el nombre de usuario; después se ingresa el código y la contraseña nueva.
- **Envío por canales intercambiables (patrón Strategy, TP de patrones, 26/11/2026):** `server/notificaciones/canales-recuperacion.js`. Por defecto el canal `consola` escribe el código en la consola del servidor (`[ENVÍO SIMULADO] …`); con `CANAL_RECUPERACION=archivo` (`npm run start:correo`) se genera un correo `.eml` en `data/bandeja-salida/`. Un envío real (SMTP, WhatsApp) es una clase nueva con `enviar()`, sin tocar `auth.js`. Justificación completa en `docs/tp-patrones/patron-strategy.md`. Mientras tanto sigue existiendo la vía real del día a día: el administrador le pone una contraseña nueva al usuario desde Configuración.
- Seguridad: en la base se guarda solo el hash del código (tabla `recuperaciones_clave`, migración `007`). El código vence a los 15 minutos, sirve una sola vez y se bloquea después de 5 intentos; se pueden pedir 3 códigos cada 15 minutos. La respuesta es la misma exista o no el usuario. Al usarlo se cierran las sesiones abiertas con la contraseña vieja y queda en la auditoría.
- Los pedidos no se borran: quedan con su estado final (`usada`, `reemplazada`, `bloqueada`).

## Rol "Empleado" (TFI, sprint 3, 26/11/2026)
- En pantalla los roles son **Administrador** y **Empleado**; en la base siguen siendo `admin` y `usuario` (no hizo falta migración y se cumple el mínimo de la cátedra Administrador/Usuario).
- El empleado vende, cobra, da de alta y corrige clientes y consulta ventas, deudas, stock y precios. No ve costos ni ganancias y no maneja compras, proveedores, caja, gastos, movimientos de stock, productos, precios por cliente, anulaciones ni configuración.
- **El control está en el servidor** (`server/routes.js`): las rutas de gestión piden `admin`, y `segunRol()` quita de las respuestas al empleado todo campo de costo, valor de inventario, ganancia, margen o recargo. El crédito de un cliente lo define solo el administrador (`creditoSegunRol()`): lo que crea un empleado queda "contado" y al editar se conserva el crédito que había. La interfaz esconde lo que no puede usar y lo manda a "Nueva venta" si entra a una pantalla de administrador.
- Prueba automática: "Empleado: vende, cobra y consulta…" en `tests/run.js`.

## Límites conocidos (decir al cliente con honestidad)
- **No es facturación fiscal.** No emite comprobantes ARCA/AFIP.
- La caja no se concilia con el banco; es lo registrado.
- Un solo negocio (sin multi-sucursal ni multi-empresa).
- Copias: el servidor guarda las suyas en su propio disco (`npm run backup` / `npm run restore`).
- La interfaz se probó con un navegador automatizado (Chromium) en escritorio y celular, sin errores de consola; el cliente ya lo usa en iPhone y Android reales.
- Sin modo sin conexión: necesita internet (o red local) para funcionar.
- Sin exportación de reportes más allá del CSV de ventas; sin impresión de ticket térmico.
- Comprobante para compartir: PDF armado por el servidor sin librerías (server/pdf.js, Helvetica estándar). El menú de compartir del celular solo funciona con HTTPS; WhatsApp no permite mandar el archivo directo a un chat, siempre se elige el contacto. Probado en Android y iPhone reales.

## Ideas para después
Pedido de reposición automático, lista de precios por categoría de cliente, importación de productos desde Excel, avisos por WhatsApp de deuda vencida (bot), exportación contable, copia automática a un almacenamiento externo.
