import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
// ... existing imports

export default function GalleryPage() {
  const { toast } = useToast();
  const [evidences, setEvidences] = useState<any[]>([]);
  // ... existing state

  // Cache specifically for signed URLs to prevent flickering/refetching
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // ... fetchEvidences logic remains the same ...

  // New effect to generate signed URLs when evidences change
  useEffect(() => {
    const generateUrls = async () => {
      const newUrls: Record<string, string> = {};
      
      const promises = evidences.map(async (ev) => {
        if (!signedUrls[ev.storage_path]) {
          const { data } = await supabase.storage
            .from('evidence')
            .createSignedUrl(ev.storage_path, 3600); // Valid for 1 hour
            
          if (data?.signedUrl) {
            newUrls[ev.storage_path] = data.signedUrl;
          }
        }
      });

      await Promise.all(promises);
      
      if (Object.keys(newUrls).length > 0) {
        setSignedUrls(prev => ({ ...prev, ...newUrls }));
      }
    };

    if (evidences.length > 0) {
      generateUrls();
    }
  }, [evidences]);

  const getImageUrl = (path: string) => {
    // Fallback to placeholder while loading or if failed
    return signedUrls[path] || "https://placehold.co/400x400?text=Loading...";
  };

  // ... rest of the component
  // Update the img tags to use the new getImageUrl
  // <img src={getImageUrl(evidence.storage_path)} ... />
  
  return (
    // ... existing JSX
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {evidences.map((evidence) => (
        <Card 
          key={evidence.id} 
          className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
          onClick={() => setSelectedImage(evidence)}
        >
          <div className="aspect-square relative bg-muted">
            <img 
              src={getImageUrl(evidence.storage_path)} 
              alt={evidence.filename}
              className="object-cover w-full h-full"
              loading="lazy"
            />
            {/* ... */}
          </div>
          {/* ... */}
        </Card>
      ))}
    </div>
    // ... existing JSX
  );
}