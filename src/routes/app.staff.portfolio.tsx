import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { Search, MessageSquareText, Save, TrendingUp, Clock3, BookOpenCheck } from "lucide-react";
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
  const [strengths, setStrengths] = useState<Record<string, string>>({});
  const [focusAreas, setFocusAreas] = useState<Record<string, string>>({});
  const [nextExercises, setNextExercises] = useState<Record<string, string>>({});

  const artworks = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ArtworkWithImage[]> => {
      const { data, error } = await db.from("student_artworks")
        .select("id,student_id,title,description,object_path,teacher_note,reviewed_by,reviewed_at,created_at,updated_at,visibility,publication_consent_at,published_at,technique,materials,dimensions,duration_minutes")
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
    mutationFn: async ({ artwork, note, strengths, focusArea, nextExercise }: {
      artwork: ArtworkWithImage;
      note: string;
      strengths: string;
      focusArea: string;
      nextExercise: string;
    }) => {
      if (![note, strengths, focusArea, nextExercise].some((value) => value.trim())) {
        throw new Error("حداقل یکی از بخش‌های بازخورد را تکمیل کنید.");
      }
      const structuredNote = [
        strengths.trim() ? "نقاط قوت هنرجو:\n" + strengths.trim() : "",
        focusArea.trim() ? "زمینه‌های نیازمند تمرین:\n" + focusArea.trim() : "",
        nextExercise.trim() ? "تمرین پیشنهادی بعدی:\n" + nextExercise.trim() : "",
        note.trim() ? "یادداشت تکمیلی استاد:\n" + note.trim() : "",
      ].filter(Boolean).join("\n\n");
      const { error } = await db.from("student_artwork_reviews").insert({
        artwork_id: artwork.id,
        reviewer_id: user.id,
        note: structuredNote,
      });
      if (error) throw error;
    },
    onSuccess: async (_, variables) => {
      toast.success("بازخورد برای هنرجو ثبت شد.");
      setNotes(current => { const next = { ...current }; delete next[variables.artwork.id]; return next; });
      setStrengths(current => { const next = { ...current }; delete next[variables.artwork.id]; return next; });
      setFocusAreas(current => { const next = { ...current }; delete next[variables.artwork.id]; return next; });
      setNextExercises(current => { const next = { ...current }; delete next[variables.artwork.id]; return next; });
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

  const studentProgress = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (profiles.data ?? [])
      .filter((profile: ProfileRow) => profile.role === "student")
      .map((profile: ProfileRow) => {
        const studentArtworks = (artworks.data ?? []).filter((artwork) => artwork.student_id === profile.id);
        const studentArtworkIds = new Set(studentArtworks.map((artwork) => artwork.id));
        const studentReviews = (reviews.data ?? []).filter((review) => studentArtworkIds.has(review.artwork_id));
        const reviewedIds = new Set(studentReviews.map((review) => review.artwork_id));
        const techniques = new Set(studentArtworks.map((artwork) => artwork.technique?.trim()).filter(Boolean));
        return {
          profile,
          artworkCount: studentArtworks.length,
          reviewedCount: reviewedIds.size + studentArtworks.filter((artwork) => !!artwork.teacher_note && !reviewedIds.has(artwork.id)).length,
          publishedCount: studentArtworks.filter((artwork) => artwork.visibility === "published").length,
          practiceMinutes: studentArtworks.reduce((sum, artwork) => sum + (artwork.duration_minutes ?? 0), 0),
          techniqueCount: techniques.size,
          latestFeedback: studentReviews[0] ?? null,
          latestAt: studentArtworks[0]?.created_at ?? null,
        };
      })
      .filter((item) => !term || [item.profile.full_name, item.profile.phone].some(value => (value ?? "").toLocaleLowerCase().includes(term)))
      .sort((a, b) => b.artworkCount - a.artworkCount || (b.latestAt ?? "").localeCompare(a.latestAt ?? ""));
  }, [profiles.data, artworks.data, reviews.data, search]);

  return <>
    <PageHeader back={{ to: "/app", label: "بازگشت به پنل" }} eyebrow="مدیریت آموزشی"
      title="پرونده‌های هنری هنرجویان"
      description="آثار ارسالی را ببینید، روند تمرین را دنبال کنید و برای هر اثر بازخورد اختصاصی بنویسید." />
    <Section title="گزارش رشد هنرجویان">
      {profiles.isPending || artworks.isPending || reviews.isPending ? <LoadingRows rows={3} />
        : profiles.error || artworks.error || reviews.error ? <ErrorState error={profiles.error ?? artworks.error ?? reviews.error}
          onRetry={() => { void profiles.refetch(); void artworks.refetch(); void reviews.refetch(); }} />
        : studentProgress.length === 0 ? <EmptyState title="هنرجویی برای نمایش گزارش پیدا نشد" description="با تغییر عبارت جست‌وجو دوباره بررسی کنید." />
        : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {studentProgress.map((item) => <article key={item.profile.id} className="surface space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-display font-semibold">{item.profile.full_name || "هنرجوی بدون نام"}</h2>
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{item.profile.phone || "شماره تماس ثبت نشده"}</p>
              </div>
              <TrendingUp className="size-5 shrink-0 text-bronze" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-muted/60 p-2"><p className="font-display text-xl font-semibold">{toPersianDigits(item.artworkCount)}</p><p className="text-[11px] text-muted-foreground">اثر ثبت‌شده</p></div>
              <div className="rounded-lg bg-muted/60 p-2"><p className="font-display text-xl font-semibold">{toPersianDigits(item.reviewedCount)}</p><p className="text-[11px] text-muted-foreground">اثر دارای بازخورد</p></div>
              <div className="rounded-lg bg-muted/60 p-2"><p className="font-display text-xl font-semibold">{toPersianDigits(item.techniqueCount)}</p><p className="text-[11px] text-muted-foreground">تکنیک متفاوت</p></div>
              <div className="rounded-lg bg-muted/60 p-2"><p className="font-display text-xl font-semibold">{toPersianDigits(item.publishedCount)}</p><p className="text-[11px] text-muted-foreground">اثر منتشرشده</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{toPersianDigits(item.practiceMinutes)} دقیقه تمرین ثبت‌شده</span>
              <span className="inline-flex items-center gap-1"><BookOpenCheck className="size-3.5" />{toPersianDigits(item.reviewedCount)} بازخورد</span>
            </div>
            <p className="text-xs text-muted-foreground">{item.latestAt ? `آخرین ثبت اثر: ${formatDateFa(item.latestAt, true)}` : "هنوز اثری در پرونده ثبت نشده است."}</p>
            {item.latestFeedback && <div className="rounded-lg border border-border p-3">
              <p className="mb-1 text-xs font-semibold text-bronze">آخرین بازخورد آموزشی</p>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{item.latestFeedback.note}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{item.latestFeedback.reviewer_name || "استاد"} · {formatDateFa(item.latestFeedback.created_at, true)}</p>
            </div>}
            <a className="inline-flex text-sm font-medium text-bronze underline-offset-4 hover:underline" href={`/app/staff/students/${item.profile.id}`}>مشاهده پرونده کامل هنرجو</a>
          </article>)}
        </div>}
    </Section>

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
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {artwork.technique && <span className="rounded-full bg-muted px-2.5 py-1">تکنیک: {artwork.technique}</span>}
                  {artwork.materials && <span className="rounded-full bg-muted px-2.5 py-1">ابزار: {artwork.materials}</span>}
                  {artwork.dimensions && <span className="rounded-full bg-muted px-2.5 py-1">ابعاد: {artwork.dimensions}</span>}
                  {artwork.duration_minutes != null && <span className="rounded-full bg-muted px-2.5 py-1">تمرین: {toPersianDigits(artwork.duration_minutes)} دقیقه</span>}
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-3 text-sm font-semibold">راهنمای بازخورد آموزشی</p>
                    <div className="space-y-3">
                      <div>
                        <label htmlFor={`teacher-strengths-${artwork.id}`} className="mb-1.5 block text-xs font-medium">نقاط قوت هنرجو</label>
                        <Textarea id={`teacher-strengths-${artwork.id}`} value={strengths[artwork.id] ?? ""} maxLength={800}
                          onChange={event => setStrengths(current => ({ ...current, [artwork.id]: event.target.value }))}
                          placeholder="مثلاً مشاهده دقیق، ترکیب‌بندی، کنترل خطوط یا ارزش‌گذاری…" />
                      </div>
                      <div>
                        <label htmlFor={`teacher-focus-${artwork.id}`} className="mb-1.5 block text-xs font-medium">زمینه‌های نیازمند تمرین</label>
                        <Textarea id={`teacher-focus-${artwork.id}`} value={focusAreas[artwork.id] ?? ""} maxLength={800}
                          onChange={event => setFocusAreas(current => ({ ...current, [artwork.id]: event.target.value }))}
                          placeholder="یک یا دو موضوع مشخص و قابل تمرین را بنویسید…" />
                      </div>
                      <div>
                        <label htmlFor={`teacher-exercise-${artwork.id}`} className="mb-1.5 block text-xs font-medium">تمرین پیشنهادی بعدی</label>
                        <Textarea id={`teacher-exercise-${artwork.id}`} value={nextExercises[artwork.id] ?? ""} maxLength={800}
                          onChange={event => setNextExercises(current => ({ ...current, [artwork.id]: event.target.value }))}
                          placeholder="تمرینی کوتاه، روشن و متناسب با سطح هنرجو پیشنهاد کنید…" />
                      </div>
                      <div>
                        <label htmlFor={`teacher-note-${artwork.id}`} className="mb-1.5 block text-xs font-medium">یادداشت تکمیلی استاد</label>
                        <Textarea id={`teacher-note-${artwork.id}`} value={note} maxLength={1200}
                          onChange={event => setNotes(current => ({ ...current, [artwork.id]: event.target.value }))}
                          placeholder="توضیحات تکمیلی، نکات فنی یا پاسخ به پرسش هنرجو…" />
                      </div>
                    </div>
                  </div>
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
                    onClick={() => saveNote.mutate({
                      artwork, note,
                      strengths: strengths[artwork.id] ?? "",
                      focusArea: focusAreas[artwork.id] ?? "",
                      nextExercise: nextExercises[artwork.id] ?? "",
                    })}>
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
