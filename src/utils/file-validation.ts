export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_DOC_TYPES = [
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain'
];

// Map of MIME types to their Magic Number validators (Hex signatures)
const SIGNATURES: Record<string, (header: string) => boolean> = {
  'image/jpeg': (h) => h.startsWith('FFD8FF'),
  'image/png': (h) => h.startsWith('89504E47'),
  'image/webp': (h) => h.startsWith('52494646') && h.slice(16, 24) === '57454250', // RIFF....WEBP
  'application/pdf': (h) => h.startsWith('25504446'), // %PDF
  'application/msword': (h) => h.startsWith('D0CF11E0'), // Legacy Office (OLE CF)
  'application/vnd.ms-excel': (h) => h.startsWith('D0CF11E0'), // Legacy Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (h) => h.startsWith('504B0304'), // ZIP (OpenXML)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (h) => h.startsWith('504B0304'), // ZIP (OpenXML)
};

/**
 * Validates file type using both MIME type string and strict binary magic numbers.
 * This prevents extension spoofing (e.g. .exe renamed to .jpg or .php renamed to .png).
 */
export async function validateFileSecurity(file: File, type: 'foto' | 'archivo'): Promise<{ valid: boolean; error?: string }> {
  const allowedTypes = type === 'foto' ? ALLOWED_IMAGE_TYPES : [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];
  
  // 1. Basic MIME check (based on extension/browser detection)
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `Tipo de archivo no permitido: ${file.type}` };
  }

  // Text files don't have consistent magic numbers, but we can check they aren't executables
  if (file.type === 'text/plain') {
    try {
      const buffer = await file.slice(0, 2).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (bytes.length >= 2) {
        const header = bytes[0].toString(16).toUpperCase().padStart(2, '0') + bytes[1].toString(16).toUpperCase().padStart(2, '0');
        // Block MZ header (Executables) just in case someone tries to bypass
        if (header === '4D5A') {
           return { valid: false, error: "Archivo ejecutable detectado." };
        }
      }
    } catch (e) { /* ignore read error for empty files */ }
    return { valid: true };
  }

  // 2. Strict Magic Number Check (Allowlist)
  try {
    // Read first 12 bytes (enough for WebP which checks bytes 0-4 and 8-12)
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let header = "";
    
    // Convert to Hex String
    for (let i = 0; i < bytes.length; i++) {
      header += bytes[i].toString(16).toUpperCase().padStart(2, '0');
    }

    const validator = SIGNATURES[file.type];
    
    if (validator) {
      if (!validator(header)) {
        return { 
          valid: false, 
          error: `El contenido del archivo no coincide con su extensión (${file.type}). Posible archivo corrupto o manipulado.` 
        };
      }
    } else {
      // Fallback: If we don't have a validator for an allowed type (shouldn't happen with current list)
      console.warn(`[Security] No signature validator for allowed type: ${file.type}`);
    }

    return { valid: true };
  } catch (e) {
    console.error("Error validando archivo:", e);
    return { valid: false, error: "Error leyendo el archivo para validación de seguridad." };
  }
}