import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import OnboardingPage from "./pages/OnboardingPage";
import Index from "./pages/Index";
import CalendarPage from "./pages/CalendarPage";
import TasksPage from "./pages/TasksPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import ChecklistRunPage from "./pages/ChecklistRunPage";
import LogHoursPage from "./pages/LogHoursPage";
import ExpensesPage from "./pages/ExpensesPage";
import MaintenancePage from "./pages/MaintenancePage";
import ShoppingPage from "./pages/ShoppingPage";
import PayoutsPage from "./pages/PayoutsPage";
import GuidesPage from "./pages/GuidesPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, orgId } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  // If logged in but no org, send to onboarding
  if (!orgId) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  if (role === "cleaner") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function OnboardingRoute() {
  const { user, loading, orgId } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (orgId) return <Navigate to="/" replace />;
  return <OnboardingPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<OnboardingRoute />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Index />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/tasks/:id" element={<TaskDetailPage />} />
              <Route path="/tasks/:taskId/checklist" element={<ChecklistRunPage />} />
              <Route path="/hours" element={<LogHoursPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/shopping" element={<ShoppingPage />} />
              <Route path="/payouts" element={<PayoutsPage />} />
              <Route path="/guides" element={<GuidesPage />} />
              <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
