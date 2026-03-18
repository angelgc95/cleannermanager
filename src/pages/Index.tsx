import { useEffect, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n/LanguageProvider";
import Dashboard from "./Dashboard";

const Index = forwardRef<HTMLDivElement>(function Index(_props, _ref) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">{t("Loading...")}</div>;
  if (!user) return null;

  return <Dashboard />;
});

export default Index;
