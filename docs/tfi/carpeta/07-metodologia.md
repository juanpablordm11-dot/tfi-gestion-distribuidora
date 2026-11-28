# 7. METODOLOGÍA

## 7.1 Enfoque metodológico
Se trabajó con un enfoque **ágil, iterativo e incremental inspirado en Scrum** (Sommerville, 2016). El trabajo se organizó en tres sprints (ver sección 9). Cada uno terminó con una versión funcionando del sistema, que se revisó con el cliente (sprints 1 y 2) o con la cátedra (sprint 3). Las correcciones pedidas se incorporaron en el sprint siguiente.

Etapas recorridas:
1. **Relevamiento y análisis:** entrevistas con el dueño del negocio, identificación de problemas y reglas de negocio.
2. **Diseño:** modelo de datos (DER), normalización y arquitectura en capas.
3. **Construcción incremental:** módulos de usuarios, catálogos, stock, ventas, deudas, compras, caja y reportes.
4. **Pruebas:** pruebas automáticas de punta a punta, ejecutadas antes de dar por terminado cada cambio.
5. **Adecuación al TFI y documentación:** requisitos de la cátedra, correcciones de la docente, patrón de diseño y documentación.

## 7.2 Técnicas y herramientas
- **Análisis:** historias de usuario con criterios de aceptación, reglas de negocio, requisitos funcionales y no funcionales, y matriz de trazabilidad (sección 6).
- **Modelado:** diagrama entidad–relación, modelo relacional y normalización hasta 3FN (sección 6.10).
- **Control de versiones:** Git y GitHub.
- **Entorno de desarrollo:** Visual Studio Code.
- **Asistente de inteligencia artificial:** usamos Claude, un asistente de IA integrado en VS Code, como apoyo para proponer código y borradores de la documentación. Todo lo que propuso lo revisamos y lo probamos con las pruebas automáticas antes de aceptarlo, y varias propuestas las corregimos o las descartamos (la reflexión completa está en la bitácora del TP 2).

## 7.3 Tecnologías utilizadas

| Capa | Tecnología | Motivo |
|---|---|---|
| Presentación | HTML, CSS y JavaScript sin frameworks | Interfaz liviana que funciona en PC y celular, sin dependencias |
| Lógica de negocio | Node.js ≥ 22.13 (módulo `node:http`) | Mismo lenguaje en cliente y servidor; sin librerías externas que mantener |
| Datos | SQLite (módulo `node:sqlite`) con migraciones (Node.js, s.f.; SQLite, s.f.) | Base relacional en un archivo, con transacciones reales; suficiente para un negocio con pocos usuarios |
| Pruebas | Pruebas de punta a punta propias (`npm test`) | Levantan el servidor real con una base temporal y usan la API como la pantalla |

Una decisión que tomamos desde el principio fue que el sistema **no tuviera dependencias externas** (no requiere `npm install`). Así se reduce el mantenimiento y no dependemos de vulnerabilidades de terceros. La contra es que hubo que programar a mano cosas que una librería resuelve, como el generador de PDF.

## 7.4 Diseño del sistema y arquitectura
**Arquitectura cliente–servidor en capas** (monolito en capas; Pressman y Maxim, 2020):

```
 Presentación (navegador)        public/        pantallas, filtros, formularios
        │  HTTP + JSON (API REST)
 Lógica de negocio (servidor)    server/
        routes.js     → recibe cada pedido y controla el permiso (Administrador / Empleado)
        services/     → reglas de negocio: ventas, deudas, stock, compras, caja, reportes
        auth.js       → login, sesiones, contraseñas, roles, recuperación de contraseña
        notificaciones/ → canales de envío del código (patrón Strategy)
 Datos                           server/db.js + SQLite + migrations/
```

Cada capa tiene una sola responsabilidad: las pantallas no acceden a la base y la base no conoce las pantallas. Las reglas de negocio se validan en el servidor y también en la base de datos (restricciones `CHECK`, claves foráneas y triggers que impiden borrar registros financieros).

