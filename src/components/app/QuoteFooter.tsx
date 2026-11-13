import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { friendlyError, qk, settingsQuery } from "@/lib/backend/queries";
import { saveSettings } from "@/lib/backend/settings";
import { isStaff } from "@/lib/domain/roles";
import { DEFAULT_QUOTE } from "@/lib/domain/settings";

export function QuoteFooter() {
  const { user, role } = useAppSession();
  const settings = useQuery(settingsQuery());
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [author, setAuthor] = useState("");

  const values = settings.data?.values ?? {};
  const text = values.motivational_quote?.trim() || DEFAULT_QUOTE;
  const by = values.motivational_quote_author?.trim();

  const save = useMutation({
    mutationFn: () =>
      saveSettings(user.id, {
        motivational_quote: quote.trim(),
        motivational_quote_author: author.trim(),
      }),
    onSuccess: () => {
      toast.success("جملهٔ انگیزشی به‌روز شد.");
      queryClient.invalidateQueries({ queryKey: qk.settings });
      setOpen(false);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <footer className="border-t border-border/70 pb-24 lg:pb-0">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 py-10 text-center">
        <div className="bronze-rule w-24" aria-hidden />
        <blockquote className="mt-4 font-display text-lg leading-9 text-foreground sm:text-xl">
          «{text}»
        </blockquote>
        {by && <p className="text-sm text-muted-foreground">— {by}</p>}
        {isStaff(role) && !settings.data?.missing && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-muted-foreground"
            onClick={() => {
              setQuote(values.motivational_quote ?? DEFAULT_QUOTE);
              setAuthor(values.motivational_quote_author ?? "");
              setOpen(true);
            }}
          >
            <Pencil /> ویرایش جمله
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle className="font-display">ویرایش جملهٔ انگیزشی</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quote.trim()) {
                toast.error("متن جمله را بنویسید.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="quote">متن</Label>
              <Textarea
                id="quote"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                maxLength={400}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quote-author">گوینده (اختیاری)</Label>
              <Input
                id="quote-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                maxLength={80}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "در حال ذخیره…" : "ذخیره"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
