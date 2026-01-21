import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, Loader2, Camera, Paperclip, FileText, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EvidenceStepProps {
  type: 'foto' | 'archivo';
  label: string;
  required: boolean;
  minCount?: number;
  files: any[];
  isUploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'foto' | 'archivo') => void;
  onDelete: (id: string, path: string) => void;
}

export function EvidenceStep({ 
  type, 
  label, 
  required, 
  minCount = 0, 
  files, 
  isUploading, 
  onUpload, 
  onDelete 
}: EvidenceStepProps) {
  
  const isPhoto = type === 'foto';
  const Icon = isPhoto ? Camera : Paperclip;
  
  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('evidence').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="p-4 rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold flex items-center gap-2 text-sm">
          <Icon className="w-4 h-4" /> {label}
        </h4>
        {required ? (
          <Badge variant="destructive" className="text-[10px]">
            {isPhoto && minCount > 0 ? `Mínimo ${minCount}` : 'Requerido'}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] bg-background">Opcional</Badge>
        )}
      </div>
      
      <div className="space-y-4">
        {/* Upload Area */}
        <div className="flex items-center justify-center w-full">
          <label 
            className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted/50 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {isUploading ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              ) : (
                <UploadCloud className="w-8 h-8 text-muted-foreground mb-2" />
              )}
              <p className="text-sm text-muted-foreground">
                {isUploading ? "Subiendo..." : isPhoto ? "Toca para foto" : "Toca para documento"}
              </p>
            </div>
            <input 
              type="file" 
              accept={isPhoto ? "image/*" : ".pdf,.doc,.docx,.xls,.xlsx,.txt"} 
              className="hidden" 
              onChange={(e) => onUpload(e, type)} 
              disabled={isUploading} 
            />
          </label>
        </div>

        {/* File List / Grid */}
        {files.length > 0 && (
          <div className={isPhoto ? "grid grid-cols-3 gap-2" : "space-y-2"}>
            {files.map(file => (
              isPhoto ? (
                // Photo Item
                <div key={file.id} className="relative group aspect-square rounded-md overflow-hidden border bg-background shadow-sm">
                  <img 
                    src={getPublicUrl(file.storage_path)} 
                    className="object-cover w-full h-full" 
                    alt="Evidencia"
                  />
                  <button 
                    onClick={() => onDelete(file.id, file.storage_path)}
                    className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                // File Item
                <div key={file.id} className="flex items-center justify-between p-2 bg-background border rounded text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-blue-500" />
                    <span className="truncate max-w-[200px]">{file.filename}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-destructive"
                    onClick={() => onDelete(file.id, file.storage_path)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}