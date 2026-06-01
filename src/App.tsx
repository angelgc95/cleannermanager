import { Suspense, lazy, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { LanguageProvider, useI18n } from "@/i18n/LanguageProvider";
import { isNativeCleanerApp } from "@/lib/appVariant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, MailWarning, UserCheck } from "lucide-react";

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

function CleanerInviteAccessMessage({ signedIn = false }: { signedIn?: boolean }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleCleanerSignIn = async () => {
    if (signedIn) {
      await supabase.auth.signOut();
    }
    navigate("/auth?cleaner=1", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              {signedIn ? (
                <UserCheck className="h-6 w-6 text-primary-foreground" />
              ) : (
                <MailWarning className="h-6 w-6 text-primary-foreground" />
              )}
            </div>
          </div>
          <CardTitle className="text-2xl">
            {signedIn ? t("Cleaner setup only") : t("Cleaner invitation expired")}
          </CardTitle>
          <CardDescription>
            {signedIn
              ? t("This page is only for invited cleaner accounts.")
              : t("This cleaner invitation is expired or already used.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t("Ask your host to resend the cleaner invitation from the cleaner list.")}
          </div>
          <Button className="w-full gap-2" variant={signedIn ? "outline" : "default"} onClick={handleCleanerSignIn}>
            {signedIn && <LogOut className="h-4 w-4" />}
            {signedIn ? t("Sign out and use the cleaner invite") : t("Sign in as cleaner")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function CompleteProfileRoute() {
  const { user, loading, role, profileComplete } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <CleanerInviteAccessMessage />;
  if (!role) return <CleanerInviteAccessMessage signedIn />;
  if (role !== "cleaner") return <CleanerInviteAccessMessage signedIn />;
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
