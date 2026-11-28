# 9. PLAN DE TRABAJO

> Las fechas de inicio y fin del desarrollo original son reales (15/09/2026 – 23/11/2026); las de cada actividad dentro de los sprints 1 y 2 son aproximadas.

## 9.1 Versión descriptiva

El desarrollo se organizó con un enfoque iterativo e incremental, en tres sprints:

- **Sprints 1 y 2:** construcción del sistema original para el cliente (relevamiento, base de datos y módulos de gestión).
- **Sprint 3:** ampliación y formalización como Trabajo Final Integrador: requisitos que exige la cátedra, mejora propuesta, documentación y manual.

Sistema: **Gestión para Distribuidoras/Negocios**. Cliente: **Gestión de Negocio de Cigarrillos**.
Integrantes: **Juan Pablo Romagnoli** (legajo [COMPLETAR]) y **Guillermo Jiménez** (legajo [COMPLETAR]).

### PRIMER SPRINT: 15/09/2026 al 18/10/2026
**Objetivo general:** relevar el negocio, diseñar la base de datos y construir la base técnica del sistema: servidor, seguridad, catálogos y stock.

| Área | Proceso | Descripción del proceso | Tiempo empleado |
|---|---|---|---|
| Análisis | Relevamiento de requerimientos | Entrevistas con el dueño de la distribuidora para conocer cómo maneja stock, precios por cliente, ventas, fiado y caja | 5 horas |
| Base de datos | Diseño del modelo de datos | Modelo entidad–relación: productos, depósitos, existencias, clientes, precios por cliente, proveedores, ventas, pagos y caja | 5 horas |
| Backend | Configuración del entorno | Servidor con Node.js (`node:http`), base SQLite (`node:sqlite`) y sistema de migraciones | 4 horas |
| Backend | Seguridad y usuarios | Login, sesiones, contraseñas cifradas, roles Administrador/Usuario y ABM de usuarios | 5 horas |
| Backend / Frontend | Módulo de productos | ABM y consulta de productos, con unidades por caja, costos y precios | 4 horas |
| Backend / Frontend | Clientes y proveedores | ABM de clientes con precios propios y ABM de proveedores | 5 horas |
| Backend / Frontend | Stock en dos depósitos | Existencias por depósito, movimientos y ajustes con motivo | 5 horas |
| Pruebas | Pruebas del sprint | Pruebas automáticas de las reglas de stock y usuarios | 2 horas |

➢ **Subtotal Sprint 1: 35 horas**

### SEGUNDO SPRINT: 19/10/2026 al 23/11/2026
**Objetivo general:** desarrollar los procesos comerciales y financieros (ventas, deudas, compras, caja y reportes) aplicando las reglas de negocio.

| Área | Proceso | Descripción del proceso | Tiempo empleado |
|---|---|---|---|
| Backend / Frontend | Módulo de ventas | Registro de ventas con precios por cliente, descuento automático de stock y anulación con motivo | 6 horas |
| Backend / Frontend | Deudas y cobros | Ventas a cuenta, cobros parciales aplicados a las ventas y deuda calculada (total − pagos) | 6 horas |
| Backend / Frontend | Compras | Compras a proveedores con ingreso de stock y pagos a proveedores | 5 horas |
| Backend / Frontend | Caja y gastos | Movimientos de caja y registro de gastos | 4 horas |
| Backend / Frontend | Reportes | Panel principal, ganancias, deudas y exportación a CSV | 5 horas |
| Backend | Comprobante de venta | Generación del comprobante en PDF | 3 horas |
| Backend | Ajustes de modelo | Lotes, saldos en el comprobante y saldo inicial de clientes (migraciones 002 a 006) | 2 horas |
| Backend | Copias de seguridad | Copia y restauración de la base de datos | 2 horas |
| Pruebas | Pruebas integrales | Pruebas automáticas de ventas, deudas, caja y reportes | 2 horas |

➢ **Subtotal Sprint 2: 35 horas**

### TERCER SPRINT: 25/11/2026 al 18/01/2027
**Objetivo general:** adecuar el sistema a los requisitos del TFI, implementar la mejora propuesta, aplicar las correcciones del tutor y completar la documentación.

| Área | Proceso | Descripción del proceso | Tiempo empleado |
|---|---|---|---|
| Análisis | Documentación de análisis | ERS: requisitos, reglas de negocio, historias de usuario, trazabilidad, DER y análisis de normalización | 5 horas |
| Backend / Frontend | Recuperación de contraseña | Código de 6 números de un solo uso (vence a los 15 minutos, se bloquea tras 5 errores) con envío simulado, tabla nueva `recuperaciones_clave` (migración 007) y prueba automática. **Hecho el 25/11/2026** | 4 horas |
| Backend / Frontend | Mejora propuesta | Exportación a PDF de los reportes de ganancias, deudas y caja | 5 horas |
| Backend / Frontend | Correcciones del tutor y la docente | Cambios pedidos en los seguimientos. **25/11/2026:** filtros y buscadores en todos los listados (compras, proveedores, deudas, historial de cobros, ventas), botón "Limpiar filtros" y contador de resultados, a pedido de la profesora (sistema más intuitivo). **26/11/2026:** guía de diseño del proyecto (skill `diseno-sistema`) a partir de referencias de paneles de gestión, ajuste visual sobrio (colores grafito, rojo más sobrio, sin brillos) y exportación de compras y deudas. **26/11/2026:** rol "Empleado" (vende, cobra y consulta; sin costos ni ganancias), con permisos controlados en el servidor y prueba automática | 3 horas |
| Pruebas | Pruebas finales | Pruebas automáticas y manuales de los flujos nuevos | 2 horas |
| Documentación | Manual de usuario | Manual pantalla por pantalla con capturas reales | 4 horas |
| Documentación | Carpeta final | Redacción y revisión de la carpeta del proyecto | 2 horas |

