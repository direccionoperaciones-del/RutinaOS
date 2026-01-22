import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit, Package, Layers, Download, Upload, Loader2 } from "lucide-react";
import { CategoryForm } from "./CategoryForm";
import { ProductForm } from "./ProductForm";
import { useToast } from "@/hooks/use-toast";

export default function InventoryPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  
  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Bulk Upload State
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCategories = async () => {
    const { data } = await supabase.from('inventory_categories').select('*').order('nombre');
    if (data) setCategories(data);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('inventory_products').select('*, inventory_categories(nombre)').order('nombre');
    if (data) setProducts(data);
  };

  useEffect(() => {
    fetchCategories();
    fetchProducts();
  }, []);

  const handleEditCategory = (cat: any) => {
    setSelectedItem(cat);
    setIsCategoryModalOpen(true);
  };

  const handleEditProduct = (prod: any) => {
    setSelectedItem(prod);
    setIsProductModalOpen(true);
  };

  // --- LOGICA DE PLANTILLA Y CARGA MASIVA ---

  const downloadTemplate = async () => {
    setIsDownloading(true);
    try {
      let fileName = "";
      let csvContent = "";
      const bom = "\uFEFF"; 

      if (activeTab === 'categories') {
        // Plantilla Categorías
        const headers = ["NOMBRE", "CODIGO (OPCIONAL)"];
        csvContent = bom + headers.join(";") + "\n" + "Bebidas;BEB\nSnacks;SNK";
        fileName = "plantilla_categorias.csv";
      } else {
        // Plantilla Productos (Con referencia de categorías y unidades)
        // 1. Obtener Categorías
        const { data: cats } = await supabase.from('inventory_categories').select('nombre').eq('activo', true).order('nombre');
        
        // 2. Obtener Unidades
        const { data: units } = await supabase.from('measurement_units').select('simbolo, nombre').eq('activo', true).order('nombre');

        const headers = [
          "NOMBRE_PRODUCTO", 
          "SKU", 
          "UNIDAD (USAR SIMBOLO)", 
          "NOMBRE_CATEGORIA", 
          "", 
          "--- CATEGORIAS (REF) ---",
          "--- UNIDADES (REF) ---"
        ];
        
        // Construir filas
        const maxRows = Math.max(cats?.length || 0, units?.length || 0, 2);
        let rows = "";
        
        // Fila ejemplo (Fila 0 de datos)
        // Usamos la primera unidad disponible si existe, sino 'UND'
        const exUnit = units && units.length > 0 ? units[0].simbolo : "UND";
        const exCat = cats && cats.length > 0 ? cats[0].nombre : "Bebidas";

        // Referencias de la primera fila
        const refCat0 = cats && cats.length > 0 ? cats[0].nombre : "";
        const refUnit0 = units && units.length > 0 ? `${units[0].simbolo} (${units[0].nombre})` : "";

        rows += `Coca Cola 1.5L;CC15;${exUnit};${exCat};;${refCat0};${refUnit0}\n`;

        for (let i = 1; i < maxRows; i++) {
           const catName = cats && i < cats.length ? cats[i].nombre : "";
           const unitName = units && i < units.length ? `${units[i].simbolo} (${units[i].nombre})` : "";
           
           // Filas siguientes: Datos vacíos, solo referencias en col F y G
           rows += `;;;;;${catName};${unitName}\n`;
        }
        
        csvContent = bom + headers.join(";") + "\n" + rows;
        fileName = "plantilla_productos.csv";
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Plantilla descargada", description: `Usa ';' como separador.` });

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (text) await processBatch(text);
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const processBatch = async (csvText: string) => {
    try {
      const lines = csvText.split(/\r?\n/);
      const rows = lines.slice(1).filter(line => line.trim() !== '');
      if (rows.length === 0) throw new Error("Archivo vacío");

      const separator = lines[0].includes(';') ? ';' : ',';
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (!profile?.tenant_id) throw new Error("Sin tenant");

      let successCount = 0;
      let errors: string[] = [];

      if (activeTab === 'categories') {
        // --- PROCESAR CATEGORIAS ---
        for (let i = 0; i < rows.length; i++) {
          const cols = rows[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
          const nombre = cols[0];
          const codigo = cols[1] || null;

          if (!nombre) continue;

          // Verificar si ya existe para no duplicar (Opcional, la BD tiene unique constraint)
          // Intentamos insertar
          const { error } = await supabase.from('inventory_categories').insert({
            tenant_id: profile.tenant_id,
            nombre,
            codigo,
            activo: true
          });

          if (error) {
             // 23505 = unique_violation
             if (error.code === '23505') errors.push(`Fila ${i+2}: Categoría "${nombre}" ya existe.`);
             else errors.push(`Fila ${i+2}: Error - ${error.message}`);
          } else {
            successCount++;
          }
        }
        fetchCategories();

      } else {
        // --- PROCESAR PRODUCTOS ---
        // 1. Cargar mapa de categorías
        const { data: cats } = await supabase.from('inventory_categories').select('id, nombre').eq('tenant_id', profile.tenant_id);
        const catMap = new Map();
        cats?.forEach(c => catMap.set(c.nombre.toLowerCase().trim(), c.id));

        for (let i = 0; i < rows.length; i++) {
          const cols = rows[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
          // Ignorar filas donde el nombre del producto esté vacío (pueden ser las filas de referencia)
          if (!cols[0]) continue;

          const nombre = cols[0];
          const sku = cols[1] || `SKU-${Date.now()}-${i}`;
          const unidad = cols[2] || 'UND';
          const catName = cols[3];

          if (!catName) {
            errors.push(`Fila ${i+2}: Falta categoría para "${nombre}"`);
            continue;
          }

          const catId = catMap.get(catName.toLowerCase().trim());
          if (!catId) {
            errors.push(`Fila ${i+2}: Categoría "${catName}" no encontrada en el sistema.`);
            continue;
          }

          const { error } = await supabase.from('inventory_products').insert({
            tenant_id: profile.tenant_id,
            categoria_id: catId,
            nombre,
            codigo_sku: sku,
            unidad,
            activo: true
          });

          if (error) {
             if (error.code === '23505') errors.push(`Fila ${i+2}: Producto/SKU ya existe.`);
             else errors.push(`Fila ${i+2}: Error - ${error.message}`);
          } else {
            successCount++;
          }
        }
        fetchProducts();
      }

      if (errors.length > 0) {
        toast({ 
          variant: "default", 
          title: "Carga finalizada con observaciones", 
          description: `Importados: ${successCount}. Errores: ${errors.length}` 
        });
        alert(`Errores:\n${errors.slice(0,10).join('\n')}\n...`);
      } else {
        toast({ title: "Éxito", description: `Se importaron ${successCount} registros.` });
      }

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error crítico", description: error.message });
    }
  };

  const filteredCategories = categories.filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredProducts = products.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.codigo_sku?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight">Inventarios</h2>
          <p className="text-muted-foreground">Gestiona el catálogo de productos y categorías para las rutinas.</p>
        </div>
        
        {/* BOTONES DE ACCION GLOBAL */}
        <div className="flex gap-2 w-full sm:w-auto">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".csv,.txt" 
            onChange={handleFileUpload} 
          />
          
          <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={isDownloading} title={`Descargar plantilla de ${activeTab === 'products' ? 'productos' : 'categorías'}`}>
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />} 
            Plantilla
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading} title={`Cargar ${activeTab === 'products' ? 'productos' : 'categorías'} masivamente`}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />} 
            Importar
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="products"><Package className="w-4 h-4 mr-2"/> Productos</TabsTrigger>
            <TabsTrigger value="categories"><Layers className="w-4 h-4 mr-2"/> Categorías</TabsTrigger>
          </TabsList>
        </div>

        {/* CONTENIDO PRODUCTOS */}
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle>Productos</CardTitle>
                <CardDescription>Items individuales que se cuentan en las rutinas.</CardDescription>
              </div>
              <Button onClick={() => { setSelectedItem(null); setIsProductModalOpen(true); }}>
                <Plus className="w-4 h-4 mr-2"/> Nuevo Producto
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center py-4">
                <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                <Input 
                  placeholder="Buscar producto..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((prod) => (
                    <TableRow key={prod.id}>
                      <TableCell className="font-mono text-xs">{prod.codigo_sku || '-'}</TableCell>
                      <TableCell className="font-medium">{prod.nombre}</TableCell>
                      <TableCell>{prod.inventory_categories?.nombre}</TableCell>
                      <TableCell>{prod.unidad}</TableCell>
                      <TableCell>
                        <Badge variant={prod.activo ? "default" : "secondary"}>
                          {prod.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEditProduct(prod)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                        No hay productos registrados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONTENIDO CATEGORÍAS */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle>Categorías</CardTitle>
                <CardDescription>Agrupadores para organizar los productos.</CardDescription>
              </div>
              <Button onClick={() => { setSelectedItem(null); setIsCategoryModalOpen(true); }}>
                <Plus className="w-4 h-4 mr-2"/> Nueva Categoría
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center py-4">
                <Search className="w-4 h-4 mr-2 text-muted-foreground" />
                <Input 
                  placeholder="Buscar categoría..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-mono text-xs">{cat.codigo || '-'}</TableCell>
                      <TableCell className="font-medium">{cat.nombre}</TableCell>
                      <TableCell>
                        <Badge variant={cat.activo ? "default" : "secondary"}>
                          {cat.activo ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEditCategory(cat)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                   {filteredCategories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        No hay categorías registradas.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CategoryForm 
        open={isCategoryModalOpen} 
        onOpenChange={setIsCategoryModalOpen}
        categoryToEdit={selectedItem}
        onSuccess={fetchCategories}
      />

      <ProductForm 
        open={isProductModalOpen} 
        onOpenChange={setIsProductModalOpen}
        productToEdit={selectedItem}
        onSuccess={fetchProducts}
      />
    </div>
  );
}