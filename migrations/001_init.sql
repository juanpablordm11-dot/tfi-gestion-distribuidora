-- ============================================================================
-- Esquema inicial. Convenciones:
--  * Todo el dinero se guarda en CENTAVOS como INTEGER (nunca decimales flotantes).
--  * Todo el stock se guarda en UNIDADES (la unidad base). Una caja = unidades_por_caja unidades.
--  * Las fechas se guardan como texto 'AAAA-MM-DD HH:MM:SS' en la hora local del negocio.
--  * Nada de lo financiero o de inventario se borra: se anula con movimientos compensatorios.
-- ============================================================================

CREATE TABLE config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
INSERT INTO config (clave, valor) VALUES
  ('negocio_nombre', 'Mi distribuidora'),
  ('saldo_inicial_caja', '0'),
  ('zona_horaria', 'America/Argentina/Buenos_Aires');

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'usuario')),
  pass_hash TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado TEXT NOT NULL
);

CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  creada TEXT NOT NULL,
  expira INTEGER NOT NULL
);

CREATE TABLE depositos (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);
INSERT INTO depositos (id, nombre) VALUES (1, 'Galpón'), (2, 'Casa');

CREATE TABLE productos (
  id INTEGER PRIMARY KEY,
  codigo TEXT,
  nombre TEXT NOT NULL,
  marca TEXT,
  variante TEXT,
  unidades_por_caja INTEGER NOT NULL DEFAULT 1 CHECK (unidades_por_caja >= 1),
  costo_caja INTEGER NOT NULL DEFAULT 0 CHECK (costo_caja >= 0),     -- último costo de compra de una caja (referencia)
  precio_unidad INTEGER NOT NULL DEFAULT 0 CHECK (precio_unidad >= 0), -- precio general
  precio_caja INTEGER NOT NULL DEFAULT 0 CHECK (precio_caja >= 0),     -- precio general
  stock_minimo INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),   -- en unidades
  valor_inventario INTEGER NOT NULL DEFAULT 0 CHECK (valor_inventario >= 0), -- valor del stock al costo promedio ponderado
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  observaciones TEXT,
  creado TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_productos_codigo ON productos (codigo) WHERE codigo IS NOT NULL AND codigo <> '';

CREATE TABLE existencias (
  producto_id INTEGER NOT NULL REFERENCES productos (id),
  deposito_id INTEGER NOT NULL REFERENCES depositos (id),
  cantidad INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),  -- la base de datos impide stock negativo
  PRIMARY KEY (producto_id, deposito_id)
);

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  documento TEXT,
  telefono TEXT,
  direccion TEXT,
  observaciones TEXT,
  modalidad TEXT NOT NULL DEFAULT 'contado' CHECK (modalidad IN ('contado', 'fiado', 'ambas')),
  limite_credito INTEGER NOT NULL DEFAULT 0 CHECK (limite_credito >= 0), -- 0 = sin límite
  plazo_dias INTEGER NOT NULL DEFAULT 0 CHECK (plazo_dias >= 0),         -- 0 = sin vencimiento
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado TEXT NOT NULL
);

CREATE TABLE precios_cliente (
  cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  producto_id INTEGER NOT NULL REFERENCES productos (id),
  precio_unidad INTEGER CHECK (precio_unidad IS NULL OR precio_unidad >= 0), -- NULL = usa el precio general
  precio_caja INTEGER CHECK (precio_caja IS NULL OR precio_caja >= 0),
  actualizado TEXT NOT NULL,
  PRIMARY KEY (cliente_id, producto_id)
);

CREATE TABLE proveedores (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  telefono TEXT,
  observaciones TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado TEXT NOT NULL
);

