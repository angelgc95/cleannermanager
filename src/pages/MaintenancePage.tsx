import { useEffect, useState, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, X, Camera, Loader2, Trash2 } from "lucide-react";

const MaintenancePage = forwardRef<HTMLDivElement>(function MaintenancePage(_props, _ref) {
  const { user, hostId, role } = useAuth();
  const { toast } = useToast();
  const isHost = role === "host";
  const [tickets, setTickets] = useState<any[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, { pic1?: string; pic2?: string }>>({});
  const [showForm, setShowForm] = useState(false);
  const [issue, setIssue] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const generateSignedUrls = async (ticketList: any[]) => {
    const urlMap: Record<string, { pic1?: string; pic2?: string }> = {};
    const promises: Promise<void>[] = [];

    for (const t of ticketList) {
      if (!t.pic1_url && !t.pic2_url) continue;
      const entry: { pic1?: string; pic2?: string } = {};
      urlMap[t.id] = entry;

      if (t.pic1_url) {
        promises.push(
          supabase.storage.from("checklist-photos").createSignedUrl(t.pic1_url, 3600)
            .then(({ data }) => { if (data?.signedUrl) entry.pic1 = data.signedUrl; })
        );
      }
      if (t.pic2_url) {
        promises.push(
          supabase.storage.from("checklist-photos").createSignedUrl(t.pic2_url, 3600)
            .then(({ data }) => { if (data?.signedUrl) entry.pic2 = data.signedUrl; })
        );
      }
    }

    await Promise.all(promises);
    setSignedUrls(urlMap);
  };

  const fetchTickets = async () => {
    const { data } = await supabase.from("maintenance_tickets").select("*").order("created_at", { ascending: false }).limit(50);
    const list = data || [];
    setTickets(list);
    await generateSignedUrls(list);
  };

  useEffect(() => { fetchTickets(); }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 2 - photos.length;
    const toAdd = files.slice(0, remaining).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  };

  const uploadPhoto = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `maintenance/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("checklist-photos").upload(path, file);
    if (error) return null;
    return path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !hostId) return;
    setUploading(true);
    let pic1_url: string | null = null;
    let pic2_url: string | null = null;
    if (photos[0]) pic1_url = await uploadPhoto(photos[0].file);
    if (photos[1]) pic2_url = await uploadPhoto(photos[1].file);
    const { error } = await supabase.from("maintenance_tickets").insert([{
      created_by_user_id: user.id,
      issue,
      pic1_url,
      pic2_url,
      host_user_id: hostId,
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

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    const { error } = await supabase.from("maintenance_tickets").update({ status: newStatus as any }).eq("id", ticketId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, status: newStatus } : t));
    }
  };

  const handleDelete = async (ticketId: string) => {
    const { error } = await supabase.from("maintenance_tickets").delete().eq("id", ticketId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      toast({ title: "Ticket deleted" });
    }
  };

  return (
    <div>
      <PageHeader title="Maintenance" description="Report and track maintenance issues" actions={<Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Report Issue</>}</Button>} />
      <div className="p-6 space-y-4 max-w-2xl">
        {showForm && (
          <Card><CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1"><Label>Issue Description</Label><Textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe the issue" required /></div>
              <div className="space-y-2">
                <Label>Photos (max 2)</Label>
                <div className="flex gap-3">
                  {photos.map((p, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-md overflow-hidden border border-border">
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"><X className="h-3 w-3" /></button>
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
              <Button type="submit" disabled={uploading}>{uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</> : "Submit"}</Button>
            </form>
          </CardContent></Card>
        )}
        {tickets.map((t: any) => (
          <Card key={t.id}><CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{t.issue}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy")}</p>
              </div>
              {isHost ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={t.status} onValueChange={(val) => handleStatusChange(t.id, val)}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete ticket?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete this maintenance ticket.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(t.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <StatusBadge status={t.status} />
              )}
            </div>
            {(signedUrls[t.id]?.pic1 || signedUrls[t.id]?.pic2) && (
              <div className="flex gap-2">
                {signedUrls[t.id]?.pic1 && <img src={signedUrls[t.id].pic1} alt="" className="h-16 w-16 rounded-md object-cover border border-border" />}
                {signedUrls[t.id]?.pic2 && <img src={signedUrls[t.id].pic2} alt="" className="h-16 w-16 rounded-md object-cover border border-border" />}
              </div>
            )}
          </CardContent></Card>
        ))}
        {tickets.length === 0 && !showForm && <p className="text-center text-muted-foreground py-8">No maintenance tickets yet.</p>}
      </div>
    </div>
  );
});
export default MaintenancePage;
