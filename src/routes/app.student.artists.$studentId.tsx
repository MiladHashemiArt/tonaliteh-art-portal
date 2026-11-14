import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Image as ImageIcon, UserCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";
import type { StudentArtworkRow, StudentFollowRow, StudentArtistStatsRow } from "@/lib/backend/types";
import { formatDateFa } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/artists/$studentId")({
  head: () => ({ meta: [{ title: "پروفایل هنری | تنالیته" }] }),
  component: StudentArtistProfilePage,
});

const artistKey = (studentId: string) => ["student-artist-profile", studentId] as const;

function StudentArtistProfilePage() {
  const { studentId } = Route.useParams();
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const isOwnProfile = studentId === user.id;

  const artist = useQuery({
    queryKey: [...artistKey(studentId), "name"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_student_gallery_names", { _user_ids: [studentId] });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const stats = useQuery({
    queryKey: [...artistKey(studentId), "stats"],
    queryFn: async (): Promise<StudentArtistStatsRow | null> => {
      const { data, error } = await supabase.rpc("get_student_artist_stats", { _student_id: studentId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const artworks = useQuery({
    queryKey: [...artistKey(studentId), "artworks"],
    enabled: !!artist.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_artworks")
        .select("id, student_id, title, description, object_path, teacher_note, reviewed_by, reviewed_at, created_at, updated_at, visibility, publication_consent_at, published_at, technique, materials, dimensions, duration_minutes")
        .eq("student_id", studentId)
        .eq("visibility", "published")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return Promise.all(((data ?? []) as StudentArtworkRow[]).map(async (artwork) => {
        const { data: signed, error: signedError } = await supabase.storage
          .from("student-artworks")
          .createSignedUrl(artwork.object_path, 5 * 60);
        if (signedError) throw signedError;
        return { ...artwork, imageUrl: signed.signedUrl };
      }));
    },
  });

  const follows = useQuery({
    queryKey: [...artistKey(studentId), "my-follow"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_follows")
        .select("follower_id, followed_id, created_at")
        .eq("follower_id", user.id)
        .eq("followed_id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data as StudentFollowRow | null;
    },
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (follows.data) {
        const { error } = await supabase.from("student_follows").delete()
          .eq("follower_id", user.id).eq("followed_id", studentId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("student_follows").insert({
          follower_id: user.id,
          followed_id: studentId,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...artistKey(studentId), "my-follow"] }),
        queryClient.invalidateQueries({ queryKey: [...artistKey(studentId), "stats"] }),
        queryClient.invalidateQueries({ queryKey: ["student-community-gallery"] }),
      ]);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const isLoading = artist.isPending || stats.isPending;
  const hasError = artist.error || stats.error;
  const title = artist.data?.display_name ?? "پروفایل هنری";

  return (
    <>
      <PageHeader
        back={{ to: "/app/student/gallery", label: "گالری هنرجویان" }}
        eyebrow="جامعه هنری تنالیته"
        title={title}
        description={isOwnProfile ? "صفحه هنری تو و آثاری که برای اعضای تنالیته منتشر کرده‌ای." : "آثار منتشرشده این هنرجو در جامعه هنری تنالیته."}
      />

      {isLoading ? <LoadingRows rows={2} /> : hasError ? (
        <ErrorState error={artist.error ?? stats.error} onRetry={() => { void artist.refetch(); void stats.refetch(); }} />
      ) : !artist.data ? (
        <EmptyState title="این پروفایل در دسترس نیست" description="ممکن است هنرجو هنوز اثری منتشر نکرده باشد یا انتشار آثارش را لغو کرده باشد." />
      ) : (
        <>
          <section className="surface mb-8 space-y-5 p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted text-bronze">
                <Users className="size-7" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">هنرجوی گروه هنری تنالیته</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 border-y border-border py-4 text-center">
              <div><p className="font-display text-2xl font-semibold">{(stats.data?.published_artworks ?? 0).toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">اثر منتشرشده</p></div>
              <div><p className="font-display text-2xl font-semibold">{(stats.data?.follower_count ?? 0).toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">دنبال‌کننده</p></div>
              <div><p className="font-display text-2xl font-semibold">{(stats.data?.following_count ?? 0).toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">دنبال‌شونده</p></div>
            </div>
            {!isOwnProfile && (
              <Button className="w-full sm:w-auto" variant={follows.data ? "outline" : "default"} disabled={follows.isPending || toggleFollow.isPending} onClick={() => toggleFollow.mutate()}>
                {follows.data ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
                {follows.data ? "دنبال می‌کنی" : "دنبال‌کردن هنرمند"}
              </Button>
            )}
            {isOwnProfile && <p className="text-xs text-muted-foreground">برای نمایش اثر در این صفحه، آن را از پرونده هنری با رضایت خودت منتشر کن.</p>}
          </section>

          <Section title="آثار منتشرشده">
            {artworks.isPending ? <LoadingRows rows={3} /> : artworks.error ? (
              <ErrorState error={artworks.error} onRetry={() => void artworks.refetch()} />
            ) : !artworks.data?.length ? (
              <EmptyState title="هنوز اثری برای نمایش نیست" description="آثاری که هنرمند با رضایت خود منتشر کند، اینجا دیده می‌شوند." />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {artworks.data.map((artwork) => (
                  <article key={artwork.id} className="surface overflow-hidden">
                    <img src={artwork.imageUrl} alt={artwork.title} className="aspect-[4/3] w-full bg-muted object-contain" loading="lazy" />
                    <div className="space-y-2 p-4">
                      <h3 className="font-display font-semibold">{artwork.title}</h3>
                      {artwork.description && <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{artwork.description}</p>}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {artwork.technique && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.technique}</span>}
                        {artwork.materials && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.materials}</span>}
                        {artwork.dimensions && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.dimensions}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDateFa(artwork.published_at ?? artwork.created_at, true)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </>
  );
}