**Patrón de diseño aplicado – Strategy (familia de comportamiento; Gamma et al., 1994; UTN FRT, 2026a):** el envío del código de recuperación de contraseña se separó de la lógica de seguridad. `auth.js` (el contexto) solo pide "enviá este código", y cada canal (`CanalConsola`, `CanalArchivoEmail`) resuelve cómo hacerlo. El canal se elige por configuración. Esto permite sumar canales sin modificar el código de seguridad (principio abierto/cerrado). El canal de correo genera mensajes en el formato estándar de Internet (Resnick, 2008). La justificación completa está en `docs/tp-patrones/patron-strategy.md`.

## 7.5 Desarrollo e implementación
- **Backend:** servidor HTTP propio con rutas por módulo. Cada ruta declara si requiere sesión o rol de administrador. Las operaciones que tocan varias tablas (por ejemplo, una venta: stock, deuda y caja) se ejecutan en **una sola transacción**, así se registran completas o no se registran.
- **Frontend:** una pantalla por módulo con componentes reutilizables (tablas ordenables, filtros, buscador, ventanas, avisos). Cada pantalla tiene ayuda "Cómo se usa".
- **Seguridad:** contraseñas con scrypt (OWASP Foundation, s.f.); bloqueo tras 5 intentos fallidos; cookie de sesión HttpOnly; protección CSRF; control de permisos en el servidor; el rol Empleado no recibe datos de costos ni ganancias.
- **Manejo de errores (robustez):** cada validación del servidor devuelve un error con código HTTP y un mensaje claro en español ("No hay stock suficiente…", "Solo el administrador puede hacer esto"), que la pantalla muestra sin cerrarse. Las operaciones de varios pasos se ejecutan en transacciones: si algo falla, se deshace todo y no queda nada a medias. Los envíos repetidos (doble clic) se detectan con claves de idempotencia, y la base de datos rechaza por sí misma los datos inválidos (por ejemplo, stock negativo), aunque fallara el código.

## 7.6 Base de datos
Diseño relacional normalizado (Elmasri y Navathe, 2016; Silberschatz et al., 2019) sobre SQLite con **23 tablas**, claves primarias y foráneas activas, restricciones de integridad (por ejemplo, el stock no puede ser negativo) y migraciones numeradas (`001` a `007`) que aplican cada cambio de esquema una sola vez. El dinero se guarda en centavos enteros y el stock en unidades enteras.

## 7.7 Pruebas
`npm test` ejecuta **58 pruebas automáticas** de punta a punta: ventas al contado y fiadas, cobros parciales, precios por cliente, transferencias, anulaciones, concurrencia (dos ventas simultáneas no venden el mismo stock), seguridad (CSRF, bloqueo de login, permisos por rol), recuperación de contraseña, el patrón Strategy y una prueba de **integridad contable global** que verifica que stock, caja y deudas cuadren con sus movimientos.

## 7.8 Implantación
Se ejecuta con `npm start` y se abre en el navegador (http://localhost:3000). La primera vez pide crear el usuario administrador. Incluye copias de seguridad (`npm run backup`), restauración y un modo de demostración con datos ficticios. Para la presentación académica se cargaron datos de ejemplo ficticios (`npm run datos-ejemplo`), sin usar información real del cliente.

## 7.9 Marco teórico
- **Desarrollo ágil e iterativo:** el producto se construye en incrementos cortos que se revisan con el cliente, lo que permite incorporar cambios y correcciones sin rehacer el sistema (Sommerville, 2016).
- **Arquitectura en capas:** separa presentación, lógica de negocio y datos, de modo que cada capa pueda cambiar sin afectar a las demás (Pressman y Maxim, 2020). Es la "arquitectura" (lo macro); los patrones de diseño resuelven problemas puntuales dentro de cada capa (lo micro) (UTN FRT, 2026a).
- **Modelo relacional y normalización:** las formas normales (1FN, 2FN, 3FN) eliminan redundancias y anomalías de inserción, actualización y borrado (Elmasri y Navathe, 2016).
- **Patrones de diseño:** soluciones reutilizables a problemas recurrentes, clasificadas en creacionales, estructurales y de comportamiento; deben aplicarse ante un problema real y con un costo justificado, para evitar la sobreingeniería (Gamma et al., 1994; UTN FRT, 2026a).
- **Seguridad en aplicaciones web:** almacenamiento de contraseñas con funciones de derivación lentas y con sal, y control de acceso por roles con el principio de mínimo privilegio (OWASP Foundation, s.f.).
