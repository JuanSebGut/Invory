-- Ejecutar manualmente o al reiniciar el contenedor con volumen limpio

-- CAMBIO 1: campo monto_pagado en movimientos
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(12,2);

-- Indice para reportes de ventas
CREATE INDEX IF NOT EXISTS idx_movimientos_monto
  ON public.movimientos_inventario (monto_pagado)
  WHERE monto_pagado IS NOT NULL;
