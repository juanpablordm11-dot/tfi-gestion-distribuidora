# 3. RESUMEN EJECUTIVO

## 3.1 Breve descripción del proyecto
El proyecto consiste en el desarrollo de **Gestión para Distribuidoras/Negocios**, una aplicación web cliente–servidor para una distribuidora mayorista de cigarrillos que vende a comercios (kioscos, almacenes, autoservicios) y guarda su mercadería en dos depósitos. El sistema reemplaza el registro manual y centraliza el stock por depósito, los precios especiales por cliente, las ventas al contado y fiadas, las deudas con cobros parciales, las compras a proveedores, la caja, los gastos y el cálculo de ganancias.

## 3.2 Objetivos principales
- Conocer en todo momento el stock exacto de cada depósito.
- Cobrar a cada cliente el precio acordado y controlar su crédito.
- Saber cuánto debe cada cliente, con pagos parciales y vencimientos.
- Calcular la ganancia real de cada venta con el costo del momento.
- Ordenar la caja y dejar registrada cada operación y quién la hizo.

## 3.3 Metodología utilizada
Se trabajó con un enfoque **ágil, iterativo e incremental inspirado en Scrum**, en tres sprints: los dos primeros (15/09/2026 – 23/11/2026) construyeron el sistema para el cliente, y el tercero (desde el 25/11/2026) lo adecuó a los requisitos del TFI, incorporó las correcciones de la docente y completó la documentación. El sistema se construyó con Node.js, SQLite y JavaScript sin dependencias externas, con arquitectura en capas y pruebas automáticas de punta a punta.

## 3.4 Resultados obtenidos y esperados
- Sistema web funcional con **58 pruebas automáticas** que verifican las reglas de negocio, la seguridad y la integridad contable.
- Login, recuperación de contraseña y **roles diferenciados** (Administrador y Empleado), con el control de permisos en el servidor.
- Base de datos relacional normalizada (3FN) con claves primarias y foráneas, restricciones y registros que no se borran (se anulan con motivo).
- Reportes en pantalla con **filtros** y **exportación a CSV**, y comprobante de venta en PDF.
- Aplicación del patrón de diseño **Strategy** (TP 2 de la materia) en el envío del código de recuperación.
- Mejora propuesta y presupuestada: exportación a PDF de los reportes.

## 3.5 Conclusiones generales
El proyecto integró los contenidos de la carrera (programación, bases de datos, metodología de sistemas, seguridad y patrones de diseño) en un sistema real que resuelve problemas concretos de un negocio. El trabajo con el cliente y luego con la cátedra mostró la importancia de relevar bien las reglas del negocio, documentar las decisiones y verificar cada cambio con pruebas antes de darlo por terminado.
