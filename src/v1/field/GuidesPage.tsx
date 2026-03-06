import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/v1/lib/db";

type Guide = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export default function GuidesPage() {
  const { organizationId } = useAuth();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    const load = async () => {
      const { data } = await db
        .from("v1_guides")
        .select("id, title, body, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      const rows = (data || []) as Guide[];
      setGuides(rows);
      setActiveGuideId(rows[0]?.id || null);
    };
    load();
  }, [organizationId]);

  const activeGuide = guides.find((guide) => guide.id === activeGuideId) || null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Guides</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {guides.length === 0 && <p className="text-sm text-muted-foreground">No guides published yet.</p>}
          {guides.map((guide) => (
            <button
              key={guide.id}
              onClick={() => setActiveGuideId(guide.id)}
              className={`w-full rounded border px-3 py-2 text-left text-sm ${activeGuideId === guide.id ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className="font-medium">{guide.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(guide.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {activeGuide && (
        <Card>
          <CardHeader><CardTitle>{activeGuide.title}</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{activeGuide.body}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
