# Plan de trabajo del TFI: Sistema de Gestión para Distribuidora

> Borrador al 25/11/2026. Los datos que faltan figuran como **[PENDIENTE]**.
> Todo sale del material de la cátedra que está en `docs/tfi/📚 Recursos PPS–TFI – UTN FRT/`.

## 1. Qué pide la cátedra (resumen de las fuentes)

| Fuente | Qué exige |
|---|---|
| CRITERIOS GENERALES PPS-TFI | Sistema real y ejecutable, código propio y ordenado, persistencia real, **3 seguimientos** con el tutor (mínimo 2 semanas entre cada uno), **mejora + presupuesto**, carpeta + manual, defensa oral con **dominio total del código** |
| Requisitos técnicos (mismo PDF) | ABM de usuarios, login, roles Administrador/Usuario, **recuperación de contraseña** (real o simulada), ABM y consulta de 2 o más entidades, DER explícito, PK/FK, integridad, **3FN**, separación en capas, manejo de errores, **reportes en pantalla y exportación PDF/Excel/CSV (excluyente)** |
| 1 - Guía para la Carpeta | 12 secciones: portada, índice, resumen ejecutivo, introducción, estado del arte, descripción del proyecto, metodología, recursos, **plan de trabajo**, resultados esperados, referencias APA 7, anexos |
| Normalización de Tablas | Checklist 1FN/2FN/3FN y "¿hay datos calculables guardados innecesariamente?" |
| Modelos FLUXX (carpeta, anexo, manual) | Nivel esperado: historias de usuario, reglas de negocio, RF/RNF, matriz de trazabilidad, DER y modelo relacional, sprints con horas que suman 95 hs, Gantt, documentos de entrevista y ERS (IEEE 830) en el anexo, manual pantalla por pantalla con capturas |
| Formularios 2 y 3 | Inscripción para exponer y planilla de evaluación (se completan al final) |
| Instructivo Mercado Pago | Ejemplo de integración de pagos que la cátedra ofrece como herramienta (opcional) |

## 2. Estado actual del sistema frente a esos requisitos

| Requisito | Estado | Dónde está / qué falta |
|---|---|---|
| Aplicación web ejecutable | ✅ | Node + `node:http`, interfaz en `public/` |
| Login con validación de credenciales | ✅ | `server/auth.js` |
| ABM de usuarios | ✅ | Alta, modificación y baja lógica (desactivar), en `/api/usuarios` |
| Roles Administrador / Usuario | ✅ | `rol IN ('admin','usuario')` en `migrations/001_init.sql` |
| Recuperación de contraseña | ✅ | Agregada el 25/11/2026 (sprint 3): código de un solo uso con envío simulado, migración 007, prueba automática |
| ABM de 2 o más entidades | ✅ | Productos, clientes, proveedores, ventas, compras, gastos… |
| Base relacional con PK/FK | ✅ | SQLite, 22 tablas, 38 `REFERENCES`, `PRAGMA foreign_keys = ON` |
| DER y modelo relacional dibujados | ❌ | Hay que hacerlos para la carpeta |
| Justificación de la 3FN | ⚠️ | Hay que escribirla. Ojo: `ventas.saldo_anterior/saldo_posterior` son una **foto histórica** (igual que el precio en la línea de venta); se justifica como dato histórico, no como redundancia |
| Separación en capas y manejo de errores | ✅ | `server/services/` (reglas), `server/routes.js` (rutas), `public/` (interfaz), `HttpError` |
| Reportes en pantalla | ✅ | Dashboard, ganancias, deudas, caja |
| Exportación (excluyente) | ✅ | CSV en productos, clientes y ventas; comprobante de venta en PDF |
| Pruebas automáticas | ✅ | `npm test` (`tests/run.js`) |
| Mejora concreta + presupuesto | ⚠️ | Elegida: exportación a PDF de reportes (ganancias, deudas, caja). Falta implementarla y definir el valor hora |
| Carpeta, anexo y manual con capturas | ❌ | Es la mayor parte del trabajo restante |

## 3. Pasos, por etapa

Cada etapa termina en un seguimiento con el tutor, que es lo que exige la cátedra.

### Etapa 0: Decisiones iniciales (antes del parcial)
1. Elegir el nombre del sistema y el título del proyecto. **[PENDIENTE]**
2. Decidir si el cliente real se nombra (con su permiso) o se lo presenta como "distribuidora de Tucumán" sin datos reales. **[PENDIENTE]**
3. Completar los datos del equipo: nombres, legajos y roles. **[PENDIENTE]**
4. Elegir la metodología que se va a declarar. FLUXX usó Scrum con sprints; acá cada sprint puede coincidir con un seguimiento. **[PENDIENTE]**
5. Elegir la mejora concreta (sección 5). **[PENDIENTE]**

