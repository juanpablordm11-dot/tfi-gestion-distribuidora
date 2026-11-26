-- Fecha de ingreso de la mercadería que se eligió al vender cada línea (NULL en ventas anteriores a esta migración).
ALTER TABLE venta_lineas ADD COLUMN fecha_ingreso TEXT;
