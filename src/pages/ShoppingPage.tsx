import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

export default function ShoppingPage() {
  const { user, orgId } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [clearing, setClearing] = useState(false);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("shopping_list")
      .select("*, products(name, category)")
      .order("updated_at", { ascending: false });
    setItems(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("*").eq("active", true).order("name");
    setProducts(data || []);
  };

  useEffect(() => { fetchItems(); fetchProducts(); }, []);

  const addItem = async () => {
    if (!selectedProduct || !user) return;
    const { error } = await supabase.from("shopping_list").insert({
      product_id: selectedProduct,
      created_by_user_id: user.id,
      status: "MISSING",
      org_id: orgId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSelectedProduct("");
      fetchItems();
    }
  };

  const updateStatus = async (id: string, status: "MISSING" | "ORDERED" | "BOUGHT" | "OK") => {
    await supabase.from("shopping_list").update({ status }).eq("id", id);
    fetchItems();
  };

  const handleClearList = async () => {
    if (!user) return;
    setClearing(true);

    const openItems = items.filter((i) => ["MISSING", "ORDERED", "BOUGHT"].includes(i.status));

    if (openItems.length > 0) {
      const ids = openItems.map((i) => i.id);
      await supabase
        .from("shopping_list")
        .update({
          status: "OK" as const,
          last_cleared_at: new Date().toISOString(),
          cleared_by_user_id: user.id,
        })
        .in("id", ids);
    }

    toast({ title: "Shopping list cleared", description: `${openItems.length} items set to OK.` });
    setClearing(false);
    fetchItems();
  };

  const openItemsCount = items.filter((i) => ["MISSING", "ORDERED", "BOUGHT"].includes(i.status)).length;

  return (
    <div>
      <PageHeader
        title="Shopping List"
        description="Track consumables and supplies"
        actions={
          openItemsCount > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={clearing}>
                  <Trash2 className="h-4 w-4" /> Clear List
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear shopping list?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will set {openItemsCount} open item{openItemsCount !== 1 ? "s" : ""} to OK status. This action cannot be undone.
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
      <div className="p-6 space-y-4 max-w-2xl">
        {/* Add item */}
        <div className="flex gap-2">
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a product..." />
            </SelectTrigger>
            <SelectContent>
              {products.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}{p.category ? ` (${p.category})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addItem} disabled={!selectedProduct}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {items.map((item: any) => (
          <Card key={item.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">{item.products?.name}</p>
                <p className="text-xs text-muted-foreground">{item.products?.category || "—"} · Qty: {item.quantity_needed}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={item.status} onValueChange={(v) => updateStatus(item.id, v as "MISSING" | "ORDERED" | "BOUGHT" | "OK")}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MISSING">Missing</SelectItem>
                    <SelectItem value="ORDERED">Ordered</SelectItem>
                    <SelectItem value="BOUGHT">Bought</SelectItem>
                    <SelectItem value="OK">OK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-center text-muted-foreground py-8">Shopping list is empty.</p>}
      </div>
    </div>
  );
}
