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
- Código subido a GitHub: **[PENDIENTE: enlace al repositorio]**

## 26/11/2026 - Uso de Inteligencia Artificial

> **BORRADOR para revisar y reescribir con sus palabras.** Describe lo que pasó en la sesión con la IA; agreguen o corrijan lo que ustedes verificaron personalmente.

Usamos Claude (asistente de IA) dentro del editor. **Problema:** le pedimos que identificara en nuestro proyecto un problema real que se resolviera con un patrón de diseño y que lo implementara. **Propuesta de la IA:** Strategy aplicado a dos lugares posibles: la exportación de reportes (la que recomendaba) y el envío del código de recuperación de contraseña. **Análisis:** elegimos el envío del código porque lo entendíamos mejor y podíamos explicarlo; descartamos la recomendación de la IA. También descartamos canales "de mentira" (WhatsApp o correo sin servidor real) y pedimos que las estrategias funcionaran de verdad: quedaron la consola y un correo .eml real. **Verificación:** antes de aceptar, corrimos las pruebas automáticas (58/58), probamos a mano los dos canales (el código en la terminal y el correo abierto en el programa de correo) y revisamos que la lógica de seguridad (vencimiento, intentos, hash) no hubiera cambiado. **Corrección:** [PENDIENTE: lo que ustedes corrigieron o pidieron cambiar; si no corrigieron nada del código, decirlo]. **Justificación:** el resultado cumple el criterio del TFI de separación de responsabilidades y permite sumar un canal sin tocar el código de seguridad.
