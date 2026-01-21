import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

interface InventoryStepProps {
  categoriesIds: string[];
  onChange: (data: any[]) => void;
}

export function InventoryStep({ categoriesIds, onChange }: InventoryStepProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estado local para los conteos: { [productId]: { fisico: number, esperado: number } }
  // Nota: "esperado" (Sistema) se asume 0 por defecto ya que no tenemos tabla de stock en vivo aún.
  const [counts, setCounts] = useState<Record<string, { fisico: string, esperado: number }>>({});

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
        // Inicializar conteos
        const initialCounts: any = {};
        data.forEach(p => {
          initialCounts[p.id] = { fisico: "", esperado: 0 }; // Esperado 0 por defecto
        });
        setCounts(initialCounts);
      }
      setLoading(false);
    };

    fetchProducts();
  }, [categoriesIds]); // Recargar si cambian las categorías (raro en ejecución, pero correcto)

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

  const handleInputChange = (productId: string, value: string) => {
    // Permitir vacío o números
    if (value !== "" && isNaN(Number(value))) return;

    const newCounts = {
      ...counts,
      [productId]: { 
        ...counts[productId], 
        fisico: value 
      }
    };
    setCounts(newCounts);

    // Preparar datos para el padre (array plano para guardar en BD)
    const submissionData = Object.entries(newCounts).map(([pid, val]) => ({
      producto_id: pid,
      fisico: val.fisico === "" ? 0 : Number(val.fisico),
      esperado: val.esperado,
      diferencia: (val.fisico === "" ? 0 : Number(val.fisico)) - val.esperado
    }));
    
    onChange(submissionData);
  };

  // Cálculos de Totales
  const totalItems = products.length;
  const itemsCounted = Object.values(counts).filter(c => c.fisico !== "").length;
  const totalDiff = Object.values(counts).reduce((acc, curr) => {
    const fis = curr.fisico === "" ? 0 : Number(curr.fisico);
    return acc + (fis - curr.esperado);
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
          
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[40%]">Producto</TableHead>
                <TableHead className="w-[15%]">Unidad</TableHead>
                <TableHead className="w-[15%] text-center bg-blue-50/50 text-blue-800">Físico</TableHead>
                <TableHead className="w-[15%] text-center">Sistema</TableHead>
                <TableHead className="w-[15%] text-right">Dif.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((prod) => {
                const count = counts[prod.id] || { fisico: "", esperado: 0 };
                const fisicoNum = count.fisico === "" ? 0 : Number(count.fisico);
                const diff = fisicoNum - count.esperado;
                
                return (
                  <TableRow key={prod.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-xs">
                      {prod.nombre}
                      <div className="text-[10px] text-muted-foreground font-mono">{prod.codigo_sku}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{prod.unidad}</TableCell>
                    <TableCell className="p-1 bg-blue-50/30">
                      <Input 
                        type="number" 
                        min="0"
                        className="h-8 text-center bg-white focus-visible:ring-blue-400"
                        placeholder="0"
                        value={count.fisico}
                        onChange={(e) => handleInputChange(prod.id, e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {count.esperado}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        diff < 0 ? 'text-red-600 bg-red-100' : 
                        diff > 0 ? 'text-blue-600 bg-blue-100' : 
                        'text-gray-400'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ))}

      {/* Footer Totalizador */}
      <div className="sticky bottom-0 bg-background border-t p-4 flex justify-between items-center rounded-lg shadow-sm">
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Progreso:</span>
            <span className="font-bold ml-1">{itemsCounted} / {totalItems}</span>
          </div>
          {itemsCounted < totalItems && (
            <div className="text-orange-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Faltan conteos
            </div>
          )}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Diferencia Total:</span>
          <Badge variant={totalDiff === 0 ? "outline" : totalDiff < 0 ? "destructive" : "default"}>
            {totalDiff > 0 ? '+' : ''}{totalDiff} Unidades
          </Badge>
        </div>
      </div>
    </div>
  );
}