-- ---------------------------------------------------------------- COMPRAS
CREATE TABLE compras (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  proveedor_id INTEGER REFERENCES proveedores (id),
  deposito_id INTEGER NOT NULL REFERENCES depositos (id),
  descuento INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total INTEGER NOT NULL CHECK (total >= 0),
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'anulada')),
  idem_key TEXT NOT NULL UNIQUE,
  usuario_id INTEGER REFERENCES usuarios (id),
  anulada_motivo TEXT,
  anulada_fecha TEXT,
  anulada_por INTEGER REFERENCES usuarios (id)
);

CREATE TABLE compra_lineas (
  id INTEGER PRIMARY KEY,
  compra_id INTEGER NOT NULL REFERENCES compras (id),
  producto_id INTEGER NOT NULL REFERENCES productos (id),
  presentacion TEXT NOT NULL CHECK (presentacion IN ('caja', 'unidad')),
  cantidad INTEGER NOT NULL CHECK (cantidad >= 1),
  unidades INTEGER NOT NULL CHECK (unidades >= 1),
  costo INTEGER NOT NULL CHECK (costo >= 0),               -- costo por presentación, antes del descuento
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  descuento_asignado INTEGER NOT NULL DEFAULT 0 CHECK (descuento_asignado >= 0),
  costo_neto INTEGER NOT NULL CHECK (costo_neto >= 0)      -- lo que entra al valor del inventario
);

CREATE TABLE pagos_proveedor (
  id INTEGER PRIMARY KEY,
  compra_id INTEGER NOT NULL REFERENCES compras (id),
  fecha TEXT NOT NULL,
  monto INTEGER NOT NULL CHECK (monto > 0),
  medio TEXT NOT NULL CHECK (medio IN ('efectivo', 'transferencia', 'otro')),
  anulado INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
  usuario_id INTEGER REFERENCES usuarios (id)
);

-- ----------------------------------------------------------------- VENTAS
CREATE TABLE ventas (
  id INTEGER PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  fecha TEXT NOT NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  deposito_id INTEGER NOT NULL REFERENCES depositos (id),
  modalidad_pago TEXT NOT NULL CHECK (modalidad_pago IN ('contado', 'fiado', 'mixto')),
  descuento INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  total INTEGER NOT NULL CHECK (total > 0),
  vencimiento TEXT,
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'anulada')),
  idem_key TEXT NOT NULL UNIQUE,
  usuario_id INTEGER REFERENCES usuarios (id),
  anulada_motivo TEXT,
  anulada_fecha TEXT,
  anulada_por INTEGER REFERENCES usuarios (id)
);
CREATE INDEX ix_ventas_fecha ON ventas (fecha);
CREATE INDEX ix_ventas_cliente ON ventas (cliente_id);

CREATE TABLE venta_lineas (
  id INTEGER PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas (id),
  producto_id INTEGER NOT NULL REFERENCES productos (id),
  presentacion TEXT NOT NULL CHECK (presentacion IN ('caja', 'unidad')),
  cantidad INTEGER NOT NULL CHECK (cantidad >= 1),
  unidades INTEGER NOT NULL CHECK (unidades >= 1),       -- cantidad equivalente en unidades base
  precio INTEGER NOT NULL CHECK (precio >= 0),           -- precio cobrado por presentación (queda congelado)
  precio_lista INTEGER NOT NULL CHECK (precio_lista >= 0), -- precio que proponía el sistema
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  descuento_asignado INTEGER NOT NULL DEFAULT 0 CHECK (descuento_asignado >= 0),
  ingreso_neto INTEGER NOT NULL CHECK (ingreso_neto >= 0),
  costo_total INTEGER NOT NULL CHECK (costo_total >= 0), -- costo histórico (promedio ponderado al momento de la venta)
  ganancia INTEGER NOT NULL                              -- ingreso_neto - costo_total
);
CREATE INDEX ix_vlineas_venta ON venta_lineas (venta_id);
CREATE INDEX ix_vlineas_producto ON venta_lineas (producto_id);

