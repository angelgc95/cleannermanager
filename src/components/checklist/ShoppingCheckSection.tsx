import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, X, ShoppingCart, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface MissingItem {
  productId: string;
  productName: string;
  quantity: number;
  note: string;
}

interface ShoppingCheckSectionProps {
  shoppingChecked: boolean | null;
  onShoppingCheckedChange: (value: boolean) => void;
  missingItems: MissingItem[];
  onMissingItemsChange: (items: MissingItem[]) => void;
  error?: string | null;
}

export function ShoppingCheckSection({
  shoppingChecked,
  onShoppingCheckedChange,
  missingItems,
  onMissingItemsChange,
  error,
}: ShoppingCheckSectionProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from("products").select("*").eq("active", true).order("name");
      setProducts(data || []);
    };
    fetchProducts();
  }, []);

  // Sync selected set from existing missingItems
  useEffect(() => {
    setSelected(new Set(missingItems.map((i) => i.productId)));
  }, [missingItems]);

  const toggleProduct = (productId: string) => {
    const next = new Set(selected);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    setSelected(next);
  };

  const addToShoppingList = () => {
    const newItems: MissingItem[] = [];
    for (const pid of selected) {
      const existing = missingItems.find((i) => i.productId === pid);
      if (existing) {
        newItems.push(existing);
      } else {
        const product = products.find((p) => p.id === pid);
        if (product) {
          newItems.push({ productId: pid, productName: product.name, quantity: 1, note: "" });
        }
      }
    }
    onMissingItemsChange(newItems);
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by category
  const grouped = filteredProducts.reduce<Record<string, any[]>>((acc, p) => {
    const cat = p.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});
  const sortedCategories = Object.keys(grouped).sort();

  const newSelectionsCount = [...selected].filter((id) => !missingItems.find((i) => i.productId === id)).length;
  const removalsCount = missingItems.filter((i) => !selected.has(i.productId)).length;
  const hasChanges = newSelectionsCount > 0 || removalsCount > 0;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShoppingCart className="h-4 w-4 text-primary" />
              Shopping checked? <span className="text-destructive">*</span>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant={shoppingChecked === true ? "default" : "outline"}
              onClick={() => onShoppingCheckedChange(true)}
              className="gap-1"
            >
              <Check className="h-3 w-3" /> Yes, checked
            </Button>
            <Button
              type="button"
              size="sm"
              variant={shoppingChecked === false ? "destructive" : "outline"}
              onClick={() => onShoppingCheckedChange(false)}
              className="gap-1"
            >
              <X className="h-3 w-3" /> Not yet
            </Button>
          </div>
        </CardContent>
      </Card>

      {shoppingChecked === true && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <p className="text-sm font-medium">Select missing products</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="h-9 text-sm pl-8"
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-3 border rounded-md p-2">
              {sortedCategories.map((cat) => (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{cat}</p>
                  <div className="space-y-0.5">
                    {grouped[cat].map((p: any) => (
                      <label
                        key={p.id}
                        className={cn(
                          "flex items-center gap-2.5 p-2 rounded-md cursor-pointer text-sm transition-colors",
                          selected.has(p.id) ? "bg-accent" : "hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggleProduct(p.id)}
                        />
                        <span className="font-medium">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No products found</p>
              )}
            </div>

            {selected.size > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{selected.size} product{selected.size !== 1 ? "s" : ""} selected</p>
                <Button size="sm" onClick={addToShoppingList} disabled={!hasChanges} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> {missingItems.length > 0 ? "Update" : "Add to"} Shopping List
                </Button>
              </div>
            )}

            {missingItems.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Added to shopping list:</p>
                <div className="flex flex-wrap gap-1.5">
                  {missingItems.map((item) => (
                    <span
                      key={item.productId}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                    >
                      {item.productName}
                      <button
                        onClick={() => {
                          const next = new Set(selected);
                          next.delete(item.productId);
                          setSelected(next);
                          onMissingItemsChange(missingItems.filter((i) => i.productId !== item.productId));
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
