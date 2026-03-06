import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import Auth from "@/pages/Auth";
import NotFound from "@/pages/NotFound";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

import ConsoleLayout from "@/v1/layouts/ConsoleLayout";
import FieldLayout from "@/v1/layouts/FieldLayout";

import OverviewPage from "@/v1/console/OverviewPage";
import HierarchyPage from "@/v1/console/HierarchyPage";
import ListingsPage from "@/v1/console/ListingsPage";
import PeopleRolesPage from "@/v1/console/PeopleRolesPage";
import AssignmentsPage from "@/v1/console/AssignmentsPage";
import OperationsCalendarPage from "@/v1/console/OperationsCalendarPage";
import ConsoleEventDetailPage from "@/v1/console/ConsoleEventDetailPage";
import TemplatesPage from "@/v1/console/TemplatesPage";
import AutomationsPage from "@/v1/console/AutomationsPage";
import OperationsInboxPage from "@/v1/console/OperationsInboxPage";
import QAReviewPage from "@/v1/console/QAReviewPage";
import ReportsPage from "@/v1/console/ReportsPage";
import IntegrationsPage from "@/v1/console/IntegrationsPage";
import NotificationsPage from "@/v1/shared/NotificationsPage";

import TodayPage from "@/v1/field/TodayPage";
import FieldCalendarPage from "@/v1/field/FieldCalendarPage";
import ChecklistLandingPage from "@/v1/field/ChecklistLandingPage";
import FieldEventDetailPage from "@/v1/field/FieldEventDetailPage";
import ChecklistWizardPage from "@/v1/field/ChecklistWizardPage";
import ExtrasPage from "@/v1/field/ExtrasPage";
import GuidesPage from "@/v1/field/GuidesPage";

const queryClient = new QueryClient();

function LoadingScreen() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Outlet />;
}

function RoleHomeRedirect() {
  const { loading, canAccessConsole, canAccessField, primaryRole } = useAuth();
  if (loading) return <LoadingScreen />;

  if (canAccessConsole) return <Navigate to="/console" replace />;
  if (canAccessField) return <Navigate to="/field" replace />;

  return (
    <div className="mx-auto mt-16 max-w-xl rounded border border-border bg-card p-6 text-sm">
      <h1 className="mb-2 text-lg font-semibold">Foundation v1</h1>
      <p className="text-muted-foreground">
        You are signed in, but no v1 role assignment is available yet.
      </p>
      <p className="mt-2 text-muted-foreground">
        Current role: <span className="font-medium">{primaryRole || "none"}</span>
      </p>
    </div>
  );
}

function RequireConsoleRole() {
  const { loading, canAccessConsole } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!canAccessConsole) return <Navigate to="/field" replace />;
  return <Outlet />;
}

function RequireFieldRole() {
  const { loading, canAccessField } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!canAccessField) return <Navigate to="/console" replace />;
  return <Outlet />;
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />

              <Route element={<RequireAuth />}>
                <Route path="/" element={<RoleHomeRedirect />} />

                <Route element={<RequireConsoleRole />}>
                  <Route path="/console" element={<ConsoleLayout />}>
                    <Route index element={<OverviewPage />} />
                    <Route path="hierarchy" element={<HierarchyPage />} />
                    <Route path="listings" element={<ListingsPage />} />
                    <Route path="people" element={<PeopleRolesPage />} />
                    <Route path="assignments" element={<AssignmentsPage />} />
                    <Route path="operations" element={<OperationsCalendarPage />} />
                    <Route path="inbox" element={<OperationsInboxPage />} />
                    <Route path="qa" element={<QAReviewPage />} />
                    <Route path="events/:eventId" element={<ConsoleEventDetailPage />} />
                    <Route path="templates" element={<TemplatesPage />} />
                    <Route path="automations" element={<AutomationsPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="integrations" element={<IntegrationsPage />} />
                    <Route
                      path="notifications"
                      element={<NotificationsPage title="Console Notifications" eventHrefPrefix="/console/events" />}
                    />
                  </Route>
                </Route>

                <Route element={<RequireFieldRole />}>
                  <Route path="/field" element={<FieldLayout />}>
                    <Route index element={<TodayPage />} />
                    <Route path="calendar" element={<FieldCalendarPage />} />
                    <Route path="checklist" element={<ChecklistLandingPage />} />
                    <Route path="events/:eventId" element={<FieldEventDetailPage />} />
                    <Route path="events/:eventId/checklist" element={<ChecklistWizardPage />} />
                    <Route path="extras" element={<ExtrasPage />} />
                    <Route path="guides" element={<GuidesPage />} />
                    <Route
                      path="notifications"
                      element={<NotificationsPage title="Field Notifications" eventHrefPrefix="/field/events" />}
                    />
                  </Route>
                </Route>

                <Route path="/legacy" element={<Navigate to="/" replace />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
