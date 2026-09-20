import { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AccountDetailPage } from "./pages/AccountDetailPage";
import { ApiDocsPage } from "./pages/ApiDocsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EnhancementSuitePage } from "./pages/EnhancementSuitePage";
import { EquifaxGatewaySimulationPage } from "./pages/EquifaxGatewaySimulationPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";
import { RemediationPage } from "./pages/RemediationPage";
import { ReportDetailPage } from "./pages/ReportDetailPage";
import { ReportInspectorPage } from "./pages/ReportInspectorPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SharedReportPage } from "./pages/SharedReportPage";
import { SignupPage } from "./pages/SignupPage";
import { StatutoryRegistryPage } from "./pages/StatutoryRegistryPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** "/" is the public marketing landing page for a signed-out visitor, and
 * the dashboard for a signed-in one — rather than splitting them across
 * two URLs, so a bookmark or shared link to "/" always does the right
 * thing for whoever opens it. */
function HomeRoute() {
  const { user } = useAuth();
  return user ? <DashboardPage /> : <LandingPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Public, unauthenticated — a shared report link has no logged-in
          user, so this must sit outside RequireAuth. */}
      <Route path="/shared/:token" element={<SharedReportPage />} />
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/reports/:id"
        element={
          <RequireAuth>
            <ReportDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reports/:id/inspector"
        element={
          <RequireAuth>
            <ReportInspectorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/accounts/:id"
        element={
          <RequireAuth>
            <AccountDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reconciliation"
        element={
          <RequireAuth>
            <ReconciliationPage />
          </RequireAuth>
        }
      />
      <Route
        path="/remediate/:step"
        element={
          <RequireAuth>
            <RemediationPage />
          </RequireAuth>
        }
      />
      <Route path="/remediate" element={<Navigate to="/remediate/1" replace />} />
      <Route
        path="/registry"
        element={
          <RequireAuth>
            <StatutoryRegistryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/api-docs"
        element={
          <RequireAuth>
            <ApiDocsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/equifax-gateway"
        element={
          <RequireAuth>
            <EquifaxGatewaySimulationPage />
          </RequireAuth>
        }
      />
      <Route
        path="/enhancement-suite"
        element={
          <RequireAuth>
            <EnhancementSuitePage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
