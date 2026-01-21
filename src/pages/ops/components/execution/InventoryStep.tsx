import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InventoryStepProps {
  categoriesIds: string[];
  onChange: (data: any[]) => void;
}

export function InventoryStep({ categoriesIds, onChange }: InventoryStepProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estado local para los conteos: { [productId]: { fisico: string, esperado: string } }
  const [counts, setCounts] = useState<Record<string, { fisico: string, esperado: string }>>({});

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      if (categoriesIds.length === 0) {
        setProducts([]);
        setLoading(false);
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

      if (data) {
        setProducts(data);
        // Inicializar conteos vacíos
        const initialCounts: any = {};
        data.forEach(p => {
          initialCounts[p.id] = { fisico: "", esperado: "" };
        });
        setCounts(initialCounts);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [categoriesIds]);

  // Agrupar productos por categoría
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
    const submissionData = Object.entries(newCounts).map(([pid, val]) => {
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

  // Cálculos de Totales
  const totalItems = products.length;
  // Item contado si tiene al menos uno de los dos valores
  const itemsCounted = Object.values(counts).filter(c => c.fisico !== "" || c.esperado !== "").length;
  
  const totalDiff = Object.values(counts).reduce((acc, curr) => {
    const fis = curr.fisico === "" ? 0 : Number(curr.fisico);
    const esp = curr.esperado === "" ? 0 : Number(curr.esperado);
    return acc + (fis - esp);
  }, 0);

  // Lista de productos con diferencias para el footer
  const productsWithDiff = products.filter(p => {
    const c = counts[p.id];
    if (!c || (c.fisico === "" && c.esperado === "")) return false;
    const fis = c.fisico === "" ? 0 : Number(c.fisico);
    const esp = c.esperado === "" ? 0 : Number(c.esperado);
    return (fis - esp) !== 0;
  });

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
          
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40%]">Producto</TableHead>
                <TableHead className="w-[10%] text-center">Unidad</TableHead>
                <TableHead className="w-[20%] text-center bg-blue-50/50 text-blue-800 border-r border-l border-blue-100">
                  Físico
                </TableHead>
                <TableHead className="w-[20%] text-center bg-gray-50 text-gray-800">
                  Sistema
                </TableHead>
                <TableHead className="w-[10%] text-right">Dif.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((prod) => {
                const count = counts[prod.id] || { fisico: "", esperado: "" };
                const fisNum = count.fisico === "" ? 0 : Number(count.fisico);
                const espNum = count.esperado === "" ? 0 : Number(count.esperado);
                const diff = fisNum - espNum;
                
                // Mostrar diferencia solo si se han ingresado datos
                const showDiff = count.fisico !== "" && count.esperado !== "";

                return (
                  <TableRow key={prod.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-xs py-2">
                      <div className="line-clamp-2">{prod.nombre}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{prod.codigo_sku}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground text-center py-2">{prod.unidad}</TableCell>
                    
                    {/* Input Físico */}
                    <TableCell className="p-1 bg-blue-50/30 border-r border-l border-blue-100">
                      <Input 
                        type="number" 
                        min="0"
                        className="h-8 text-center bg-white border-blue-200 focus-visible:ring-blue-400 font-medium"
                        placeholder="0"
                        value={count.fisico}
                        onChange={(e) => handleInputChange(prod.id, 'fisico', e.target.value)}
                      />
                    </TableCell>
                    
                    {/* Input Sistema (Editable) */}
                    <TableCell className="p-1 bg-gray-50/50">
                      <Input 
                        type="number" 
                        min="0"
                        className="h-8 text-center bg-white border-gray-200 focus-visible:ring-gray-400"
                        placeholder="0"
                        value={count.esperado}
                        onChange={(e) => handleInputChange(prod.id, 'esperado', e.target.value)}
                      />
                    </TableCell>
                    
                    {/* Diferencia */}
                    <TableCell className="text-right py-2">
                      {showDiff ? (
                        <span className={`text-xs font-bold px-2 py-1 rounded ${
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
        </Card>
      ))}

      {/* Footer Totalizador Mejorado */}
      <div className="sticky bottom-0 bg-background border-t p-4 rounded-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10 flex flex-col gap-3">
        
        {/* Detalle de diferencias (Scrollable si hay muchas) */}
        {productsWithDiff.length > 0 && (
           <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar border-b pb-2">
             <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Detalle de Diferencias</p>
             {productsWithDiff.map(p => {
               const c = counts[p.id];
               const diff = (c.fisico === "" ? 0 : Number(c.fisico)) - (c.esperado === "" ? 0 : Number(c.esperado));
               
               return (
                 <div key={p.id} className="flex justify-between items-center text-xs py-0.5">
                   <span className="truncate font-medium text-foreground/80 w-3/4">{p.nombre}</span>
                   <span className={`font-bold ${diff < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                     {diff > 0 ? '+' : ''}{diff}
                   </span>
                 </div>
               )
             })}
           </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <div className="flex gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Progreso:</span>
              <span className="font-bold ml-1">{itemsCounted} / {totalItems}</span>
            </div>
            {itemsCounted < totalItems && (
              <div className="text-orange-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Incompleto
              </div>
            )}
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