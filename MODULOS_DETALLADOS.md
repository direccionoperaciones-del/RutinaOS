# MÓDULOS FUNCIONALES DETALLADOS

Este documento contiene la especificación completa de todos los módulos del sistema.

---

## ÍNDICE

1. [Autenticación y Seguridad](#1-autenticacion-y-seguridad)
2. [Puntos de Venta (PDV)](#2-puntos-de-venta-pdv)
3. [Inventarios](#3-inventarios)
4. [Rutinas (Catálogo)](#4-rutinas-catalogo)
5. [Asignación de Rutinas](#5-asignacion-de-rutinas)
6. [Gestión Personal - Ausencias](#6-gestion-personal-ausencias)
7. [Mis Tareas (Ejecución)](#7-mis-tareas-ejecucion)
8. [Centro de Mensajes](#8-centro-de-mensajes)
9. [Centro de Mando](#9-centro-de-mando)
10. [Auditoría](#10-auditoria)
11. [Galería de Evidencias](#11-galeria-de-evidencias)
12. [Reportes](#12-reportes)
13. [Dashboard](#13-dashboard)
14. [Audit Sistema](#14-audit-sistema)

---

## 1. AUTENTICACIÓN Y SEGURIDAD

### 1.1 Login

**URL:** `/login`

**Pantalla:**
```
┌─────────────────────────────────────┐
│                                      │
│         [Logo de la Empresa]         │
│                                      │
│   Sistema de Gestión Operativa      │
│                                      │
│   Email: [________________]          │
│   Contraseña: [________________]     │
│   □ Recordarme                       │
│                                      │
│   [      Iniciar Sesión      ]       │
│                                      │
│   ¿Olvidaste tu contraseña?          │
│                                      │
└─────────────────────────────────────┘
```

**Validaciones:**
```javascript
// Frontend
const schema = yup.object({
  email: yup.string()
    .email('Email inválido')
    .required('Email es obligatorio'),
  password: yup.string()
    .min(8, 'Mínimo 8 caracteres')
    .required('Contraseña es obligatoria')
});

// Backend (Supabase Auth)
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
});

if (error) {
  // Mensajes específicos
  switch (error.message) {
    case 'Invalid login credentials':
      return 'Email o contraseña incorrectos';
    case 'Email not confirmed':
      return 'Email no verificado';
    default:
      return 'Error al iniciar sesión';
  }
}

// Verificar usuario activo
const { data: profile } = await supabase
  .from('profiles')
  .select('*, tenant:tenants(*), pdv_assignment:pdv_assignments!vigente(*)')
  .eq('id', data.user.id)
  .single();

if (!profile.activo) {
  throw new Error('Usuario inactivo. Contacte al administrador.');
}
```

**Post-Login:**
1. Guardar token JWT en cookie httpOnly
2. Cargar perfil completo (rol, tenant, PDV asignado)
3. Guardar en Pinia store
4. Redirigir a `/dashboard`

---

### 1.2 Recuperación de Contraseña

**URL:** `/forgot-password`

**Flujo:**
```javascript
// Paso 1: Solicitar recuperación
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`
});

// Paso 2: Usuario recibe email con link
// Link válido por 1 hora

// Paso 3: Formulario de reset
const schema = yup.object({
  password: yup.string()
    .min(8)
    .matches(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .matches(/[0-9]/, 'Debe contener al menos un número')
    .required(),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Las contraseñas no coinciden')
    .required()
});

await supabase.auth.updateUser({ password: newPassword });
```

---

### 1.3 Cambio de Contraseña (Usuario Logueado)

**URL:** `/settings/change-password`

**Validaciones:**
```javascript
const schema = yup.object({
  currentPassword: yup.string().required('Contraseña actual obligatoria'),
  newPassword: yup.string()
    .min(8)
    .matches(/[A-Z]/, 'Debe contener mayúscula')
    .matches(/[0-9]/, 'Debe contener número')
    .notOneOf([yup.ref('currentPassword')], 'Debe ser diferente a la actual')
    .required(),
  confirmPassword: yup.string()
    .oneOf([yup.ref('newPassword')], 'No coinciden')
    .required()
});

// Verificar contraseña actual
const { error: signInError } = await supabase.auth.signInWithPassword({
  email: user.email,
  password: currentPassword
});

if (signInError) {
  throw new Error('Contraseña actual incorrecta');
}

// Actualizar
await supabase.auth.updateUser({ password: newPassword });

// Logout en otros dispositivos
await supabase.rpc('invalidate_sessions_except_current');
```

---

## 2. PUNTOS DE VENTA (PDV)

### 2.1 Lista de PDV

**URL:** `/config/pdv`

**Componente Vue:**
```vue
<template>
  <div class="pdv-list">
    <header>
      <h1>Puntos de Venta</h1>
      <div class="actions">
        <button @click="openCreateModal" v-if="canCreate">
          + Crear PDV
        </button>
        <button @click="openBulkUpload" v-if="canCreate">
          📤 Cargar Masivo
        </button>
      </div>
    </header>
    
    <div class="filters">
      <input 
        v-model="search" 
        placeholder="Buscar por nombre, código o ciudad..."
        @input="debounceSearch"
      />
      <select v-model="filterStatus">
        <option value="">Todos</option>
        <option value="true">Activos</option>
        <option value="false">Inactivos</option>
      </select>
      <select v-model="filterCity">
        <option value="">Todas las ciudades</option>
        <option v-for="city in cities" :key="city">{{ city }}</option>
      </select>
    </div>
    
    <table>
      <thead>
        <tr>
          <th @click="sortBy('codigo_interno')">
            Código
            <span v-if="sort.field === 'codigo_interno'">
              {{ sort.dir === 'asc' ? '↑' : '↓' }}
            </span>
          </th>
          <th @click="sortBy('nombre')">Nombre</th>
          <th>Ciudad</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="pdv in filteredPDVs" :key="pdv.id">
          <td>{{ pdv.codigo_interno }}</td>
          <td>{{ pdv.nombre }}</td>
          <td>{{ pdv.ciudad }}</td>
          <td>
            <span v-if="pdv.responsable">
              {{ pdv.responsable.nombre }}
            </span>
            <span v-else class="warning">
              ⚠️ Sin responsable
            </span>
          </td>
          <td>
            <span :class="['badge', pdv.activo ? 'active' : 'inactive']">
              {{ pdv.activo ? '● Activo' : '○ Inactivo' }}
            </span>
          </td>
          <td>
            <button @click="edit(pdv)" v-if="canEdit">Editar</button>
            <button @click="view(pdv)">Ver</button>
            <button 
              @click="toggleStatus(pdv)" 
              v-if="canEdit"
              :class="pdv.activo ? 'btn-danger' : 'btn-success'"
            >
              {{ pdv.activo ? 'Desactivar' : 'Activar' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    
    <div class="pagination">
      <button @click="prevPage" :disabled="page === 1">Anterior</button>
      <span>Página {{ page }} de {{ totalPages }}</span>
      <button @click="nextPage" :disabled="page === totalPages">Siguiente</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { usePDVStore } from '~/stores/pdv';
import { useAuthStore } from '~/stores/auth';

const pdvStore = usePDVStore();
const authStore = useAuthStore();

const search = ref('');
const filterStatus = ref('');
const filterCity = ref('');
const sort = ref({ field: 'nombre', dir: 'asc' });
const page = ref(1);
const perPage = 20;

const canCreate = computed(() => {
  return ['director'].includes(authStore.user.role);
});

const canEdit = computed(() => {
  return ['director'].includes(authStore.user.role);
});

const filteredPDVs = computed(() => {
  let result = pdvStore.pdvs;
  
  // Búsqueda
  if (search.value) {
    const s = search.value.toLowerCase();
    result = result.filter(p => 
      p.nombre.toLowerCase().includes(s) ||
      p.codigo_interno.toLowerCase().includes(s) ||
      p.ciudad.toLowerCase().includes(s)
    );
  }
  
  // Filtro estado
  if (filterStatus.value !== '') {
    result = result.filter(p => p.activo === (filterStatus.value === 'true'));
  }
  
  // Filtro ciudad
  if (filterCity.value) {
    result = result.filter(p => p.ciudad === filterCity.value);
  }
  
  // Ordenamiento
  result.sort((a, b) => {
    const aVal = a[sort.value.field];
    const bVal = b[sort.value.field];
    const multiplier = sort.value.dir === 'asc' ? 1 : -1;
    return aVal > bVal ? multiplier : -multiplier;
  });
  
  // Paginación
  const start = (page.value - 1) * perPage;
  return result.slice(start, start + perPage);
});

const totalPages = computed(() => {
  return Math.ceil(pdvStore.pdvs.length / perPage);
});

onMounted(() => {
  pdvStore.fetchAll();
});
</script>
```

---

### 2.2 Modal Crear/Editar PDV

**Componente:**
```vue
<template>
  <Modal :show="show" @close="$emit('close')">
    <h2>{{ isEdit ? 'Editar PDV' : 'Crear PDV' }}</h2>
    
    <Form @submit="handleSubmit" :validation-schema="schema">
      <Tabs v-model="activeTab">
        <!-- Tab 1: Información Básica -->
        <TabPanel value="general" title="Información Básica">
          <Field name="nombre" label="Nombre *">
            <input 
              v-model="form.nombre" 
              type="text"
              placeholder="Ej: PDV Central"
              required
            />
          </Field>
          
          <Field name="codigo_interno" label="Código Interno *">
            <input 
              v-model="form.codigo_interno"
              type="text"
              placeholder="Ej: 001"
              required
            />
          </Field>
          
          <Field name="ciudad" label="Ciudad *">
            <select v-model="form.ciudad" required>
              <option value="">Seleccione...</option>
              <option value="Medellín">Medellín</option>
              <option value="Bogotá">Bogotá</option>
              <option value="Cali">Cali</option>
              <option value="Barranquilla">Barranquilla</option>
              <option value="Cartagena">Cartagena</option>
            </select>
          </Field>
          
          <Field name="direccion" label="Dirección">
            <input v-model="form.direccion" type="text" />
          </Field>
          
          <Field name="telefono" label="Teléfono">
            <input v-model="form.telefono" type="tel" />
          </Field>
          
          <Field name="activo" label="Estado *">
            <select v-model="form.activo" required>
              <option :value="true">Activo</option>
              <option :value="false">Inactivo</option>
            </select>
          </Field>
        </TabPanel>
        
        <!-- Tab 2: Georreferenciación -->
        <TabPanel value="geo" title="Georreferenciación">
          <p class="help">
            Las coordenadas GPS son obligatorias si se asignarán rutinas 
            que requieran validación GPS.
          </p>
          
          <Field name="latitud" label="Latitud">
            <input 
              v-model="form.latitud" 
              type="number" 
              step="0.000001"
              placeholder="Ej: 6.244203"
            />
          </Field>
          
          <Field name="longitud" label="Longitud">
            <input 
              v-model="form.longitud" 
              type="number" 
              step="0.000001"
              placeholder="Ej: -75.581215"
            />
          </Field>
          
          <Field name="radio_gps" label="Radio GPS (metros) *">
            <input 
              v-model="form.radio_gps" 
              type="number" 
              min="10" 
              max="1000"
              value="100"
              required
            />
            <p class="help">
              Distancia máxima permitida para validación GPS (10-1000m)
            </p>
          </Field>
          
          <button type="button" @click="getCurrentLocation">
            📍 Obtener mi ubicación actual
          </button>
          
          <div v-if="form.latitud && form.longitud" class="map-preview">
            <!-- Aquí iría un componente de mapa, ej: Leaflet -->
            <p>
              Vista previa: 
              <a :href="mapLink" target="_blank">Ver en Google Maps</a>
            </p>
          </div>
        </TabPanel>
        
        <!-- Tab 3: Responsable -->
        <TabPanel value="responsable" title="Responsable">
          <p class="help">
            Asigne el usuario responsable de este PDV. 
            Puede ser un Administrador o Líder.
          </p>
          
          <Field name="responsable_id" label="Responsable">
            <select v-model="form.responsable_id">
              <option value="">Sin asignar</option>
              <optgroup label="Administradores">
                <option 
                  v-for="user in admins" 
                  :key="user.id" 
                  :value="user.id"
                >
                  {{ user.nombre }} {{ user.apellido }}
                </option>
              </optgroup>
              <optgroup label="Líderes">
                <option 
                  v-for="user in lideres" 
                  :key="user.id" 
                  :value="user.id"
                >
                  {{ user.nombre }} {{ user.apellido }}
                </option>
              </optgroup>
            </select>
          </Field>
          
          <div v-if="form.responsable_id" class="responsable-info">
            <p>
              <strong>Usuario seleccionado:</strong> 
              {{ selectedUser?.nombre }} {{ selectedUser?.apellido }}
            </p>
            <p>
              <strong>Rol:</strong> {{ selectedUser?.role }}
            </p>
            <p>
              <strong>Email:</strong> {{ selectedUser?.email }}
            </p>
          </div>
        </TabPanel>
      </Tabs>
      
      <div class="modal-footer">
        <button type="button" @click="$emit('close')">Cancelar</button>
        <button type="submit" :disabled="loading">
          {{ loading ? 'Guardando...' : 'Guardar' }}
        </button>
      </div>
    </Form>
  </Modal>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import * as yup from 'yup';
import { usePDVStore } from '~/stores/pdv';
import { useUserStore } from '~/stores/user';

const props = defineProps({
  show: Boolean,
  pdv: Object // Si viene, es edición
});

const emit = defineEmits(['close', 'saved']);

const pdvStore = usePDVStore();
const userStore = useUserStore();

const activeTab = ref('general');
const loading = ref(false);

const isEdit = computed(() => !!props.pdv);

const form = ref({
  nombre: '',
  codigo_interno: '',
  ciudad: '',
  direccion: '',
  telefono: '',
  latitud: null,
  longitud: null,
  radio_gps: 100,
  responsable_id: '',
  activo: true
});

const schema = yup.object({
  nombre: yup.string()
    .required('Nombre es obligatorio')
    .max(100, 'Máximo 100 caracteres'),
  codigo_interno: yup.string()
    .required('Código interno es obligatorio')
    .matches(/^[A-Z0-9]+$/, 'Solo letras mayúsculas y números')
    .max(20, 'Máximo 20 caracteres'),
  ciudad: yup.string()
    .required('Ciudad es obligatoria'),
  radio_gps: yup.number()
    .min(10, 'Mínimo 10 metros')
    .max(1000, 'Máximo 1000 metros')
    .required('Radio GPS es obligatorio'),
  latitud: yup.number()
    .nullable()
    .min(-90, 'Latitud inválida')
    .max(90, 'Latitud inválida')
    .test('gps-required', 'Coordenadas obligatorias para rutinas GPS', 
      async function(value) {
        if (!value) {
          // Verificar si el PDV tiene rutinas GPS asignadas
          const hasGPSRoutines = await pdvStore.hasGPSRoutines(props.pdv?.id);
          return !hasGPSRoutines;
        }
        return true;
      }
    ),
  longitud: yup.number()
    .nullable()
    .min(-180, 'Longitud inválida')
    .max(180, 'Longitud inválida')
});

const admins = computed(() => {
  return userStore.users.filter(u => u.role === 'administrador' && u.activo);
});

const lideres = computed(() => {
  return userStore.users.filter(u => u.role === 'lider' && u.activo);
});

const selectedUser = computed(() => {
  return userStore.users.find(u => u.id === form.value.responsable_id);
});

const mapLink = computed(() => {
  const { latitud, longitud } = form.value;
  return `https://www.google.com/maps?q=${latitud},${longitud}`;
});

const getCurrentLocation = () => {
  if (!navigator.geolocation) {
    alert('Geolocalización no disponible en este navegador');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      form.value.latitud = position.coords.latitude;
      form.value.longitud = position.coords.longitude;
    },
    (error) => {
      alert('Error al obtener ubicación: ' + error.message);
    }
  );
};

const handleSubmit = async (values) => {
  loading.value = true;
  
  try {
    if (isEdit.value) {
      await pdvStore.update(props.pdv.id, values);
    } else {
      await pdvStore.create(values);
    }
    
    emit('saved');
    emit('close');
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  userStore.fetchAll();
  
  if (isEdit.value) {
    Object.assign(form.value, props.pdv);
  }
});
</script>
```

---

### 2.3 Validaciones Backend (Supabase)

**Database Trigger:**
```sql
-- Validación: código_interno único por tenant
CREATE UNIQUE INDEX idx_pdv_codigo_tenant 
  ON pdv(tenant_id, codigo_interno);

-- Validación: nombre único por tenant
CREATE UNIQUE INDEX idx_pdv_nombre_tenant 
  ON pdv(tenant_id, nombre);

-- Trigger: Validar GPS si hay rutinas GPS asignadas
CREATE OR REPLACE FUNCTION validate_pdv_gps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitud IS NULL OR NEW.longitud IS NULL THEN
    -- Verificar si tiene rutinas GPS asignadas
    IF EXISTS (
      SELECT 1 
      FROM routine_assignments ra
      JOIN routine_templates rt ON ra.rutina_id = rt.id
      WHERE ra.pdv_id = NEW.id
        AND rt.gps_obligatorio = true
        AND ra.estado = 'activa'
    ) THEN
      RAISE EXCEPTION 'Este PDV tiene rutinas GPS asignadas. Coordenadas son obligatorias.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_pdv_gps
  BEFORE INSERT OR UPDATE ON pdv
  FOR EACH ROW
  EXECUTE FUNCTION validate_pdv_gps();
```

---

### 2.4 Carga Masiva

**Formato CSV:**
```csv
codigo_interno,nombre,ciudad,latitud,longitud,radio_gps,activo,responsable_email
001,PDV Central,Medellín,6.244203,-75.581215,100,true,juan@ejemplo.com
002,PDV Norte,Medellín,6.297874,-75.572189,150,true,maria@ejemplo.com
003,PDV Sur,Medellín,6.189847,-75.590012,100,true,
```

**Procesamiento:**
```javascript
async function processBulkUpload(file) {
  const results = {
    success: [],
    errors: []
  };
  
  const csv = await parseCsv(file);
  
  for (const [index, row] of csv.entries()) {
    try {
      // Validar fila
      await schema.validate(row);
      
      // Buscar responsable si se especificó email
      let responsable_id = null;
      if (row.responsable_email) {
        const user = await supabase
          .from('profiles')
          .select('id')
          .eq('email', row.responsable_email)
          .single();
        
        if (!user) {
          throw new Error(`Email ${row.responsable_email} no encontrado`);
        }
        responsable_id = user.id;
      }
      
      // Crear PDV
      const { data, error } = await supabase
        .from('pdv')
        .insert({
          ...row,
          responsable_id,
          tenant_id: authStore.user.tenant_id
        });
      
      if (error) throw error;
      
      results.success.push({
        line: index + 2, // +2 porque CSV tiene header y es 0-indexed
        codigo: row.codigo_interno,
        nombre: row.nombre
      });
    } catch (error) {
      results.errors.push({
        line: index + 2,
        codigo: row.codigo_interno,
        error: error.message
      });
    }
  }
  
  return results;
}
```

---

## 3. INVENTARIOS

### 3.1 Categorías

**Pantalla Lista:**
```vue
<template>
  <div class="categories-list">
    <header>
      <h1>Categorías de Inventario</h1>
      <button @click="openCreateModal" v-if="canCreate">
        + Crear Categoría
      </button>
    </header>
    
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Código</th>
          <th>Productos</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="cat in categories" :key="cat.id">
          <td>{{ cat.nombre }}</td>
          <td>{{ cat.codigo }}</td>
          <td>{{ cat.productos_count }}</td>
          <td>
            <span :class="['badge', cat.activo ? 'active' : 'inactive']">
              {{ cat.activo ? '● Activo' : '○ Inactivo' }}
            </span>
          </td>
          <td>
            <button @click="edit(cat)" v-if="canEdit">Editar</button>
            <button @click="viewProducts(cat)">Ver Productos</button>
            <button 
              @click="toggleStatus(cat)" 
              v-if="canDelete && !cat.productos_count"
            >
              Eliminar
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

**Modal Crear/Editar:**
```vue
<template>
  <Modal :show="show" @close="$emit('close')">
    <h2>{{ isEdit ? 'Editar Categoría' : 'Crear Categoría' }}</h2>
    
    <Form @submit="handleSubmit">
      <Field name="nombre" label="Nombre *">
        <input v-model="form.nombre" required />
      </Field>
      
      <Field name="codigo" label="Código">
        <input 
          v-model="form.codigo" 
          placeholder="Ej: BEB, SNK, CIG"
          @input="toUpperCase"
        />
      </Field>
      
      <Field name="activo" label="Estado *">
        <select v-model="form.activo" required>
          <option :value="true">Activo</option>
          <option :value="false">Inactivo</option>
        </select>
      </Field>
      
      <div class="modal-footer">
        <button type="button" @click="$emit('close')">Cancelar</button>
        <button type="submit">Guardar</button>
      </div>
    </Form>
  </Modal>
</template>
```

**Validación Backend:**
```sql
-- Validación: nombre único por tenant
CREATE UNIQUE INDEX idx_categoria_nombre_tenant 
  ON inventory_categories(tenant_id, nombre);

-- Validación: código único por tenant (si se especifica)
CREATE UNIQUE INDEX idx_categoria_codigo_tenant 
  ON inventory_categories(tenant_id, codigo) 
  WHERE codigo IS NOT NULL;

-- Trigger: No permitir eliminar si tiene productos activos
CREATE OR REPLACE FUNCTION prevent_delete_category_with_products()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM inventory_products 
    WHERE categoria_id = OLD.id 
      AND activo = true
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar categoría con productos activos';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_delete_category
  BEFORE DELETE ON inventory_categories
  FOR EACH ROW
  EXECUTE FUNCTION prevent_delete_category_with_products();
```

---

### 3.2 Productos

**Componente Lista:**
```vue
<template>
  <div class="products-list">
    <header>
      <h1>Productos de Inventario</h1>
      <button @click="openCreateModal">+ Crear Producto</button>
    </header>
    
    <div class="filters">
      <select v-model="filterCategory">
        <option value="">Todas las categorías</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">
          {{ cat.nombre }}
        </option>
      </select>
      
      <input 
        v-model="search" 
        placeholder="Buscar producto..."
      />
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Código SKU</th>
          <th>Nombre</th>
          <th>Categoría</th>
          <th>Unidad</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="prod in filteredProducts" :key="prod.id">
          <td>{{ prod.codigo_sku }}</td>
          <td>{{ prod.nombre }}</td>
          <td>{{ prod.categoria.nombre }}</td>
          <td>{{ prod.unidad }}</td>
          <td>
            <span :class="['badge', prod.activo ? 'active' : 'inactive']">
              {{ prod.activo ? '● Activo' : '○ Inactivo' }}
            </span>
          </td>
          <td>
            <button @click="edit(prod)">Editar</button>
            <button @click="toggleStatus(prod)">
              {{ prod.activo ? 'Desactivar' : 'Activar' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

**Modal Crear/Editar:**
```vue
<template>
  <Modal :show="show" @close="$emit('close')">
    <h2>{{ isEdit ? 'Editar Producto' : 'Crear Producto' }}</h2>
    
    <Form @submit="handleSubmit">
      <Field name="categoria_id" label="Categoría *">
        <select v-model="form.categoria_id" required>
          <option value="">Seleccione categoría...</option>
          <option 
            v-for="cat in activeCategories" 
            :key="cat.id" 
            :value="cat.id"
          >
            {{ cat.nombre }}
          </option>
        </select>
      </Field>
      
      <Field name="nombre" label="Nombre *">
        <input 
          v-model="form.nombre" 
          placeholder="Ej: Coca Cola 350ml"
          required 
        />
      </Field>
      
      <Field name="codigo_sku" label="Código SKU">
        <input 
          v-model="form.codigo_sku" 
          placeholder="Ej: CC350"
        />
      </Field>
      
      <Field name="unidad" label="Unidad de Medida">
        <input 
          v-model="form.unidad" 
          placeholder="Ej: Und, Kg, L, Caja"
        />
      </Field>
      
      <Field name="activo" label="Estado *">
        <select v-model="form.activo" required>
          <option :value="true">Activo</option>
          <option :value="false">Inactivo</option>
        </select>
      </Field>
      
      <div class="modal-footer">
        <button type="button" @click="$emit('close')">Cancelar</button>
        <button type="submit">Guardar</button>
      </div>
    </Form>
  </Modal>
</template>
```

---

### 3.3 Snapshot / Stock

**Pantalla:**
```vue
<template>
  <div class="inventory-snapshot">
    <header>
      <h1>Histórico de Inventarios</h1>
      <button @click="exportCSV">📥 Exportar CSV</button>
    </header>
    
    <div class="filters">
      <Field label="PDV">
        <select v-model="filters.pdv_id">
          <option value="">Todos</option>
          <option v-for="pdv in pdvs" :key="pdv.id" :value="pdv.id">
            {{ pdv.nombre }}
          </option>
        </select>
      </Field>
      
      <Field label="Fecha Desde">
        <input v-model="filters.fecha_desde" type="date" />
      </Field>
      
      <Field label="Fecha Hasta">
        <input v-model="filters.fecha_hasta" type="date" />
      </Field>
      
      <Field label="Categoría">
        <select v-model="filters.categoria_id">
          <option value="">Todas</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.nombre }}
          </option>
        </select>
      </Field>
      
      <Field label="Producto">
        <select v-model="filters.producto_id">
          <option value="">Todos</option>
          <option 
            v-for="prod in filteredProducts" 
            :key="prod.id" 
            :value="prod.id"
          >
            {{ prod.nombre }}
          </option>
        </select>
      </Field>
      
      <button @click="search">🔍 Buscar</button>
      <button @click="clearFilters">✖ Limpiar</button>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>PDV</th>
          <th>Rutina</th>
          <th>Producto</th>
          <th>Esperado</th>
          <th>Físico</th>
          <th>Diferencia</th>
          <th>%</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in snapshots" :key="row.id">
          <td>{{ formatDate(row.fecha) }}</td>
          <td>{{ row.pdv.nombre }}</td>
          <td>{{ row.rutina.nombre }}</td>
          <td>{{ row.producto.nombre }}</td>
          <td>{{ row.esperado }}</td>
          <td>{{ row.fisico }}</td>
          <td :class="{
            'positive': row.diferencia > 0,
            'negative': row.diferencia < 0,
            'neutral': row.diferencia === 0
          }">
            {{ row.diferencia > 0 ? '+' : '' }}{{ row.diferencia }}
          </td>
          <td>{{ row.porcentaje }}%</td>
          <td>
            <button @click="viewDetail(row)">Ver Detalle</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

**Modal Detalle:**
```vue
<template>
  <Modal :show="show" @close="$emit('close')" size="large">
    <h2>Detalle de Inventario</h2>
    
    <div class="snapshot-header">
      <p><strong>PDV:</strong> {{ snapshot.pdv.nombre }}</p>
      <p><strong>Rutina:</strong> {{ snapshot.rutina.nombre }}</p>
      <p><strong>Fecha:</strong> {{ formatDateTime(snapshot.fecha) }}</p>
      <p><strong>Ejecutado por:</strong> {{ snapshot.ejecutado_por.nombre }}</p>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Esperado</th>
          <th>Físico</th>
          <th>Diferencia</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in snapshot.items" :key="item.id">
          <td>{{ item.producto.nombre }}</td>
          <td>{{ item.esperado }}</td>
          <td>{{ item.fisico }}</td>
          <td :class="{
            'positive': item.diferencia > 0,
            'negative': item.diferencia < 0
          }">
            {{ item.diferencia > 0 ? '+' : '' }}{{ item.diferencia }}
          </td>
          <td>{{ item.porcentaje }}%</td>
        </tr>
      </tbody>
    </table>
    
    <div class="evidences" v-if="snapshot.evidencias.length">
      <h3>Evidencias</h3>
      <div class="gallery">
        <img 
          v-for="ev in snapshot.evidencias" 
          :key="ev.id"
          :src="ev.url"
          @click="openLightbox(ev)"
        />
      </div>
    </div>
    
    <div class="comments" v-if="snapshot.comentario">
      <h3>Comentarios</h3>
      <p>{{ snapshot.comentario }}</p>
    </div>
  </Modal>
</template>
```

---

## 4. RUTINAS (CATÁLOGO)

### 4.1 Lista de Rutinas

```vue
<template>
  <div class="routines-list">
    <header>
      <h1>Catálogo de Rutinas</h1>
      <button @click="openCreateWizard">+ Crear Rutina</button>
    </header>
    
    <div class="filters">
      <input v-model="search" placeholder="Buscar rutina..." />
      <select v-model="filterPriority">
        <option value="">Todas las prioridades</option>
        <option value="baja">Baja</option>
        <option value="media">Media</option>
        <option value="alta">Alta</option>
        <option value="critica">Crítica</option>
      </select>
      <select v-model="filterFrequency">
        <option value="">Todas las frecuencias</option>
        <option value="diaria">Diaria</option>
        <option value="semanal">Semanal</option>
        <option value="quincenal">Quincenal</option>
        <option value="mensual">Mensual</option>
        <option value="fechas_especificas">Fechas específicas</option>
      </select>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Prioridad</th>
          <th>Frecuencia</th>
          <th>Horario</th>
          <th>GPS</th>
          <th>Fotos</th>
          <th>Inventario</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rutina in filteredRoutines" :key="rutina.id">
          <td>{{ rutina.nombre }}</td>
          <td>
            <span :class="['badge', 'priority-' + rutina.prioridad]">
              {{ rutina.prioridad }}
            </span>
          </td>
          <td>{{ rutina.frecuencia }}</td>
          <td>{{ rutina.hora_inicio }} - {{ rutina.hora_limite }}</td>
          <td>{{ rutina.gps_obligatorio ? '✓' : '-' }}</td>
          <td>{{ rutina.fotos_obligatorias ? `✓ (${rutina.min_fotos})` : '-' }}</td>
          <td>{{ rutina.requiere_inventario ? '✓' : '-' }}</td>
          <td>
            <span :class="['badge', rutina.activo ? 'active' : 'inactive']">
              {{ rutina.activo ? '● Activo' : '○ Inactivo' }}
            </span>
          </td>
          <td>
            <button @click="edit(rutina)">Editar</button>
            <button @click="duplicate(rutina)">Duplicar</button>
            <button @click="viewAssignments(rutina)">Ver Asignaciones</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

---

### 4.2 Wizard Crear/Editar Rutina

Debido a la extensión, continuaré en el siguiente mensaje...