-- ------------------------------------------------------------ PAGOS / DEUDAS
CREATE TABLE pagos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  fecha TEXT NOT NULL,
  monto INTEGER NOT NULL CHECK (monto > 0),
  medio TEXT NOT NULL CHECK (medio IN ('efectivo', 'transferencia', 'otro')),
  devuelto INTEGER NOT NULL DEFAULT 0 CHECK (devuelto >= 0 AND devuelto <= monto), -- parte reintegrada en efectivo al anular una venta
  origen TEXT NOT NULL CHECK (origen IN ('venta', 'cobro')), -- 'venta' = lo pagado en el momento de vender
  nota TEXT,
  anulado INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
  anulado_motivo TEXT,
  anulado_fecha TEXT,
  idem_key TEXT NOT NULL UNIQUE,
  usuario_id INTEGER REFERENCES usuarios (id)
);
CREATE INDEX ix_pagos_cliente ON pagos (cliente_id);

CREATE TABLE pago_aplicaciones (
  id INTEGER PRIMARY KEY,
  pago_id INTEGER NOT NULL REFERENCES pagos (id),
  venta_id INTEGER NOT NULL REFERENCES ventas (id),
  monto INTEGER NOT NULL CHECK (monto > 0),
  anulada INTEGER NOT NULL DEFAULT 0 CHECK (anulada IN (0, 1)),
  fecha TEXT NOT NULL
);
CREATE INDEX ix_aplic_venta ON pago_aplicaciones (venta_id);
CREATE INDEX ix_aplic_pago ON pago_aplicaciones (pago_id);

-- Defensa en profundidad: aunque el código falle, la base impide pagar de más.
CREATE TRIGGER trg_aplicacion_valida BEFORE INSERT ON pago_aplicaciones
BEGIN
  SELECT RAISE(ABORT, 'La venta no está confirmada')
   WHERE (SELECT estado FROM ventas WHERE id = NEW.venta_id) <> 'confirmada';
  SELECT RAISE(ABORT, 'El pago supera el saldo de la venta')
   WHERE NEW.anulada = 0
     AND (SELECT COALESCE(SUM(monto), 0) FROM pago_aplicaciones WHERE venta_id = NEW.venta_id AND anulada = 0) + NEW.monto
         > (SELECT total FROM ventas WHERE id = NEW.venta_id);
  SELECT RAISE(ABORT, 'La aplicación supera el importe del pago')
   WHERE NEW.anulada = 0
     AND (SELECT COALESCE(SUM(monto), 0) FROM pago_aplicaciones WHERE pago_id = NEW.pago_id AND anulada = 0) + NEW.monto
         > (SELECT monto FROM pagos WHERE id = NEW.pago_id);
END;

-- ------------------------------------------------------------------- CAJA
CREATE TABLE caja_mov (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  categoria TEXT NOT NULL CHECK (categoria IN
    ('venta', 'cobro_deuda', 'pago_proveedor', 'gasto', 'retiro', 'otro_ingreso', 'otro_egreso')),
  medio TEXT NOT NULL CHECK (medio IN ('efectivo', 'transferencia', 'otro')),
  monto INTEGER NOT NULL CHECK (monto > 0),
  concepto TEXT NOT NULL,
  ref_tipo TEXT,
  ref_id INTEGER,
  reversa_de INTEGER REFERENCES caja_mov (id),  -- si es una anulación, apunta al movimiento original
  usuario_id INTEGER REFERENCES usuarios (id)
);
CREATE INDEX ix_caja_fecha ON caja_mov (fecha);

CREATE TABLE gastos (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN
    ('transporte', 'alquiler', 'servicios', 'sueldos', 'mantenimiento', 'otros')),
  descripcion TEXT NOT NULL,
  monto INTEGER NOT NULL CHECK (monto > 0),
  medio TEXT NOT NULL CHECK (medio IN ('efectivo', 'transferencia', 'otro')),
  anulado INTEGER NOT NULL DEFAULT 0 CHECK (anulado IN (0, 1)),
  anulado_motivo TEXT,
  usuario_id INTEGER REFERENCES usuarios (id)
);
CREATE INDEX ix_gastos_fecha ON gastos (fecha);

