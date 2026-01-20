# MOTOR DE TAREAS - GENERACIÓN AUTOMÁTICA

## Resumen

El motor de tareas es el corazón del sistema. Se ejecuta diariamente a las 5:00 a.m. (hora Colombia) mediante un Supabase Edge Function programado con `pg_cron`.

---

## 1. CONFIGURACIÓN DEL CRON JOB

### 1.1 Supabase Edge Function

```typescript
// supabase/functions/generate-daily-tasks/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const fecha = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  console.log(`[${new Date().toISOString()}] Iniciando generación de tareas para ${fecha}`);
  
  try {
    const result = await generarTareasDiarias(supabase, fecha);
    
    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Error generando tareas:', error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

### 1.2 Programar con pg_cron

```sql
-- Ejecutar en Supabase SQL Editor
SELECT cron.schedule(
  'generate-daily-tasks',
  '0 5 * * *', -- 5:00 AM todos los días
  $$
  SELECT
    net.http_post(
      url := 'https://[PROJECT-ID].supabase.co/functions/v1/generate-daily-tasks',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer [SERVICE-ROLE-KEY]'
      ),
      body := jsonb_build_object('fecha', CURRENT_DATE::text)
    )
  $$
);

-- Configurar timezone a Colombia
ALTER DATABASE postgres SET timezone TO 'America/Bogota';
```

---

## 2. LÓGICA DE GENERACIÓN

### 2.1 Función Principal

```typescript
async function generarTareasDiarias(supabase, fecha: string) {
  const stats = {
    pdvs_procesados: 0,
    tareas_creadas: 0,
    pdvs_sin_responsable: 0,
    ausencias_omitidas: 0,
    ausencias_reasignadas: 0,
    errores: []
  };

  // 1. Obtener todos los PDV activos
  const { data: pdvs, error: pdvError } = await supabase
    .from('pdv')
    .select('*')
    .eq('activo', true);

  if (pdvError) throw pdvError;

  // 2. Procesar cada PDV
  for (const pdv of pdvs) {
    try {
      await procesarPDV(supabase, pdv, fecha, stats);
      stats.pdvs_procesados++;
    } catch (error) {
      stats.errores.push({
        pdv_id: pdv.id,
        pdv_nombre: pdv.nombre,
        error: error.message
      });
    }
  }

  // 3. Registrar en log
  await supabase
    .from('task_generation_log')
    .insert({
      fecha,
      stats: JSON.stringify(stats),
      created_at: new Date().toISOString()
    });

  return stats;
}
```

### 2.2 Procesar PDV

```typescript
async function procesarPDV(supabase, pdv, fecha: string, stats) {
  // 1. Obtener responsable vigente
  const { data: assignment } = await supabase
    .rpc('get_responsable_vigente', { 
      p_pdv_id: pdv.id,
      p_fecha: fecha
    })
    .single();

  if (!assignment) {
    console.warn(`PDV ${pdv.nombre} sin responsable vigente`);
    stats.pdvs_sin_responsable++;
    return;
  }

  let responsable_id = assignment.user_id;

  // 2. Verificar ausencia
  const { data: ausencia } = await supabase
    .rpc('get_ausencia_vigente', {
      p_user_id: responsable_id,
      p_fecha: fecha
    })
    .single();

  if (ausencia) {
    if (ausencia.politica === 'omitir') {
      console.log(`Responsable ${responsable_id} ausente. Omitiendo tareas.`);
      stats.ausencias_omitidas++;
      return;
    }

    if (ausencia.politica === 'reasignar') {
      // Verificar que receptor no esté ausente también
      const { data: receptorAusente } = await supabase
        .rpc('get_ausencia_vigente', {
          p_user_id: ausencia.receptor_id,
          p_fecha: fecha
        })
        .single();

      if (receptorAusente) {
        console.error(`Receptor ${ausencia.receptor_id} también ausente. Omitiendo tareas.`);
        stats.ausencias_omitidas++;
        return;
      }

      responsable_id = ausencia.receptor_id;
      stats.ausencias_reasignadas++;
      console.log(`Tareas reasignadas a ${responsable_id}`);
    }
  }

  // 3. Obtener rutinas asignadas al PDV
  const { data: assignments } = await supabase
    .from('routine_assignments')
    .select('*, rutina:routine_templates(*)')
    .eq('pdv_id', pdv.id)
    .eq('estado', 'activa');

  if (!assignments || assignments.length === 0) {
    return;
  }

  // 4. Generar tareas
  for (const assignment of assignments) {
    const rutina = assignment.rutina;

    // Verificar si debe generarse hoy
    const debeGenerar = await shouldGenerateRoutine(rutina, fecha);

    if (!debeGenerar) {
      continue;
    }

    // Verificar excepciones
    const { data: excepcion } = await supabase
      .from('routine_assignment_exceptions')
      .select('*')
      .eq('assignment_id', assignment.id)
      .eq('fecha', fecha)
      .single();

    if (excepcion) {
      console.log(`Excepción encontrada para ${rutina.nombre} en ${pdv.nombre} el ${fecha}`);
      continue;
    }

    // Crear tarea
    await crearTarea(supabase, rutina, pdv, responsable_id, fecha);
    stats.tareas_creadas++;
  }
}
```

### 2.3 Verificar si Debe Generarse

```typescript
function shouldGenerateRoutine(rutina, fecha: string): boolean {
  const date = new Date(fecha);
  const dayOfWeek = date.getDay(); // 0=Dom, 6=Sáb
  const dayOfMonth = date.getDate();

  switch (rutina.frecuencia) {
    case 'diaria':
      return rutina.dias_ejecucion.includes(dayOfWeek);

    case 'semanal':
      return rutina.dias_ejecucion.includes(dayOfWeek);

    case 'quincenal':
      // Se genera solo en día de inicio de corte
      return dayOfMonth === rutina.corte_1_inicio || 
             dayOfMonth === rutina.corte_2_inicio;

    case 'mensual':
      // Se genera solo el día 1 del mes
      return dayOfMonth === 1;

    case 'fechas_especificas':
      return rutina.fechas_especificas.some(f => {
        const fechaEsp = new Date(f);
        return fechaEsp.toISOString().split('T')[0] === fecha;
      });

    default:
      return false;
  }
}
```

### 2.4 Crear Tarea

```typescript
async function crearTarea(supabase, rutina, pdv, responsable_id: string, fecha: string) {
  // Calcular deadline según frecuencia
  let deadline_date = fecha;
  let deadline_time = rutina.hora_limite;

  if (rutina.frecuencia === 'quincenal') {
    const day = new Date(fecha).getDate();
    if (day >= 1 && day <= 15) {
      deadline_date = `${fecha.slice(0, 8)}${rutina.corte_1_limite.toString().padStart(2, '0')}`;
    } else {
      deadline_date = `${fecha.slice(0, 8)}${rutina.corte_2_limite.toString().padStart(2, '0')}`;
    }
  } else if (rutina.frecuencia === 'mensual') {
    const year = fecha.slice(0, 4);
    const month = fecha.slice(5, 7);
    deadline_date = `${year}-${month}-${rutina.vencimiento_dia_mes.toString().padStart(2, '0')}`;
  }

  const { data, error } = await supabase
    .from('task_instances')
    .insert({
      tenant_id: pdv.tenant_id,
      rutina_id: rutina.id,
      pdv_id: pdv.id,
      responsable_id: responsable_id,
      fecha: fecha,
      hora_inicio: rutina.hora_inicio,
      hora_limite: deadline_time,
      deadline_date: deadline_date,
      estado: 'pendiente'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error creando tarea: ${error.message}`);
  }

  console.log(`✅ Tarea creada: ${rutina.nombre} para ${pdv.nombre} (${responsable_id})`);

  return data;
}
```

---

## 3. FRECUENCIAS DETALLADAS

### 3.1 Diaria

```javascript
// Configuración
{
  frecuencia: 'diaria',
  dias_ejecucion: [1, 2, 3, 4, 5, 6] // Lun-Sáb
}

// Comportamiento:
// - Se genera todos los días incluidos en dias_ejecucion
// - Deadline: hora_limite del mismo día
// - Si se completa después de hora_limite: estado = 'completada_vencida'

// Ejemplo:
// Apertura de Caja (Lun-Sáb, 08:00-10:00)
// → Se crea tarea todos los Lun-Sáb a las 5:00 AM
// → Deadline: mismo día 10:00
```

### 3.2 Semanal

```javascript
// Configuración
{
  frecuencia: 'semanal',
  dias_ejecucion: [1, 4] // Lunes y Jueves
}

// Comportamiento:
// - Igual que diaria pero con días específicos de la semana
// - Útil para rutinas que no son diarias pero sí regulares

// Ejemplo:
// Inventario de Bebidas (Lunes y Jueves, 12:00-18:00)
// → Se crea tarea solo lunes y jueves
// → Deadline: mismo día 18:00
```

### 3.3 Quincenal (por cortes)

```javascript
// Configuración
{
  frecuencia: 'quincenal',
  corte_1_inicio: 1,
  corte_1_limite: 15,
  corte_2_inicio: 16,
  corte_2_limite: 30
}

// Comportamiento:
// Día 1 del mes a las 5:00 AM:
//   - Se crea tarea_1
//   - deadline_date = día 15 del mes
//   - La tarea permanece visible todos los días 1-15 hasta completarse

// Día 15:
//   - Si no se completó: estado = 'incumplida'

// Día 16 del mes a las 5:00 AM:
//   - Se crea tarea_2
//   - deadline_date = día 30 del mes
//   - La tarea permanece visible todos los días 16-30

// Ejemplo:
// Arqueo Quincenal (1-15, 16-30)
// → Día 1: se crea, visible hasta día 15
// → Si se completa día 10: OK, no vuelve a aparecer hasta día 16
// → Si se completa día 17: estado = 'completada_vencida'
```

### 3.4 Mensual (hasta día X)

```javascript
// Configuración
{
  frecuencia: 'mensual',
  vencimiento_dia_mes: 25
}

// Comportamiento:
// Día 1 del mes a las 5:00 AM:
//   - Se crea tarea
//   - deadline_date = día 25 del mes
//   - Aparece todos los días 1-25 como pendiente

// Día 25:
//   - Si no se completó: estado = 'incumplida'

// Días 26-31:
//   - Tarea no visible (ya venció o se completó)

// Mes siguiente día 1:
//   - Se crea NUEVA tarea

// Ejemplo:
// Informe Mensual de Ventas (vence día 25)
// → Día 1 enero: se crea, deadline 25 enero
// → Día 10: si se completa → OK
// → Día 28: tarea ya no visible
// → Día 1 febrero: nueva tarea, deadline 25 febrero
```

### 3.5 Fechas Específicas

```javascript
// Configuración
{
  frecuencia: 'fechas_especificas',
  fechas_especificas: ['2026-01-15', '2026-02-14', '2026-03-08']
}

// Comportamiento:
// - Se genera SOLO en las fechas exactas especificadas
// - Deadline: hora_limite del mismo día
// - Útil para eventos únicos o irregulares

// Ejemplo:
// Inventario de San Valentín (14 febrero)
// → Solo se crea el 14 de febrero
// → No se repite otros días
```

---

## 4. ESTADOS DE TAREA

### 4.1 Estados Posibles

```typescript
type TaskEstado = 
  | 'pendiente'
  | 'completada_a_tiempo'
  | 'completada_vencida'
  | 'incumplida';

// Transiciones:
// pendiente → completada_a_tiempo (si se completa antes del deadline)
// pendiente → completada_vencida (si se completa después del deadline)
// pendiente → incumplida (si pasa el deadline sin completarse)
```

### 4.2 Cálculo de Estado al Completar

```typescript
async function completarTarea(task_id: string) {
  const { data: task } = await supabase
    .from('task_instances')
    .select('*, rutina:routine_templates(*)')
    .eq('id', task_id)
    .single();

  const now = new Date();
  const deadline = new Date(`${task.deadline_date}T${task.hora_limite}`);

  let estado: TaskEstado;

  if (now <= deadline) {
    estado = 'completada_a_tiempo';
  } else {
    estado = 'completada_vencida';
  }

  await supabase
    .from('task_instances')
    .update({
      estado,
      submitted_at: now.toISOString()
    })
    .eq('id', task_id);

  return estado;
}
```

### 4.3 Job Nocturno: Marcar Incumplidas

```typescript
// Edge Function programado para 23:59 diariamente
async function marcarIncumplidas(supabase) {
  const hoy = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('task_instances')
    .update({ estado: 'incumplida' })
    .eq('estado', 'pendiente')
    .lte('deadline_date', hoy)
    .select();

  console.log(`Marcadas ${data?.length || 0} tareas como incumplidas`);

  return data;
}

// Programar
SELECT cron.schedule(
  'mark-missed-tasks',
  '59 23 * * *', -- 23:59 todos los días
  $$
  SELECT net.http_post(...)
  $$
);
```

---

## 5. CASOS ESPECIALES

### 5.1 Tarea Quincenal Pendiente de Corte Anterior

**Problema:** ¿Qué pasa si una tarea del corte 1-15 no se completó y ya es día 16?

**Solución:**
```typescript
// Al generar tareas del corte 2 (día 16):
// 1. Marcar tarea del corte 1 como incumplida
// 2. Crear nueva tarea para corte 2

// Código:
const { data: tareaAnterior } = await supabase
  .from('task_instances')
  .select('*')
  .eq('rutina_id', rutina.id)
  .eq('pdv_id', pdv.id)
  .eq('deadline_date', `${fecha.slice(0, 8)}15`) // Corte 1
  .eq('estado', 'pendiente')
  .single();

if (tareaAnterior) {
  await supabase
    .from('task_instances')
    .update({ estado: 'incumplida' })
    .eq('id', tareaAnterior.id);
}

// Luego crear tarea del corte 2
await crearTarea(supabase, rutina, pdv, responsable_id, fecha);
```

### 5.2 Receptor Ausente en Cadena

**Problema:** Usuario A ausente (reasignar a B), pero B también ausente.

**Solución:**
```typescript
async function resolverCadenaAusencias(user_id: string, fecha: string): Promise<string | null> {
  const MAX_INTENTOS = 5;
  let intentos = 0;
  let usuario_actual = user_id;

  while (intentos < MAX_INTENTOS) {
    const { data: ausencia } = await supabase
      .rpc('get_ausencia_vigente', {
        p_user_id: usuario_actual,
        p_fecha: fecha
      })
      .single();

    if (!ausencia) {
      // No está ausente, retornar este usuario
      return usuario_actual;
    }

    if (ausencia.politica === 'omitir') {
      // Omitir tareas
      return null;
    }

    if (ausencia.politica === 'reasignar') {
      usuario_actual = ausencia.receptor_id;
      intentos++;
    }
  }

  // Demasiados niveles de reasignación, omitir
  console.error(`Cadena de ausencias demasiado larga para ${user_id} en ${fecha}`);
  return null;
}
```

### 5.3 PDV Cambia de Responsable

**Problema:** PDV tenía responsable A, pero hoy cambió a responsable B.

**Solución:**
```typescript
// Las tareas YA CREADAS hoy (a las 5 AM) quedan asignadas al responsable vigente en ese momento
// Las tareas de mañana se crearán con el nuevo responsable

// No hay reasignación retroactiva de tareas pendientes
// Solo se usa la función get_responsable_vigente(pdv_id, fecha) que retorna el vigente para esa fecha
```

---

## 6. MONITOREO Y ALERTAS

### 6.1 Log de Generación

```sql
CREATE TABLE task_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP,
  stats JSONB,
  errores JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stats ejemplo:
{
  "pdvs_procesados": 23,
  "tareas_creadas": 156,
  "pdvs_sin_responsable": 0,
  "ausencias_omitidas": 2,
  "ausencias_reasignadas": 1,
  "duracion_ms": 2458
}
```

### 6.2 Alertas Críticas

```typescript
async function enviarAlertas(stats) {
  const alertas = [];

  // Alerta 1: PDVs sin responsable
  if (stats.pdvs_sin_responsable > 0) {
    alertas.push({
      tipo: 'warning',
      mensaje: `${stats.pdvs_sin_responsable} PDV(s) sin responsable asignado`
    });
  }

  // Alerta 2: Errores en generación
  if (stats.errores && stats.errores.length > 0) {
    alertas.push({
      tipo: 'error',
      mensaje: `${stats.errores.length} error(es) en generación de tareas`
    });
  }

  // Alerta 3: Cero tareas creadas (sospechoso)
  if (stats.tareas_creadas === 0 && stats.pdvs_procesados > 0) {
    alertas.push({
      tipo: 'critical',
      mensaje: 'Ninguna tarea creada hoy (posible error en configuración)'
    });
  }

  // Enviar notificación a Directors
  if (alertas.length > 0) {
    await supabase.from('messages').insert({
      tipo: 'sistema',
      asunto: 'Alertas de Generación de Tareas',
      cuerpo: JSON.stringify(alertas),
      prioridad: 'alta',
      recipient_type: 'role',
      recipient_id: 'director'
    });
  }
}
```

---

## 7. TESTING

### 7.1 Test Manual

```typescript
// Ejecutar en Supabase SQL Editor o via API
SELECT net.http_post(
  url := 'https://[PROJECT-ID].supabase.co/functions/v1/generate-daily-tasks',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer [SERVICE-ROLE-KEY]'
  ),
  body := jsonb_build_object(
    'fecha', '2026-01-20', -- Fecha específica para testing
    'dry_run', true -- No crear tareas, solo simular
  )
);
```

### 7.2 Test de Frecuencias

```typescript
// Casos de prueba
const testCases = [
  {
    nombre: 'Diaria Lun-Sáb',
    rutina: { frecuencia: 'diaria', dias_ejecucion: [1,2,3,4,5,6] },
    fechas: ['2026-01-20', '2026-01-25'], // Martes y Domingo
    esperado: [true, false]
  },
  {
    nombre: 'Quincenal',
    rutina: { frecuencia: 'quincenal', corte_1_inicio: 1, corte_2_inicio: 16 },
    fechas: ['2026-01-01', '2026-01-05', '2026-01-16', '2026-01-20'],
    esperado: [true, false, true, false]
  },
  {
    nombre: 'Mensual',
    rutina: { frecuencia: 'mensual', vencimiento_dia_mes: 25 },
    fechas: ['2026-01-01', '2026-01-15', '2026-02-01'],
    esperado: [true, false, true]
  }
];

for (const test of testCases) {
  for (let i = 0; i < test.fechas.length; i++) {
    const resultado = shouldGenerateRoutine(test.rutina, test.fechas[i]);
    console.assert(
      resultado === test.esperado[i],
      `FAIL: ${test.nombre} en ${test.fechas[i]}`
    );
  }
}
```

---

**FIN DEL MOTOR DE TAREAS**
