# 12. ANEXOS

## Anexo A – Relevamiento de requerimientos (síntesis)
Necesidades relevadas con el dueño del negocio durante el sprint 1, y cómo las resuelve el sistema:

| N° | Necesidad relevada | Cómo la resuelve el sistema |
|---|---|---|
| 1 | Saber cuánto hay en el galpón y cuánto en la casa | Existencias por depósito, transferencias y lotes por fecha de ingreso |
| 2 | Cobrar a cada comercio su precio | Precio especial por cliente, por caja y por unidad |
| 3 | Llevar el fiado y los pagos de a partes | Deuda calculada, pagos aplicados a ventas, saldo a favor y vencimientos |
| 4 | No fiarle de más a un cliente | Modalidad (contado/fiado) y límite de crédito |
| 5 | Saber cuánto se gana de verdad | Ganancia por venta con costo promedio ponderado |
| 6 | Ordenar la plata que entra y sale | Caja con categorías, gastos y saldo |
| 7 | Corregir errores sin perder el historial | Anulaciones con motivo y auditoría |
| 8 | Que el empleado venda sin ver números del dueño | Rol Empleado sin acceso a costos, ganancias, compras ni caja |
| 9 | Imprimir o mandar el comprobante al cliente | Comprobante de venta imprimible y en PDF |

**Guía de preguntas usada en el relevamiento**
1. ¿Qué productos vende y cómo los compra (caja/cartón) y los vende (caja o unidad)?
2. ¿Dónde guarda la mercadería y cómo sabe cuánto hay en cada lugar?
3. ¿Todos los clientes pagan el mismo precio? ¿Cómo se acuerdan los precios especiales?
4. ¿Cómo registra hoy las ventas fiadas y los pagos parciales? ¿Pone un límite o un plazo?
5. ¿Cómo calcula cuánto gana? ¿Qué pasa cuando le aumenta el costo?
6. ¿Qué movimientos de dinero tiene además de las ventas (gastos, retiros, pagos a proveedores)?
7. ¿Quién más usa la información? ¿Qué debería poder ver y hacer cada persona?
8. ¿Desde qué dispositivos lo usaría? ¿Necesita imprimir o enviar comprobantes?

*(Las fechas y participantes de cada entrevista con el cliente se pueden agregar acá si el equipo conserva las notas.)*

## Anexo B – Diccionario de datos (requisitos de datos)

### B.1 Tablas y su propósito

| Tabla | Para qué sirve | Clave primaria | Claves foráneas principales |
|---|---|---|---|
| usuarios | Personas que entran al sistema y su rol | id | — |
| sesiones | Sesiones abiertas (token hasheado) | token_hash | usuario_id → usuarios |
| recuperaciones_clave | Pedidos de código para recuperar la contraseña | id | usuario_id → usuarios |
| depositos | Galpón y Casa | id | — |
| productos | Catálogo: unidades por caja, costos, precios, stock mínimo | id | — |
| existencias | Stock de cada producto en cada depósito | (producto_id, deposito_id) | → productos, → depositos |
| lotes / lote_mov | Mercadería por fecha de ingreso y sus movimientos | id | → productos, → depositos, → mov_stock |
| mov_stock | Todo movimiento de mercadería (compra, venta, merma, ajuste, transferencia) | id | → productos, → depositos, → usuarios |
| clientes | Comercios, modalidad, límite de crédito y plazo | id | — |
| precios_cliente | Precio especial de un producto para un cliente | (cliente_id, producto_id) | → clientes, → productos |
| ventas / venta_lineas | Venta y su detalle (precio y costo congelados) | id | → clientes, → depositos, → productos, → usuarios |
| pagos / pago_aplicaciones | Cobros y a qué venta se aplicó cada parte | id | → clientes, → pagos, → ventas |
| proveedores | A quién se le compra | id | — |
| compras / compra_lineas / pagos_proveedor | Compras, su detalle y sus pagos | id | → proveedores, → depositos, → productos, → compras |
| caja_mov | Ingresos y egresos de caja | id | → usuarios, reversa_de → caja_mov |
| gastos | Gastos del negocio | id | → usuarios |
| auditoria | Registro de acciones (quién, qué y cuándo) | id | → usuarios |
| config | Datos del negocio y parámetros | clave | — |

