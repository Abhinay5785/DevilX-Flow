"use client";

import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Edit3,
  MoreHorizontal,
  Power,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Course = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

type CourseForm = {
  name: string;
  description: string;
};

const supabase = createClient();

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CoursesPage() {
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [batchCounts, setBatchCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [menuCourseId, setMenuCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm>({
    name: "",
    description: "",
  });
  const [error, setError] = useState("");

  async function loadCourses() {
    setError("");

    const { data, error: coursesError } = await supabase
      .from("courses")
      .select("id,name,description,status,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (coursesError) {
      setError(coursesError.message);
      setCourses([]);
      setLoading(false);
      return;
    }

    const loadedCourses = (data || []) as Course[];
    setCourses(loadedCourses);

    const { data: batches, error: batchesError } = await supabase
      .from("course_batches")
      .select("id,course_id");

    if (!batchesError) {
      const counts: Record<string, number> = {};

      (batches || []).forEach((batch) => {
        counts[batch.course_id] = (counts[batch.course_id] || 0) + 1;
      });

      setBatchCounts(counts);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCourses();

    const channel = supabase
      .channel("courses-page-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "courses",
        },
        () => loadCourses(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "course_batches",
        },
        () => loadCourses(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredCourses = useMemo(() => {
    const query = normalize(search);

    return courses.filter((course) => {
      const matchesSearch =
        !query ||
        normalize(course.name).includes(query) ||
        normalize(course.description).includes(query);

      const matchesStatus =
        statusFilter === "all" || course.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [courses, search, statusFilter]);

  function openCreate() {
    setEditingCourse(null);
    setForm({ name: "", description: "" });
    setError("");
    setShowModal(true);
  }

  function openEdit(course: Course) {
    setEditingCourse(course);
    setForm({
      name: course.name,
      description: course.description || "",
    });
    setError("");
    setMenuCourseId(null);
    setShowModal(true);
  }

  async function saveCourse() {
    const name = form.name.trim();

    if (!name) {
      setError("Course name is required.");
      return;
    }

    setSaving(true);
    setError("");

    const duplicate = courses.some(
      (course) =>
        normalize(course.name) === normalize(name) &&
        course.id !== editingCourse?.id,
    );

    if (duplicate) {
      setError("A course with this name already exists.");
      setSaving(false);
      return;
    }

    if (editingCourse) {
      const { error: updateError } = await supabase
        .from("courses")
        .update({
          name,
          description: form.description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingCourse.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("courses").insert({
        name,
        description: form.description.trim() || null,
        status: "active",
      });

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowModal(false);
    setEditingCourse(null);
    setForm({ name: "", description: "" });
    await loadCourses();
  }

  async function toggleCourse(course: Course) {
    setMenuCourseId(null);

    const nextStatus = course.status === "active" ? "inactive" : "active";

    const { error: updateError } = await supabase
      .from("courses")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", course.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadCourses();
  }

  async function deleteCourse(course: Course) {
    setMenuCourseId(null);

    const count = batchCounts[course.id] || 0;

    if (count > 0) {
      setError(
        `"${course.name}" has ${count} batch${count === 1 ? "" : "es"}. Disable the course instead of deleting it.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete "${course.name}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from("courses")
      .delete()
      .eq("id", course.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadCourses();
  }


  return (
    <main className="courses-page" onClick={() => setMenuCourseId(null)}>
      <div className="ambient ambient-red" />

      <div className="page-shell">
        <header className="page-header">
          <div className="header-left">
            <button
              className="back-button"
              type="button"
              onClick={() => router.push("/dashboard")}
              aria-label="Back to dashboard"
              title="Back to Dashboard"
            >
              <ChevronLeft size={16} className="back-icon" />
            </button>

            <div className="header-copy">
              <span className="eyebrow">DEVILX FLOW / MANAGEMENT</span>
              <div className="title-line">
                <h1>Courses</h1>
                <span className="live-dot"><span />Live</span>
              </div>
              <p>
                Manage your course catalog and configure batches with their own payment rules.
              </p>
            </div>
          </div>

          <button className="create-button" type="button" onClick={openCreate}>
            <CirclePlus size={16} />
            New Course
          </button>
        </header>

        {error && (
          <div className="error-banner">
            <div className="error-symbol"><X size={14} /></div>
            <div className="error-copy">
              <strong>Action could not be completed</strong>
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}

        <section className="toolbar">
          <div className="search-box">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search courses..."
              aria-label="Search courses"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="toolbar-right">
            <span className="showing">
              Showing <strong>{filteredCourses.length}</strong>
            </span>
            <div className="filter-group">
              {(["all", "active", "inactive"] as const).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  className={statusFilter === filter ? "active" : ""}
                  onClick={() => setStatusFilter(filter)}
                >
                  {filter === "all" ? "All" : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="course-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">COURSE CATALOG</span>
              <h2>Courses</h2>
            </div>
            <span className="result-count">
              {filteredCourses.length} {filteredCourses.length === 1 ? "result" : "results"}
            </span>
          </div>

          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <span>Loading course catalog...</span>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-mark"><Archive size={18} /></div>
              <h3>{courses.length ? "No matching courses" : "Your catalog is empty"}</h3>
              <p>
                {courses.length
                  ? "Try changing your search or status filter."
                  : "Create your first course, then add batches and payment amounts."}
              </p>
              {!courses.length && (
                <button type="button" onClick={openCreate}>
                  <CirclePlus size={15} />
                  Create Course
                </button>
              )}
            </div>
          ) : (
            <div className="course-list">
              {filteredCourses.map((course) => {
                const batchCount = batchCounts[course.id] || 0;
                const active = course.status === "active";

                return (
                  <article className="course-card" key={course.id}>
                    <div
                      className="card-click"
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/dashboard/courses/${course.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/dashboard/courses/${course.id}`);
                        }
                      }}
                    >
                      <div className="card-top">
                        <div className="course-mark">
                          <span>{course.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <button
                          type="button"
                          className="more-button"
                          aria-label={`Actions for ${course.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuCourseId(menuCourseId === course.id ? null : course.id);
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>

                      <div className="course-content">
                        <h3>{course.name}</h3>
                        <p>{course.description || "No description added for this course."}</p>

                        <div className={`status ${active ? "active" : ""}`}>
                          <span />
                          {active ? "Live" : "Inactive"}
                        </div>

                        <div className="course-meta">
                          <span className={`batch-meta ${batchCount === 0 ? "course-level-meta" : ""}`}>
                            <Archive size={15} />
                            {batchCount === 0
                              ? "Course-level · No Batch"
                              : `${batchCount} ${batchCount === 1 ? "Batch" : "Batches"}`}
                          </span>
                          <span>Created {formatDate(course.created_at)}</span>
                        </div>
                      </div>

                      <div className="card-footer">
                        <span>View Course</span>
                        <ChevronRight size={17} />
                      </div>
                    </div>

                    {menuCourseId === course.id && (
                      <div
                        className="action-menu"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button type="button" onClick={() => openEdit(course)}>
                          <Edit3 size={14} />
                          Edit course
                        </button>
                        <button type="button" onClick={() => toggleCourse(course)}>
                          <Power size={14} />
                          {active ? "Disable course" : "Activate course"}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => deleteCourse(course)}
                        >
                          <Archive size={14} />
                          Delete course
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setShowModal(false);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-accent" />
            <div className="modal-header">
              <div>
                <span className="section-kicker">
                  {editingCourse ? "EDIT COURSE" : "NEW COURSE"}
                </span>
                <h2>{editingCourse ? "Update course" : "Create course"}</h2>
                <p>
                  {editingCourse
                    ? "Update the basic course information."
                    : "Create the course first. You can configure batches next."}
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                <X size={16} />
              </button>
            </div>

            <div className="form">
              <label>
                <span>Course name</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="e.g. Garuda"
                  maxLength={100}
                />
              </label>

              <label>
                <span>Description <em>Optional</em></span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Short description about this course..."
                  rows={4}
                  maxLength={500}
                />
              </label>

              {error && <div className="modal-error"><X size={13} />{error}</div>}

              <div className="form-note">
                <Check size={13} />
                <span>
                  Course names are unique. Each course can contain multiple batches with different pricing.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-button"
                onClick={saveCourse}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="small-spinner" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    {editingCourse ? "Save Changes" : "Create Course"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        :global(html), :global(body) { margin: 0; min-height: 100%; background: #050505; }
        :global(body) {
          color: #f5f5f5;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .courses-page {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          padding: 36px 44px 70px;
          background:
            radial-gradient(circle at 12% 0%, rgba(255,23,68,.055), transparent 28%),
            radial-gradient(circle at 92% 8%, rgba(255,23,68,.035), transparent 24%),
            #050505;
          color: #f5f5f5;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .ambient { position: fixed; pointer-events: none; z-index: 0; filter: blur(100px); }
        .ambient-red { width: 460px; height: 460px; top: -280px; right: -140px; background: rgba(220,38,38,.075); }

        .page-shell {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: none;
          margin: 0;
          padding: 0;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 32px;
          padding-bottom: 28px;
          border-bottom: 1px solid #202023;
        }

        .header-left { display: flex; align-items: flex-start; gap: 16px; min-width: 0; }
        .back-button {
          width: 42px; height: 42px; flex: 0 0 42px; margin-top: 1px;
          display: grid; place-items: center;
          border: 1px solid #242427; border-radius: 9px;
          background: #0a0a0b; color: #8b8b93; cursor: pointer; transition: .18s ease;
        }
        .back-button:hover { color: #fff; border-color: #3b3b3f; background: #101011; }
        .back-icon { transform: none; }

        .header-copy { min-width: 0; }
        .eyebrow, .section-kicker {
          display: block; color: #707078; font-size: 12px; font-weight: 700;
          letter-spacing: .11em; text-transform: uppercase;
        }
        .title-line { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
        .title-line h1 {
          margin: 0; color: #fafafa; font-size: 38px; line-height: 1.1;
          letter-spacing: -.035em; font-weight: 700;
        }
        .live-dot { display: inline-flex; align-items: center; gap: 7px; color: #4ade80; font-size: 14px; font-weight: 700; }
        .live-dot span { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.08); }
        .header-copy p { margin: 10px 0 0; color: #8b8b94; font-size: 15px; line-height: 1.55; }

        .create-button, .empty-state button, .save-button {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          height: 44px; padding: 0 18px; border: 1px solid #ef2335; border-radius: 8px;
          background: #ef2335; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
          box-shadow: 0 8px 24px rgba(239,35,53,.12); transition: .18s ease;
        }
        .create-button:hover, .empty-state button:hover, .save-button:hover {
          background: #d9182a; border-color: #d9182a; transform: translateY(-1px);
          box-shadow: 0 12px 30px rgba(239,35,53,.18);
        }

        .error-banner {
          display: flex; align-items: center; gap: 11px; margin-top: 20px; padding: 13px 15px;
          border: 1px solid rgba(239,68,68,.22); border-radius: 8px; background: rgba(127,29,29,.10);
        }
        .error-symbol { display: grid; place-items: center; color: #f87171; }
        .error-copy { display: grid; gap: 3px; min-width: 0; }
        .error-copy strong { color: #fca5a5; font-size: 13px; }
        .error-copy span { color: #a1a1aa; font-size: 13px; overflow-wrap: anywhere; }
        .error-banner > button { margin-left: auto; border: 0; background: transparent; color: #777; cursor: pointer; }

        .toolbar {
          display: flex; align-items: center; justify-content: space-between; gap: 24px;
          margin: 26px 0 34px;
        }
        .search-box {
          width: min(610px, 100%); height: 46px; display: flex; align-items: center; gap: 11px;
          padding: 0 14px; border: 1px solid #222225; border-radius: 9px; background: #09090a; color: #7b7b84;
          transition: .18s ease;
        }
        .search-box:focus-within { border-color: rgba(239,68,68,.46); box-shadow: 0 0 0 3px rgba(239,68,68,.05); }
        .search-box input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; color: #eee; font-size: 14px; }
        .search-box input::placeholder { color: #5e5e66; }
        .search-box button { display: grid; place-items: center; border: 0; background: transparent; color: #777; cursor: pointer; }
        .toolbar-right { display: flex; align-items: center; gap: 14px; }
        .showing { color: #777780; font-size: 13px; white-space: nowrap; }
        .showing strong { color: #ddd; }
        .filter-group { display: flex; overflow: hidden; border: 1px solid #242427; border-radius: 9px; background: #09090a; }
        .filter-group button {
          height: 40px; padding: 0 16px; border: 0; border-right: 1px solid #1d1d20;
          background: transparent; color: #85858d; font-size: 13px; cursor: pointer; transition: .16s ease;
        }
        .filter-group button:last-child { border-right: 0; }
        .filter-group button:hover { color: #fff; background: #101012; }
        .filter-group button.active { color: #fff; background: #c91427; }

        .course-section { padding-top: 1px; }
        .section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .section-heading h2 { margin: 5px 0 0; color: #f2f2f3; font-size: 22px; line-height: 1.2; font-weight: 700; letter-spacing: -.025em; }
        .result-count { color: #65656d; font-size: 13px; }

        .course-list {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 350px));
          gap: 20px;
          justify-content: start;
          align-items: stretch;
        }

        .course-card {
          position: relative; width: 100%; height: 360px; min-width: 0;
          border: 1px solid #202023; border-radius: 11px;
          background: linear-gradient(145deg, #101011 0%, #0a0a0b 100%);
          overflow: visible; box-shadow: 0 10px 30px rgba(0,0,0,.16);
          transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease;
        }
        .course-card:hover { border-color: #3a1a1d; transform: translateY(-2px); box-shadow: 0 16px 40px rgba(0,0,0,.26); }

        .card-click {
          width: 100%; height: 100%; padding: 22px;
          border: 0; background: transparent; color: inherit; text-align: left;
          cursor: pointer; display: flex; flex-direction: column; outline: none;
        }
        .card-click:focus-visible { box-shadow: inset 0 0 0 2px rgba(239,68,68,.65); border-radius: 10px; }
        .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .course-mark {
          width: 54px; height: 54px; flex: 0 0 54px; display: grid; place-items: center;
          border: 1px solid rgba(239,68,68,.25); border-radius: 10px;
          background: linear-gradient(145deg, rgba(127,29,29,.44), rgba(69,10,10,.25));
          color: #ff3448; font-size: 23px; font-weight: 800;
        }
        .more-button {
          width: 32px; height: 32px; display: grid; place-items: center;
          border: 1px solid transparent; border-radius: 7px; background: transparent; color: #777780; cursor: pointer; transition: .16s ease;
        }
        .more-button:hover { color: #fff; border-color: #28282c; background: #151516; }

        .course-content { margin-top: 18px; display: flex; flex-direction: column; flex: 1; min-height: 0; }
        .course-content h3 { margin: 0; color: #f5f5f6; font-size: 20px; line-height: 1.25; font-weight: 700; letter-spacing: -.02em; overflow-wrap: anywhere; }
        .course-content p {
          margin: 8px 0 0; min-height: 43px; color: #8f8f98; font-size: 14px; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .status { display: inline-flex; align-items: center; gap: 8px; margin-top: 17px; color: #8f8f98; font-size: 14px; font-weight: 600; }
        .status span { width: 8px; height: 8px; border-radius: 50%; background: #6d6d75; }
        .status.active { color: #4ade80; }
        .status.active span { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.08); }
        .course-meta { display: flex; flex-direction: column; gap: 9px; margin-top: 15px; padding-top: 14px; border-top: 1px solid #1c1c1f; color: #777780; font-size: 13px; }
        .batch-meta { display: inline-flex; align-items: center; gap: 8px; color: #d0d0d4; }
        .card-footer { margin-top: auto; padding-top: 14px; border-top: 1px solid #1c1c1f; display: flex; align-items: center; justify-content: space-between; color: #ff3448; font-size: 14px; font-weight: 700; }
        .card-footer svg { transition: transform .16s ease; }
        .course-card:hover .card-footer svg { transform: translateX(3px); }

        .action-menu {
          position: absolute; z-index: 20; top: 57px; right: 13px; width: 185px; padding: 6px;
          border: 1px solid #29292d; border-radius: 9px; background: #111113; box-shadow: 0 20px 55px rgba(0,0,0,.58);
        }
        .action-menu button { width: 100%; display: flex; align-items: center; gap: 9px; padding: 10px; border: 0; border-radius: 6px; background: transparent; color: #c5c5ca; font-size: 13px; text-align: left; cursor: pointer; }
        .action-menu button:hover { background: #1b1b1e; color: #fff; }
        .action-menu button.danger { color: #f87171; }

        .loading-state, .empty-state {
          min-height: 300px; display: grid; place-items: center; align-content: center; gap: 10px;
          border: 1px solid #202023; border-radius: 11px; background: #09090a; text-align: center; padding: 35px;
        }
        .spinner { width: 28px; height: 28px; border: 2px solid #242427; border-top-color: #ef2335; border-radius: 50%; animation: spin .8s linear infinite; }
        .small-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
        .loading-state span { color: #85858d; font-size: 14px; }
        .empty-mark { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid rgba(239,68,68,.22); background: rgba(127,29,29,.16); color: #ef4444; border-radius: 9px; }
        .empty-state h3 { margin: 2px 0 0; font-size: 19px; }
        .empty-state p { margin: 0; color: #77777f; font-size: 14px; max-width: 440px; line-height: 1.5; }

        .modal-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.76); backdrop-filter: blur(7px); }
        .modal { width: min(100%, 540px); position: relative; border: 1px solid #29292d; border-radius: 11px; background: #101011; box-shadow: 0 30px 80px rgba(0,0,0,.65); padding: 24px; overflow: hidden; }
        .modal-accent { position: absolute; left: 0; top: 0; width: 100%; height: 2px; background: #ef2335; }
        .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; margin-bottom: 21px; }
        .modal-header h2 { margin: 6px 0 5px; font-size: 21px; letter-spacing: -.03em; }
        .modal-header p { max-width: 390px; margin: 0; color: #808089; font-size: 14px; line-height: 1.5; }
        .modal-close { width: 35px; height: 35px; display: grid; place-items: center; border: 1px solid #28282b; border-radius: 8px; color: #8a8a92; background: #151516; cursor: pointer; }
        .form { display: grid; gap: 15px; }
        .form label { display: grid; gap: 7px; }
        .form label > span { color: #c5c5ca; font-size: 14px; font-weight: 700; }
        .form label em { color: #66666e; font-style: normal; font-weight: 500; }
        .form input, .form textarea { width: 100%; border: 1px solid #29292d; border-radius: 8px; outline: none; background: #09090a; color: #f4f4f5; font-size: 14px; transition: .16s ease; }
        .form input { height: 44px; padding: 0 12px; }
        .form textarea { min-height: 96px; resize: vertical; padding: 11px 12px; line-height: 1.5; }
        .form input:focus, .form textarea:focus { border-color: rgba(239,68,68,.55); box-shadow: 0 0 0 3px rgba(239,68,68,.07); }
        .form input::placeholder, .form textarea::placeholder { color: #55555e; }
        .modal-error { display: flex; align-items: center; gap: 7px; padding: 10px; border: 1px solid rgba(239,68,68,.18); border-radius: 8px; color: #fca5a5; background: rgba(127,29,29,.08); font-size: 14px; }
        .form-note { display: flex; align-items: flex-start; gap: 7px; padding: 10px; border: 1px solid #202023; border-radius: 8px; color: #77777f; background: #0b0b0c; font-size: 13px; line-height: 1.45; }
        .form-note :global(svg) { flex: 0 0 auto; color: #f87171; margin-top: 1px; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #202023; }
        .cancel-button { height: 40px; padding: 0 15px; border: 1px solid #29292d; border-radius: 8px; color: #a0a0a8; background: #151516; font-size: 14px; font-weight: 700; cursor: pointer; }
        .save-button { height: 40px; min-width: 130px; }
        button:disabled { cursor: not-allowed; opacity: .55; }
        button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid rgba(248,113,113,.55); outline-offset: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 1180px) {
          .courses-page { padding-left: 32px; padding-right: 32px; }
          .course-list { grid-template-columns: repeat(2, minmax(0, 350px)); }
        }
        @media (max-width: 760px) {
          .courses-page { padding: 28px 28px 52px; }
          .page-header { flex-direction: column; gap: 20px; }
          .create-button { width: 100%; }
          .toolbar { align-items: stretch; flex-direction: column; margin-top: 24px; }
          .search-box { width: 100%; }
          .toolbar-right { justify-content: space-between; }
          .course-list { grid-template-columns: minmax(0, 1fr); }
          .course-card { height: 350px; }
        }
        @media (max-width: 520px) {
          .title-line h1 { font-size: 30px; }
          .back-button { display: none; }
          .toolbar-right { align-items: stretch; flex-direction: column; }
          .filter-group { width: 100%; }
          .filter-group button { flex: 1; }
          .course-card { height: 345px; }
          .card-click { padding: 20px; }
        }
`}</style>
    </main>
  );
}
