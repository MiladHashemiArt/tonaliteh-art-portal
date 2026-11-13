import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Phone, MapPin, RefreshCw, UserRound } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Input } from "@/components/ui/input";
import { studentsQuery } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";
import { StudentRecordView } from "./app.staff.students.$studentId";

export const Route = createFileRoute("/app/staff/students")({
  head: () => ({ meta: [{ title: "هنرجویان | تنالیته" }] }),
  component: StaffStudentsPage,
});

function StaffStudentsPage() {
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const students = useQuery(studentsQuery());

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const rows = students.data ?? [];
    if (!term) return rows;
    return rows.filter((student) =>
      [student.full_name, student.phone, student.home_address].some((value) =>
        (value ?? "").toLocaleLowerCase().includes(term),
      ),
    );
  }, [students.data, search]);

  if (selectedStudentId) return <StudentRecordView studentId={selectedStudentId} onBack={() => setSelectedStudentId(null)} />;

  return (
    <>
      <PageHeader
        back={{ to: "/app" }}
        eyebrow="مدیریت آموزشگاه"
        title="هنرجویان"
        description="فهرست هنرجویان ثبت‌نام‌شده در گروه هنری تنالیته."
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="surface flex items-center gap-4 p-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-bronze/10 text-bronze">
            <Users className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">تعداد هنرجویان</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {students.isLoading ? "…" : toPersianDigits(students.data?.length ?? 0)}
            </p>
          </div>
        </div>
        <div className="surface flex items-center gap-4 p-4">
          <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground">
            <UserRound className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">نتیجهٔ جست‌وجو</p>
            <p className="mt-1 font-display text-2xl font-semibold">
              {students.isLoading ? "…" : toPersianDigits(filteredStudents.length)}
            </p>
          </div>
        </div>
      </section>

      <div className="relative mb-5">
        <Search
          className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="جست‌وجو بر اساس نام، شماره تماس یا نشانی…"
          aria-label="جست‌وجوی هنرجویان"
          className="pr-10"
        />
      </div>

      {students.isLoading ? (
        <LoadingRows rows={4} />
      ) : students.isError ? (
        <ErrorState error={students.error} onRetry={() => void students.refetch()} />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          title={search ? "هنرجویی با این مشخصات پیدا نشد" : "هنوز هنرجویی ثبت‌نام نکرده است"}
          description={
            search
              ? "عبارت جست‌وجو را تغییر دهید و دوباره تلاش کنید."
              : "پس از ثبت‌نام هنرجویان، اطلاعات آن‌ها در این بخش نمایش داده می‌شود."
          }
          icon={<Users className="size-7" aria-hidden />}
        />
      ) : (
        <div className="space-y-3">
          {filteredStudents.map((student, index) => (
            <article key={student.id} className="surface p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <ProfileAvatar path={student.avatar_path} name={student.full_name} className="size-12 ring-2 ring-bronze/10" fallbackClassName="text-base" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-foreground">
                      <button type="button" onClick={() => setSelectedStudentId(student.id)} className="inline-flex min-h-10 items-center gap-2 text-right hover:text-bronze hover:underline underline-offset-4">
                        {student.full_name || "هنرجوی بدون نام"}
                      <span className="text-xs font-normal text-bronze">مشاهده پرونده ←</span></button>
                    </h2>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                      {toPersianDigits(index + 1)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    {student.phone ? (
                      <a
                        href={`tel:${student.phone}`}
                        className="flex items-center gap-2 hover:text-bronze"
                        dir="ltr"
                      >
                        <Phone className="size-4 shrink-0" aria-hidden />
                        <span>{toPersianDigits(student.phone)}</span>
                      </a>
                    ) : (
                      <p className="flex items-center gap-2">
                        <Phone className="size-4 shrink-0" aria-hidden />
                        شماره تماس ثبت نشده
                      </p>
                    )}
                    <div className="flex min-w-0 items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {student.home_address ? <div className="min-w-0 space-y-1">
                        <a className="block break-words hover:text-bronze" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(student.home_address)}`}>{student.home_address}</a>
                        <div className="flex flex-wrap gap-3 text-xs"><a className="text-bronze hover:underline" target="_blank" rel="noreferrer" href="https://neshan.org/maps">نشان</a><a className="text-bronze hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(student.home_address)}`}>نقشهٔ جایگزین</a></div>
                      </div> : <span>نشانی ثبت نشده</span>}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {students.data && students.data.length > 0 && (
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <RefreshCw className="ml-1 inline size-3" aria-hidden />
          اطلاعات از پایگاه دادهٔ تنالیته دریافت می‌شود.
        </p>
      )}
    </>
  );
}
