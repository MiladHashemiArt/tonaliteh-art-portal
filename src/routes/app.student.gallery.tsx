import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Heart, MessageCircle, Flag, Send, Users, LockKeyhole, ImagePlus, UserPlus, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, isMissingRelation } from "@/lib/backend/queries";
import type {
  StudentArtworkCommentRow,
  StudentArtworkLikeRow,
  StudentArtworkRow,
  StudentFollowRow,
} from "@/lib/backend/types";
import { formatDateFa } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/gallery")({
  head: () => ({ meta: [{ title: "گالری هنرجویان | تنالیته" }] }),
  component: StudentGalleryPage,
});

const galleryKey = ["student-community-gallery"] as const;

type GalleryArtwork = StudentArtworkRow & { imageUrl: string };

function StudentGalleryPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reporting, setReporting] = useState<string | null>(null);

  const feed = useQuery({
    queryKey: galleryKey,
    queryFn: async (): Promise<GalleryArtwork[]> => {
      const { data, error } = await supabase
        .from("student_artworks")
        .select("id, student_id, title, description, object_path, teacher_note, reviewed_by, reviewed_at, created_at, updated_at, visibility, publication_consent_at, published_at, technique, materials, dimensions, duration_minutes")
        .eq("visibility", "published")
        .order("published_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      const rows = (data ?? []) as StudentArtworkRow[];
      return Promise.all(rows.map(async (row) => {
        const { data: signed, error: signedError } = await supabase.storage
          .from("student-artworks")
          .createSignedUrl(row.object_path, 5 * 60);
        if (signedError) throw signedError;
        return { ...row, imageUrl: signed.signedUrl };
      }));
    },
    staleTime: 30_000,
  });

  const artworkIds = useMemo(() => (feed.data ?? []).map((artwork) => artwork.id), [feed.data]);
  const artistIds = useMemo(() => [...new Set((feed.data ?? []).map((artwork) => artwork.student_id))], [feed.data]);

  const artistNames = useQuery({
    queryKey: [...galleryKey, "artist-names", artistIds.join(",")],
    enabled: artistIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_student_gallery_names", { _user_ids: artistIds });
      if (error) throw error;
      return data ?? [];
    },
  });

  const follows = useQuery({
    queryKey: [...galleryKey, "follows", user.id],
    queryFn: async (): Promise<StudentFollowRow[]> => {
      const { data, error } = await supabase
        .from("student_follows")
        .select("follower_id, followed_id, created_at")
        .eq("follower_id", user.id);
      if (error) throw error;
      return (data ?? []) as StudentFollowRow[];
    },
  });

  const likes = useQuery({
    queryKey: [...galleryKey, "likes", user.id, artworkIds.join(",")],
    enabled: artworkIds.length > 0,
    queryFn: async (): Promise<StudentArtworkLikeRow[]> => {
      const { data, error } = await supabase
        .from("student_artwork_likes")
        .select("id, artwork_id, user_id, created_at")
        .in("artwork_id", artworkIds);
      if (error) throw error;
      return (data ?? []) as StudentArtworkLikeRow[];
    },
  });

  const comments = useQuery({
    queryKey: [...galleryKey, "comments", artworkIds.join(",")],
    enabled: artworkIds.length > 0,
    queryFn: async (): Promise<StudentArtworkCommentRow[]> => {
      const { data, error } = await supabase
        .from("student_artwork_comments")
        .select("id, artwork_id, author_id, parent_id, body, is_hidden, created_at, updated_at")
        .in("artwork_id", artworkIds)
        .eq("is_hidden", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StudentArtworkCommentRow[];
    },
  });

  const toggleLike = useMutation({
    mutationFn: async (artworkId: string) => {
      const existing = (likes.data ?? []).find((like) => like.artwork_id === artworkId && like.user_id === user.id);
      if (existing) {
        const { error } = await supabase.from("student_artwork_likes").delete().eq("id", existing.id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("student_artwork_likes").insert({ artwork_id: artworkId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...galleryKey, "likes"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const toggleFollow = useMutation({
    mutationFn: async (artistId: string) => {
      const existing = (follows.data ?? []).some((follow) => follow.followed_id === artistId);
      if (existing) {
        const { error } = await supabase.from("student_follows").delete().eq("follower_id", user.id).eq("followed_id", artistId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("student_follows").insert({ follower_id: user.id, followed_id: artistId });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...galleryKey, "follows", user.id] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const addComment = useMutation({
    mutationFn: async ({ artworkId, body }: { artworkId: string; body: string }) => {
      const clean = body.trim();
      if (!clean || clean.length > 2000) throw new Error("متن دیدگاه باید بین ۱ تا ۲۰۰۰ نویسه باشد.");
      const { error } = await supabase.from("student_artwork_comments").insert({
        artwork_id: artworkId,
        author_id: user.id,
        body: clean,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      setDrafts((current) => ({ ...current, [variables.artworkId]: "" }));
      toast.success("دیدگاهت ثبت شد.");
      await queryClient.invalidateQueries({ queryKey: [...galleryKey, "comments"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const reportArtwork = useMutation({
    mutationFn: async ({ artworkId, reason }: { artworkId: string; reason: string }) => {
      const { error } = await supabase.from("student_artwork_reports").insert({
        reporter_id: user.id,
        artwork_id: artworkId,
        reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReporting(null);
      toast.success("گزارشت برای بررسی به گروه آموزشی ارسال شد.");
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const missingSchema = [feed.error, likes.error, comments.error, artistNames.error, follows.error].some((error) =>
    isMissingRelation(error as { code?: string; message?: string } | null)
  );

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="جامعهٔ هنری تنالیته"
        title="گالری هنرجویان"
        description="آثاری را ببین، تجربه‌ها را به اشتراک بگذار و با احترام از مسیر هنری یکدیگر الهام بگیر."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="surface flex items-center gap-3 p-4">
          <Users className="size-5 text-bronze" />
          <div><p className="text-sm font-semibold">ویژهٔ اعضای تنالیته</p><p className="text-xs text-muted-foreground">فقط اعضای واردشده</p></div>
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <LockKeyhole className="size-5 text-bronze" />
          <div><p className="text-sm font-semibold">انتشار با اجازهٔ هنرجو</p><p className="text-xs text-muted-foreground">آثار خصوصی در فید نیستند</p></div>
        </div>
        <div className="surface flex items-center gap-3 p-4">
          <ImagePlus className="size-5 text-bronze" />
          <div><p className="text-sm font-semibold">پروندهٔ هنری من</p><p className="text-xs text-muted-foreground">برای ثبت یا مدیریت آثار</p></div>
          <Button asChild size="sm" variant="outline" className="ms-auto"><a href="/app/student/portfolio">ورود</a></Button>
        </div>
      </div>

      <Section title="آثار منتشرشده">
        {feed.isPending ? <LoadingRows rows={4} /> : missingSchema ? (
          <div className="surface space-y-3 p-6">
            <p className="font-semibold">گالری اجتماعی در مرحلهٔ آماده‌سازی است.</p>
            <p className="text-sm leading-7 text-muted-foreground">ساختار امن گالری آماده شده، اما تا زمان بررسی و اجرای migration در محیط مجاز، انتشار، پسند و دیدگاه فعال نمی‌شوند. آثار فعلی شما خصوصی می‌مانند.</p>
            <Button asChild variant="outline"><a href="/app/student/portfolio">رفتن به پروندهٔ هنری</a></Button>
          </div>
        ) : feed.error ? (
          <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
        ) : !feed.data?.length ? (
          <EmptyState title="هنوز اثری برای نمایش منتشر نشده" description="وقتی هنرجوها با رضایت خود اثری را منتشر کنند، اینجا می‌توانی ببینی و از آن الهام بگیری." />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {feed.data.map((artwork) => {
              const artworkLikes = (likes.data ?? []).filter((like) => like.artwork_id === artwork.id);
              const artworkComments = (comments.data ?? []).filter((comment) => comment.artwork_id === artwork.id);
              const liked = artworkLikes.some((like) => like.user_id === user.id);
              const isReporting = reporting === artwork.id;
              return (
                <article key={artwork.id} className="surface overflow-hidden">
                  <img src={artwork.imageUrl} alt={artwork.title} className="aspect-[4/3] w-full bg-muted object-contain" loading="lazy" />
                  <div className="space-y-3 p-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs text-bronze">{artistNames.data?.find((artist) => artist.user_id === artwork.student_id)?.display_name ?? "هنرجوی تنالیته"}</p>
                        {artwork.student_id !== user.id && (
                          <Button type="button" size="sm" variant="outline" disabled={toggleFollow.isPending || follows.isPending} onClick={() => toggleFollow.mutate(artwork.student_id)}>
                            {follows.data?.some((follow) => follow.followed_id === artwork.student_id) ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
                            {follows.data?.some((follow) => follow.followed_id === artwork.student_id) ? "دنبال می‌کنی" : "دنبال‌کردن"}
                          </Button>
                        )}
                        <time className="text-xs text-muted-foreground">{formatDateFa(artwork.published_at ?? artwork.created_at, true)}</time>
                      </div>
                      <h3 className="font-display text-lg font-semibold">{artwork.title}</h3>
                      {artwork.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{artwork.description}</p>}
                    </div>
                    {(artwork.technique || artwork.materials || artwork.dimensions) && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {artwork.technique && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.technique}</span>}
                        {artwork.materials && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.materials}</span>}
                        {artwork.dimensions && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.dimensions}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-3 border-y border-border py-2">
                      <Button type="button" variant="ghost" size="sm" disabled={toggleLike.isPending || likes.isPending} onClick={() => toggleLike.mutate(artwork.id)}>
                        <Heart className={liked ? "size-4 fill-current text-rose-600" : "size-4"} /> {artworkLikes.length.toLocaleString("fa-IR")}
                      </Button>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MessageCircle className="size-4" /> {artworkComments.length.toLocaleString("fa-IR")} دیدگاه</span>
                      <Button type="button" variant="ghost" size="sm" className="ms-auto" onClick={() => setReporting(isReporting ? null : artwork.id)}>
                        <Flag className="size-4" /> گزارش
                      </Button>
                    </div>
                    {isReporting && (
                      <div className="rounded-lg bg-muted/60 p-3">
                        <p className="mb-2 text-xs text-muted-foreground">دلیل گزارش را انتخاب کن:</p>
                        <div className="flex flex-wrap gap-2">
                          {["محتوای نامناسب", "نقض حریم خصوصی", "مالکیت اثر", "سایر موارد"].map((reason) => (
                            <Button key={reason} type="button" size="sm" variant="outline" disabled={reportArtwork.isPending} onClick={() => reportArtwork.mutate({ artworkId: artwork.id, reason })}>{reason}</Button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      {artworkComments.slice(-3).map((comment) => (
                        <div key={comment.id} className="rounded-lg bg-muted/50 px-3 py-2">
                          <p className="mb-1 text-[11px] text-muted-foreground">عضو تنالیته</p>
                          <p className="whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
                        </div>
                      ))}
                      <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); addComment.mutate({ artworkId: artwork.id, body: drafts[artwork.id] ?? "" }); }}>
                        <Textarea rows={1} maxLength={2000} value={drafts[artwork.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [artwork.id]: event.target.value }))} placeholder="دیدگاه محترمانه و سازنده…" className="min-h-10 resize-y" />
                        <Button type="submit" size="icon" aria-label="ارسال دیدگاه" disabled={addComment.isPending || !(drafts[artwork.id] ?? "").trim()}><Send className="size-4" /></Button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
