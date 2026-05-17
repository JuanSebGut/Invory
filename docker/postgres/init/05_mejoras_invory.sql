-- Mejoras INVORY: unidades de medida, clientes, facturacion y fiados

-- 1) UNIDADES DE MEDIDA
CREATE TABLE IF NOT EXISTS public.unidades_medida (
    id_unidad SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    abreviatura VARCHAR(10) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    factor_base NUMERIC(12,6) NOT NULL,
    CONSTRAINT unidades_medida_tipo_check CHECK (tipo IN ('peso', 'volumen', 'unidad')),
    CONSTRAINT unidades_medida_nombre_key UNIQUE (nombre),
    CONSTRAINT unidades_medida_abreviatura_key UNIQUE (abreviatura)
);

ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS id_unidad INTEGER,
    ADD COLUMN IF NOT EXISTS permite_fraccion BOOLEAN DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'productos_id_unidad_fkey'
          AND conrelid = 'public.productos'::regclass
    ) THEN
        ALTER TABLE public.productos
            ADD CONSTRAINT productos_id_unidad_fkey
            FOREIGN KEY (id_unidad)
            REFERENCES public.unidades_medida(id_unidad);
    END IF;
END $$;

INSERT INTO public.unidades_medida (nombre, abreviatura, tipo, factor_base)
VALUES
    ('Unidad', 'und', 'unidad', 1),
    ('Kilogramo', 'kg', 'peso', 1),
    ('Gramo', 'g', 'peso', 0.001),
    ('Libra', 'lb', 'peso', 0.453592),
    ('Litro', 'l', 'volumen', 1),
    ('Mililitro', 'ml', 'volumen', 0.001)
ON CONFLICT (abreviatura) DO NOTHING;

-- 2) CLIENTES
CREATE TABLE IF NOT EXISTS public.clientes (
    id_cliente SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    direccion TEXT,
    correo VARCHAR(100),
    documento VARCHAR(50),
    estado BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- 3) FACTURAS
CREATE TABLE IF NOT EXISTS public.facturas (
    id_factura SERIAL PRIMARY KEY,
    numero_factura VARCHAR(50) UNIQUE,
    id_usuario INTEGER NOT NULL,
    id_cliente INTEGER,
    fecha_emision TIMESTAMP DEFAULT NOW(),
    subtotal NUMERIC(12,2),
    descuento NUMERIC(12,2) DEFAULT 0,
    total NUMERIC(12,2),
    estado VARCHAR(20),
    tipo VARCHAR(20),
    observaciones TEXT,
    CONSTRAINT facturas_estado_check CHECK (estado IN ('emitida', 'anulada')),
    CONSTRAINT facturas_tipo_check CHECK (tipo IN ('venta', 'devolucion')),
    CONSTRAINT facturas_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario),
    CONSTRAINT facturas_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente)
);

CREATE TABLE IF NOT EXISTS public.facturas_detalle (
    id_detalle SERIAL PRIMARY KEY,
    id_factura INTEGER NOT NULL,
    id_producto INTEGER NOT NULL,
    cantidad NUMERIC(12,3),
    precio_unitario NUMERIC(12,2),
    subtotal NUMERIC(12,2),
    CONSTRAINT facturas_detalle_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.facturas(id_factura) ON DELETE CASCADE,
    CONSTRAINT facturas_detalle_id_producto_fkey FOREIGN KEY (id_producto) REFERENCES public.productos(id_producto)
);

ALTER TABLE public.movimientos_inventario
    ADD COLUMN IF NOT EXISTS id_factura INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'movimientos_inventario_id_factura_fkey'
          AND conrelid = 'public.movimientos_inventario'::regclass
    ) THEN
        ALTER TABLE public.movimientos_inventario
            ADD CONSTRAINT movimientos_inventario_id_factura_fkey
            FOREIGN KEY (id_factura)
            REFERENCES public.facturas(id_factura);
    END IF;
END $$;

-- 4) FIADOS
CREATE TABLE IF NOT EXISTS public.fiados (
    id_fiado SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    id_factura INTEGER,
    monto_total NUMERIC(12,2) NOT NULL,
    monto_pagado NUMERIC(12,2) DEFAULT 0,
    saldo_pendiente NUMERIC(12,2) GENERATED ALWAYS AS (monto_total - monto_pagado) STORED,
    fecha_fiado TIMESTAMP DEFAULT NOW(),
    fecha_pago_acordada DATE NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',
    observaciones TEXT,
    CONSTRAINT fiados_estado_check CHECK (estado IN ('pendiente', 'pagado', 'vencido')),
    CONSTRAINT fiados_id_cliente_fkey FOREIGN KEY (id_cliente) REFERENCES public.clientes(id_cliente),
    CONSTRAINT fiados_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario),
    CONSTRAINT fiados_id_factura_fkey FOREIGN KEY (id_factura) REFERENCES public.facturas(id_factura)
);

CREATE TABLE IF NOT EXISTS public.fiados_pagos (
    id_pago SERIAL PRIMARY KEY,
    id_fiado INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    monto NUMERIC(12,2) NOT NULL,
    fecha_pago TIMESTAMP DEFAULT NOW(),
    observaciones TEXT,
    CONSTRAINT fiados_pagos_id_fiado_fkey FOREIGN KEY (id_fiado) REFERENCES public.fiados(id_fiado),
    CONSTRAINT fiados_pagos_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES public.usuarios(id_usuario)
);

-- 5) MOTIVOS DE DEVOLUCION
INSERT INTO public.motivos_movimiento (nombre_motivo, tipo_operacion)
SELECT 'Devolucion de cliente', 'ENTRADA'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.motivos_movimiento
    WHERE nombre_motivo = 'Devolucion de cliente'
      AND tipo_operacion = 'ENTRADA'
);

INSERT INTO public.motivos_movimiento (nombre_motivo, tipo_operacion)
SELECT 'Devolucion a proveedor', 'SALIDA'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.motivos_movimiento
    WHERE nombre_motivo = 'Devolucion a proveedor'
      AND tipo_operacion = 'SALIDA'
);

-- 6) CONFIGURACION DEL SISTEMA
ALTER TABLE public.configuracion_sistema
    ADD COLUMN IF NOT EXISTS modulo_clientes_activo BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS modulo_fiados_activo BOOLEAN DEFAULT false;

-- 7) PARAMETROS NUEVOS
INSERT INTO public.parametros_sistema (clave, valor)
VALUES
    ('dias_aviso_fiado', '1'),
    ('consecutivo_factura_actual', '0'),
    ('prefijo_factura', 'FAC')
ON CONFLICT (clave) DO NOTHING;

-- 8) INDICES
CREATE INDEX IF NOT EXISTS idx_fiados_id_cliente ON public.fiados (id_cliente);
CREATE INDEX IF NOT EXISTS idx_fiados_estado ON public.fiados (estado);
CREATE INDEX IF NOT EXISTS idx_fiados_fecha_pago_acordada ON public.fiados (fecha_pago_acordada);
CREATE INDEX IF NOT EXISTS idx_fiados_pagos_id_fiado ON public.fiados_pagos (id_fiado);
CREATE INDEX IF NOT EXISTS idx_facturas_id_cliente ON public.facturas (id_cliente);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha_emision ON public.facturas (fecha_emision);
CREATE INDEX IF NOT EXISTS idx_facturas_detalle_id_factura ON public.facturas_detalle (id_factura);