### B.2 Detalle de columnas (generado desde el esquema real de la base)

Tipos: INTEGER = número entero (el dinero se guarda en **centavos**); TEXT = texto (las fechas, como AAAA-MM-DD HH:MM:SS). PK = clave primaria; FK = clave foránea.

**auditoria**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| fecha | TEXT | Sí | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |
| accion | TEXT | Sí | — |
| entidad | TEXT | Sí | — |
| entidad_id | INTEGER | No | — |
| detalle | TEXT | No | — |

**caja_mov**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| fecha | TEXT | Sí | — |
| tipo | TEXT | Sí | — |
| categoria | TEXT | Sí | — |
| medio | TEXT | Sí | — |
| monto | INTEGER | Sí | — |
| concepto | TEXT | Sí | — |
| ref_tipo | TEXT | No | — |
| ref_id | INTEGER | No | — |
| reversa_de | INTEGER | No | FK → caja_mov(id) |
| usuario_id | INTEGER | No | FK → usuarios(id) |

**clientes**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| nombre | TEXT | Sí | — |
| documento | TEXT | No | — |
| telefono | TEXT | No | — |
| direccion | TEXT | No | — |
| observaciones | TEXT | No | — |
| modalidad | TEXT | Sí | — |
| limite_credito | INTEGER | Sí | — |
| plazo_dias | INTEGER | Sí | — |
| activo | INTEGER | Sí | — |
| creado | TEXT | Sí | — |

**compra_lineas**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| compra_id | INTEGER | Sí | FK → compras(id) |
| producto_id | INTEGER | Sí | FK → productos(id) |
| presentacion | TEXT | Sí | — |
| cantidad | INTEGER | Sí | — |
| unidades | INTEGER | Sí | — |
| costo | INTEGER | Sí | — |
| subtotal | INTEGER | Sí | — |
| descuento_asignado | INTEGER | Sí | — |
| costo_neto | INTEGER | Sí | — |

**compras**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| fecha | TEXT | Sí | — |
| proveedor_id | INTEGER | No | FK → proveedores(id) |
| deposito_id | INTEGER | Sí | FK → depositos(id) |
| descuento | INTEGER | Sí | — |
| total | INTEGER | Sí | — |
| observaciones | TEXT | No | — |
| estado | TEXT | Sí | — |
| idem_key | TEXT | Sí | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |
| anulada_motivo | TEXT | No | — |
| anulada_fecha | TEXT | No | — |
| anulada_por | INTEGER | No | FK → usuarios(id) |
| tipo | TEXT | Sí | — |

**config**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| clave | TEXT | Sí | PK |
| valor | TEXT | Sí | — |

**depositos**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| nombre | TEXT | Sí | — |

**existencias**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| producto_id | INTEGER | Sí | PK · FK → productos(id) |
| deposito_id | INTEGER | Sí | PK · FK → depositos(id) |
| cantidad | INTEGER | Sí | — |

**gastos**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| fecha | TEXT | Sí | — |
| categoria | TEXT | Sí | — |
| descripcion | TEXT | Sí | — |
| monto | INTEGER | Sí | — |
| medio | TEXT | Sí | — |
| anulado | INTEGER | Sí | — |
| anulado_motivo | TEXT | No | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |

**lote_mov**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| lote_id | INTEGER | Sí | FK → lotes(id) |
| mov_id | INTEGER | Sí | FK → mov_stock(id) |
| unidades | INTEGER | Sí | — |

**lotes**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| producto_id | INTEGER | Sí | FK → productos(id) |
| deposito_id | INTEGER | Sí | FK → depositos(id) |
| fecha_ingreso | TEXT | Sí | — |
| origen | TEXT | Sí | — |
| raiz_id | INTEGER | No | FK → lotes(id) |
| ref_tipo | TEXT | No | — |
| ref_id | INTEGER | No | — |
| mov_id | INTEGER | No | FK → mov_stock(id) |
| unidades_iniciales | INTEGER | Sí | — |
| cantidad | INTEGER | Sí | — |
| creado | TEXT | Sí | — |

