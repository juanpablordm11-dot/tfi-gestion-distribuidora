-- Recuperación de contraseña (requisito técnico del TFI: "mecanismo de recuperación, real o simulado").
--  * Se guarda solo el HASH del código, nunca el código en texto.
--  * Los pedidos no se borran: quedan como historial con su estado final.
--      pendiente   → esperando que el usuario ingrese el código
--      usada       → se cambió la contraseña con ese código
--      reemplazada → el usuario pidió un código nuevo antes de usar este
--      bloqueada   → se ingresó mal el código demasiadas veces
--  * El vencimiento (15 minutos) se controla con "expira", en milisegundos, igual que en la tabla sesiones.
CREATE TABLE recuperaciones_clave (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id),
  codigo_hash TEXT NOT NULL,
  creada TEXT NOT NULL,
  expira INTEGER NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'usada', 'reemplazada', 'bloqueada')),
  cerrada TEXT
);
CREATE INDEX idx_recuperaciones_usuario ON recuperaciones_clave (usuario_id, estado);
