import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Edit, Package, Layers } from "lucide-react";
import { CategoryForm } from "./CategoryForm";
import { ProductForm } from "./ProductForm";
import { useToast } from "@/hooks/use-toast";

export default function InventoryPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

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

  const filteredCategories = categories.filter(c => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredProducts = products.filter(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || p.codigo_sku?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Inventarios</h2>
        <p className="text-muted-foreground">Gestiona el catálogo de productos y categorías para las rutinas.</p>
      </div>

      <Tabs defaultValue="products" className="w-full">
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