**mov_stock**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| fecha | TEXT | Sí | — |
| producto_id | INTEGER | Sí | FK → productos(id) |
| tipo | TEXT | Sí | — |
| unidades | INTEGER | Sí | — |
| deposito_origen | INTEGER | No | FK → depositos(id) |
| deposito_destino | INTEGER | No | FK → depositos(id) |
| motivo | TEXT | No | — |
| ref_tipo | TEXT | No | — |
| ref_id | INTEGER | No | — |
| costo | INTEGER | Sí | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |

**pago_aplicaciones**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| pago_id | INTEGER | Sí | FK → pagos(id) |
| venta_id | INTEGER | Sí | FK → ventas(id) |
| monto | INTEGER | Sí | — |
| anulada | INTEGER | Sí | — |
| fecha | TEXT | Sí | — |

**pagos**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| cliente_id | INTEGER | Sí | FK → clientes(id) |
| fecha | TEXT | Sí | — |
| monto | INTEGER | Sí | — |
| medio | TEXT | Sí | — |
| devuelto | INTEGER | Sí | — |
| origen | TEXT | Sí | — |
| nota | TEXT | No | — |
| anulado | INTEGER | Sí | — |
| anulado_motivo | TEXT | No | — |
| anulado_fecha | TEXT | No | — |
| idem_key | TEXT | Sí | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |
| venta_entrega_id | INTEGER | No | FK → ventas(id) |

**pagos_proveedor**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| compra_id | INTEGER | Sí | FK → compras(id) |
| fecha | TEXT | Sí | — |
| monto | INTEGER | Sí | — |
| medio | TEXT | Sí | — |
| anulado | INTEGER | Sí | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |

**precios_cliente**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| cliente_id | INTEGER | Sí | PK · FK → clientes(id) |
| producto_id | INTEGER | Sí | PK · FK → productos(id) |
| precio_unidad | INTEGER | No | — |
| precio_caja | INTEGER | No | — |
| actualizado | TEXT | Sí | — |

**productos**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| codigo | TEXT | No | — |
| nombre | TEXT | Sí | — |
| marca | TEXT | No | — |
| variante | TEXT | No | — |
| unidades_por_caja | INTEGER | Sí | — |
| costo_caja | INTEGER | Sí | — |
| precio_unidad | INTEGER | Sí | — |
| precio_caja | INTEGER | Sí | — |
| stock_minimo | INTEGER | Sí | — |
| valor_inventario | INTEGER | Sí | — |
| activo | INTEGER | Sí | — |
| observaciones | TEXT | No | — |
| creado | TEXT | Sí | — |

**proveedores**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| nombre | TEXT | Sí | — |
| telefono | TEXT | No | — |
| observaciones | TEXT | No | — |
| activo | INTEGER | Sí | — |
| creado | TEXT | Sí | — |

**recuperaciones_clave**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| usuario_id | INTEGER | Sí | FK → usuarios(id) |
| codigo_hash | TEXT | Sí | — |
| creada | TEXT | Sí | — |
| expira | INTEGER | Sí | — |
| intentos | INTEGER | Sí | — |
| estado | TEXT | Sí | — |
| cerrada | TEXT | No | — |

**sesiones**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| token_hash | TEXT | Sí | PK |
| usuario_id | INTEGER | Sí | FK → usuarios(id) |
| creada | TEXT | Sí | — |
| expira | INTEGER | Sí | — |

**usuarios**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| usuario | TEXT | Sí | — |
| nombre | TEXT | Sí | — |
| rol | TEXT | Sí | — |
| pass_hash | TEXT | Sí | — |
| activo | INTEGER | Sí | — |
| creado | TEXT | Sí | — |

**venta_lineas**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| venta_id | INTEGER | Sí | FK → ventas(id) |
| producto_id | INTEGER | Sí | FK → productos(id) |
| presentacion | TEXT | Sí | — |
| cantidad | INTEGER | Sí | — |
| unidades | INTEGER | Sí | — |
| precio | INTEGER | Sí | — |
| precio_lista | INTEGER | Sí | — |
| subtotal | INTEGER | Sí | — |
| descuento_asignado | INTEGER | Sí | — |
| ingreso_neto | INTEGER | Sí | — |
| costo_total | INTEGER | Sí | — |
| ganancia | INTEGER | Sí | — |
| fecha_ingreso | TEXT | No | — |

