// ... existing imports

export default function AssignmentList() {
  // ... existing code

  // Helper for CSV Injection Prevention
  const sanitizeForCsv = (val: string | null | undefined): string => {
    if (!val) return "";
    let str = String(val).replace(/;/g, ',').trim(); // Replace delimiters
    
    // Prevent CSV Formula Injection
    if (str.length > 0 && ['=', '+', '-', '@'].includes(str[0])) {
      str = "'" + str;
    }
    return str;
  };

  const downloadTemplate = async () => {
    setIsDownloading(true);
    try {
      // ... existing data fetching ...

      // 6. Construir CSV
      // ... existing headers ...

      let csvContent = headers.join(";") + "\n";
      const maxRows = Math.max(routines?.length || 0, pdvs?.length || 0, 2); 

      for (let i = 0; i < maxRows; i++) {
        const parts = [];

        // BLOQUE 1: DATOS DE CARGA
        if (i === 0) {
          // ... 
          parts.push(sanitizeForCsv(routines?.[0]?.nombre || "Nombre Rutina"));
          parts.push(sanitizeForCsv(pdvs?.[0]?.codigo_interno || "CODIGO"));
        } else {
          parts.push(""); parts.push("");
        }

        // GAP 1
        parts.push(""); parts.push(""); parts.push("");

        // BLOQUE 2: REFERENCIA RUTINAS
        if (routines && i < routines.length) {
          parts.push(sanitizeForCsv(routines[i].nombre));
          parts.push(sanitizeForCsv(routines[i].frecuencia));
        } else {
          parts.push(""); parts.push("");
        }

        // GAP 2
        parts.push(""); parts.push(""); parts.push("");

        // BLOQUE 3: REFERENCIA PDVS
        if (pdvs && i < pdvs.length) {
          const p = pdvs[i];
          const responsable = responsibleMap.get(p.id) || "Sin asignar";
          
          parts.push(sanitizeForCsv(p.codigo_interno));
          parts.push(sanitizeForCsv(`${p.nombre} (${p.ciudad})`));
          parts.push(sanitizeForCsv(responsable));
        } else {
          parts.push(""); parts.push(""); parts.push("");
        }

        csvContent += parts.join(";") + "\n";
      }

      // ... existing download logic ...

    } catch (error: any) {
      // ... existing error handling ...
    } finally {
      setIsDownloading(false);
    }
  };

  // ... rest of file
}