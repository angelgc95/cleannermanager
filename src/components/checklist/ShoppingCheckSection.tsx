import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Plus, X, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from("products").select("*").eq("active", true).order("name");
      setProducts(data || []);
    };
    fetchProducts();
  }, []);

  const addMissingItem = () => {
    if (!selectedProduct) return;
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return;

    // Check if already added
    const existing = missingItems.findIndex((i) => i.productId === selectedProduct);
    if (existing >= 0) {
      const updated = [...missingItems];
      updated[existing].quantity += quantity;
      onMissingItemsChange(updated);
    } else {
      onMissingItemsChange([
        ...missingItems,
        { productId: selectedProduct, productName: product.name, quantity, note },
      ]);
    }
    setSelectedProduct("");
    setQuantity(1);
    setNote("");
  };

  const removeItem = (index: number) => {
    onMissingItemsChange(missingItems.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Shopping checked? */}
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

      {/* If checked YES → show add missing items */}
      {shoppingChecked === true && (
        <>
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-sm font-medium">Add missing products</p>
              <div className="flex gap-2">
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger className="flex-1 h-9 text-sm">
                    <SelectValue placeholder="Select product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.category ? ` (${p.category})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                  className="w-16 h-9 text-sm"
                  placeholder="Qty"
                />
              </div>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" onClick={addMissingItem} disabled={!selectedProduct} className="gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </CardContent>
          </Card>

          {/* Added items */}
          {missingItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium px-1">Missing items added:</p>
              {missingItems.map((item, idx) => (
                <Card key={idx}>
                  <CardContent className="p-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.productName} × {item.quantity}</p>
                      {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-destructive p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}