**ventas**

| Columna | Tipo | Obligatoria | Clave |
|---|---|---|---|
| id | INTEGER | Sí | PK |
| numero | INTEGER | Sí | — |
| fecha | TEXT | Sí | — |
| cliente_id | INTEGER | Sí | FK → clientes(id) |
| deposito_id | INTEGER | Sí | FK → depositos(id) |
| modalidad_pago | TEXT | Sí | — |
| descuento | INTEGER | Sí | — |
| total | INTEGER | Sí | — |
| vencimiento | TEXT | No | — |
| observaciones | TEXT | No | — |
| estado | TEXT | Sí | — |
| idem_key | TEXT | Sí | — |
| usuario_id | INTEGER | No | FK → usuarios(id) |
| anulada_motivo | TEXT | No | — |
| anulada_fecha | TEXT | No | — |
| anulada_por | INTEGER | No | FK → usuarios(id) |
| saldo_anterior | INTEGER | No | — |
| saldo_posterior | INTEGER | No | — |
| tipo | TEXT | Sí | — |

Las restricciones (CHECK, triggers que impiden borrar registros financieros) están en `migrations/001` a `007` del repositorio.

## Anexo C – Pruebas automáticas
`npm test` ejecuta las siguientes 58 pruebas (resultado: **58/58 OK**):

1. Sin sesión no se puede leer ningún dato
2. Se crea el primer administrador una sola vez
3. Pedidos sin la cabecera de seguridad o de otro origen se rechazan (CSRF)
4. Login: clave incorrecta, bloqueo tras 5 intentos y cookie HttpOnly
5. Un usuario operador puede vender pero no anular ni administrar
6. Cambiar el nombre de usuario: valida, no se repite, se entra con el nuevo y queda registrado
7. Recuperar contraseña: código simulado de un solo uso, que vence, se bloquea y no revela usuarios
8. A: venta contado descuenta stock, registra cobro y calcula ganancia con costo histórico
9. A: las estadísticas se actualizan
10. B: la venta fiada baja stock, sube la deuda y NO suma plata a la caja
11. B: a un cliente de contado no se le puede dejar deuda
12. B: venta mixta (paga una parte y queda deuda por el resto)
13. C: deuda de $2.000 → pago 500 → saldo 1.500 → pago 700 → saldo 800, con historial y caja
14. C: la ganancia no cambia al cobrar deudas (solo cambia la caja)
15. C: pagos inválidos y excedentes
16. C: excedente como saldo a favor, y se aplica a una deuda nueva
17. C: se puede repartir un pago eligiendo deudas y anularlo
18. D: cada cliente paga su precio y los cambios no tocan ventas anteriores
19. D: descuento y precio modificado quedan registrados y los importes son exactos
20. E: transferir entre Galpón y Casa mueve el stock sin generar ventas, cobros ni ganancia
21. E: merma y ajuste de inventario quedan registrados y afectan el resultado
22. F: la rentabilidad de ventas anteriores no cambia al comprar a otro costo
23. F: el descuento de compra baja el costo y el costo unitario no pierde centavos
24. G: anular una venta fiada con pagos revierte stock, deuda y caja, y queda auditada
25. G: anular dejando el cobro como saldo a favor
26. G: anular una compra devuelve el stock y reintegra el pago
27. H: no se vende más de lo disponible y no queda nada a medias
28. H: venta sin productos, cantidades o importes inválidos
29. H: enviar dos veces la misma venta (doble clic) la registra una sola vez
30. H: ventas simultáneas nunca venden el mismo stock dos veces
31. H: límite de crédito requiere confirmación explícita
32. H: productos y clientes con historial no se pueden borrar, solo desactivar
33. H: la base de datos impide borrar o dejar stock negativo aunque falle el código
34. Lotes: mercadería vieja con su fecha real, y al vender se elige de qué fecha sale
35. Lotes: una transferencia conserva la fecha de ingreso; con una sola fecha en el depósito no hace falta elegir
36. Lotes: anular una venta devuelve la mercadería a los mismos lotes de los que salió
37. Lotes: historial de ingresos por fecha con lo que queda de cada uno; anular una compra saca su propio lote
38. Saldo inicial de un cliente: cuenta como deuda pero no como venta, stock, ganancia ni caja
39. Saldo inicial: se anula con motivo (queda registrado) y se puede volver a cargar; la base impide que lleve productos
40. Saldo inicial con un proveedor: deuda que se paga normal, sin tocar stock ni costos
41. Comprobante: estado de cuenta del momento (saldo anterior + venta − entrega = saldo) y datos del negocio
42. Comprobante en PDF para compartir: requiere sesión, dice que no es factura y no existe para un saldo inicial
43. Unidad = caja ÷ unidades, redondeada al centavo más cercano (nunca $0) y aviso con la cuenta
44. Entrega para la deuda: paga la venta y parte de la deuda vieja; caja separada, ventas sin inflar y comprobante detallado
45. Entrega para la deuda: si entrega de más queda a favor; anular la venta no anula el cobro de deuda
46. Entrega para la deuda: solo con la venta paga completa, con deuda y con importe válido
47. Caja: saldo inicial, gastos, retiros y movimientos manuales
48. Compra con saldo pendiente al proveedor y pago posterior
49. Reportes: ganancia por producto, cliente, período y margen vs recargo
50. Stock bajo y agotados
51. Copias de seguridad: crear, listar y descargar un archivo SQLite válido
52. Copia automática: solo con el token del servidor, sin usuario ni contraseña
53. Versión y última copia externa: la versión pide token y la fecha pide administrador
54. Subir copia: rechaza llave equivocada, copias rotas, huella distinta y versiones anteriores sin tocar nada
55. Patrón Strategy: cada canal de recuperación funciona solo y un canal desconocido es un error
56. Patrón Strategy en el sistema: con CANAL_RECUPERACION=archivo el código llega como correo .eml y sirve
57. Empleado: vende, cobra y consulta; no ve costos ni ganancias ni maneja compras, caja, stock o precios
58. Integridad contable global (stock, caja y deudas cuadran con sus movimientos)

