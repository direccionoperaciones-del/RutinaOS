# 📋 PRD COMPLETO - PLATAFORMA WEB DE RUTINAS OPERATIVAS Y CONTROL DE PDV

## Bienvenido

Este es el Product Requirements Document (PRD) completo para el desarrollo de la Plataforma Web de Gestión de Rutinas Operativas para 23 Puntos de Venta (PDV).

---

## 🗂️ ESTRUCTURA DE LA DOCUMENTACIÓN

Este PRD está dividido en múltiples archivos para facilitar la navegación y lectura:

### 1. **PLAN.md** (Principal)
📄 **Archivo de inicio obligatorio**

Contiene:
- Resumen ejecutivo del proyecto
- Objetivos y métricas de éxito
- Alcance V1 (qué incluye y qué no)
- Restricciones técnicas (NO REACT)
- Stack tecnológico aprobado
- Arquitectura del sistema
- Estructura de navegación
- Resumen de módulos
- Plan de implementación por fases

**👉 EMPIEZA POR AQUÍ**

---

### 2. **MODULOS_DETALLADOS.md**
📄 **Especificación de cada módulo funcional**

Contiene:
- Autenticación (login, recuperación, cambio de contraseña)
- Puntos de Venta (CRUD + georreferenciación)
- Inventarios (categorías, productos, snapshot)
- Rutinas (catálogo de plantillas)
- Asignación de Rutinas (módulo independiente)
- Gestión Personal - Ausencias
- Mis Tareas (ejecución con evidencias)
- Centro de Mensajes
- Centro de Mando
- Auditoría
- Galería de Evidencias
- Reportes
- Dashboard
- Audit Sistema

**Incluye:**
- Componentes Vue completos
- Validaciones frontend y backend
- Flujos de usuario
- Reglas de negocio

---

### 3. **DATABASE_SCHEMA.md**
📄 **Modelo de datos completo**

Contiene:
- Esquema SQL de todas las tablas
- Relaciones entre tablas
- Índices de performance
- Triggers automáticos
- Row Level Security (RLS) policies
- Database functions
- Views útiles

**Stack:** PostgreSQL + Supabase

---

### 4. **MOTOR_TAREAS.md**
📄 **Lógica del motor de generación automática**

Contiene:
- Configuración del cron job (5:00 a.m.)
- Lógica de generación diaria
- 5 tipos de frecuencia detallados
- Estados de tarea
- Casos especiales (ausencias, cadenas)
- Monitoreo y alertas
- Testing

**Crítico para el corazón del sistema**

---

## 🚀 CÓMO USAR ESTA DOCUMENTACIÓN

### Para Gemini 3 Pro (VibeCoding en Dyad)

1. **Carga todos los archivos .md en el contexto**
2. **Lee PLAN.md primero** para entender la arquitectura global
3. **Consulta módulos específicos** cuando implementes cada feature
4. **Usa DATABASE_SCHEMA.md** para crear migraciones
5. **Implementa MOTOR_TAREAS.md** como Edge Function

### Orden de Implementación Recomendado

```
Fase 1: Fundamentos (Semana 1-2)
├─ Setup Nuxt 3 + Supabase
├─ Crear tablas base (ver DATABASE_SCHEMA.md)
├─ Implementar RLS policies
├─ Autenticación (ver MODULOS_DETALLADOS.md #1)
└─ Layout y navegación

Fase 2: Configuración (Semana 3-4)
├─ CRUD PDV (ver MODULOS_DETALLADOS.md #2)
├─ CRUD Inventarios (ver MODULOS_DETALLADOS.md #3)
├─ CRUD Rutinas (ver MODULOS_DETALLADOS.md #4)
├─ Asignación de Rutinas (ver MODULOS_DETALLADOS.md #5)
└─ Gestión de Ausencias (ver MODULOS_DETALLADOS.md #6)

Fase 3: Operaciones (Semana 5-6)
├─ Motor de Tareas (ver MOTOR_TAREAS.md completo)
├─ Módulo "Mis Tareas" (ver MODULOS_DETALLADOS.md #7)
└─ Sistema de evidencias

Fase 4: Control (Semana 7-8)
├─ Centro de Mensajes (ver MODULOS_DETALLADOS.md #8)
├─ Centro de Mando (ver MODULOS_DETALLADOS.md #9)
├─ Auditoría (ver MODULOS_DETALLADOS.md #10)
└─ Dashboard

Fase 5: Reportes y Pulido (Semana 9-10)
├─ Reportes exportables
├─ PWA (Service Worker)
└─ Optimizaciones

Fase 6: Deploy (Semana 11-12)
├─ Deploy producción
└─ Capacitación
```

---

## ⚠️ RESTRICCIONES CRÍTICAS

### 1. NO USAR REACT
🚫 **Prohibición absoluta**

Cualquier librería que incluya React debe ser rechazada.

**Stack aprobado:**
- ✅ Vue 3 + Nuxt 3
- ✅ Tailwind CSS
- ✅ Pinia
- ✅ VeeValidate
- ✅ Chart.js o Apache ECharts

### 2. Multi-tenancy Obligatorio
Todas las tablas deben tener `tenant_id` y RLS policies.

### 3. Validaciones Duras
Los campos obligatorios listados en PLAN.md #11 deben bloquearse si faltan.

---

## 📊 MÉTRICAS DE ÉXITO V1

**El producto está completo cuando:**

- [ ] Generación automática 5:00 a.m. funciona 7 días seguidos sin fallos
- [ ] 4 roles implementados con permisos correctos
- [ ] GPS valida correctamente (dentro/fuera de rango)
- [ ] Inventarios calculan diferencias correctamente
- [ ] Ausencias omiten/reasignan tareas automáticamente
- [ ] Auditoría puede aprobar/rechazar con devolución
- [ ] Mensajes + notificaciones push PWA funcionan
- [ ] Reportes CSV/Excel exportan correctamente
- [ ] Todas las reglas de PLAN.md #13 se cumplen

---

## 🧪 TESTING

### Unit Tests
- Validar `shouldGenerateRoutine()` para todas las frecuencias
- Validar cálculo de diferencias de inventario
- Validar estados de tarea

### Integration Tests
- Crear PDV → Asignar rutina → Generar tarea → Ejecutar → Auditar
- Crear ausencia (omitir) → Verificar no generación
- Crear ausencia (reasignar) → Verificar reasignación

### E2E Tests
- Login → Ver tareas → Ejecutar → Subir evidencias → Completar
- Director → Crear comunicado → Verificar recepción
- Auditor → Rechazar tarea → Verificar notificación

---

## 📞 SOPORTE

**Equipo de Desarrollo:**
- Product Owner: [Nombre]
- Tech Lead: [Nombre]
- Frontend Dev: [Nombre]
- Backend Dev: [Nombre]

**Recursos Técnicos:**
- [Supabase Docs](https://supabase.com/docs)
- [Vue 3 Docs](https://vuejs.org/)
- [Nuxt 3 Docs](https://nuxt.com/)

---

## 📝 CHANGELOG

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0.0 | 2026-01-20 | Documento inicial completo |

---

## 📄 LICENCIA

Este documento es propiedad de [Nombre de la Empresa] y es confidencial.

---

**¡ÉXITO EN EL DESARROLLO! 🚀**

Para cualquier duda sobre la implementación, consulta el archivo específico correspondiente.
