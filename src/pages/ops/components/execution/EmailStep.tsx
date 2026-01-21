import { Checkbox } from "@/components/ui/checkbox";
import { Mail } from "lucide-react";

interface EmailStepProps {
  requiresSend: boolean;
  requiresRespond: boolean;
  sentConfirmed: boolean;
  respondedConfirmed: boolean;
  onUpdate: (field: 'sent' | 'responded', value: boolean) => void;
}

export function EmailStep({ 
  requiresSend, 
  requiresRespond, 
  sentConfirmed, 
  respondedConfirmed, 
  onUpdate 
}: EmailStepProps) {
  
  if (!requiresSend && !requiresRespond) return null;

  return (
    <div className="p-4 rounded-lg border bg-blue-50/50 border-blue-100 space-y-4">
      <h4 className="font-semibold flex items-center gap-2 text-sm text-blue-900">
        <Mail className="w-4 h-4" /> Gestión de Correos
      </h4>
      
      {requiresSend && (
        <div className="flex items-start space-x-2">
          <Checkbox 
            id="chk-send-email" 
            checked={sentConfirmed}
            onCheckedChange={(c) => onUpdate('sent', !!c)}
          />
          <div className="grid gap-1.5 leading-none">
            <label htmlFor="chk-send-email" className="text-sm font-medium leading-none cursor-pointer">
              Confirmar envío de correo
            </label>
            <p className="text-sm text-muted-foreground">He enviado el correo solicitado.</p>
          </div>
        </div>
      )}

      {requiresRespond && (
        <div className="flex items-start space-x-2">
          <Checkbox 
            id="chk-respond-email"
            checked={respondedConfirmed}
            onCheckedChange={(c) => onUpdate('responded', !!c)}
          />
          <div className="grid gap-1.5 leading-none">
            <label htmlFor="chk-respond-email" className="text-sm font-medium leading-none cursor-pointer">
              Confirmar respuesta de correo
            </label>
            <p className="text-sm text-muted-foreground">He respondido los correos pendientes.</p>
          </div>
        </div>
      )}
    </div>
  );
}