## Anexo D – Patrón de diseño (TP 2)
- Justificación: `docs/tp-patrones/patron-strategy.md`
- Bitácora y reflexión sobre el uso de IA: `docs/tp-patrones/bitacora.md`
- Implementación: `server/notificaciones/canales-recuperacion.js`

## Anexo E – Repositorio y ejecución
- Código fuente: https://github.com/juanpablordm11-dot/tfi-gestion-distribuidora
- Requisito: Node.js 22.13 o superior. No requiere instalar dependencias.
- Ejecutar: `npm start` → abrir http://localhost:3000 (la primera vez pide crear el administrador).
- Datos de ejemplo ficticios: `npm run datos-ejemplo` (sobre una base nueva).
- Pruebas: `npm test`.

## Anexo F – Glosario, definiciones y abreviaturas

| Término | Significado |
|---|---|
| ABM / CRUD | Alta, baja, modificación (y consulta) de registros |
| API REST | Forma en que la interfaz pide y recibe datos del servidor, con una dirección por recurso (por ejemplo, `/api/ventas`) |
| Caja (presentación) | En cigarrillos, el cartón: un conjunto de unidades (atados) definido por producto |
| CSV | Archivo de texto con datos separados por comas, que se abre con Excel |
| DER | Diagrama entidad–relación |
| Fiado | Venta que el cliente paga después, total o parcialmente |
| FK / PK | Clave foránea / clave primaria |
| HU | Historia de usuario |
| Lote | Mercadería que ingresó en una misma fecha, en un depósito |
| Migración | Archivo que aplica un cambio de estructura a la base de datos, una sola vez |
| RF / RNF | Requisito funcional / no funcional |
| RN | Regla de negocio |
| Saldo a favor | Dinero que un cliente pagó de más y queda como crédito |
| Saldo inicial | Deuda que existía antes de empezar a usar el sistema |
| 3FN | Tercera forma normal |
| TFI | Trabajo Final Integrador |

