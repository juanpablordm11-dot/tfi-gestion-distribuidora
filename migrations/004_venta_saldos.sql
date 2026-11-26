-- Estado de cuenta del cliente en el momento de la venta, para el comprobante impreso.
-- Saldo neto = deuda − saldo a favor (positivo: debe; negativo: tiene a favor). NULL en ventas anteriores a esta migración.
ALTER TABLE ventas ADD COLUMN saldo_anterior INTEGER;
ALTER TABLE ventas ADD COLUMN saldo_posterior INTEGER;

-- Datos del negocio para el encabezado y el pie del comprobante.
INSERT OR IGNORE INTO config (clave, valor) VALUES ('negocio_direccion', ''), ('negocio_telefono', ''), ('comprobante_pie', '');
