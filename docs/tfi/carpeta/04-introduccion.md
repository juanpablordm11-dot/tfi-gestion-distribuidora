# 4. INTRODUCCIÓN

## 4.1 Contexto y antecedentes
Las distribuidoras mayoristas pequeñas trabajan con márgenes ajustados, muchos clientes recurrentes y una alta rotación de mercadería. En el rubro de los cigarrillos, además, los precios cambian con frecuencia, cada comercio negocia su propio precio y una parte importante de las ventas se hace "fiado", con pagos parciales.

El cliente, **Gestión de Negocio de Cigarrillos**, llevaba su negocio con anotaciones manuales. La mercadería está repartida en dos depósitos (galpón y casa), y la información de stock, precios, deudas y caja estaba dispersa. A partir del relevamiento de esa situación, el equipo desarrolló un sistema a medida entre septiembre y noviembre de 2026, que luego se retomó y amplió como Trabajo Final Integrador, como admite la cátedra para proyectos previos, que pueden ser "retomados, ampliados, mejorados o reformulados" (UTN FRT, 2026b).

## 4.2 Justificación y relevancia
- **Para el negocio:** errores en el stock, en el precio cobrado o en la deuda de un cliente se traducen en pérdida de dinero y de confianza. Un sistema que calcule esos valores de forma exacta y deje registro de cada operación reduce esos errores.
- **Para la formación:** el proyecto obliga a aplicar de manera integrada el análisis de requisitos, el modelado de datos y su normalización, la arquitectura en capas, la seguridad (autenticación, roles, contraseñas), las pruebas automáticas, los patrones de diseño y la gestión de un proyecto con un cliente real.

## 4.3 Objetivo general
Desarrollar un sistema web de gestión para una distribuidora de cigarrillos que centralice el stock en dos depósitos, los precios por cliente, las ventas, las deudas con cobros parciales, las compras, la caja y las ganancias, garantizando la exactitud de los datos y la trazabilidad de las operaciones.

## 4.4 Objetivos específicos
1. Relevar los procesos del negocio y especificar requisitos, reglas de negocio e historias de usuario.
2. Diseñar una base de datos relacional normalizada hasta la tercera forma normal.
3. Implementar autenticación, recuperación de contraseña y control de acceso por roles (Administrador y Empleado).
4. Implementar el ABM y la consulta de productos, clientes, proveedores y usuarios.
5. Registrar ventas, cobros, compras y movimientos de stock y caja sin borrar información (anulaciones con motivo).
6. Brindar reportes en pantalla con filtros y exportación de datos.
7. Verificar el comportamiento del sistema con pruebas automáticas.
8. Aplicar un patrón de diseño a un problema real del sistema y justificar su elección.
9. Proponer y presupuestar una mejora concreta.
