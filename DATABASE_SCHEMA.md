# ESQUEMA DE BASE DE DATOS

## Tablas Principales (PostgreSQL + Supabase)

### 1. Core - Multi-tenancy y Usuarios

```sql
-- Tenants (Organizaciones)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(200) NOT NULL,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  activo BOOLEAN DEFAULT true,
  configuracion JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Profiles (Extensión de auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('director', 'lider', 'administrador', 'auditor')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_profiles_role ON profiles(role);
```

---

### 2. PDV (Puntos de Venta)

```sql
CREATE TABLE pdv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  codigo_interno VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  ciudad VARCHAR(100) NOT NULL,
  direccion TEXT,
  telefono VARCHAR(20),
  latitud DECIMAL(10, 6),
  longitud DECIMAL(10, 6),
  radio_gps INTEGER NOT NULL DEFAULT 100 CHECK (radio_gps BETWEEN 10 AND 1000),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, codigo_interno),
  UNIQUE(tenant_id, nombre)
);

-- Asignaciones de responsables (historial)
CREATE TABLE pdv_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  pdv_id UUID NOT NULL REFERENCES pdv(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  vigente BOOLEAN DEFAULT true,
  fecha_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_hasta DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_pdv_assignments_vigente ON pdv_assignments(pdv_id, vigente) WHERE vigente = true;
```

---

### 3. Inventarios

```sql
CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  nombre VARCHAR(100) NOT NULL,
  codigo VARCHAR(20),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, nombre),
  UNIQUE(tenant_id, codigo) WHERE codigo IS NOT NULL
);

CREATE TABLE inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  categoria_id UUID NOT NULL REFERENCES inventory_categories(id),
  nombre VARCHAR(200) NOT NULL,
  codigo_sku VARCHAR(50),
  unidad VARCHAR(20),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, categoria_id, nombre),
  UNIQUE(tenant_id, codigo_sku) WHERE codigo_sku IS NOT NULL
);

CREATE INDEX idx_products_categoria ON inventory_products(categoria_id);
```

---

### 4. Rutinas (Templates)

```sql
CREATE TABLE routine_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  nombre VARCHAR(200) NOT NULL,
  descripcion TEXT NOT NULL,
  prioridad VARCHAR(20) NOT NULL CHECK (prioridad IN ('baja', 'media', 'alta', 'critica')),
  frecuencia VARCHAR(30) NOT NULL CHECK (frecuencia IN ('diaria', 'semanal', 'quincenal', 'mensual', 'fechas_especificas')),
  
  -- Horarios
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_limite TIME NOT NULL DEFAULT '23:59',
  
  -- Días de ejecución (para diaria/semanal)
  dias_ejecucion INTEGER[] DEFAULT ARRAY[]::INTEGER[], -- 0=Dom, 1=Lun, ..., 6=Sáb
  
  -- Configuración quincenal
  corte_1_inicio INTEGER DEFAULT 1,
  corte_1_limite INTEGER DEFAULT 15,
  corte_2_inicio INTEGER DEFAULT 16,
  corte_2_limite INTEGER DEFAULT 30,
  
  -- Configuración mensual
  vencimiento_dia_mes INTEGER CHECK (vencimiento_dia_mes BETWEEN 1 AND 31),
  
  -- Fechas específicas
  fechas_especificas DATE[],
  
  -- Requisitos de evidencia
  gps_obligatorio BOOLEAN DEFAULT false,
  fotos_obligatorias BOOLEAN DEFAULT false,
  min_fotos INTEGER DEFAULT 0,
  comentario_obligatorio BOOLEAN DEFAULT false,
  archivo_obligatorio BOOLEAN DEFAULT false,
  requiere_inventario BOOLEAN DEFAULT false,
  
  -- Roles permitidos
  roles_ejecutores VARCHAR(20)[] DEFAULT ARRAY['administrador']::VARCHAR[],
  
  activo BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(tenant_id, nombre)
);

-- Campos dinámicos de rutinas
CREATE TABLE routine_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rutina_id UUID NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('texto', 'numero', 'fecha', 'si_no')),
  obligatorio BOOLEAN DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categorías de inventario por rutina
CREATE TABLE routine_inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rutina_id UUID NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES inventory_categories(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(rutina_id, categoria_id)
);
```

