import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { LanguageProvider, useI18n } from "@/i18n/LanguageProvider";
import Auth from "./pages/Auth";
import OnboardingPage from "./pages/OnboardingPage";
import CompleteCleanerProfilePage from "./pages/CompleteCleanerProfilePage";
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
import CleanerSettingsPage from "./pages/CleanerSettingsPage";
import CleanerAppAccessPage from "./pages/CleanerAppAccessPage";
import NotFound from "./pages/NotFound";
import { isNativeCleanerApp } from "@/lib/appVariant";

const queryClient = new QueryClient();

function LoadingScreen() {
  const { t } = useI18n();
  return <div className="flex items-center justify-center min-h-screen text-muted-foreground">{t("Loading...")}</div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role, profileComplete } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isNativeCleanerApp() && role === "host") return <Navigate to="/cleaner-app-only" replace />;
  if (!role) return <Navigate to="/onboarding" replace />;
  if (role === "cleaner" && !profileComplete) return <Navigate to="/complete-profile" replace />;
  return <>{children}</>;
}

function SettingsRoute() {
  const { role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (isNativeCleanerApp()) return <CleanerSettingsPage />;
  if (role === "cleaner") return <CleanerSettingsPage />;
  return <SettingsPage />;
}

function OnboardingRoute() {
  const { user, loading, role } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (isNativeCleanerApp()) return <CleanerAppAccessPage />;
  if (role) return <Navigate to="/" replace />;
  return <OnboardingPage />;
}

function CompleteProfileRoute() {
  const { user, loading, role, profileComplete } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!role) return <Navigate to="/onboarding" replace />;
  if (role !== "cleaner") return <Navigate to="/" replace />;
  if (profileComplete) return <Navigate to="/" replace />;
  return <CompleteCleanerProfilePage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/cleaner-app-only" element={<CleanerAppAccessPage />} />
              <Route path="/onboarding" element={<OnboardingRoute />} />
              <Route path="/complete-profile" element={<CompleteProfileRoute />} />
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
                <Route path="/events/:id" element={<TaskDetailPage />} />
                <Route path="/events/:eventId/checklist" element={<ChecklistRunPage />} />
                <Route path="/hours" element={<LogHoursPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/maintenance" element={<MaintenancePage />} />
                <Route path="/shopping" element={<ShoppingPage />} />
                <Route path="/payouts" element={<PayoutsPage />} />
                <Route path="/guides" element={<GuidesPage />} />
                <Route path="/settings" element={<SettingsRoute />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
