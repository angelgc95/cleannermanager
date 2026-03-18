import { useState, forwardRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, ShoppingCart, Package, Edit2, X, Check, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/i18n/LanguageProvider";

/* ─── types ─── */
interface Product { id: string; name: string; category: string | null; }
interface ShoppingItem {
  id: string; product_id: string; status: string; quantity_needed: number;
  note: string | null; created_at: string; created_by_user_id: string;
  created_from: string | null;
  checklist_run_id: string | null;
  host_user_id: string | null;
  submission_id: string | null;
  products?: { name: string; category: string | null } | null;
}
interface Submission {
  id: string; created_by_user_id: string; created_at: string; status: string; notes: string | null;
  host_user_id: string | null;
}
interface SubmissionView extends Submission {
  isSynthetic?: boolean;
}
interface SelectedProduct { productId: string; quantity: number; note: string; }

const SHOPPING_STATUS_OPTIONS = [
  { value: "MISSING", label: "Missing" },
  { value: "ORDERED", label: "Ordered" },
  { value: "BOUGHT", label: "Bought" },
  { value: "OK", label: "OK" },
] as const;

const getSubmissionStatusFromItems = (items: Pick<ShoppingItem, "status">[]) =>
  items.length === 0 || items.every((item) => item.status === "OK") ? "DONE" : "PENDING";

const getSyntheticSubmissionId = (item: ShoppingItem) =>
  item.checklist_run_id ? `checklist:${item.checklist_run_id}` : `checklist-item:${item.id}`;

const getItemsForSubmission = (submission: SubmissionView, items: ShoppingItem[]) =>
  submission.isSynthetic
    ? items.filter((item) => !item.submission_id && item.created_from === "CHECKLIST" && getSyntheticSubmissionId(item) === submission.id)
    : items.filter((item) => item.submission_id === submission.id);

const buildSubmissionViews = (submissions: Submission[], items: ShoppingItem[]): SubmissionView[] => {
  const syntheticMap = new Map<string, SubmissionView>();

  items
    .filter((item) => !item.submission_id && item.created_from === "CHECKLIST")
    .forEach((item) => {
      const syntheticId = getSyntheticSubmissionId(item);
      const existing = syntheticMap.get(syntheticId);
      const nextStatus = item.status === "OK" ? "DONE" : "PENDING";

      if (!existing) {
        syntheticMap.set(syntheticId, {
          id: syntheticId,
          created_by_user_id: item.created_by_user_id,
          created_at: item.created_at,
          status: nextStatus,
          notes: "Added from checklist",
          host_user_id: item.host_user_id,
          isSynthetic: true,
        });
        return;
      }

      existing.status = existing.status === "DONE" && nextStatus === "DONE" ? "DONE" : "PENDING";
      if (new Date(item.created_at).getTime() < new Date(existing.created_at).getTime()) {
        existing.created_at = item.created_at;
      }
    });

  const actualSubmissions: SubmissionView[] = submissions.map((submission) => ({
    ...submission,
    isSynthetic: false,
  }));

  return [...actualSubmissions, ...Array.from(syntheticMap.values())].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

/* ═══════════════════════════════════════════ */
const ShoppingPage = forwardRef<HTMLDivElement>(function ShoppingPage(_props, _ref) {
  const { user, hostId, role } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isAdmin = role === "host";

  const { data, isLoading: loading } = useQuery({
    queryKey: ["shopping-data"],
    queryFn: async () => {
      const [{ data: subsData }, { data: itemsData }, { data: productsData }] = await Promise.all([
        supabase.from("shopping_submissions").select("*").order("created_at", { ascending: true }),
        supabase.from("shopping_list").select("*, products(name, category)").order("created_at", { ascending: true }),
        supabase.from("products").select("*").eq("active", true).order("name"),
      ]);
      return {
        submissions: (subsData as Submission[]) || [],
        items: (itemsData as ShoppingItem[]) || [],
        products: (productsData as Product[]) || [],
      };
    },
  });

  const submissions = data?.submissions || [];
  const items = data?.items || [];
  const products = data?.products || [];

  const onRefresh = () => queryClient.invalidateQueries({ queryKey: ["shopping-data"] });

  if (loading) return <div className="p-6 text-muted-foreground">{t("Loading...")}</div>;

  return isAdmin
    ? <AdminShoppingView submissions={submissions} items={items} products={products} user={user} hostId={hostId} toast={toast} onRefresh={onRefresh} />
    : <CleanerShoppingView submissions={submissions} items={items} products={products} user={user} hostId={hostId} toast={toast} onRefresh={onRefresh} />;
});
export default ShoppingPage;

/* ═══════════════════════════════════════════
   CLEANER VIEW
   ═══════════════════════════════════════════ */
function CleanerShoppingView({ submissions, items, products, user, hostId, toast, onRefresh }: any) {
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submissionViews = buildSubmissionViews(submissions as Submission[], items as ShoppingItem[]);

  // My submissions (oldest first)
  const mySubs = submissionViews
    .filter((s) => s.created_by_user_id === user?.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const toggleProduct = (productId: string) => {
    setSelected((prev) => {
      const idx = prev.findIndex((s) => s.productId === productId);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { productId, quantity: 1, note: "" }];
    });
  };

  const updateQuantity = (productId: string, qty: number) => {
    setSelected((prev) => prev.map((s) => s.productId === productId ? { ...s, quantity: Math.max(1, qty) } : s));
  };

  const handleSubmit = async () => {
    if (!user || selected.length === 0) return;
    setSubmitting(true);

    // 1. Create submission
    const { data: sub, error: subErr } = await supabase
      .from("shopping_submissions")
      .insert({ created_by_user_id: user.id, host_user_id: hostId, status: "PENDING" } as any)
      .select("id")
      .single();

    if (subErr || !sub) {
      toast({ title: "Error", description: subErr?.message || "Failed to create submission", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // 2. Insert items linked to submission
    const rows = selected.map((s) => ({
      product_id: s.productId,
      created_by_user_id: user.id,
      status: "MISSING" as const,
      host_user_id: hostId,
      quantity_needed: s.quantity,
      note: s.note || null,
      created_from: "MANUAL" as const,
      submission_id: sub.id,
    }));
    const { error } = await supabase.from("shopping_list").insert(rows as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted!", description: `Shopping list with ${selected.length} item(s) submitted.` });
      setSelected([]);
    }
    setSubmitting(false);
    onRefresh();
  };

  const filtered = products.filter((p: Product) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc: Record<string, Product[]>, p: Product) => {
    const cat = p.category || "Other";
    (acc[cat] = acc[cat] || []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Shopping List" description="Select missing products and submit" />
      <div className="p-4 md:p-6 max-w-2xl space-y-6">
        {/* ── New Shopping List ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">New Shopping List</h2>
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-auto">{selected.length} selected</Badge>
            )}
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, prods]: [string, Product[]]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">{cat}</p>
                <div className="space-y-1">
                  {prods.map((p: Product) => {
                    const sel = selected.find((s) => s.productId === p.id);
                    return (
                      <Card key={p.id} className={sel ? "border-primary/50 bg-primary/5" : ""}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <Checkbox checked={!!sel} onCheckedChange={() => toggleProduct(p.id)} />
                          <span className="text-sm font-medium flex-1">{p.name}</span>
                          {sel && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Qty:</span>
                              <Input type="number" min={1} value={sel.quantity} onChange={(e) => updateQuantity(p.id, Number(e.target.value))} className="w-14 h-7 text-xs text-center" />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No products found.</p>}
          </div>

          {/* Cleaner: Add new product */}
          <Card className="border-dashed">
            <CardContent className="p-3 space-y-2">
              <p className="text-sm font-medium">Add New Product</p>
              <CleanerAddProduct hostId={hostId} onAdded={onRefresh} />
            </CardContent>
          </Card>

          {selected.length > 0 && (
            <Button onClick={handleSubmit} disabled={submitting} className="w-full mt-4 gap-2">
              <Send className="h-4 w-4" /> Submit {selected.length} item{selected.length !== 1 ? "s" : ""}
            </Button>
          )}
        </section>

        {/* ── My Submitted Lists ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Shopping Lists</h2>
            {mySubs.length > 0 && <Badge variant="outline">{mySubs.length}</Badge>}
          </div>

          {mySubs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No submitted lists yet.</p>
          ) : (
            <div className="space-y-2">
              {mySubs.map((sub) => (
                <SubmissionCard key={sub.id} submission={sub} items={getItemsForSubmission(sub, items as ShoppingItem[])} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Collapsible submission card (shared) ─── */
function SubmissionCard({ submission, items, actions }: { submission: SubmissionView; items: ShoppingItem[]; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { formatDate } = useI18n();
  const pendingCount = items.filter((i) => i.status !== "OK").length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardContent className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors">
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {formatDate(submission.created_at, "dd MMM yyyy, HH:mm")}
              </p>
              {submission.notes && (
                <p className="text-xs text-muted-foreground truncate">{submission.notes}</p>
              )}
              <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
            </div>
            {pendingCount > 0 && <Badge variant="destructive" className="text-[10px]">{pendingCount} pending</Badge>}
            <SubmissionStatusBadge status={submission.status} />
            {actions}
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-1">
                <div>
                  <span className="font-medium">{item.products?.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">× {item.quantity_needed}</span>
                  {item.note && <span className="text-muted-foreground text-xs ml-2">({item.note})</span>}
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ═══════════════════════════════════════════
   ADMIN VIEW
   ═══════════════════════════════════════════ */
function AdminShoppingView({ submissions, items, products, user, hostId, toast, onRefresh }: any) {
  const [clearing, setClearing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [adminSelected, setAdminSelected] = useState<SelectedProduct[]>([]);
  const [adminSearch, setAdminSearch] = useState("");

  // Product template management
  const [productSearch, setProductSearch] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState("");
  const [editProductCategory, setEditProductCategory] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("");

  const allSubs = buildSubmissionViews(submissions as Submission[], items as ShoppingItem[]);
  const pendingSubs = allSubs.filter((s) => s.status === "PENDING");
  const openItems = (items as ShoppingItem[]).filter((i) => ["MISSING", "ORDERED", "BOUGHT"].includes(i.status));

  const syncSubmissionStatus = async (submissionId: string | null) => {
    if (!submissionId) return;

    const { data: submissionItems } = await supabase
      .from("shopping_list")
      .select("status")
      .eq("submission_id", submissionId);

    const nextStatus = getSubmissionStatusFromItems((submissionItems as Pick<ShoppingItem, "status">[]) || []);
    await supabase.from("shopping_submissions").update({ status: nextStatus }).eq("id", submissionId);
  };

  const handleClearList = async () => {
    if (!user) return;
    setClearing(true);
    if (openItems.length > 0) {
      await supabase.from("shopping_list")
        .update({ status: "OK" as const, last_cleared_at: new Date().toISOString(), cleared_by_user_id: user.id })
        .in("id", openItems.map((i) => i.id));
      // Mark all pending submissions as DONE
      const subIds = [...new Set(openItems.map((i) => i.submission_id).filter(Boolean))];
      if (subIds.length > 0) {
        await supabase.from("shopping_submissions").update({ status: "DONE" }).in("id", subIds as string[]);
      }
    }
    toast({ title: "List cleared", description: `${openItems.length} items set to OK.` });
    setClearing(false);
    onRefresh();
  };

  const handleDeleteItem = async (id: string) => {
    const item = (items as ShoppingItem[]).find((entry) => entry.id === id);
    await supabase.from("shopping_list").delete().eq("id", id);
    if (item?.submission_id) {
      await syncSubmissionStatus(item.submission_id);
    }
    onRefresh();
  };

  const handleSaveEdit = async (id: string) => {
    await supabase.from("shopping_list").update({ quantity_needed: editQty }).eq("id", id);
    setEditingId(null);
    onRefresh();
  };

  const handleBulkStatusUpdate = async (submission: SubmissionView, itemIds: string[], nextStatus: string) => {
    if (itemIds.length === 0) return;

    await supabase
      .from("shopping_list")
      .update({ status: nextStatus as "MISSING" | "ORDERED" | "BOUGHT" | "OK" })
      .in("id", itemIds);

    if (!submission.isSynthetic) {
      await syncSubmissionStatus(submission.id);
    }

    toast({
      title: "Items updated",
      description: `${itemIds.length} item${itemIds.length !== 1 ? "s" : ""} set to ${nextStatus.toLowerCase()}.`,
    });
    onRefresh();
  };

  const handleDeleteSubmission = async (subId: string) => {
    await supabase.from("shopping_submissions").delete().eq("id", subId);
    onRefresh();
  };

  const toggleAdminProduct = (productId: string) => {
    setAdminSelected((prev) => {
      const idx = prev.findIndex((s) => s.productId === productId);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { productId, quantity: 1, note: "" }];
    });
  };

  const handleAdminAdd = async () => {
    if (!user || adminSelected.length === 0) return;
    // Create a submission for admin-added items too
    const { data: sub } = await supabase.from("shopping_submissions")
      .insert({ created_by_user_id: user.id, host_user_id: hostId, status: "PENDING" } as any)
      .select("id").single();
    if (!sub) return;
    const rows = adminSelected.map((s) => ({
      product_id: s.productId, created_by_user_id: user.id, status: "MISSING" as const,
      host_user_id: hostId, quantity_needed: s.quantity, created_from: "MANUAL" as const, submission_id: sub.id,
    }));
    await supabase.from("shopping_list").insert(rows as any);
    setAdminSelected([]);
    toast({ title: "Added", description: `${rows.length} item(s) added.` });
    onRefresh();
  };

  const filteredProducts = products.filter((p: Product) =>
    p.name.toLowerCase().includes(adminSearch.toLowerCase()) || (p.category || "").toLowerCase().includes(adminSearch.toLowerCase())
  );

  const templateProducts = (products as Product[]).filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.category || "").toLowerCase().includes(productSearch.toLowerCase())
  );

  const groupedTemplate = templateProducts.reduce((acc: Record<string, Product[]>, p: Product) => {
    const cat = p.category || "Other";
    (acc[cat] = acc[cat] || []).push(p);
    return acc;
  }, {});

  const handleAddProduct = async () => {
    if (!newProductName.trim()) return;
    await supabase.from("products").insert({ name: newProductName.trim(), category: newProductCategory.trim() || null, host_user_id: hostId, active: true } as any);
    setNewProductName("");
    setNewProductCategory("");
    toast({ title: "Product added" });
    onRefresh();
  };

  const handleSaveProduct = async (id: string) => {
    await supabase.from("products").update({ name: editProductName, category: editProductCategory || null }).eq("id", id);
    setEditingProductId(null);
    toast({ title: "Product updated" });
    onRefresh();
  };

  const handleDeleteProduct = async (id: string) => {
    await supabase.from("products").update({ active: false }).eq("id", id);
    toast({ title: "Product removed" });
    onRefresh();
  };

  return (
    <div>
      <PageHeader
        title="Shopping List"
        description="Manage all shopping submissions"
        actions={
          openItems.length > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={clearing}>
                  <Trash2 className="h-4 w-4" /> Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear shopping list?</AlertDialogTitle>
                  <AlertDialogDescription>Set {openItems.length} open item{openItems.length !== 1 ? "s" : ""} to OK.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearList}>Clear All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : undefined
        }
      />
      <div className="p-4 md:p-6 max-w-3xl">
        <Tabs defaultValue="lists">
          <TabsList className="mb-4">
            <TabsTrigger value="lists" className="gap-1.5">
              Shopping Lists
              {pendingSubs.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-[10px] px-1.5 rounded-full">
                  {pendingSubs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5">
              <Package className="h-3.5 w-3.5" /> Products
              <Badge variant="outline" className="ml-1 text-[10px]">{products.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Shopping Lists ── */}
          <TabsContent value="lists" className="space-y-3">
            {allSubs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No shopping lists submitted yet.</p>
            ) : (
              allSubs.map((sub) => {
                const subItems = getItemsForSubmission(sub, items as ShoppingItem[]);
                return (
                  <AdminSubmissionCard
                    key={sub.id}
                    submission={sub}
                    items={subItems}
                    editingId={editingId}
                    editQty={editQty}
                    onStartEdit={(item: ShoppingItem) => { setEditingId(item.id); setEditQty(item.quantity_needed); }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={handleSaveEdit}
                    onDeleteItem={handleDeleteItem}
                    onBulkStatusUpdate={handleBulkStatusUpdate}
                    onDeleteSubmission={handleDeleteSubmission}
                    setEditQty={setEditQty}
                    canDeleteSubmission={!sub.isSynthetic}
                  />
                );
              })
            )}
          </TabsContent>

          {/* ── Tab: Products Template ── */}
          <TabsContent value="products" className="space-y-4">
            {/* Add new product */}
            <Card>
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-medium">Add New Product</p>
                <div className="flex gap-2">
                  <Input placeholder="Product name" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className="flex-1 h-8 text-sm" />
                  <Input placeholder="Category" value={newProductCategory} onChange={(e) => setNewProductCategory(e.target.value)} className="w-32 h-8 text-sm" />
                  <Button size="sm" onClick={handleAddProduct} disabled={!newProductName.trim()} className="gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>

            {/* Product list grouped by category */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {Object.entries(groupedTemplate).sort(([a], [b]) => a.localeCompare(b)).map(([cat, prods]: [string, Product[]]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">{cat} ({prods.length})</p>
                  <div className="space-y-1">
                    {prods.map((p: Product) => (
                      <Card key={p.id}>
                        <CardContent className="p-3 flex items-center gap-2">
                          {editingProductId === p.id ? (
                            <>
                              <Input value={editProductName} onChange={(e) => setEditProductName(e.target.value)} className="flex-1 h-7 text-sm" />
                              <Input value={editProductCategory} onChange={(e) => setEditProductCategory(e.target.value)} placeholder="Category" className="w-28 h-7 text-sm" />
                              <Button size="sm" variant="ghost" onClick={() => handleSaveProduct(p.id)}><Check className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingProductId(null)}><X className="h-3.5 w-3.5" /></Button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm font-medium flex-1">{p.name}</span>
                              <span className="text-xs text-muted-foreground">{p.category || ""}</span>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingProductId(p.id); setEditProductName(p.name); setEditProductCategory(p.category || ""); }}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove "{p.name}"?</AlertDialogTitle>
                                    <AlertDialogDescription>This product will be deactivated and hidden from the shopping list.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteProduct(p.id)}>Remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
              {templateProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No products found.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ─── Admin submission card with inline editing ─── */
function AdminSubmissionCard({ submission, items, editingId, editQty, onStartEdit, onCancelEdit, onSaveEdit, onDeleteItem, onBulkStatusUpdate, onDeleteSubmission, setEditQty, canDeleteSubmission }: any) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>("MISSING");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const { formatDate } = useI18n();
  const pendingCount = items.filter((i: ShoppingItem) => i.status !== "OK").length;
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item: ShoppingItem) => item.id === id)));
  }, [items]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    );
  };

  const toggleAllSelection = (checked: boolean) => {
    setSelectedIds(checked ? items.map((item: ShoppingItem) => item.id) : []);
  };

  const applyBulkStatus = async () => {
    if (selectedIds.length === 0) return;
    setBulkUpdating(true);
    await onBulkStatusUpdate(submission, selectedIds, bulkStatus);
    setSelectedIds([]);
    setBulkUpdating(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardContent className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors">
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{formatDate(submission.created_at, "dd MMM yyyy, HH:mm")}</p>
              {submission.notes && <p className="text-xs text-muted-foreground truncate">{submission.notes}</p>}
              <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
            </div>
            {pendingCount > 0 && <Badge variant="destructive" className="text-[10px]">{pendingCount} pending</Badge>}
            <SubmissionStatusBadge status={submission.status} />
            {canDeleteSubmission && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteSubmission(submission.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-3 pb-3 pt-2 space-y-1.5">
            <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => toggleAllSelection(checked === true)}
                />
                <span className="text-xs text-muted-foreground">
                  {selectedIds.length > 0
                    ? `${selectedIds.length} selected`
                    : "Select items to update status"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select value={bulkStatus} onValueChange={setBulkStatus}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOPPING_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.length === 0 || bulkUpdating}
                  onClick={applyBulkStatus}
                >
                  Set Status
                </Button>
              </div>
            </div>
            {items.map((item: ShoppingItem) => (
              <div key={item.id} className="flex items-center gap-2 py-1">
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={() => toggleItemSelection(item.id)}
                />
                {editingId === item.id ? (
                  <>
                    <span className="text-sm font-medium flex-1">{item.products?.name}</span>
                    <Input type="number" min={1} value={editQty} onChange={(e) => setEditQty(Number(e.target.value) || 1)} className="w-16 h-7 text-xs" />
                    <Button size="sm" variant="ghost" onClick={() => onSaveEdit(item.id)}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={onCancelEdit}><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{item.products?.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">× {item.quantity_needed}</span>
                      {item.note && <span className="text-muted-foreground text-xs ml-2">({item.note})</span>}
                    </div>
                    <StatusBadge status={item.status} />
                    <Button size="sm" variant="ghost" onClick={() => onStartEdit(item)}><Edit2 className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDeleteItem(item.id)}><Trash2 className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ── Status badges ── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    MISSING: { label: "Missing", variant: "destructive" },
    ORDERED: { label: "Ordered", variant: "secondary" },
    BOUGHT: { label: "Bought", variant: "default" },
    OK: { label: "OK", variant: "outline" },
  };
  const { label, variant } = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

function SubmissionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    PENDING: { label: "Pending", variant: "secondary" },
    DONE: { label: "Done", variant: "outline" },
  };
  const { label, variant } = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

/* ─── Cleaner: Add new product inline ─── */
function CleanerAddProduct({ hostId, onAdded }: { hostId: string | null; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  const handleAdd = async () => {
    if (!name.trim() || !hostId || !user) return;
    const { error } = await supabase.from("products").insert({ name: name.trim(), category: category.trim() || null, host_user_id: hostId, active: true } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Product added" });
      setName("");
      setCategory("");
      onAdded();
    }
  };

  return (
    <div className="flex gap-2">
      <Input placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 h-8 text-sm" />
      <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-28 h-8 text-sm" />
      <Button size="sm" onClick={handleAdd} disabled={!name.trim()} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
