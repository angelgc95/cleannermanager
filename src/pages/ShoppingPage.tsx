import { useEffect, useState, useMemo } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, ShoppingCart, Package, Edit2, X, Check, Search } from "lucide-react";

/* ─── types ─── */
interface Product { id: string; name: string; category: string | null; }
interface ShoppingItem {
  id: string; product_id: string; status: string; quantity_needed: number;
  note: string | null; created_at: string; created_by_user_id: string;
  products?: { name: string; category: string | null } | null;
}
interface SelectedProduct { productId: string; quantity: number; note: string; }

/* ═══════════════════════════════════════════ */
export default function ShoppingPage() {
  const { user, orgId, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin" || role === "manager";

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: itemsData }, { data: productsData }] = await Promise.all([
      supabase.from("shopping_list").select("*, products(name, category)").order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("active", true).order("name"),
    ]);
    setItems((itemsData as ShoppingItem[]) || []);
    setProducts((productsData as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return isAdmin
    ? <AdminShoppingView items={items} products={products} user={user} orgId={orgId} toast={toast} onRefresh={fetchAll} />
    : <CleanerShoppingView items={items} products={products} user={user} orgId={orgId} toast={toast} onRefresh={fetchAll} />;
}

/* ═══════════════════════════════════════════
   CLEANER VIEW
   ═══════════════════════════════════════════ */
function CleanerShoppingView({ items, products, user, orgId, toast, onRefresh }: any) {
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mySubmitted = items.filter((i: ShoppingItem) => i.created_by_user_id === user?.id && i.status !== "OK");

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
    const rows = selected.map((s) => ({
      product_id: s.productId,
      created_by_user_id: user.id,
      status: "MISSING" as const,
      org_id: orgId,
      quantity_needed: s.quantity,
      note: s.note || null,
      created_from: "MANUAL" as const,
    }));
    const { error } = await supabase.from("shopping_list").insert(rows);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted!", description: `${selected.length} item(s) added to shopping list.` });
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
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
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
                          <Checkbox
                            checked={!!sel}
                            onCheckedChange={() => toggleProduct(p.id)}
                          />
                          <span className="text-sm font-medium flex-1">{p.name}</span>
                          {sel && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Qty:</span>
                              <Input
                                type="number"
                                min={1}
                                value={sel.quantity}
                                onChange={(e) => updateQuantity(p.id, Number(e.target.value))}
                                className="w-14 h-7 text-xs text-center"
                              />
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

          {selected.length > 0 && (
            <Button onClick={handleSubmit} disabled={submitting} className="w-full mt-4 gap-2">
              <Send className="h-4 w-4" />
              Submit {selected.length} item{selected.length !== 1 ? "s" : ""}
            </Button>
          )}
        </section>

        {/* ── Submitted Shopping List ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Shopping List</h2>
            {mySubmitted.length > 0 && <Badge variant="outline">{mySubmitted.length}</Badge>}
          </div>

          {mySubmitted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pending items.</p>
          ) : (
            <div className="space-y-1.5">
              {(mySubmitted as ShoppingItem[]).map((item: ShoppingItem) => (
                <Card key={item.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.products?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.products?.category || "—"} · Qty: {item.quantity_needed}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ADMIN VIEW
   ═══════════════════════════════════════════ */
function AdminShoppingView({ items, products, user, orgId, toast, onRefresh }: any) {
  const [clearing, setClearing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editStatus, setEditStatus] = useState<string>("MISSING");

  // New item multi-select for admin
  const [adminSelected, setAdminSelected] = useState<SelectedProduct[]>([]);
  const [adminSearch, setAdminSearch] = useState("");

  const openItems = items.filter((i: ShoppingItem) => ["MISSING", "ORDERED", "BOUGHT"].includes(i.status));
  const newItemsCount = items.filter((i: ShoppingItem) => i.status === "MISSING").length;

  const handleClearList = async () => {
    if (!user) return;
    setClearing(true);
    if (openItems.length > 0) {
      await supabase
        .from("shopping_list")
        .update({ status: "OK" as const, last_cleared_at: new Date().toISOString(), cleared_by_user_id: user.id })
        .in("id", openItems.map((i: ShoppingItem) => i.id));
    }
    toast({ title: "List cleared", description: `${openItems.length} items set to OK.` });
    setClearing(false);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("shopping_list").delete().eq("id", id);
    onRefresh();
  };

  const handleSaveEdit = async (id: string) => {
    await supabase.from("shopping_list").update({ quantity_needed: editQty, status: editStatus as "MISSING" | "ORDERED" | "BOUGHT" | "OK" }).eq("id", id);
    setEditingId(null);
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
    const rows = adminSelected.map((s) => ({
      product_id: s.productId,
      created_by_user_id: user.id,
      status: "MISSING" as const,
      org_id: orgId,
      quantity_needed: s.quantity,
      created_from: "MANUAL" as const,
    }));
    await supabase.from("shopping_list").insert(rows);
    setAdminSelected([]);
    toast({ title: "Added", description: `${rows.length} item(s) added.` });
    onRefresh();
  };

  const filteredProducts = products.filter((p: Product) =>
    p.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(adminSearch.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Shopping List"
        description="Manage all shopping items"
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
                  <AlertDialogDescription>
                    Set {openItems.length} open item{openItems.length !== 1 ? "s" : ""} to OK.
                  </AlertDialogDescription>
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
        <Tabs defaultValue="list">
          <TabsList className="mb-4">
            <TabsTrigger value="list" className="gap-1.5">
              Shopping List
              {newItemsCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-[10px] px-1.5 rounded-full">
                  {newItemsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Items
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Shopping List ── */}
          <TabsContent value="list" className="space-y-2">
            {openItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No open items.</p>
            ) : (
              openItems.map((item: ShoppingItem) => (
                <Card key={item.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {editingId === item.id ? (
                      <>
                        <div className="flex-1 space-y-1.5">
                          <p className="text-sm font-medium">{item.products?.name}</p>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="number" min={1} value={editQty}
                              onChange={(e) => setEditQty(Number(e.target.value) || 1)}
                              className="w-16 h-7 text-xs"
                            />
                            <Select value={editStatus} onValueChange={setEditStatus}>
                              <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MISSING">Missing</SelectItem>
                                <SelectItem value="ORDERED">Ordered</SelectItem>
                                <SelectItem value="BOUGHT">Bought</SelectItem>
                                <SelectItem value="OK">OK</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(item.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.products?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.products?.category || "—"} · Qty: {item.quantity_needed}
                            {item.note ? ` · ${item.note}` : ""}
                          </p>
                        </div>
                        <StatusBadge status={item.status} />
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(item.id); setEditQty(item.quantity_needed); setEditStatus(item.status); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Tab: Add Items ── */}
          <TabsContent value="add" className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search products..." value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {filteredProducts.map((p: Product) => {
                const sel = adminSelected.find((s) => s.productId === p.id);
                return (
                  <Card key={p.id} className={sel ? "border-primary/50 bg-primary/5" : ""}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Checkbox checked={!!sel} onCheckedChange={() => toggleAdminProduct(p.id)} />
                      <span className="text-sm font-medium flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.category || ""}</span>
                      {sel && (
                        <Input
                          type="number" min={1} value={sel.quantity}
                          onChange={(e) => {
                            const v = Number(e.target.value) || 1;
                            setAdminSelected((prev) => prev.map((s) => s.productId === p.id ? { ...s, quantity: v } : s));
                          }}
                          className="w-14 h-7 text-xs text-center"
                        />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {adminSelected.length > 0 && (
              <Button onClick={handleAdminAdd} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Add {adminSelected.length} item{adminSelected.length !== 1 ? "s" : ""}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ── Shared status badge ── */
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
