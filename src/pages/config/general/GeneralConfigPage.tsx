import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AbsenceTypesList } from "./AbsenceTypesList";
import { MeasurementUnitsList } from "./MeasurementUnitsList";
import { Settings2, Scale, CalendarOff } from "lucide-react";

export default function GeneralConfigPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight">Parametrización</h2>
        <p className="text-muted-foreground">Configura los maestros y listas desplegables del sistema.</p>
      </div>

      <Tabs defaultValue="absences" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="absences"><CalendarOff className="w-4 h-4 mr-2"/> Novedades</TabsTrigger>
          <TabsTrigger value="units"><Scale className="w-4 h-4 mr-2"/> Unidades</TabsTrigger>
        </TabsList>

        <TabsContent value="absences" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Novedades</CardTitle>
              <CardDescription>
                Define los tipos de ausencias que pueden registrar los empleados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AbsenceTypesList />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Unidades de Medida</CardTitle>
              <CardDescription>
                Estándares de medición para los productos del inventario.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MeasurementUnitsList />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}