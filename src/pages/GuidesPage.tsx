import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { FileText, FolderOpen } from "lucide-react";

export default function GuidesPage() {
  const [folders, setFolders] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data: f } = await supabase.from("guides_folders").select("*").order("name");
      const { data: g } = await supabase.from("guides").select("*").order("title");
      setFolders(f || []);
      setGuides(g || []);
    };
    fetch();
  }, []);

  const guidesByFolder = folders.map((f) => ({
    ...f,
    guides: guides.filter((g) => g.folder_id === f.id),
  }));

  return (
    <div>
      <PageHeader title="Guides" description="Standard operating procedures and reference documents" />
      <div className="p-6 space-y-4 max-w-2xl">
        {guidesByFolder.length === 0 && <p className="text-center text-muted-foreground py-8">No guides uploaded yet.</p>}
        {guidesByFolder.map((folder) => (
          <Card key={folder.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                {folder.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {folder.guides.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guides in this folder.</p>
              ) : (
                <div className="space-y-2">
                  {folder.guides.map((g: any) => (
                    <a
                      key={g.id}
                      href={g.pdf_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span>{g.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