---

### 5. Asignación de Rutinas a PDV

```sql
CREATE TABLE routine_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rutina_id UUID NOT NULL REFERENCES routine_templates(id),
  pdv_id UUID NOT NULL REFERENCES pdv(id),
  estado VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva', 'no_aplica')),
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, rutina_id, pdv_id)
);

-- Excepciones (días específicos donde no aplica)
CREATE TABLE routine_assignment_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES routine_assignments(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  motivo TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(assignment_id, fecha)
);

CREATE INDEX idx_assignments_rutina ON routine_assignments(rutina_id);
CREATE INDEX idx_assignments_pdv ON routine_assignments(pdv_id);
```

---

### 6. Ausencias

```sql
CREATE TABLE absence_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  nombre VARCHAR(100) NOT NULL,
  codigo VARCHAR(20) NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, nombre),
  UNIQUE(tenant_id, codigo)
);

CREATE TABLE user_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  tipo_ausencia_id UUID NOT NULL REFERENCES absence_types(id),
  fecha_desde DATE NOT NULL,
  fecha_hasta DATE NOT NULL,
  politica VARCHAR(20) NOT NULL CHECK (politica IN ('omitir', 'reasignar')),
  receptor_id UUID REFERENCES profiles(id), -- Obligatorio si politica = reasignar
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  CHECK (fecha_hasta >= fecha_desde),
  CHECK (politica != 'reasignar' OR receptor_id IS NOT NULL)
);

CREATE INDEX idx_absences_user_dates ON user_absences(user_id, fecha_desde, fecha_hasta);
```

---

### 7. Tareas (Instancias)

```sql
CREATE TABLE task_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  rutina_id UUID NOT NULL REFERENCES routine_templates(id),
  pdv_id UUID NOT NULL REFERENCES pdv(id),
  responsable_id UUID NOT NULL REFERENCES profiles(id),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_limite TIME NOT NULL,
  
  -- Estado de ejecución
  estado VARCHAR(30) NOT NULL DEFAULT 'pendiente' 
    CHECK (estado IN ('pendiente', 'completada_a_tiempo', 'completada_vencida', 'incumplida')),
  
  -- Evidencia de ejecución
  submitted_at TIMESTAMP,
  submitted_by UUID REFERENCES profiles(id),
  gps_latitud DECIMAL(10, 6),
  gps_longitud DECIMAL(10, 6),
  gps_en_rango BOOLEAN,
  comentario TEXT,
  
  -- Auditoría
  audit_status VARCHAR(20) DEFAULT 'pendiente' 
    CHECK (audit_status IN ('pendiente', 'aprobado', 'rechazado')),
  audit_at TIMESTAMP,
  audit_by UUID REFERENCES profiles(id),
  audit_notas TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Valores de campos dinámicos
CREATE TABLE task_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES routine_fields(id),
  value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(task_id, field_id)
);

-- Evidencias (fotos/archivos)
CREATE TABLE evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('foto', 'archivo')),
  filename VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL, -- Supabase Storage path
  mime_type VARCHAR(100),
  size_bytes INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inventarios capturados
CREATE TABLE inventory_submission_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES task_instances(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES inventory_products(id),
  esperado DECIMAL(10, 2),
  fisico DECIMAL(10, 2) NOT NULL,
  diferencia DECIMAL(10, 2) GENERATED ALWAYS AS (fisico - esperado) STORED,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tasks_responsable_fecha ON task_instances(responsable_id, fecha);
CREATE INDEX idx_tasks_pdv_fecha ON task_instances(pdv_id, fecha);
CREATE INDEX idx_tasks_audit_status ON task_instances(audit_status) WHERE audit_status = 'pendiente';
```

---

### 8. Mensajería

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('mensaje', 'comunicado', 'tarea_flash')),
  asunto VARCHAR(200) NOT NULL,
  cuerpo TEXT NOT NULL,
  prioridad VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (prioridad IN ('normal', 'alta')),
  requiere_confirmacion BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Destinatarios