## Anexo G – Origen del problema (diagrama causa–efecto)

**Efecto:** falta de control del stock, las deudas, los precios y la caja de la distribuidora.

| Categoría | Causas |
|---|---|
| Métodos | Registro manual en cuadernos y planillas; cálculo de la ganancia "a ojo" |
| Información | Datos dispersos; sin historial de quién hizo cada cambio; deuda de cada cliente difícil de reconstruir |
| Mercadería | Dos depósitos sin control de transferencias; mercadería de distintas fechas mezclada |
| Clientes | Precios distintos por cliente; ventas fiadas con pagos parciales y sin límite claro |
| Personas | Sin roles ni permisos: cualquiera podía ver o modificar todo |
| Herramientas | Sin un sistema propio adaptado al negocio; los sistemas genéricos no contemplan sus reglas |

## Anexo H – Cumplimiento de los requisitos de la cátedra

| Requisito (Criterios generales PPS–TFI) | Cómo se cumple | Dónde |
|---|---|---|
| Sistema real y ejecutable, código propio | Aplicación web en Node.js, sin dependencias | Repositorio, `npm start` |
| Tipo de proyecto admitido | Aplicación web / API con cliente | Sección 7.4 |
| ABM de usuarios | Alta, modificación y desactivación de usuarios | Configuración → Usuarios |
| Login con validación de credenciales | Usuario y contraseña con hash; bloqueo tras 5 intentos | Sección 7.5 |
| Roles diferenciados (mínimo Administrador / Usuario) | Administrador y Empleado (rol `usuario`), controlados en el servidor | Secciones 6.4 y 7.5 |
| Recuperación de contraseña (real o simulada) | Código de un solo uso; envío simulado por consola o correo .eml | HU2, RF02 |
| ABM y consulta de al menos dos entidades | Productos, clientes, proveedores, usuarios (y ventas, compras, gastos) | Sección 6.7 |
| Base de datos relacional | SQLite | Sección 7.6 |
| Modelo de datos explícito (entidad–relación) | DER, modelo relacional y diccionario de datos | Sección 6.10 y Anexo B |
| Claves primarias y foráneas | Definidas en todas las tablas, con integridad referencial activa | Anexo B |
| Validaciones de integridad | Restricciones CHECK, UNIQUE, NOT NULL y triggers | Sección 6.10 |
| Normalización hasta 3FN | Análisis y checklist de la cátedra | Sección 6.10 |
| Arquitectura con separación de responsabilidades | Capas: presentación, lógica, datos | Sección 7.4 |
| Modularidad y reutilización | Servicios por módulo y componentes de interfaz reutilizables | Sección 7.5 |
| Robustez (manejo de errores) | Mensajes claros, transacciones, idempotencia, restricciones en la base | Sección 7.5 |
| Reportes en pantalla (excluyente) | Inicio, ganancias, deudas, stock bajo, caja | Manual de usuario |
| Exportación PDF, Excel o CSV (excluyente) | CSV en ventas, clientes, productos, compras y deudas; comprobante en PDF | RF13 |
| Mejora concreta con presupuesto | Reportes en PDF: horas, valor hora, costo original, de la ampliación y total | Sección 6.11 |
| Carpeta: descripción, alcance, objetivos, DER, stack y tareas realizadas | Secciones 3 a 10 | Este documento |
| Manual de usuario pantalla por pantalla con capturas reales | Documento anexo | Manual de usuario |
| Seguimientos con el tutor (mínimo 3) | Planificados | Sección 9.5 |

## Anexo I – Control de versiones del documento

| Versión | Fecha | Cambios | Autores |
|---|---|---|---|
| 1.0 | 25/11/2026 | Descripción del proyecto y plan de trabajo | Romagnoli, Jiménez |
| 1.1 | 26/11/2026 | Recuperación de contraseña, rol Empleado, filtros, patrón Strategy | Romagnoli, Jiménez |
| 1.2 | 27/11/2026 | Carpeta completa (12 secciones), anexos y manual de usuario | Romagnoli, Jiménez |
