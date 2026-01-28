export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_DOC_TYPES = [
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain'
];

/**
 * Validates file type using both MIME type string and binary magic numbers
 * to prevent extension spoofing (e.g. .exe renamed to .jpg)
 */
export async function validateFileSecurity(file: File, type: 'foto' | 'archivo'): Promise<{ valid: boolean; error?: string }> {
  const allowedTypes = type === 'foto' ? ALLOWED_IMAGE_TYPES : [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];
  
  // 1. Basic MIME check
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `Tipo de archivo no permitido: ${file.type}` };
  }

  // 2. Magic Number Check (Binary Header)
  try {
    const buffer = await file.slice(0, 4).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let header = "";
    for (let i = 0; i < bytes.length; i++) {
      header += bytes[i].toString(16).toUpperCase();
    }

    // Check for Executables (MZ = 4D 5A)
    if (header.startsWith("4D5A")) {
      return { valid: false, error: "Archivo ejecutable detectado. Por seguridad no se permite subir este archivo." };
    }

    // Optional: We could strictly enforce headers for images, 
    // but the executable check is the most critical security control here.
    
    return { valid: true };
  } catch (e) {
    console.error("Error validando archivo:", e);
    return { valid: false, error: "Error leyendo el archivo para validación de seguridad." };
  }
}