import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package } from "lucide-react";
import { Card } from "@/components/ui/card";

interface InventoryStepProps {
  categoriesIds: string[];
  savedData?: any[]; 
  onChange: (data: any[]) => void;
}

export function InventoryStep({ categoriesIds, savedData, onChange }: InventoryStepProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, { fisico: string, esperado: string }>>({});
  
  // Ref para controlar si ya inicializamos con los datos guardados y evitar re-renders por cambios de referencia
  const dataInitialized = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const fetchProductsAndInit = async () => {
      setLoading(true);
      
      if (!categoriesIds || categoriesIds.length === 0) {
        if (isMounted) {
          setProducts([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from('inventory_products')
        .select(`
          id, 
          nombre, 
          unidad, 
          codigo_sku, 
          categoria_id,
          inventory_categories (nombre)
        `)
        .in('categoria_id', categoriesIds)
        .eq('activo', true)
        .order('nombre');

      if (data && isMounted) {
        setProducts(data);
        
        // Inicializar conteos basados en savedData (SOLO UNA VEZ o cuando cambian los productos)
        const initialCounts: any = {};
        const savedMap = new Map();
        
        if (savedData && savedData.length > 0) {
          savedData.forEach(row => {
            savedMap.set(row.producto_id, { fisico: row.fisico, esperado: row.esperado });
          });
        }

        data.forEach(p => {
          const saved = savedMap.get(p.id);
          if (saved) {
             initialCounts[p.id] = { 
                 fisico: saved.fisico !== null ? String(saved.fisico) : "", 
                 esperado: saved.esperado !== null ? String(saved.esperado) : "0" 
             };
          } else {
             initialCounts[p.id] = { fisico: "", esperado: "" };
          }
        });
        
        setCounts(initialCounts);
        dataInitialized.current = true;
      }
      
      if (isMounted) setLoading(false);
    };

    fetchProductsAndInit();

    return () => { isMounted = false; };
  }, [JSON.stringify(categoriesIds)]); 

  const groupedProducts = useMemo(() => {
    const groups: Record<string, any[]> = {};
    products.forEach(p => {
      const catName = p.inventory_categories?.nombre || 'Sin Categoría';
      if (!groups[catName]) groups[catName] = [];
      groups[catName].push(p);
    });
    return groups;
  }, [products]);

  const handleInputChange = (productId: string, field: 'fisico' | 'esperado', value: string) => {
    // Permitir vacío o números
    if (value !== "" && isNaN(Number(value))) return;

    const current = counts[productId] || { fisico: "", esperado: "" };
    const newCounts = {
      ...counts,
      [productId]: { 
        ...current, 
        [field]: value 
      }
    };
    setCounts(newCounts);

    // Preparar datos para el padre
    const submissionData = Object.entries(newCounts).map(([pid, val]: any) => {
      const fis = val.fisico === "" ? 0 : Number(val.fisico);
      const esp = val.esperado === "" ? 0 : Number(val.esperado);
      
      return {
        producto_id: pid,
        fisico: fis,
        esperado: esp,
        diferencia: fis - esp
      };
    });
    
    onChange(submissionData);
  };

  const totalItems = products.length;
  const itemsCounted = Object.values(counts).filter((c: any) => c.fisico !== "" || c.esperado !== "").length;
  
  const totalDiff = Object.values(counts).reduce((acc: number, curr: any) => {
    const fis = curr.fisico === "" ? 0 : Number(curr.fisico);
    const esp = curr.esperado === "" ? 0 : Number(curr.esperado);
    return acc + (fis - esp);
  }, 0);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  if (products.length === 0) return <div className="p-4 text-center text-muted-foreground bg-muted/20 rounded">No hay productos asociados a las categorías seleccionadas.</div>;

  return (
    <div className="space-y-6">
      {Object.entries(groupedProducts).map(([category, items]) => (
        <Card key={category} className="overflow-hidden border-none shadow-sm bg-muted/10">
          <div className="bg-primary/5 px-4 py-2 border-b border-primary/10 flex justify-between items-center">
            <h4 className="font-semibold text-sm text-primary flex items-center gap-2">
              <Package className="w-4 h-4" /> {category}
            </h4>
            <Badge variant="outline" className="text-[10px] bg-background">{items.length} items</Badge>
          </div>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent text-[10px] sm:text-xs">
                  <TableHead className="w-[30%] min-w-[100px]">Producto</TableHead>
                  <TableHead className="w-[10%] text-center p-1">Unid</TableHead>
                  <TableHead className="w-[25%] min-w-[70px] text-center bg-blue-50/50 text-blue-800 border-r border-l border-blue-100 p-1">
                    Físico
                  </TableHead>
                  <TableHead className="w-[25%] min-w-[70px] text-center bg-gray-50 text-gray-800 p-1">
                    Sistema
                  </TableHead>
                  <TableHead className="w-[10%] text-right p-1">Dif.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((prod) => {
                  const count = counts[prod.id] || { fisico: "", esperado: "" };
                  const fisNum = count.fisico === "" ? 0 : Number(count.fisico);
                  const espNum = count.esperado === "" ? 0 : Number(count.esperado);
                  const diff = fisNum - espNum;
                  const showDiff = count.fisico !== "" && count.esperado !== "";

                  return (
                    <TableRow key={prod.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-[10px] sm:text-xs py-2 leading-tight">
                        <div className="line-clamp-2">{prod.nombre}</div>
                        <div className="text-[9px] text-muted-foreground font-mono mt-0.5">{prod.codigo_sku}</div>
                      </TableCell>
                      <TableCell className="text-[10px] sm:text-xs text-muted-foreground text-center py-2 px-1">{prod.unidad}</TableCell>
                      <TableCell className="p-1 bg-blue-50/30 border-r border-l border-blue-100">
                        <Input 
                          type="number" 
                          min="0"
                          className="h-8 text-center bg-white border-blue-200 focus-visible:ring-blue-400 font-medium text-xs px-1"
                          placeholder="0"
                          value={count.fisico}
                          onChange={(e) => handleInputChange(prod.id, 'fisico', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="p-1 bg-gray-50/50">
                        <Input 
                          type="number" 
                          min="0"
                          className="h-8 text-center bg-white border-gray-200 focus-visible:ring-gray-400 text-xs px-1"
                          placeholder="0"
                          value={count.esperado}
                          onChange={(e) => handleInputChange(prod.id, 'esperado', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right py-2 px-1">
                        {showDiff ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            diff < 0 ? 'text-red-600 bg-red-100' : 
                            diff > 0 ? 'text-blue-600 bg-blue-100' : 
                            'text-gray-500 bg-gray-100'
                          }`}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ))}

      <div className="sticky bottom-0 bg-background border-t p-4 rounded-lg shadow-sm z-10 flex flex-col gap-3">
        <div className="flex justify-between items-center pt-1">
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Progreso:</span>
              <span className="font-bold ml-1">{itemsCounted} / {totalItems}</span>
            </div>
          </div>
          <div className="text-sm flex items-center gap-2">
            <span className="text-muted-foreground font-medium">Total Diferencia:</span>
            <Badge variant={totalDiff === 0 ? "outline" : totalDiff < 0 ? "destructive" : "default"} className="text-sm px-2">
              {totalDiff > 0 ? '+' : ''}{totalDiff}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}