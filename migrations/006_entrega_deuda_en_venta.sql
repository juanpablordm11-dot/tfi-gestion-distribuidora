-- Entrega para la deuda en el momento de vender: el cliente paga la venta completa y además entrega plata
-- para su deuda vieja. Eso se guarda como un cobro normal (origen 'cobro', aplicado a las deudas más viejas;
-- lo que sobra queda a favor) y esta columna lo vincula con la venta en la que se entregó, para mostrarlo
-- en el comprobante. No es parte de la venta: no suma a ventas ni ganancias, y anular la venta no lo anula.
-- Solo agrega una columna: los pagos existentes quedan con NULL.
ALTER TABLE pagos ADD COLUMN venta_entrega_id INTEGER REFERENCES ventas (id);
CREATE INDEX ix_pagos_venta_entrega ON pagos (venta_entrega_id) WHERE venta_entrega_id IS NOT NULL;
