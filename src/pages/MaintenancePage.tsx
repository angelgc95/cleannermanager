import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X, Camera, Loader2 } from "lucide-react";

export default function MaintenancePage() {
  const { user, orgId } = useAuth();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [issue, setIssue] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchTickets = async () => {
    const { data } = await supabase
      .from("maintenance_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setTickets(data || []);
  };

  useEffect(() => { fetchTickets(); }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 2 - photos.length;
    const toAdd = files.slice(0, remaining).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `maintenance/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("checklist-photos").upload(path, file);
    if (error) return null;
    const { data } = supabase.storage.from("checklist-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setUploading(true);

    let pic1_url: string | null = null;
    let pic2_url: string | null = null;

    if (photos[0]) pic1_url = await uploadPhoto(photos[0].file);
    if (photos[1]) pic2_url = await uploadPhoto(photos[1].file);

    const currentOrgId = orgId;
    const { error } = await supabase.from("maintenance_tickets").insert([{
      created_by_user_id: user.id,
      issue,
      pic1_url,
      pic2_url,
      org_id: currentOrgId,
    }]);

    setUploading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ticket created" });
      setShowForm(false);
      setIssue("");
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      fetchTickets();
    }
  };

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Report and track maintenance issues"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Report Issue</>}
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label>Issue Description</Label>
                  <Textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe the issue" required />
                </div>
                <div className="space-y-2">
                  <Label>Photos (max 2)</Label>
                  <div className="flex gap-3">
                    {photos.map((p, i) => (
                      <div key={i} className="relative h-20 w-20 rounded-md overflow-hidden border border-border">
                        <img src={p.preview} alt="" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {photos.length < 2 && (
                      <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted/50 transition-colors">
                        <Camera className="h-5 w-5" />
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                      </label>
                    )}
                  </div>
                </div>
                <Button type="submit" disabled={uploading}>
                  {uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</> : "Submit"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {tickets.map((t: any) => (
          <Card key={t.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{t.issue}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
              {(t.pic1_url || t.pic2_url) && (
                <div className="flex gap-2">
                  {t.pic1_url && <img src={t.pic1_url} alt="" className="h-16 w-16 rounded-md object-cover border border-border" />}
                  {t.pic2_url && <img src={t.pic2_url} alt="" className="h-16 w-16 rounded-md object-cover border border-border" />}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {tickets.length === 0 && !showForm && <p className="text-center text-muted-foreground py-8">No maintenance tickets yet.</p>}
      </div>
    </div>
  );
}
