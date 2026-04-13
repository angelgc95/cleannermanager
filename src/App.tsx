import { Suspense, lazy, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { LanguageProvider, useI18n } from "@/i18n/LanguageProvider";
import { isNativeCleanerApp } from "@/lib/appVariant";

const queryClient = new QueryClient();
const Auth = lazy(() => import("./pages/Auth"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const CompleteCleanerProfilePage = lazy(() => import("./pages/CompleteCleanerProfilePage"));
const Index = lazy(() => import("./pages/Index"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const TaskDetailPage = lazy(() => import("./pages/TaskDetailPage"));
const ChecklistRunPage = lazy(() => import("./pages/ChecklistRunPage"));
const LogHoursPage = lazy(() => import("./pages/LogHoursPage"));
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const ShoppingPage = lazy(() => import("./pages/ShoppingPage"));
const PayoutsPage = lazy(() => import("./pages/PayoutsPage"));
const GuidesPage = lazy(() => import("./pages/GuidesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const CleanerSettingsPage = lazy(() => import("./pages/CleanerSettingsPage"));
const CleanerAppAccessPage = lazy(() => import("./pages/CleanerAppAccessPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

function LoadingScreen() {
  const { t } = useI18n();
  return <div className="flex items-center justify-center min-h-screen text-muted-foreground">{t("Loading...")}</div>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
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
            <Suspense fallback={<LoadingScreen />}>
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
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