CREATE TABLE message_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('user', 'role', 'pdv')),
  recipient_id UUID, -- user_id, role name, o pdv_id
  created_at TIMESTAMP DEFAULT NOW()
);

-- Receipts (lectura/confirmación)
CREATE TABLE message_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  leido_at TIMESTAMP,
  confirmado_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_receipts_user ON message_receipts(user_id) WHERE leido_at IS NULL;
```

---

### 9. Auditoría de Sistema

```sql
CREATE TABLE system_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES profiles(id),
  action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_date ON system_audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user ON system_audit_log(user_id);
CREATE INDEX idx_audit_table ON system_audit_log(table_name, record_id);
```

---

## Row Level Security (RLS) Policies

### 1. Política Base: Multi-tenancy

```sql
-- Aplicar a TODAS las tablas con tenant_id
CREATE POLICY "tenant_isolation"
  ON <table_name> FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
```

### 2. Políticas Específicas por Tabla

```sql
-- PDV: Todos leen, solo Director escribe
CREATE POLICY "pdv_select"
  ON pdv FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "pdv_insert"
  ON pdv FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'director'
  );

-- Task Instances: Todos leen, solo responsable/líder/director escriben
CREATE POLICY "tasks_select"
  ON task_instances FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tasks_insert"
  ON task_instances FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      responsable_id = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('lider', 'director')
    )
  );

-- Auditoría: Solo auditor y líder pueden actualizar
CREATE POLICY "tasks_audit_update"
  ON task_instances FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('auditor', 'lider', 'director')
  );

