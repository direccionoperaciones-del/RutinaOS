import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, RefreshCw } from "lucide-react";
import { NewMessageModal } from "./NewMessageModal";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMessages } from "./hooks/useMessages";
import { MessageFilters } from "./components/MessageFilters";
import { InboxList } from "./components/InboxList";
import { SentList } from "./components/SentList";
import { ReadDetailsDialog } from "./components/ReadDetailsDialog";

export default function MessageList() {
  const { profile } = useCurrentUser();
  const { inboxMessages, sentMessages, loading, refreshMessages, markAsRead, confirmReceipt } = useMessages();
  
  // Modal states
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [readDetailsOpen, setReadDetailsOpen] = useState(false);
  const [selectedSentMessageId, setSelectedSentMessageId] = useState<string | null>(null);

  // Filter states
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  const canCreate = ['director', 'lider', 'superadmin'].includes(profile?.role || '');

  // Filter Logic
  const filteredInbox = inboxMessages.filter(msg => {
    if (filterType !== 'all') {
      if (filterType === 'comunicado' && msg.tipo !== 'comunicado') return false;
      if (filterType === 'mensaje' && msg.tipo !== 'mensaje') return false;
      if (filterType === 'sistema' && (msg.source === 'message' || msg.tipo === 'comunicado' || msg.tipo === 'mensaje')) return false;
    }
    
    if (filterPriority !== 'all' && msg.prioridad !== filterPriority) return false;
    
    if (filterDateFrom && msg.created_at < `${filterDateFrom}T00:00:00`) return false;
    if (filterDateTo && msg.created_at > `${filterDateTo}T23:59:59`) return false;
    
    return true;
  });

  const clearFilters = () => {
    setFilterType("all");
    setFilterPriority("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const hasActiveFilters = filterType !== 'all' || filterPriority !== 'all' || filterDateFrom || filterDateTo;

  const handleViewDetails = (msg: any) => {
    setSelectedSentMessageId(msg.id);
    setReadDetailsOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Centro de Mensajes</h2>
          <p className="text-muted-foreground">Bandeja de entrada y notificaciones del sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refreshMessages()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-2">Actualizar</span>
          </Button>
          {canCreate && (
            <Button onClick={() => setIsNewModalOpen(true)}>
              <Send className="w-4 h-4 mr-2" /> Redactar
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="inbox" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="inbox" className="flex gap-2">
            <Mail className="w-4 h-4" /> Recibidos
            {inboxMessages.some(m => !m.leido_at) && (
              <Badge variant="destructive" className="h-2 w-2 rounded-full p-0" />
            )}
          </TabsTrigger>
          {canCreate && (
            <TabsTrigger value="sent" className="flex gap-2">
              <Send className="w-4 h-4" /> Enviados
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="inbox" className="mt-4 space-y-4">
          <MessageFilters 
            filterType={filterType} setFilterType={setFilterType}
            filterPriority={filterPriority} setFilterPriority={setFilterPriority}
            dateFrom={filterDateFrom} setDateFrom={setFilterDateFrom}
            dateTo={filterDateTo} setDateTo={setFilterDateTo}
            onClear={clearFilters}
            hasActiveFilters={!!hasActiveFilters}
          />
          <InboxList 
            messages={filteredInbox} 
            loading={loading} 
            onOpenMessage={markAsRead}
            onConfirm={confirmReceipt}
          />
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <SentList messages={sentMessages} onViewDetails={handleViewDetails} />
        </TabsContent>
      </Tabs>

      <ReadDetailsDialog 
        open={readDetailsOpen} 
        onOpenChange={setReadDetailsOpen} 
        messageId={selectedSentMessageId} 
      />

      <NewMessageModal 
        open={isNewModalOpen} 
        onOpenChange={setIsNewModalOpen} 
        onSuccess={() => refreshMessages()} 
      />
    </div>
  );
}