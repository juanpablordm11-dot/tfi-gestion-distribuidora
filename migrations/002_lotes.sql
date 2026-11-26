-- Lotes por fecha de ingreso. Cada entrada de mercadería a un depósito es un lote con su fecha;
-- las salidas (ventas, pérdidas, ajustes, transferencias) descuentan primero lo más viejo (FIFO).
-- Los lotes solo llevan CANTIDADES: la ganancia sigue calculándose con el costo promedio ponderado.
-- Invariante: para cada producto y depósito, SUM(lotes.cantidad) = existencias.cantidad.

CREATE TABLE lotes (
  id INTEGER PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos (id),
  deposito_id INTEGER NOT NULL REFERENCES depositos (id),
  fecha_ingreso TEXT NOT NULL,                       -- AAAA-MM-DD en que la mercadería entró al negocio
  origen TEXT NOT NULL CHECK (origen IN ('compra', 'entrada_manual', 'ajuste', 'anulacion_venta', 'transferencia')),
  raiz_id INTEGER REFERENCES lotes (id),             -- si se creó por una transferencia: el lote original (conserva su fecha)
  ref_tipo TEXT,
  ref_id INTEGER,
  mov_id INTEGER REFERENCES mov_stock (id),          -- movimiento que creó el lote
  unidades_iniciales INTEGER NOT NULL CHECK (unidades_iniciales > 0),
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0),   -- lo que queda hoy
  creado TEXT NOT NULL
);
CREATE INDEX ix_lotes_fifo ON lotes (producto_id, deposito_id, fecha_ingreso, id);
CREATE INDEX ix_lotes_raiz ON lotes (raiz_id);
CREATE INDEX ix_lotes_ref ON lotes (ref_tipo, ref_id);

-- Qué lote tocó cada movimiento de stock (negativo = salió del lote, positivo = volvió al lote).
CREATE TABLE lote_mov (
  id INTEGER PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes (id),
  mov_id INTEGER NOT NULL REFERENCES mov_stock (id),
  unidades INTEGER NOT NULL CHECK (unidades <> 0)
);
CREATE INDEX ix_lote_mov_mov ON lote_mov (mov_id);

CREATE TRIGGER trg_no_borrar_lotes BEFORE DELETE ON lotes
BEGIN SELECT RAISE(ABORT, 'Los lotes no se borran'); END;
CREATE TRIGGER trg_no_borrar_lote_mov BEFORE DELETE ON lote_mov
BEGIN SELECT RAISE(ABORT, 'Los movimientos de lotes no se borran'); END;

-- Datos que ya existían: un lote por cada entrada registrada. Lo que hay hoy en cada depósito se reparte
-- entre las entradas más recientes (lo más viejo se supone vendido primero). Las entradas por transferencia
-- quedan con la fecha de la transferencia, porque antes no se registraba de qué ingreso venía la mercadería.
INSERT INTO lotes (producto_id, deposito_id, fecha_ingreso, origen, ref_tipo, ref_id, mov_id, unidades_iniciales, cantidad, creado)
WITH e AS (
  SELECT m.id, m.producto_id, m.deposito_destino AS dep, m.unidades, m.ref_tipo, m.ref_id, m.tipo AS origen,
         substr(CASE WHEN m.tipo = 'compra' THEN COALESCE((SELECT c.fecha FROM compras c WHERE c.id = m.ref_id), m.fecha) ELSE m.fecha END, 1, 10) AS f
    FROM mov_stock m
   WHERE m.deposito_destino IS NOT NULL AND m.tipo IN ('compra', 'entrada_manual', 'ajuste', 'anulacion_venta', 'transferencia')
), c AS (
  SELECT e.*,
         SUM(e.unidades) OVER (PARTITION BY e.producto_id, e.dep ORDER BY e.f DESC, e.id DESC ROWS UNBOUNDED PRECEDING) AS acum,
         COALESCE((SELECT x.cantidad FROM existencias x WHERE x.producto_id = e.producto_id AND x.deposito_id = e.dep), 0) AS stock
    FROM e
)
SELECT producto_id, dep, f, origen, ref_tipo, ref_id, id, unidades,
       MAX(0, MIN(unidades, stock - (acum - unidades))), strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
  FROM c
 ORDER BY f, id;
