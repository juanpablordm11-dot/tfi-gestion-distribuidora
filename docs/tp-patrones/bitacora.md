# Bitácora – TP Patrones de diseño

**Proyecto:** Gestión para Distribuidoras/Negocios · **Integrantes:** Juan Pablo Romagnoli · Guillermo Jiménez

---

## 26/11/2026 - Patrón

- **Problema:** el envío del código de recuperación de contraseña estaba fijo (solo consola) y escrito dentro de la lógica de seguridad (`server/auth.js`). Cambiar el medio de envío obligaba a tocar código de seguridad.
- **Patrón elegido:** **Strategy** (de comportamiento). Cada medio de envío es una estrategia intercambiable (`CanalConsola`, `CanalArchivoEmail`) con la misma interfaz `enviar()`. `auth.js` (el contexto) no sabe cómo se envía.
- **Por qué este y no otro:** se necesita variar un comportamiento e intercambiarlo sin modificar a quien lo usa. Factory solo crea objetos (lo usamos como complemento para elegir el canal), Template Method obliga a herencia, Adapter adapta interfaces externas que hoy no existen y Observer notifica a muchos (acá se elige uno). Detalle en `patron-strategy.md`.

## 26/11/2026 - Implementación

- Nuevo `server/notificaciones/canales-recuperacion.js` con las dos estrategias y `crearCanal()`.
- `server/auth.js` usa `canal.enviar(...)`; el canal se elige con `CANAL_RECUPERACION` (`consola` por defecto o `archivo`).
- Comandos: `npm start` (consola) y `npm run start:correo` (correo .eml en `data/bandeja-salida/`).
- Verificación: `npm test` → 58/58 OK, con 2 pruebas nuevas del patrón (cada estrategia por separado, y el sistema completo funcionando con el canal "archivo").
- Código subido a GitHub: https://github.com/juanpablordm11-dot/tfi-gestion-distribuidora
- Prueba manual de los dos canales: `npm start` (el código aparece en la terminal) y `npm run start:correo` (se generó el correo `data/bandeja-salida/recuperacion-jimenez-….eml` y con ese código se cambió la contraseña).

## 26/11/2026 - Uso de Inteligencia Artificial

**Problema:** usamos Claude (asistente de IA en VS Code) y le pedimos que encontrara en nuestro sistema un problema real que se resolviera con un patrón de diseño, y que lo implementara.
**Propuesta de IA:** sugirió Strategy en dos lugares: la exportación de reportes (su recomendación) o el envío del código de recuperación de contraseña.
**Análisis:** elegimos el envío del código, en contra de su recomendación, porque lo podíamos explicar mejor; descartamos canales que no funcionaban de verdad (WhatsApp, correo sin servidor) y quedaron la consola y un correo .eml real.
**Verificación:** antes de aceptar corrimos las pruebas automáticas (58/58), probamos a mano los dos canales (el código en la terminal y el correo generado en la bandeja de salida) y revisamos que no cambiara la seguridad (vencimiento, intentos, hash).
**Corrección:** al subirlo a GitHub la IA dio por hecho un nombre de usuario que no era el real y un comando que no funcionaba en PowerShell; lo comprobamos en GitHub y en la terminal y lo corregimos.
**Justificación:** el patrón separa la lógica de seguridad del medio de envío y permite agregar canales sin tocar el código de seguridad.