➢ **Subtotal Sprint 3: 25 horas**

**Total general: 95 horas** (Sprint 1: 35 hs · Sprint 2: 35 hs · Sprint 3: 25 hs)

## 9.2 Calendarización de actividades

Las fechas de los sprints 1 y 2 son estimadas y hay que revisarlas.

| Actividad | Fecha de inicio | Fecha de fin | Duración | Responsable |
|---|---|---|---|---|
| Relevamiento y análisis | 15/09/2026 | 19/09/2026 | 5 días | Romagnoli / Jiménez |
| Diseño de base de datos | 20/09/2026 | 24/09/2026 | 5 días | Romagnoli / Jiménez |
| Entorno, seguridad y usuarios | 25/09/2026 | 02/10/2026 | 8 días | Romagnoli / Jiménez |
| Productos, clientes y proveedores | 03/10/2026 | 11/10/2026 | 9 días | Romagnoli / Jiménez |
| Stock en dos depósitos | 12/10/2026 | 18/10/2026 | 7 días | Romagnoli / Jiménez |
| Módulo de ventas | 19/10/2026 | 27/10/2026 | 9 días | Romagnoli / Jiménez |
| Deudas y cobros | 28/10/2026 | 05/11/2026 | 9 días | Romagnoli / Jiménez |
| Compras, caja y gastos | 06/11/2026 | 13/11/2026 | 8 días | Romagnoli / Jiménez |
| Reportes, comprobante y copias | 14/11/2026 | 23/11/2026 | 10 días | Romagnoli / Jiménez |
| Recuperación de contraseña (realizada) | 25/11/2026 | 25/11/2026 | 1 día | Romagnoli / Jiménez |
| Documentación de análisis (ERS, DER) | 26/11/2026 | 11/12/2026 | 16 días | Romagnoli / Jiménez |
| Mejora: reportes en PDF | 14/12/2026 | 23/12/2026 | 10 días | Romagnoli / Jiménez |
| Correcciones y pruebas finales | 04/01/2027 | 11/01/2027 | 8 días | Romagnoli / Jiménez |
| Manual de usuario y carpeta final | 11/01/2027 | 18/01/2027 | 8 días | Equipo completo |

## 9.3 Diagrama de Gantt

Cada columna es una quincena. ■ = actividad en curso.

| Actividad | Sep 2ª | Oct 1ª | Oct 2ª | Nov 1ª | Nov 2ª | Dic 1ª | Dic 2ª | Ene 1ª | Ene 2ª |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Relevamiento y análisis | ■ | | | | | | | | |
| Diseño de base de datos | ■ | | | | | | | | |
| Entorno, seguridad y usuarios | ■ | ■ | | | | | | | |
| Productos, clientes y proveedores | | ■ | | | | | | | |
| Stock en dos depósitos | | ■ | ■ | | | | | | |
| Módulo de ventas | | | ■ | | | | | | |
| Deudas y cobros | | | ■ | ■ | | | | | |
| Compras, caja y gastos | | | | ■ | | | | | |
| Reportes, comprobante y copias | | | | ■ | ■ | | | | |
| Recuperación de contraseña (realizada) | | | | | ■ | | | | |
| Documentación de análisis | | | | | ■ | ■ | | | |
| Mejora propuesta | | | | | | | ■ | | |
| Correcciones y pruebas finales | | | | | | | | ■ | |
| Manual de usuario y carpeta final | | | | | | | | ■ | ■ |

## 9.4 Etapas y entregables

| Etapa | Actividades principales | Entregable |
|---|---|---|
| 1. Análisis | Relevamiento, requisitos y reglas de negocio | Documento de requisitos (ERS) |
| 2. Diseño | Modelo entidad–relación, normalización, arquitectura en capas | DER, modelo relacional y estructura del sistema |
| 3. Backend | Reglas de negocio, seguridad, persistencia | Servidor funcional |
| 4. Frontend | Pantallas, validaciones, integración con el servidor | Sistema con interfaz completa |
| 5. Pruebas | Pruebas automáticas y manuales, corrección de errores | Sistema estable (`npm test` sin errores) |
| 6. Ampliación TFI | Recuperación de contraseña, mejora propuesta, correcciones del tutor | Versión final del sistema |
| 7. Documentación | Carpeta, anexo y manual de usuario con capturas | Carpeta final lista |

## 9.5 Fechas clave de revisión

Son tentativas y se confirman con el tutor. La cátedra exige al menos 2 semanas entre seguimientos.

| Hito | Fecha tentativa |
|---|---|
| Presentación del proyecto en Metodología de Sistemas II (aprobada) | 26/11/2026 |
| Seguimiento 1: definición y propuesta | semana del 30/11/2026 |
| Seguimiento 2: avance y correcciones | semana del 14/12/2026 |
| Seguimiento 3: verificación final | semana del 18/01/2027 |
| Entrega de la documentación del Trabajo Final (Metodología de Sistemas II) | 27/11/2026 |
| Envío de la carpeta por correo (TFI) | a confirmar con el tutor (ver nota) |
| Mesa de Entrada | 15 a 20 días antes de la defensa |
| Defensa del TFI | febrero de 2027 (fecha a confirmar) |

**Nota:** los criterios de la cátedra dicen que la carpeta enviada por correo "se evalúa en un plazo de 30 días aproximadamente", pero también que el envío se hace "entre 15 y 20 días antes de la defensa". Conviene preguntarle al tutor en el seguimiento 1 cuál de los dos plazos rige. Además, hay que confirmar si hay seguimientos durante el receso de enero.
