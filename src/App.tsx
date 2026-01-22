import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider"; // Importar
import DashboardLayout from "./components/layouts/DashboardLayout";
import Login from "./pages/Login";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import PDVList from "./pages/config/pdv/PDVList";
import InventoryPage from "./pages/config/inventory/InventoryPage";
import RoutineList from "./pages/config/routines/RoutineList";
import AssignmentList from "./pages/config/assignments/AssignmentList";
import UsersList from "./pages/config/users/UsersList";
import AbsencesPage from "./pages/config/absences/AbsencesPage";
import CalendarPage from "./pages/config/calendar/CalendarPage";
import GeneralConfigPage from "./pages/config/general/GeneralConfigPage";
import CommandCenter from "./pages/ops/CommandCenter";
import TasksList from "./pages/ops/TasksList";
import AuditList from "./pages/control/audit/AuditList";
import SystemAuditLog from "./pages/control/audit/SystemAuditLog";
import MessageList from "./pages/ops/messages/MessageList";
import GalleryPage from "./pages/control/gallery/GalleryPage";
import ReportsPage from "./pages/control/reports/ReportsPage";
import SettingsPage from "./pages/config/SettingsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="movacheck-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Index />} />
              
              {/* Ops Routes */}
              <Route path="tasks" element={<TasksList />} />
              <Route path="messages" element={<MessageList />} />
              <Route path="command-center" element={<CommandCenter />} />
              
              {/* Control Routes */}
              <Route path="audit" element={<AuditList />} />
              <Route path="system-audit" element={<SystemAuditLog />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="reports" element={<ReportsPage />} />
              
              {/* Config Routes */}
              <Route path="config/pdv" element={<PDVList />} />
              <Route path="config/inventory" element={<InventoryPage />} />
              <Route path="config/routines" element={<RoutineList />} />
              <Route path="config/assignments" element={<AssignmentList />} />
              <Route path="config/general" element={<GeneralConfigPage />} />
              <Route path="config/users" element={<UsersList />} />
              <Route path="config/absences" element={<AbsencesPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              
              <Route path="settings" element={<SettingsPage />} />
              
              <Route path="personnel" element={<UsersList />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;