-- Log de Auditoría: Solo director puede leer
CREATE POLICY "audit_read_director_only" ON system_audit_log
FOR SELECT TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'director'
  )
);
```

---

## Triggers Automáticos

### 1. Actualizar updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas relevantes
CREATE TRIGGER trigger_update_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### 2. Audit Log Automático

```sql
CREATE OR REPLACE FUNCTION log_system_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO system_audit_log (
    tenant_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Aplicar a tablas críticas
CREATE TRIGGER audit_pdv
  AFTER INSERT OR UPDATE OR DELETE ON pdv
  FOR EACH ROW
  EXECUTE FUNCTION log_system_audit();
```

### 3. Validar Responsable en Ausencia

```sql
CREATE OR REPLACE FUNCTION validate_absence_receptor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.politica = 'reasignar' THEN
    -- Verificar que receptor no esté ausente en el mismo período
    IF EXISTS (
      SELECT 1 FROM user_absences
      WHERE user_id = NEW.receptor_id
        AND fecha_desde <= NEW.fecha_hasta
        AND fecha_hasta >= NEW.fecha_desde
    ) THEN
      RAISE EXCEPTION 'El usuario receptor también tiene una ausencia en este período';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_absence
  BEFORE INSERT OR UPDATE ON user_absences
  FOR EACH ROW
  EXECUTE FUNCTION validate_absence_receptor();
```

---

## Database Functions (Lógica de Negocio)

### 1. Obtener Responsable Vigente

```sql
CREATE OR REPLACE FUNCTION get_responsable_vigente(
  p_pdv_id UUID,
  p_fecha DATE DEFAULT CURRENT_DATE
) RETURNS UUID AS $$
  SELECT user_id
  FROM pdv_assignments
  WHERE pdv_id = p_pdv_id
    AND vigente = true
    AND fecha_desde <= p_fecha
    AND (fecha_hasta IS NULL OR fecha_hasta >= p_fecha)
  LIMIT 1;
$$ LANGUAGE SQL STABLE;
```

### 2. Verificar Ausencia Vigente

```sql
CREATE OR REPLACE FUNCTION get_ausencia_vigente(
  p_user_id UUID,
  p_fecha DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
  id UUID,
  tipo_ausencia_id UUID,
  politica VARCHAR,
  receptor_id UUID
) AS $$
  SELECT id, tipo_ausencia_id, politica, receptor_id
  FROM user_absences
  WHERE user_id = p_user_id
    AND fecha_desde <= p_fecha
    AND fecha_hasta >= p_fecha
  LIMIT 1;
$$ LANGUAGE SQL STABLE;
```

### 3. Verificar si Rutina Debe Generarse Hoy

```sql
CREATE OR REPLACE FUNCTION should_generate_routine(
  p_rutina_id UUID,
  p_fecha DATE DEFAULT CURRENT_DATE
) RETURNS BOOLEAN AS $$
DECLARE
  v_rutina RECORD;
  v_day_of_week INTEGER;
  v_day_of_month INTEGER;
BEGIN
  SELECT * INTO v_rutina FROM routine_templates WHERE id = p_rutina_id;
  
  v_day_of_week := EXTRACT(DOW FROM p_fecha); -- 0=Dom, 6=Sáb
  v_day_of_month := EXTRACT(DAY FROM p_fecha);
  
  CASE v_rutina.frecuencia
    WHEN 'diaria' THEN
      RETURN v_day_of_week = ANY(v_rutina.dias_ejecucion);
    
    WHEN 'semanal' THEN
      RETURN v_day_of_week = ANY(v_rutina.dias_ejecucion);
    
    WHEN 'quincenal' THEN
      RETURN v_day_of_month IN (v_rutina.corte_1_inicio, v_rutina.corte_2_inicio);
    
    WHEN 'mensual' THEN
      RETURN v_day_of_month = 1; -- Se crea el día 1 del mes
    
    WHEN 'fechas_especificas' THEN
      RETURN p_fecha = ANY(v_rutina.fechas_especificas);
  END CASE;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## Views Útiles

### 1. Vista de Tareas con Contexto Completo

```sql
CREATE VIEW v_tasks_full AS
SELECT 
  t.id,
  t.fecha,
  t.estado,
  t.audit_status,
  r.nombre AS rutina_nombre,
  r.prioridad,
  p.nombre AS pdv_nombre,
  p.ciudad AS pdv_ciudad,
  u.nombre || ' ' || u.apellido AS responsable_nombre,
  t.submitted_at,
  t.gps_en_rango,
  (SELECT COUNT(*) FROM evidence_files WHERE task_id = t.id AND tipo = 'foto') AS num_fotos,
  (SELECT COUNT(*) FROM inventory_submission_rows WHERE task_id = t.id) AS num_inventario_items
FROM task_instances t
JOIN routine_templates r ON t.rutina_id = r.id
JOIN pdv p ON t.pdv_id = p.id
JOIN profiles u ON t.responsable_id = u.id;
```

### 2. Vista de Cumplimiento por PDV

```sql
CREATE VIEW v_cumplimiento_pdv AS
SELECT 
  p.id AS pdv_id,
  p.nombre AS pdv_nombre,
  COUNT(*) FILTER (WHERE t.estado = 'completada_a_tiempo') AS completadas_a_tiempo,
  COUNT(*) FILTER (WHERE t.estado = 'completada_vencida') AS completadas_vencidas,
  COUNT(*) FILTER (WHERE t.estado = 'incumplida') AS incumplidas,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE t.estado = 'completada_a_tiempo') * 100.0 / NULLIF(COUNT(*), 0),
    2
  ) AS porcentaje_cumplimiento
FROM pdv p
LEFT JOIN task_instances t ON p.id = t.pdv_id
GROUP BY p.id, p.nombre;
```

---

## Índices de Performance

```sql
-- Índices para queries frecuentes
CREATE INDEX idx_tasks_fecha_estado ON task_instances(fecha, estado);
CREATE INDEX idx_tasks_responsable_fecha ON task_instances(responsable_id, fecha DESC);
CREATE INDEX idx_tasks_pdv_fecha ON task_instances(pdv_id, fecha DESC);
CREATE INDEX idx_tasks_audit_pending ON task_instances(audit_status) WHERE audit_status = 'pendiente';

-- Índices para búsquedas de texto
CREATE INDEX idx_pdv_nombre_trgm ON pdv USING gin(nombre gin_trgm_ops);
CREATE INDEX idx_routine_nombre_trgm ON routine_templates USING gin(nombre gin_trgm_ops);
```

---

**FIN DEL ESQUEMA DE BASE DE DATOS**