-- Saldo inicial de cuenta corriente: lo que un cliente ya debía (o lo que el negocio le debía a un proveedor)
-- al empezar a usar el sistema. Se guarda como una venta / compra de tipo 'saldo_inicial' SIN líneas de productos:
-- cuenta como deuda y se cobra o paga igual que cualquier otra, pero NO es una venta ni una compra:
-- no toca el stock, ni las ventas, ni las ganancias, ni la caja.
-- Solo agrega columnas e índices: los datos existentes quedan como 'venta' / 'compra'.
ALTER TABLE ventas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'venta' CHECK (tipo IN ('venta', 'saldo_inicial'));
ALTER TABLE compras ADD COLUMN tipo TEXT NOT NULL DEFAULT 'compra' CHECK (tipo IN ('compra', 'saldo_inicial'));

-- Un solo saldo inicial vigente por cliente y por proveedor (si estaba mal, se anula y se carga de nuevo).
CREATE UNIQUE INDEX ux_saldo_inicial_cliente ON ventas (cliente_id) WHERE tipo = 'saldo_inicial' AND estado = 'confirmada';
CREATE UNIQUE INDEX ux_saldo_inicial_proveedor ON compras (proveedor_id) WHERE tipo = 'saldo_inicial' AND estado = 'confirmada';

-- Un saldo inicial nunca tiene productos: la base lo impide aunque falle el código.
CREATE TRIGGER trg_saldo_inicial_sin_lineas BEFORE INSERT ON venta_lineas
WHEN (SELECT tipo FROM ventas WHERE id = NEW.venta_id) = 'saldo_inicial'
BEGIN SELECT RAISE(ABORT, 'Un saldo inicial no lleva productos'); END;
CREATE TRIGGER trg_saldo_inicial_compra_sin_lineas BEFORE INSERT ON compra_lineas
WHEN (SELECT tipo FROM compras WHERE id = NEW.compra_id) = 'saldo_inicial'
BEGIN SELECT RAISE(ABORT, 'Un saldo inicial no lleva productos'); END;
