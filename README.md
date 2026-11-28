# Gestión para Distribuidoras/Negocios

**Trabajo Final Integrador – Tecnicatura Universitaria en Programación – UTN FRT**
Juan Pablo Romagnoli · Guillermo Jiménez · Metodología de Sistemas II – 2026

| Documentación | Archivo |
|---|---|
| Carpeta del proyecto (12 secciones) | [docs/tfi/CARPETA-TFI.md](docs/tfi/CARPETA-TFI.md) |
| Manual de usuario | [docs/tfi/MANUAL-USUARIO.md](docs/tfi/MANUAL-USUARIO.md) |
| TP 2 – Patrón Strategy (justificación y bitácora) | [docs/tp-patrones/](docs/tp-patrones/) |
| Decisiones técnicas | [docs/DECISIONES.md](docs/DECISIONES.md) |

Arquitectura cliente–servidor en capas (presentación `public/`, lógica `server/`, datos SQLite `migrations/`). Pruebas automáticas: `npm test` (58/58).

---

Sistema web para una distribuidora de cigarrillos: stock en dos depósitos (Galpón y Casa), clientes de contado y fiado con precios propios por caja y por unidad, ventas, deudas con cobros parciales, compras a proveedores, caja, gastos y ganancias.

**No tiene dependencias**: no hace falta `npm install`. Solo necesita Node.js 22.13 o más nuevo.

## Probarlo en tu computadora (5 minutos)

1. Instalá Node.js LTS desde https://nodejs.org (versión 22 o superior). Verificá con `node -v`.
2. Abrí la carpeta del proyecto en VS Code y abrí la terminal (Terminal → Nueva terminal).
3. **Con datos de ejemplo** (recomendado para conocerlo):
   ```
   npm run demo
   npm run start:demo
   ```
   Abrí http://localhost:3000 en Chrome. Usuario `demo`, contraseña `demo12345`. Los datos son ficticios y viven en `data/demo.db`.
4. **Para trabajar de verdad** (base vacía):
   ```
   npm start
   ```
   La primera vez, el sistema te pide crear el usuario administrador (el dueño). Los datos quedan en `data/negocio.db`.
5. Para frenarlo: `Ctrl + C` en la terminal.

Otros comandos: `npm test` (54 pruebas automáticas), `npm run backup`, `npm run restore -- archivo.db`, `npm run crear-admin -- usuario "Nombre" contraseña` (recupera el acceso si se olvidó la clave).

## Qué hace cada pantalla

| Pantalla | Para qué sirve |
|---|---|
| Inicio | Ventas, cobros, ganancia, deudas, stock bajo. Todo con datos reales; si no hay datos, lo dice. |
| Nueva venta | Elegís cliente y depósito, sumás productos (caja o unidad). Se aplican los precios del cliente. Contado, fiado o paga una parte. Si el cliente debe, al pagar de contado puede entregar además plata para su deuda (va a lo más viejo; lo que sobra queda a favor) y el comprobante lo detalla. |
| Ventas | Historial con filtros, detalle, cobro, anulación y comprobante de venta con estado de cuenta (no fiscal): compartir en PDF (WhatsApp), ver en pantalla para captura o imprimir. |
| Clientes | Contado/fiado, límite de crédito, plazo y lista de precios propia por producto. |
| Deudas | Saldos, vencimientos, cobros parciales (a la deuda más vieja o elegidas) e historial. |
| Productos | Costo, precios, margen sobre venta y recargo sobre costo, en vivo mientras escribís. |
| Stock | Existencias, qué hay en el Galpón y en la Casa, mercadería por fecha de ingreso (lo más viejo sale primero), ingresos por mes, transferencias, mermas, ajustes por conteo. |
| Compras | Mercadería que llega, proveedores, deuda con proveedores. Actualiza el costo promedio. |
| Caja y gastos | Todo lo que entró y salió, retiros personales, gastos por categoría. |
| Ganancias | Por período, comparado con el anterior; por producto, cliente y venta. |
| Configuración | Usuarios, contraseña, copias de seguridad, registro de actividad. |

## Reglas de negocio importantes

- **Nada se borra.** Una venta, cobro, compra o gasto mal cargado se **anula** (con motivo) y el sistema corrige stock, deuda y caja. Queda todo en el registro.
- **Ganancia = precio vendido − costo promedio** de la mercadería al momento de vender. El costo queda congelado en cada venta, así que cambiar precios después no altera el pasado.
- **Margen** (ganancia ÷ venta) y **recargo** (ganancia ÷ costo) se muestran por separado: son números distintos.
- Las compras no son gasto (ya están en el costo de lo vendido). Los retiros personales no bajan la ganancia.
- El dinero se guarda en centavos enteros, sin decimales flotantes. Los importes los calcula siempre el servidor.
- El sistema **no emite facturas ni comprobantes fiscales** (ARCA/AFIP). El "ticket" es solo interno.
- El saldo de caja es lo que dicen los movimientos cargados; no es una conciliación bancaria.

## Documentación

- [docs/DECISIONES.md](docs/DECISIONES.md): decisiones técnicas, seguridad, límites conocidos y qué falta.

## Estructura

```
server/     API (Node), reglas de negocio en server/services/
migrations/ esquema de la base de datos (SQLite)
public/     interfaz (HTML/CSS/JS sin librerías externas)
scripts/    backup, restore, demo, crear-admin
tests/      pruebas automáticas (arrancan un servidor real con base temporal)
_previo/    esqueleto anterior que había en la carpeta; se conserva por si querés revisarlo
```