### Etapa 1: Parcial y Seguimiento 1 ("Definición y propuesta")
Objetivo: mostrar que el proyecto está definido y encaminado.
1. **Documentar el relevamiento**: planificación, validación y conclusiones de la entrevista con el cliente, en el formato del anexo FLUXX. Va en el anexo.
2. **Análisis del problema**: definición del problema, a quién afecta, diagrama de causas (fishbone), límites y limitaciones de la solución, beneficios esperados.
3. **ERS (IEEE 830)**: requisitos funcionales y no funcionales, reglas de negocio, historias de usuario con criterios de aceptación y matriz de trazabilidad, todo sacado del sistema actual.
4. **DER + modelo relacional + análisis de 3FN**, a partir de `migrations/`.
5. **Propuesta de mejora + presupuesto**: horas, valor hora, costo del sistema original y de la ampliación, total.
6. **Este plan de trabajo** con fechas reales.
7. **Demo en vivo** con `npm run demo` (datos ficticios).

### Etapa 2: Desarrollo y Seguimiento 2 ("Avance y correcciones")
1. Implementar la **recuperación de contraseña**, que es obligatoria.
2. Implementar la **mejora elegida**.
3. Aplicar las correcciones que pida el tutor en el seguimiento 1.
4. Pruebas: `npm test` tiene que pasar, y además pruebas manuales de cada flujo nuevo.

### Etapa 3: Documentación y Seguimiento 3 ("Verificación final")
1. Escribir la carpeta completa con las 12 secciones de la guía: estado del arte, metodología, recursos, resultados esperados, referencias APA 7.
2. Escribir el **manual de usuario pantalla por pantalla con capturas reales** (sin capturas no es válido).
3. Armar el anexo: entrevistas, ERS, requisitos de datos (diccionario de tablas).
4. Revisión final de ortografía y formato.

### Etapa 4: Entrega y defensa
1. Enviar la carpeta a `pps.tfi.tup@frt.utn.edu.ar` (asunto "PPS/TFI – ANEXO – CARPETA") **entre 15 y 20 días antes** de la defensa.
2. Presentar por Mesa de Entrada: formulario de inscripción, estado académico, libre deuda, planilla de evaluación, carpeta anillada con el manual y el código en pendrive o DVD.
3. Defensa: demo en vivo, justificación de la arquitectura y ronda de preguntas. **Los dos integrantes tienen que dominar todo el código.**

## 4. Cronograma

El detalle completo (sprints, tareas, horas, Gantt y entregables) está en [carpeta/09-plan-de-trabajo.md](carpeta/09-plan-de-trabajo.md).

| Etapa | Fechas | Horas |
|---|---|---|
| Sistema original (sprints 1 y 2) | 15/09/2026 – 23/11/2026 | 70 hs |
| Parcial de Metodología | 25/11/2026 o 27/11/2026 | — |
| Etapa 1 – Definición y propuesta (Seguimiento 1) | 25/11/2026 – 11/12/2026 | Sprint 3: 25 hs (etapas 1 a 3) |
| Etapa 2 – Desarrollo de faltantes (Seguimiento 2) | 14/12/2026 – 11/01/2027 | |
| Etapa 3 – Documentación (Seguimiento 3) | 11/01/2027 – 18/01/2027 | |
| Etapa 4 – Entrega y defensa | febrero de 2027 **[PENDIENTE: fecha exacta]** | — |
| **Total** | | **95 hs** |

## 5. Candidatas para la "mejora concreta" (hay que elegir una)

| Opción | Por qué sirve | Esfuerzo |
|---|---|---|
| Cobro de deudas con link o QR de Mercado Pago | La cátedra dio el instructivo; encaja con las deudas y los cobros parciales del sistema | Alto (cuenta de prueba de Mercado Pago, webhook) |
| Exportación de reportes a PDF (ganancias, deudas, caja) | Refuerza el requisito excluyente; ya existe un generador de PDF propio (`server/pdf.js`) | Medio |
| Alertas de stock mínimo por producto y depósito | Es una necesidad clara de una distribuidora; también la tiene el modelo FLUXX | Bajo-medio |

## 6. Puntos que hay que saber defender
- **"Baja" = anular o desactivar con motivo, nunca borrar**: protege la trazabilidad, igual que el "principio de no eliminación física" del modelo FLUXX.
- **La deuda se calcula** (total − pagos aplicados), no se guarda: evita redundancia (3FN).
- **Dinero en centavos enteros**: evita errores de redondeo con decimales.
- **Saldos y precios guardados en la venta** son fotos históricas, no redundancia.
- **Sin dependencias externas** (`node:http`, `node:sqlite`): explicar por qué y qué se pierde (por ejemplo, Express).