-- ------------------------------------------------------------- INVENTARIO
CREATE TABLE mov_stock (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos (id),
  tipo TEXT NOT NULL CHECK (tipo IN
    ('compra', 'entrada_manual', 'venta', 'merma', 'ajuste', 'transferencia', 'anulacion_venta', 'anulacion_compra')),
  unidades INTEGER NOT NULL CHECK (unidades > 0),
  deposito_origen INTEGER REFERENCES depositos (id),   -- NULL = entra desde afuera
  deposito_destino INTEGER REFERENCES depositos (id),  -- NULL = sale del negocio
  motivo TEXT,
  ref_tipo TEXT,
  ref_id INTEGER,
  costo INTEGER NOT NULL DEFAULT 0,                    -- valor en centavos de la mercadería movida
  usuario_id INTEGER REFERENCES usuarios (id),
  CHECK (deposito_origen IS NOT NULL OR deposito_destino IS NOT NULL)
);
CREATE INDEX ix_movstock_producto ON mov_stock (producto_id);
CREATE INDEX ix_movstock_fecha ON mov_stock (fecha);

-- ------------------------------------------------------------- AUDITORÍA
CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios (id),
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id INTEGER,
  detalle TEXT
);
CREATE INDEX ix_auditoria_fecha ON auditoria (fecha);

-- ---------------------------------------------------------------- VISTAS
-- Saldo de cada venta, siempre derivado de los pagos aplicados (no se guarda duplicado).
CREATE VIEW v_ventas_saldo AS
SELECT v.id AS venta_id,
       v.total,
       COALESCE((SELECT SUM(a.monto) FROM pago_aplicaciones a WHERE a.venta_id = v.id AND a.anulada = 0), 0) AS pagado
  FROM ventas v;

-- ---------------------------------------------- NO SE BORRA LO FINANCIERO
CREATE TRIGGER trg_no_borrar_ventas BEFORE DELETE ON ventas
BEGIN SELECT RAISE(ABORT, 'Las ventas no se borran: se anulan'); END;
CREATE TRIGGER trg_no_borrar_venta_lineas BEFORE DELETE ON venta_lineas
BEGIN SELECT RAISE(ABORT, 'Las líneas de venta no se borran'); END;
CREATE TRIGGER trg_no_borrar_pagos BEFORE DELETE ON pagos
BEGIN SELECT RAISE(ABORT, 'Los pagos no se borran: se anulan'); END;
CREATE TRIGGER trg_no_borrar_aplicaciones BEFORE DELETE ON pago_aplicaciones
BEGIN SELECT RAISE(ABORT, 'Las aplicaciones de pago no se borran'); END;
CREATE TRIGGER trg_no_borrar_caja BEFORE DELETE ON caja_mov
BEGIN SELECT RAISE(ABORT, 'Los movimientos de caja no se borran: se compensan'); END;
CREATE TRIGGER trg_no_borrar_movstock BEFORE DELETE ON mov_stock
BEGIN SELECT RAISE(ABORT, 'Los movimientos de stock no se borran'); END;
CREATE TRIGGER trg_no_borrar_compras BEFORE DELETE ON compras
BEGIN SELECT RAISE(ABORT, 'Las compras no se borran: se anulan'); END;
CREATE TRIGGER trg_no_borrar_gastos BEFORE DELETE ON gastos
BEGIN SELECT RAISE(ABORT, 'Los gastos no se borran: se anulan'); END;
CREATE TRIGGER trg_no_borrar_auditoria BEFORE DELETE ON auditoria
BEGIN SELECT RAISE(ABORT, 'La auditoría no se borra'); END;
