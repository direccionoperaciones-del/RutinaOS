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
 * 
 * REGLA DE ORO: Si el flag de configuración es false, el campo NO se agrega.
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

  // 3. Archivos (Solo si archivo_obligatorio es true)
  if (rutina.archivo_obligatorio) {
    fields.push({
      id: 'files',
      type: 'file',
      label: 'Documentos Adjuntos',
      required: true,
      validate: (files: any[]) => {
        if (!files || files.length === 0) {
          return 'Debes adjuntar al menos un documento.';
        }
        return null;
      }
    });
  }

  // 4. Fotos (Solo si fotos_obligatorias es true)
  if (rutina.fotos_obligatorias) {
    // Si está habilitado, respetamos el min_fotos. Si es 0 o null, asumimos 1 por defecto al ser "obligatorias".
    const min = (rutina.min_fotos && rutina.min_fotos > 0) ? rutina.min_fotos : 1;
    
    fields.push({
      id: 'photos',
      type: 'photo',
      label: 'Evidencia Fotográfica',
      required: true,
      constraints: { min },
      validate: (photos: any[]) => {
        if (!photos || photos.length < min) {
          return `Debes subir al menos ${min} foto(s).`;
        }
        return null;
      }
    });
  }

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
      // TODO: Implementar validación real de inventario cuando exista el módulo
      validate: (data: any) => null 
    });
  }

  // 6. Comentarios (Solo si comentario_obligatorio es true)
  if (rutina.comentario_obligatorio) {
    fields.push({
      id: 'comments',
      type: 'text',
      label: 'Notas de ejecución',
      required: true,
      validate: (val: string) => {
        if (!val || val.trim().length === 0) {
          return 'El comentario es obligatorio.';
        }
        return null;
      }
    });
  } 
  // Opcional: Si queremos mostrar comentarios siempre como opcional si no es obligatorio
  // Se puede agregar un 'else' aquí, pero según la regla estricta "Si no está seleccionado no se muestra", lo omitimos.
  // Sin embargo, es común dejar un campo de notas opcional siempre. 
  // Para cumplir estrictamente tu pedido de "No debe aparecer si no está seleccionado", lo dejo dentro del if.

  return fields;
}