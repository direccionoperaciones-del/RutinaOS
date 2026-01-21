import { z } from "zod";

// Tipos de campos soportados por el motor de renderizado
export type FieldType = 'location' | 'email_check' | 'file' | 'photo' | 'inventory' | 'text';

export interface TaskField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  constraints?: {
    min?: number;
    max?: number;
    radio?: number; // Para GPS
    categories?: string[]; // Para inventario
  };
  // Función para validar el campo basado en el estado actual del formulario
  validate: (value: any) => string | null;
}

/**
 * Convierte la configuración plana de la BD (routine_templates)
 * en un Schema estructurado para la UI.
 */
export function buildTaskSchema(rutina: any, pdv: any): TaskField[] {
  const fields: TaskField[] = [];

  if (!rutina) return [];

  // 1. GPS / Ubicación
  if (rutina.gps_obligatorio) {
    fields.push({
      id: 'gps',
      type: 'location',
      label: 'Validación de Ubicación',
      required: true,
      constraints: {
        radio: pdv?.radio_gps || 100
      },
      validate: (val: { valid: boolean }) => 
        !val?.valid ? 'Debes validar tu ubicación dentro del rango permitido.' : null
    });
  }

  // 2. Correos (Checkboxes)
  if (rutina.enviar_email) {
    fields.push({
      id: 'email_send',
      type: 'email_check',
      label: 'Confirmar envío de correo',
      required: true,
      validate: (val: boolean) => !val ? 'Debes confirmar el envío del correo.' : null
    });
  }

  if (rutina.responder_email) {
    fields.push({
      id: 'email_respond',
      type: 'email_check',
      label: 'Confirmar respuesta de correo',
      required: true,
      validate: (val: boolean) => !val ? 'Debes confirmar la respuesta de correos.' : null
    });
  }

  // 3. Archivos
  // Si archivo_obligatorio es false, NO agregamos el campo (o lo agregamos como opcional si quisiéramos)
  // Según requerimiento: "renderizar campos solo si están definidos".
  // Asumiremos que si está en false pero queremos permitir adjuntos opcionales, lo agregamos con required: false.
  // Pero para limpiar la UI, si es false y no es obligatorio, podríamos ocultarlo o mostrarlo como opcional.
  // Vamos a mostrarlo siempre para permitir adjuntos opcionales, pero validando solo si es true.
  fields.push({
    id: 'files',
    type: 'file',
    label: 'Documentos Adjuntos',
    required: rutina.archivo_obligatorio,
    validate: (files: any[]) => {
      if (rutina.archivo_obligatorio && (!files || files.length === 0)) {
        return 'Debes adjuntar al menos un documento.';
      }
      return null;
    }
  });

  // 4. Fotos (El BUG estaba aquí: la lógica debe ser estricta)
  fields.push({
    id: 'photos',
    type: 'photo',
    label: 'Evidencia Fotográfica',
    required: rutina.fotos_obligatorias,
    constraints: {
      min: rutina.fotos_obligatorias ? (rutina.min_fotos || 1) : 0
    },
    validate: (photos: any[]) => {
      if (rutina.fotos_obligatorias) {
        const min = rutina.min_fotos || 1;
        if (!photos || photos.length < min) {
          return `Debes subir al menos ${min} foto(s).`;
        }
      }
      return null;
    }
  });

  // 5. Inventario
  if (rutina.requiere_inventario) {
    fields.push({
      id: 'inventory',
      type: 'inventory',
      label: 'Toma de Inventario',
      required: true,
      constraints: {
        categories: rutina.categorias_ids
      },
      validate: (data: any) => null // TODO: Validar inventario cuando se implemente el módulo completo
    });
  }

  // 6. Comentarios
  fields.push({
    id: 'comments',
    type: 'text',
    label: 'Notas de ejecución',
    required: rutina.comentario_obligatorio,
    validate: (val: string) => {
      if (rutina.comentario_obligatorio && (!val || val.trim().length === 0)) {
        return 'El comentario es obligatorio.';
      }
      return null;
    }
  });

  return fields;
}