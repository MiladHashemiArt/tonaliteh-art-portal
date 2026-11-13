import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { Search, MessageSquareText, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { allProfilesQuery, friendlyError } from "@/lib/backend/queries";
import type { ProfileRow, StudentArtworkReviewRow, StudentArtworkRow } from "@/lib/backend/types";
import { formatDateFa, toPersianDigits } from "@/lib/domain/persian";

const db = supabase as unknown as SupabaseClient<any>;
const key = ["staff-student-artworks"] as const;

export const Route = createFileRoute("/app/staff/portfolio")({
  head: () => ({ meta: [{ title: "پرونده‌های هنری | تنالیته" }] }),
  component: StaffPortfolioPage,
});

type ArtworkWithImage = StudentArtworkRow & { imageUrl: string };

function StaffPortfolioPage() {
  const { user } = useAppSession();
  const qc = useQueryClient();
  const profiles = useQuery(allProfilesQuery());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const artworks = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ArtworkWithImage[]> => {
      const { data, error } = await db.from("student_artworks")
        .select("id,student_id,title,description,object_path,teacher_note,reviewed_by,reviewed_at,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Promise.all(((data ?? []) as StudentArtworkRow[]).map(async row => {
        const { data: signed, error: signedError } = await supabase.storage
          .from("student-artworks").createSignedUrl(row.object_path, 60 * 60);
        if (signedError) throw signedError;
        return { ...row, imageUrl: signed.signedUrl };
      }));
    },
  });

  const reviews = useQuery({
    queryKey: ["staff-artwork-reviews", artworks.data?.map((item) => item.id).join(",")],
    enabled: !!artworks.data,
    queryFn: async () => {
      const artworkIds = (artworks.data ?? []).map((item) => item.id);
      if (!artworkIds.length) return [] as StudentArtworkReviewRow[];
      const { data, error } = await db.from("student_artwork_reviews")
        .select("id, artwork_id, reviewer_id, reviewer_name, note, created_at")
        .in("artwork_id", artworkIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentArtworkReviewRow[];
    },
  });

  const saveNote = useMutation({
    mutationFn: async ({ artwork, note }: { artwork: ArtworkWithImage; note: string }) => {
      if (!note.trim()) throw new Error("متن بازخورد را وارد کنید.");
      const { error } = await db.from("student_artwork_reviews").insert({
        artwork_id: artwork.id,
        reviewer_id: user.id,
        note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      toast.success("بازخورد برای هنرجو ثبت شد.");
      setNotes(current => { const next = { ...current }; delete next[variables.artwork.id]; return next; });
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ["staff-artwork-reviews"] })]);
    },
    onError: error => toast.error(friendlyError(error)),
  });

  const profileById = useMemo(() => new Map((profiles.data ?? []).map((p: ProfileRow) => [p.id, p])), [profiles.data]);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (artworks.data ?? []).filter(artwork => {
      const student = profileById.get(artwork.student_id);
      return !term || [artwork.title, artwork.description, student?.full_name, student?.phone]
        .some(value => (value ?? "").toLocaleLowerCase().includes(term));
    });
  }, [artworks.data, profileById, search]);

  return <>
    <PageHeader back={{ to: "/app", label: "بازگشت به پنل" }} eyebrow="مدیریت آموزشی"
      title="پرونده‌های هنری هنرجویان"
      description="آثار ارسالی را ببینید، روند تمرین را دنبال کنید و برای هر اثر بازخورد اختصاصی بنویسید." />
    <Section title={`آثار ثبت‌شده · ${toPersianDigits(rows.length)}`}>
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={search} onChange={event => setSearch(event.target.value)}
          placeholder="جست‌وجو بر اساس نام هنرجو، عنوان اثر یا شماره تماس…" className="pr-10" />
      </div>
      {artworks.isPending || profiles.isPending ? <LoadingRows rows={4} />
        : artworks.error || profiles.error ? <ErrorState error={artworks.error ?? profiles.error}
          onRetry={() => { void artworks.refetch(); void profiles.refetch(); }} />
        : rows.length === 0 ? <EmptyState title={search ? "اثری با این مشخصات پیدا نشد" : "هنوز اثری ارسال نشده است"}
          description={search ? "عبارت جست‌وجو را تغییر دهید." : "پس از بارگذاری آثار توسط هنرجویان، آن‌ها در این بخش نمایش داده می‌شوند."}
          icon={<MessageSquareText className="size-7" aria-hidden />} />
        : <div className="grid gap-5 md:grid-cols-2">
          {rows.map(artwork => {
            const student = profileById.get(artwork.student_id);
            const note = notes[artwork.id] ?? artwork.teacher_note ?? "";
            return <article key={artwork.id} className="surface overflow-hidden">
              <img src={artwork.imageUrl} alt={artwork.title} className="aspect-[4/3] w-full bg-muted object-contain" loading="lazy" />
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs text-bronze">{student?.full_name || "هنرجو"}</p>
                  <h2 className="mt-1 font-display text-lg font-semibold">{artwork.title}</h2>
                  {student?.phone && <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{toPersianDigits(student.phone)}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">ارسال‌شده در {formatDateFa(artwork.created_at, true)}</p>
                </div>
                {artwork.description && <p className="rounded-lg bg-muted/50 p-3 text-sm leading-6">{artwork.description}</p>}
                <div className="space-y-2">
                  <label htmlFor={`teacher-note-${artwork.id}`} className="text-sm font-medium">بازخورد استاد</label>
                  <Textarea id={`teacher-note-${artwork.id}`} value={note} maxLength={1200}
                    onChange={event => setNotes(current => ({ ...current, [artwork.id]: event.target.value }))}
                    placeholder="نکات مثبت، پیشنهادهای اصلاحی و تمرین بعدی را بنویسید…" />
                  {artwork.reviewed_at && <p className="text-xs text-muted-foreground">آخرین بازبینی: {formatDateFa(artwork.reviewed_at, true)}</p>}
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-xs font-semibold text-bronze">سوابق بازخورد</p>
                    {reviews.isPending ? <p className="text-xs text-muted-foreground">در حال دریافت…</p>
                      : reviews.error ? <p className="text-xs text-destructive">دریافت سوابق ناموفق بود.</p>
                      : (() => {
                        const history = (reviews.data ?? []).filter((review) => review.artwork_id === artwork.id);
                        if (!history.length && artwork.teacher_note) return <div className="text-sm leading-6">{artwork.teacher_note}</div>;
                        if (!history.length) return <p className="text-xs text-muted-foreground">هنوز بازخوردی ثبت نشده است.</p>;
                        return <ol className="space-y-3">
                          {history.map((review) => <li key={review.id} className="border-r-2 border-bronze/40 pr-3">
                            <p className="mb-1 text-xs text-muted-foreground">{review.reviewer_name || "استاد"} · {formatDateFa(review.created_at, true)}</p>
                            <p className="whitespace-pre-wrap text-sm leading-6">{review.note}</p>
                          </li>)}
                        </ol>;
                      })()}
                  </div>
                  <Button className="w-full" disabled={saveNote.isPending || note === (artwork.teacher_note ?? "")}
                    onClick={() => saveNote.mutate({ artwork, note })}>
                    <Save className="size-4" /> ثبت بازخورد
                  </Button>
                </div>
              </div>
            </article>;
          })}
        </div>}
    </Section>
  </>;
}
