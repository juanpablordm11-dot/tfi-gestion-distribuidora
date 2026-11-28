# 5. ESTADO DEL ARTE

## 5.1 Contexto tecnológico actual
La gestión de pequeños comercios y distribuidoras se resuelve hoy de tres maneras: registros manuales (cuaderno o planillas de cálculo), sistemas de gestión comerciales genéricos (de escritorio o en la nube, por suscripción) y desarrollos a medida. Las aplicaciones web se volvieron el enfoque predominante porque se usan desde cualquier dispositivo con un navegador y centralizan la información en un servidor.

## 5.2 Soluciones existentes y comparativa

| Criterio | Cuaderno / planilla | Sistema comercial genérico | **Gestión para Distribuidoras/Negocios** |
|---|---|---|---|
| Costo | Muy bajo | Suscripción mensual o licencia | Desarrollo propio, sin licencias |
| Stock por depósito (galpón y casa) | Manual, propenso a errores | Según el producto y el plan | **Sí**, con transferencias y lotes por fecha de ingreso |
| Precio propio por cliente | Manual | Generalmente por listas de precios | **Sí**, por producto y por cliente, por caja y por unidad |
| Fiado con pagos parciales | Difícil de seguir | Cuenta corriente genérica | **Sí**: deuda calculada, pagos aplicados a ventas, saldo a favor, límite de crédito |
| Ganancia real por venta | No | Variable | **Sí**, con costo promedio ponderado del momento |
| Trazabilidad (nada se borra) | No | Variable | **Sí**: anulaciones con motivo y auditoría |
| Adaptación a reglas del negocio | Total, pero sin control | Limitada | **Total** |
| Facturación fiscal (ARCA/AFIP) | No | Sí, en general | **No** (fuera del alcance) |

## 5.3 Enfoques tecnológicos
- **Aplicaciones de escritorio:** funcionan sin conexión, pero se instalan en cada equipo y no se acceden desde el celular.
- **Software como servicio (SaaS):** acceso desde cualquier lugar y mantenimiento tercerizado, con costo recurrente y poca personalización.
- **Aplicación web propia con arquitectura en capas:** el enfoque elegido. Combina acceso desde la PC y el celular con control total de las reglas del negocio y del código.

## 5.4 Modelado de datos y normalización
Las bases de datos relacionales siguen siendo el estándar para sistemas transaccionales porque garantizan integridad referencial y consistencia (Elmasri y Navathe, 2016; Silberschatz et al., 2019). La normalización hasta la tercera forma normal evita redundancias y anomalías de inserción, actualización y borrado. En este proyecto, además, los datos que se guardan calculados (precio y costo de cada venta) se justifican como **fotos históricas**, y la deuda no se guarda: se calcula.

## 5.5 Seguridad y control de acceso
Para aplicaciones web se recomienda guardar las contraseñas con funciones de derivación de clave lentas y con sal, como scrypt, y no en texto plano (OWASP Foundation, s.f.). Se recomienda también limitar los intentos de inicio de sesión, usar cookies de sesión HttpOnly y aplicar control de acceso por roles con el principio de mínimo privilegio. El sistema aplica estas prácticas, y el control de permisos se hace en el servidor.

## 5.6 Patrones de diseño
Los patrones de diseño son soluciones reutilizables a problemas de diseño recurrentes (Gamma et al., 1994), organizados en tres familias: creacionales, estructurales y de comportamiento. Su uso tiene que responder a un problema real, para no caer en sobreingeniería. En el proyecto se aplicó el patrón **Strategy** al envío del código de recuperación de contraseña (ver sección 7.4).

## 5.7 Aporte del proyecto
Frente a las alternativas, el sistema aporta una solución **adaptada a las reglas reales de una distribuidora**: dos depósitos, precios negociados por cliente, ventas fiadas con pagos parciales y ganancia real por venta. Lo hace sin costo de licencias, con datos exactos (dinero en centavos enteros, operaciones atómicas), trazabilidad completa y un código propio, ordenado y verificable con pruebas automáticas.
