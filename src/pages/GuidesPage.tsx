import { useEffect, useState, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, FolderOpen, Plus, Trash2, Pencil, Upload, Loader2, X, Image, Video, File,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function getFileIcon(url: string) {
  const lower = url.toLowerCase();
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return <Image className="h-4 w-4 text-primary shrink-0" />;
  if (lower.match(/\.(mp4|mov|avi|webm)$/)) return <Video className="h-4 w-4 text-primary shrink-0" />;
  if (lower.match(/\.pdf$/)) return <FileText className="h-4 w-4 text-primary shrink-0" />;
  return <File className="h-4 w-4 text-primary shrink-0" />;
}

export default function GuidesPage() {
  const { role, orgId, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin" || role === "manager";

  const [folders, setFolders] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);

  // Folder CRUD
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<any>(null);
  const [folderName, setFolderName] = useState("");

  // Guide upload
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [guideTitle, setGuideTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit guide
  const [editingGuide, setEditingGuide] = useState<any>(null);
  const [editGuideTitle, setEditGuideTitle] = useState("");

  const fetchData = async () => {
    const [{ data: f }, { data: g }] = await Promise.all([
      supabase.from("guides_folders").select("*").order("name"),
      supabase.from("guides").select("*").order("title"),
    ]);
    setFolders(f || []);
    setGuides(g || []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const guidesByFolder = folders.map((f) => ({
    ...f,
    guides: guides.filter((g) => g.folder_id === f.id),
  }));

  // Folder handlers
  const openNewFolder = () => {
    setEditingFolder(null);
    setFolderName("");
    setFolderDialogOpen(true);
  };

  const openEditFolder = (folder: any) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDialogOpen(true);
  };

  const saveFolder = async () => {
    if (!folderName.trim() || !orgId) return;
    if (editingFolder) {
      await supabase.from("guides_folders").update({ name: folderName.trim() }).eq("id", editingFolder.id);
      toast({ title: "Folder updated" });
    } else {
      await supabase.from("guides_folders").insert({ name: folderName.trim(), org_id: orgId });
      toast({ title: "Folder created" });
    }
    setFolderDialogOpen(false);
    fetchData();
  };

  const deleteFolder = async (folderId: string) => {
    // Delete all guides in folder first
    const folderGuides = guides.filter((g) => g.folder_id === folderId);
    for (const g of folderGuides) {
      if (g.pdf_url) {
        const path = g.pdf_url.split("/guides/")[1];
        if (path) await supabase.storage.from("guides").remove([path]);
      }
      await supabase.from("guides").delete().eq("id", g.id);
    }
    await supabase.from("guides_folders").delete().eq("id", folderId);
    toast({ title: "Folder deleted" });
    fetchData();
  };

  // Guide handlers
  const handleUpload = async () => {
    if (!selectedFile || !guideTitle.trim() || !uploadFolderId || !orgId || !user) return;
    setUploading(true);

    const ext = selectedFile.name.split(".").pop();
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("guides")
      .upload(path, selectedFile, { contentType: selectedFile.type });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("guides").getPublicUrl(uploadData.path);

    const { error } = await supabase.from("guides").insert({
      title: guideTitle.trim(),
      folder_id: uploadFolderId,
      pdf_url: urlData.publicUrl,
      uploaded_by_user_id: user.id,
      org_id: orgId,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "File uploaded" });
    }

    setUploadFolderId(null);
    setGuideTitle("");
    setSelectedFile(null);
    setUploading(false);
    fetchData();
  };

  const deleteGuide = async (guide: any) => {
    if (guide.pdf_url) {
      const path = guide.pdf_url.split("/guides/")[1];
      if (path) await supabase.storage.from("guides").remove([path]);
    }
    await supabase.from("guides").delete().eq("id", guide.id);
    toast({ title: "Guide deleted" });
    fetchData();
  };

  const saveGuideEdit = async () => {
    if (!editingGuide || !editGuideTitle.trim()) return;
    await supabase.from("guides").update({ title: editGuideTitle.trim() }).eq("id", editingGuide.id);
    toast({ title: "Guide updated" });
    setEditingGuide(null);
    fetchData();
  };

  return (
    <div>
      <PageHeader
        title="Guides"
        description="Standard operating procedures and reference documents"
        actions={
          isAdmin ? (
            <Button size="sm" onClick={openNewFolder}>
              <Plus className="h-4 w-4 mr-1" /> New Folder
            </Button>
          ) : undefined
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        {guidesByFolder.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No guides uploaded yet.</p>
        )}
        {guidesByFolder.map((folder) => (
          <Card key={folder.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  {folder.name}
                </CardTitle>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditFolder(folder)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setUploadFolderId(folder.id); setGuideTitle(""); setSelectedFile(null); }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete folder "{folder.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete the folder and all {folder.guides.length} file(s) inside it.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteFolder(folder.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Upload form for this folder */}
              {isAdmin && uploadFolderId === folder.id && (
                <div className="mb-3 p-3 bg-muted/50 rounded-lg space-y-2">
                  <Input
                    placeholder="File title"
                    value={guideTitle}
                    onChange={(e) => setGuideTitle(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {selectedFile ? selectedFile.name : "Choose file"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!selectedFile || !guideTitle.trim() || uploading}
                      onClick={handleUpload}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUploadFolderId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi,.webm"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </div>
              )}

              {folder.guides.length === 0 ? (
                <p className="text-sm text-muted-foreground">No guides in this folder.</p>
              ) : (
                <div className="space-y-1">
                  {folder.guides.map((g: any) => (
                    <div key={g.id} className="flex items-center gap-2 group">
                      <a
                        href={g.pdf_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm flex-1 min-w-0"
                      >
                        {g.pdf_url ? getFileIcon(g.pdf_url) : <FileText className="h-4 w-4 text-primary shrink-0" />}
                        <span className="truncate">{g.title}</span>
                      </a>
                      {isAdmin && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setEditingGuide(g); setEditGuideTitle(g.title); }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{g.title}"?</AlertDialogTitle>
                                <AlertDialogDescription>This file will be permanently removed.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteGuide(g)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Folder create/edit dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFolder ? "Edit Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Folder Name</Label>
            <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Bathroom, Towel Folding" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveFolder} disabled={!folderName.trim()}>
              {editingFolder ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guide edit dialog */}
      <Dialog open={!!editingGuide} onOpenChange={(open) => !open && setEditingGuide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Guide Title</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={editGuideTitle} onChange={(e) => setEditGuideTitle(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGuide(null)}>Cancel</Button>
            <Button onClick={saveGuideEdit} disabled={!editGuideTitle.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
