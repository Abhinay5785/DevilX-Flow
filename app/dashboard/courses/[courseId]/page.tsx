"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  CreditCard,
  ChevronRight,
  CirclePlus,
  Edit3,
  Layers3,
  MessageCircle,
  MoreHorizontal,
  Power,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Course = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

type Batch = {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  advance_amount: number;
  balance_amount: number;
  full_amount: number;
  payment_mode: "single" | "split";
  status: "active" | "inactive";
  start_date: string | null;
  end_date: string | null;
  whatsapp_community_url: string | null;
  whatsapp_doubts_url: string | null;
  created_at: string;
  updated_at: string;
};

type BatchForm = {
  name: string;
  description: string;
  advance_amount: string;
  balance_amount: string;
  full_amount: string;
  payment_mode: "single" | "split";
  start_date: string;
  end_date: string;
  whatsapp_community_url: string;
  whatsapp_doubts_url: string;
};

type CoursePayment = {
  id: string;
  payment_id: string | null;
  customer_id: string | null;
  amount: number;
  status: string | null;
  payment_time: string | null;
  payment_type: string | null;
  course: string | null;
  batch: string | null;
};

type CourseStudent = {
  id: string;
  name: string | null;
  age: number | string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  batch: string | null;
  paymentCount: number;
  totalPaid: number;
  lastPaymentTime: string | null;
};

const supabase = createClient();

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
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

const emptyForm: BatchForm = {
  name: "",
  description: "",
  advance_amount: "",
  balance_amount: "",
  full_amount: "",
  payment_mode: "split",
  start_date: "",
  end_date: "",
  whatsapp_community_url: "",
  whatsapp_doubts_url: "",
};

export default function CourseDetailsPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const courseId = params.courseId;

  const [course, setCourse] = useState<Course | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [courseStudentCount, setCourseStudentCount] = useState(0);
  const [coursePayments, setCoursePayments] = useState<CoursePayment[]>([]);
  const [courseStudents, setCourseStudents] = useState<CourseStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [menuBatchId, setMenuBatchId] = useState<string | null>(null);
  const [form, setForm] = useState<BatchForm>(emptyForm);
  const [error, setError] = useState("");

  async function loadData() {
    if (!courseId) return;

    setError("");

    const [courseResult, batchesResult] = await Promise.all([
      supabase
        .from("courses")
        .select("id,name,description,status,created_at,updated_at")
        .eq("id", courseId)
        .maybeSingle(),

      supabase
        .from("course_batches")
        .select(
          "id,course_id,name,description,advance_amount,balance_amount,full_amount,payment_mode,status,start_date,end_date,whatsapp_community_url,whatsapp_doubts_url,created_at,updated_at",
        )
        .eq("course_id", courseId)
        .order("created_at", { ascending: true }),
    ]);

    if (courseResult.error) {
      setError(courseResult.error.message);
      setCourse(null);
      setBatches([]);
      setStudentCounts({});
      setCourseStudentCount(0);
      setCoursePayments([]);
      setCourseStudents([]);
      setLoading(false);
      return;
    }

    const courseData = courseResult.data as Course | null;
    setCourse(courseData);

    if (!courseData) {
      setBatches([]);
      setStudentCounts({});
      setCourseStudentCount(0);
      setCoursePayments([]);
      setCourseStudents([]);
      setLoading(false);
      return;
    }

    if (batchesResult.error) {
      setError(batchesResult.error.message);
      setBatches([]);
      setStudentCounts({});
      setCourseStudentCount(0);
      setCoursePayments([]);
      setLoading(false);
      return;
    }

    const nextBatches = (batchesResult.data || []) as Batch[];
    setBatches(nextBatches);

    // Course + batch membership is calculated from BOTH customers and
    // payment-level routing data. Payment-level course/batch is historical
    // and therefore remains correct even if a customer later changes batch.
    const [{ data: customerRows, error: customersError }, { data: paymentRows, error: paymentsError }] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id,name,age,city,phone,email,course,batch")
          .ilike("course", courseData.name),

        supabase
          .from("payments")
          .select("id,payment_id,customer_id,amount,status,payment_time,payment_type,course,batch")
          .ilike("course", courseData.name)
          .order("payment_time", { ascending: false })
          .limit(500),
      ]);

    if (customersError) {
      setError(customersError.message);
      setStudentCounts({});
      setCourseStudentCount(0);
    } else if (paymentsError) {
      setError(paymentsError.message);
      setStudentCounts({});
      setCourseStudentCount((customerRows || []).length);
    } else {
      const customers = customerRows || [];
      const payments = (paymentRows || []) as CoursePayment[];

      setCoursePayments(payments);

      const courseStudentIds = new Set<string>();
      const studentMap = new Map<string, CourseStudent>();

      customers.forEach((row) => {
        if (!row.id) return;

        studentMap.set(row.id, {
          id: row.id,
          name: row.name || "Student",
          age: row.age ?? null,
          city: row.city || null,
          email: row.email || null,
          phone: row.phone || null,
          batch: row.batch || null,
          paymentCount: 0,
          totalPaid: 0,
          lastPaymentTime: null,
        });
        courseStudentIds.add(row.id);
      });

      payments.forEach((payment) => {
        if (!payment.customer_id) return;

        courseStudentIds.add(payment.customer_id);

        const existing = studentMap.get(payment.customer_id) || {
          id: payment.customer_id,
          name: "Student",
          age: null,
          city: null,
          email: null,
          phone: null,
          batch: null,
          paymentCount: 0,
          totalPaid: 0,
          lastPaymentTime: null,
        };

        if (String(payment.status || "").toLowerCase() === "captured") {
          existing.paymentCount += 1;
          existing.totalPaid += Number(payment.amount || 0);
          if (payment.payment_time && (!existing.lastPaymentTime || new Date(payment.payment_time).getTime() > new Date(existing.lastPaymentTime).getTime())) {
            existing.lastPaymentTime = payment.payment_time;
          }

          // Consultation is course-level, so the display batch is always No Batch.
          if (normalize(payment.course) === "consultation") {
            existing.batch = null;
          } else if (!existing.batch && payment.batch) {
            existing.batch = payment.batch;
          }
        }

        studentMap.set(payment.customer_id, existing);
      });

      // Keep students ordered by their most recent captured payment.
      // Newest payment appears first; students without a payment stay at the bottom.
      setCourseStudents(
        Array.from(studentMap.values()).sort((a, b) => {
          const aTime = a.lastPaymentTime ? new Date(a.lastPaymentTime).getTime() : 0;
          const bTime = b.lastPaymentTime ? new Date(b.lastPaymentTime).getTime() : 0;
          return bTime - aTime;
        }),
      );

      const counts: Record<string, number> = {};
      const batchStudentSets: Record<string, Set<string>> = {};

      nextBatches.forEach((batch) => {
        counts[batch.id] = 0;
        batchStudentSets[batch.id] = new Set<string>();
      });

      // Existing customer membership remains visible, including customers
      // who have not paid yet.
      customers.forEach((row) => {
        if (!row.id) return;

        courseStudentIds.add(row.id);

        const matchingBatch = nextBatches.find(
          (batch) => normalize(batch.name) === normalize(row.batch),
        );

        if (matchingBatch) {
          batchStudentSets[matchingBatch.id].add(row.id);
        }
      });

      // Payment routing is authoritative for historical transactions.
      payments.forEach((payment) => {
        if (!payment.customer_id) return;
        courseStudentIds.add(payment.customer_id);

        if (String(payment.status || "").toLowerCase() !== "captured") return;

        const matchingBatch = nextBatches.find(
          (batch) =>
            normalize(batch.name) === normalize(payment.batch) &&
            normalize(payment.course) === normalize(courseData.name),
        );

        if (matchingBatch) {
          batchStudentSets[matchingBatch.id].add(payment.customer_id);
        }
      });

      nextBatches.forEach((batch) => {
        counts[batch.id] = batchStudentSets[batch.id].size;
      });

      setStudentCounts(counts);
      setCourseStudentCount(courseStudentIds.size);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel(`course-details-${courseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "courses",
          filter: `id=eq.${courseId}`,
        },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "course_batches",
          filter: `course_id=eq.${courseId}`,
        },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
        },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        () => loadData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId]);

  const activeBatches = useMemo(
    () => batches.filter((batch) => batch.status === "active").length,
    [batches],
  );

  const inactiveBatches = batches.length - activeBatches;

  const totalFullValue = useMemo(
    () =>
      batches.reduce(
        (sum, batch) => sum + Number(batch.full_amount || 0),
        0,
      ),
    [batches],
  );


  const courseLevelSummary = useMemo(() => {
    const captured = coursePayments.filter(
      (payment) => String(payment.status || "").toLowerCase() === "captured",
    );

    const students = new Set(
      captured
        .map((payment) => payment.customer_id)
        .filter(Boolean),
    );

    const revenue = captured.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );

    return {
      students: students.size,
      payments: captured.length,
      revenue,
    };
  }, [coursePayments]);

  function openCreate() {
    setEditingBatch(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(batch: Batch) {
    setEditingBatch(batch);
    setForm({
      name: batch.name,
      description: batch.description ?? "",
      advance_amount: String(batch.advance_amount ?? ""),
      balance_amount: String(batch.balance_amount ?? ""),
      full_amount: String(batch.full_amount ?? ""),
      payment_mode: batch.payment_mode === "single" ? "single" : "split",
      start_date: batch.start_date ?? "",
      end_date: batch.end_date ?? "",
      whatsapp_community_url: batch.whatsapp_community_url ?? "",
      whatsapp_doubts_url: batch.whatsapp_doubts_url ?? "",
    });
    setError("");
    setMenuBatchId(null);
    setShowModal(true);
  }

  function validateForm() {
    const name = form.name.trim();
    const advance = form.payment_mode === "single" ? 0 : Number(form.advance_amount);
    const balance = form.payment_mode === "single" ? 0 : Number(form.balance_amount);
    const full = Number(form.full_amount);

    if (!name) return "Batch name is required.";

    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      return "End date cannot be before the start date.";
    }

    if (!Number.isFinite(full) || full <= 0) {
      return "Enter a valid payment amount.";
    }

    if (form.payment_mode === "split") {
      if (!Number.isFinite(advance) || !Number.isFinite(balance)) {
        return "Enter valid Advance and Balance amounts.";
      }

      if (advance < 0 || balance < 0) {
        return "Advance and Balance cannot be negative.";
      }

      if (Math.abs(advance + balance - full) > 0.01) {
        return "Full amount should equal Advance + Balance.";
      }
    }

    const duplicate = batches.some(
      (batch) =>
        normalize(batch.name) === normalize(name) &&
        batch.id !== editingBatch?.id,
    );

    if (duplicate) {
      return "This batch name already exists under this course.";
    }

    return "";
  }

  async function saveBatch() {
    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      advance_amount: form.payment_mode === "single" ? 0 : Number(form.advance_amount),
      balance_amount: form.payment_mode === "single" ? 0 : Number(form.balance_amount),
      full_amount: Number(form.full_amount),
      payment_mode: form.payment_mode,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      whatsapp_community_url: form.whatsapp_community_url.trim() || null,
      whatsapp_doubts_url: form.whatsapp_doubts_url.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingBatch) {
      const { error: updateError } = await supabase
        .from("course_batches")
        .update(payload)
        .eq("id", editingBatch.id)
        .eq("course_id", courseId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("course_batches")
        .insert({
          course_id: courseId,
          ...payload,
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
    setEditingBatch(null);
    setForm(emptyForm);
    await loadData();
  }

  async function toggleBatch(batch: Batch) {
    setMenuBatchId(null);

    const nextStatus = batch.status === "active" ? "inactive" : "active";

    const { error: updateError } = await supabase
      .from("course_batches")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .eq("course_id", courseId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await loadData();
  }

  async function deleteBatch(batch: Batch) {
    setMenuBatchId(null);

    const confirmed = window.confirm(
      `Delete "${batch.name}" from ${course?.name || "this course"}?`,
    );

    if (!confirmed) return;

    const { error: deleteError } = await supabase
      .from("course_batches")
      .delete()
      .eq("id", batch.id)
      .eq("course_id", courseId);

    if (deleteError) {
      setError(
        `Could not delete this batch. If payments or customers already reference it, disable it instead. ${deleteError.message}`,
      );
      return;
    }

    await loadData();
  }

  const filteredCourseStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return courseStudents;

    return courseStudents.filter((student) =>
      [student.name, student.email, student.phone, student.city]
        .some((value) => String(value ?? "").toLowerCase().includes(query)),
    );
  }, [courseStudents, studentSearch]);

  const STUDENTS_PER_PAGE = 15;

  const totalStudentPages = Math.max(
    1,
    Math.ceil(filteredCourseStudents.length / STUDENTS_PER_PAGE),
  );

  const paginatedCourseStudents = useMemo(() => {
    const safePage = Math.min(studentPage, totalStudentPages);
    const start = (safePage - 1) * STUDENTS_PER_PAGE;
    return filteredCourseStudents.slice(start, start + STUDENTS_PER_PAGE);
  }, [filteredCourseStudents, studentPage, totalStudentPages]);

  useEffect(() => {
    setStudentPage(1);
  }, [studentSearch]);

  useEffect(() => {
    if (studentPage > totalStudentPages) {
      setStudentPage(totalStudentPages);
    }
  }, [studentPage, totalStudentPages]);

  if (loading) {
    return (
      <main className="courses-page">
        <div className="loading-screen">
          <div className="spinner" />
          <span>Loading course…</span>
        </div>
        <style jsx>{baseStyles}</style>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="courses-page">
        <div className="not-found">
          <span className="section-kicker">COURSE</span>
          <h1>Course not found</h1>
          <p>
            This course may have been removed, or the link is no longer valid.
          </p>
          <button type="button" onClick={() => router.push("/dashboard/courses")}>
            <ArrowLeft size={15} />
            Back to Courses
          </button>
        </div>
        <style jsx>{baseStyles}</style>
      </main>
    );
  }


  return (
    <main className="courses-page" onClick={() => setMenuBatchId(null)}>
      <div className="glow glow-red" />

      <div className="page-shell">
        <header className="page-header">
          <div className="header-left">
            <button
              type="button"
              className="back-button"
              onClick={() => router.push("/dashboard/courses")}
              aria-label="Back to courses"
              title="Back to Courses"
            >
              <ArrowLeft size={17} />
            </button>

            <div className="page-title-copy">
              {batches.length === 0 && <span className="eyebrow">COURSE-LEVEL</span>}
              <div className="title-line">
                <h1>
                  {course.name}
                  {batches.length === 0 && <span className="title-separator"> · No Batch</span>}
                </h1>
                {batches.length === 0 ? (
                  <span className="no-batch-header-pill">No Batch</span>
                ) : (
                  <span className={`status ${course.status === "active" ? "active" : ""}`}>
                    <span />
                    {course.status === "active" ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
              <p>
                {course.description ||
                  (batches.length === 0
                    ? "This course accepts payments without a batch. New payments that match this course are shown here automatically."
                    : "Configure batches and payment amounts for this course.")}
              </p>
            </div>
          </div>

          {batches.length > 0 && (
            <button
            className="create-button"
            type="button"
            onClick={openCreate}
            disabled={course.status !== "active"}
            title={
              course.status !== "active"
                ? "Activate the course before creating a batch"
                : "Create Batch"
            }
          >
            <CirclePlus size={17} />
            Create Batch
            </button>
          )}
        </header>

        {error && (
          <div className="error-banner">
            <div>
              <strong>Something needs your attention</strong>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}


        <section className="batch-section">
          {batches.length > 0 && (
            <div className="section-heading">
              <div>
                <span className="section-kicker">BATCHES</span>
                <h2>Course batches</h2>
              </div>
              <span className="result-count">
                {batches.length} {batches.length === 1 ? "batch" : "batches"}
              </span>
            </div>
          )}

          {batches.length === 0 ? (
            <div className="course-level-panel">
              <div className="course-level-stats">
                <div>
                  <span className="stat-icon students"><Users size={21} /></span>
                  <small>Total Students</small>
                  <strong>{courseStudentCount.toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span className="stat-icon payments"><CreditCard size={21} /></span>
                  <small>Total Payments</small>
                  <strong>{courseLevelSummary.payments.toLocaleString("en-IN")}</strong>
                </div>
                <div>
                  <span className="stat-icon revenue">₹</span>
                  <small>Total Revenue</small>
                  <strong>{formatCurrency(courseLevelSummary.revenue)}</strong>
                </div>
              </div>

              <div className="student-table-card">
                <div className="student-table-toolbar">
                  <div className="student-table-title">
                    <Users size={20} />
                    <div>
                      <h2>Students</h2>
                      <p>{course.name} · No Batch</p>
                    </div>
                  </div>

                  <div className="student-table-actions">
                    <label className="student-search">
                      <Search size={17} />
                      <input
                        value={studentSearch}
                        onChange={(event) => setStudentSearch(event.target.value)}
                        placeholder="Search by name, email, phone or city..."
                        aria-label="Search students"
                      />
                    </label>
                    <span className="student-count-pill">{filteredCourseStudents.length} students</span>
                  </div>
                </div>

                {filteredCourseStudents.length === 0 ? (
                  <div className="course-level-empty">
                    {studentSearch ? "No students match your search." : "No students linked to this course yet."}
                  </div>
                ) : (
                  <div className="student-table-scroll">
                    <table className="student-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Age</th>
                          <th>City</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Payments</th>
                          <th>Total Paid</th>
                          <th>Payment Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedCourseStudents.map((student) => (
                          <tr key={student.id}>
                            <td>
                              <div className="table-student">
                                <span className="student-avatar">
                                  {(student.name || "S").charAt(0).toUpperCase()}
                                </span>
                                <span>
                                  <strong>{student.name || "Student"}</strong>
                                  <small>Consultation · No Batch</small>
                                </span>
                              </div>
                            </td>
                            <td>{student.age ?? "—"}</td>
                            <td>{student.city || "—"}</td>
                            <td className="email-cell">{student.email || "—"}</td>
                            <td className="phone-cell">{student.phone || "—"}</td>
                            <td>{student.paymentCount}</td>
                            <td><strong>{formatCurrency(student.totalPaid)}</strong></td>
                            <td>
                              {student.lastPaymentTime ? (
                                <span className="payment-time">
                                  <strong>{formatDate(student.lastPaymentTime)}</strong>
                                  <small>{new Date(student.lastPaymentTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small>
                                </span>
                              ) : "—"}
                            </td>
                            <td>
                              <span className="paid-status"><span /> Paid</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="student-table-footer">
                  <span>
                    {filteredCourseStudents.length === 0
                      ? "Showing 0 students"
                      : `Showing ${Math.min(
                          (studentPage - 1) * STUDENTS_PER_PAGE + 1,
                          filteredCourseStudents.length,
                        )}-${Math.min(
                          studentPage * STUDENTS_PER_PAGE,
                          filteredCourseStudents.length,
                        )} of ${filteredCourseStudents.length} students`}
                  </span>

                  {totalStudentPages > 1 && (
                    <div className="student-pagination" aria-label="Student pages">
                      <button
                        type="button"
                        className="pagination-button"
                        onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
                        disabled={studentPage === 1}
                        aria-label="Previous page"
                      >
                        <ArrowLeft size={14} />
                      </button>

                      <div className="pagination-pages">
                        {Array.from({ length: totalStudentPages }, (_, index) => index + 1).map(
                          (page) => (
                            <button
                              key={page}
                              type="button"
                              className={`pagination-page ${
                                studentPage === page ? "active" : ""
                              }`}
                              onClick={() => setStudentPage(page)}
                              aria-current={studentPage === page ? "page" : undefined}
                            >
                              {page}
                            </button>
                          ),
                        )}
                      </div>

                      <button
                        type="button"
                        className="pagination-button"
                        onClick={() =>
                          setStudentPage((page) => Math.min(totalStudentPages, page + 1))
                        }
                        disabled={studentPage === totalStudentPages}
                        aria-label="Next page"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="course-level-bottom">
                <button
                  type="button"
                  className="course-level-action"
                  onClick={openCreate}
                  disabled={course.status !== "active"}
                >
                  <CirclePlus size={16} />
                  Add a Batch to this Course
                </button>
                <span>Only add a batch if you want to create scheduled batches for this course.</span>
              </div>
            </div>
          ) : (
            <div className="batch-grid">
              {batches.map((batch) => {
                const active = batch.status === "active";
                const studentCount = studentCounts[batch.id] ?? 0;

                return (
                  <article className="batch-card" key={batch.id}>
                    <div className="batch-card-top">
                      <div className="batch-icon">
                        <CalendarDays size={20} />
                      </div>

                      <div className="batch-menu-wrap">
                        <button
                          type="button"
                          className="more-button"
                          aria-label={`Actions for ${batch.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuBatchId(
                              menuBatchId === batch.id ? null : batch.id,
                            );
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>

                        {menuBatchId === batch.id && (
                          <div
                            className="action-menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button type="button" onClick={() => openEdit(batch)}>
                              <Edit3 size={14} />
                              Edit batch
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleBatch(batch)}
                            >
                              <Power size={14} />
                              {active ? "Disable batch" : "Activate batch"}
                            </button>

                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteBatch(batch)}
                            >
                              <X size={14} />
                              Delete batch
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="batch-card-heading">
                      <div>
                        <div className="batch-name-row">
                          <h3>{batch.name}</h3>
                          <span className={`status ${active ? "active" : ""}`}>
                            <span />
                            {active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p>{course.name}</p>
                        {batch.description && (
                          <div className="batch-description">
                            {batch.description}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="batch-details-grid">
                      <div className="detail-item">
                        <Users size={17} />
                        <span>
                          <small>Students</small>
                          <strong>{studentCount}</strong>
                        </span>
                      </div>

                      <div className="detail-item">
                        <CalendarDays size={17} />
                        <span>
                          <small>Start Date</small>
                          <strong>{batch.start_date ? formatDate(batch.start_date) : "Not set"}</strong>
                        </span>
                      </div>

                      <div className="detail-item">
                        <CalendarDays size={17} />
                        <span>
                          <small>End Date</small>
                          <strong>{batch.end_date ? formatDate(batch.end_date) : "Not set"}</strong>
                        </span>
                      </div>

                      <div className="detail-item">
                        <Layers3 size={17} />
                        <span>
                          <small>Full Fee</small>
                          <strong>{formatCurrency(batch.full_amount)}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="price-strip">
                      {batch.payment_mode === "single" ? (
                        <div className="single-price">
                          <small>Payment</small>
                          <strong>{formatCurrency(batch.full_amount)}</strong>
                        </div>
                      ) : (
                        <>
                          <div>
                            <small>Advance</small>
                            <strong>{formatCurrency(batch.advance_amount)}</strong>
                          </div>
                          <div>
                            <small>Balance</small>
                            <strong>{formatCurrency(batch.balance_amount)}</strong>
                          </div>
                          <div>
                            <small>Full</small>
                            <strong>{formatCurrency(batch.full_amount)}</strong>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="view-batch-button"
                      onClick={() =>
                        router.push(
                          `/dashboard/courses/${course.id}/batch/${batch.id}`,
                        )
                      }
                    >
                      View Batch
                      <ChevronRight size={16} />
                    </button>
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
            if (event.target === event.currentTarget && !saving) {
              setShowModal(false);
            }
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <span className="section-kicker">
                  {editingBatch ? "EDIT BATCH" : "NEW BATCH"}
                </span>
                <h2>{editingBatch ? "Edit batch" : "Create batch"}</h2>
                <p>
                  {course.name} · Set the batch schedule and payment amounts.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                <X size={17} />
              </button>
            </div>

            <div className="form">
              <label>
                <span>Batch name</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Batch 1"
                  maxLength={100}
                />
              </label>

              <label>
                <span>Batch description</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe what this batch includes, who it is for, or what students will learn..."
                  rows={3}
                  maxLength={300}
                />
                <small className="field-help">Optional. Keep it short so it looks clean on the batch card.</small>
              </label>

              <div className="payment-mode-section">
                <span className="form-label">Payment structure</span>
                <div className="payment-mode-grid">
                  <button
                    type="button"
                    className={`payment-mode-option ${form.payment_mode === "single" ? "selected" : ""}`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        payment_mode: "single",
                        advance_amount: "0",
                        balance_amount: "0",
                      }))
                    }
                  >
                    <span className="payment-mode-radio" />
                    <span>
                      <strong>Single Payment</strong>
                      <small>One amount paid directly</small>
                    </span>
                  </button>

                  <button
                    type="button"
                    className={`payment-mode-option ${form.payment_mode === "split" ? "selected" : ""}`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        payment_mode: "split",
                      }))
                    }
                  >
                    <span className="payment-mode-radio" />
                    <span>
                      <strong>Advance + Balance</strong>
                      <small>Advance, balance or full payment</small>
                    </span>
                  </button>
                </div>
              </div>

              <div className="date-grid">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        start_date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        end_date: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="whatsapp-links-section">
                <div className="whatsapp-links-heading">
                  <div className="whatsapp-links-icon">
                    <MessageCircle size={17} />
                  </div>
                  <div>
                    <strong>WhatsApp Links</strong>
                    <span>Add the links students should use for this batch.</span>
                  </div>
                </div>

                <div className="whatsapp-links-grid">
                  <label>
                    <span>WhatsApp Community Link</span>
                    <input
                      type="url"
                      value={form.whatsapp_community_url}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          whatsapp_community_url: event.target.value,
                        }))
                      }
                      placeholder="https://chat.whatsapp.com/..." 
                      autoComplete="off"
                    />
                    <small className="field-help">Main WhatsApp Community/group link for this batch.</small>
                  </label>

                  <label>
                    <span>Doubts Group Link</span>
                    <input
                      type="url"
                      value={form.whatsapp_doubts_url}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          whatsapp_doubts_url: event.target.value,
                        }))
                      }
                      placeholder="https://chat.whatsapp.com/..." 
                      autoComplete="off"
                    />
                    <small className="field-help">Separate WhatsApp group for student doubts.</small>
                  </label>
                </div>
              </div>

              {form.payment_mode === "single" ? (
                <label>
                  <span>Payment amount</span>
                  <div className="amount-input">
                    <span>₹</span>
                    <input
                      inputMode="decimal"
                      value={form.full_amount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          full_amount: event.target.value,
                        }))
                      }
                      placeholder="199"
                    />
                  </div>
                  <small className="field-help">The student pays this amount in one transaction. No advance or balance is required.</small>
                </label>
              ) : (
                <>
                  <div className="amount-grid">
                    <label>
                      <span>Advance amount</span>
                      <div className="amount-input">
                        <span>₹</span>
                        <input
                          inputMode="decimal"
                          value={form.advance_amount}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              advance_amount: event.target.value,
                            }))
                          }
                          placeholder="666"
                        />
                      </div>
                    </label>

                    <label>
                      <span>Balance amount</span>
                      <div className="amount-input">
                        <span>₹</span>
                        <input
                          inputMode="decimal"
                          value={form.balance_amount}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              balance_amount: event.target.value,
                            }))
                          }
                          placeholder="6000"
                        />
                      </div>
                    </label>

                    <label>
                      <span>Full amount</span>
                      <div className="amount-input">
                        <span>₹</span>
                        <input
                          inputMode="decimal"
                          value={form.full_amount}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              full_amount: event.target.value,
                            }))
                          }
                          placeholder="6666"
                        />
                      </div>
                    </label>
                  </div>
                </>
              )}

              <div className="rule-box">
                <div className="rule-icon">
                  <Check size={15} />
                </div>
                <div>
                  <strong>Payment rule</strong>
                  <span>
                    {form.payment_mode === "single"
                      ? "The full amount is the single payment the student pays directly."
                      : "Full amount must equal Advance + Balance. Students can pay Advance, Balance, or the Full amount."}
                  </span>
                </div>
              </div>

              {error && <div className="modal-error">{error}</div>}
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
                onClick={saveBatch}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span className="small-spinner" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    {editingBatch ? "Save Changes" : "Create Batch"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{baseStyles}</style>
    </main>
  );
}

const baseStyles = `
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    background: #050505;
  }

  .courses-page {
    min-height: 100vh;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(circle at 92% 0%, rgba(255, 23, 68, .07), transparent 28%),
      #050505;
    color: #f5f5f5;
    font-family: Arial, Helvetica, sans-serif;
  }

  .glow {
    position: fixed;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(110px);
  }

  .glow-red {
    width: 320px;
    height: 320px;
    right: -220px;
    bottom: 40px;
    background: #ff1744;
    opacity: .07;
  }

  .page-shell {
    position: relative;
    z-index: 1;
    width: min(1100px, calc(100% - 32px));
    margin: 0 auto;
    padding: 24px 0 42px;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
    padding-bottom: 24px;
    margin-bottom: 28px;
    border-bottom: 1px solid #202023;
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    min-width: 0;
  }

  .back-button {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    margin-top: 3px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 10px;
    color: #9a9aa1;
    background: rgba(255,255,255,.035);
    cursor: pointer;
    transition: .18s ease;
  }

  .back-button:hover {
    color: #fff;
    border-color: rgba(255,255,255,.15);
    background: rgba(255,255,255,.06);
  }

  .eyebrow,
  .section-kicker {
    display: block;
    margin-bottom: 8px;
    color: #ff1744;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .15em;
  }

  h1,h2,h3,p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 7px;
    font-size: 34px;
    line-height: 1.08;
    letter-spacing: -.04em;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .page-header p {
    max-width: 680px;
    margin-bottom: 0;
    color: #85858c;
    font-size: 13px;
    line-height: 1.55;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #77777f;
    font-size: 10px;
    font-weight: 800;
  }

  .status > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #66666d;
  }

  .status.active {
    color: #65e68b;
  }

  .status.active > span {
    background: #2ed866;
    box-shadow: 0 0 9px rgba(46,216,102,.45);
  }

  .create-button,
  .save-button {
    height: 43px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    background: #ff1744;
    box-shadow: 0 10px 26px rgba(255,23,68,.16);
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    transition: .18s ease;
  }

  .create-button:hover:not(:disabled),
  .save-button:hover:not(:disabled) {
    transform: translateY(-1px);
    background: #ff2852;
    box-shadow: 0 14px 30px rgba(255,23,68,.22);
  }

  .create-button:disabled {
    cursor: not-allowed;
    opacity: .45;
    box-shadow: none;
  }

  .error-banner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
    padding: 12px 14px;
    border: 1px solid rgba(255,23,68,.2);
    border-radius: 10px;
    background: rgba(255,23,68,.055);
    color: #ffb4c2;
  }

  .error-banner strong,
  .error-banner span {
    display: block;
  }

  .error-banner strong {
    margin-bottom: 3px;
    font-size: 11px;
  }

  .error-banner span {
    color: #b98590;
    font-size: 10px;
  }

  .error-banner button {
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: #d18c99;
    cursor: pointer;
  }

  .course-overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 26px;
    margin-bottom: 34px;
    padding: 24px 26px;
    border: 1px solid #202023;
    border-radius: 11px;
    background: #0c0c0d;
  }

  .overview-course {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .course-badge {
    width: 76px;
    height: 76px;
    flex: 0 0 76px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,23,68,.34);
    border-radius: 16px;
    color: #ff1744;
    background: rgba(255,23,68,.08);
    font-size: 30px;
    font-weight: 850;
  }

  .overview-copy {
    min-width: 0;
  }

  .overview-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 5px;
  }

  .overview-title-row h2 {
    margin-bottom: 0;
    font-size: 21px;
    letter-spacing: -.025em;
  }

  .overview-copy > p {
    margin-bottom: 18px;
    color: #85858c;
    font-size: 12px;
    line-height: 1.5;
  }

  .overview-meta {
    display: flex;
    align-items: center;
    gap: 30px;
  }

  .overview-meta > div {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 105px;
    color: #8f8f97;
  }

  .overview-meta svg {
    color: #b4b4ba;
  }

  .overview-meta span {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .overview-meta small {
    color: #66666d;
    font-size: 9px;
  }

  .overview-meta strong {
    color: #e6e6e8;
    font-size: 12px;
    font-weight: 700;
  }

  .edit-course-button {
    height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    padding: 0 14px;
    border: 1px solid #29292d;
    border-radius: 8px;
    color: #9a9aa1;
    background: #101011;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: not-allowed;
    opacity: .75;
  }

  .course-level-panel {
    border: 1px solid #202023;
    border-radius: 12px;
    background: #0c0c0d;
    overflow: hidden;
  }

  .course-level-banner {
    padding: 22px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid #202023;
    background:
      radial-gradient(circle at 100% 0%, rgba(255,23,68,.07), transparent 35%),
      #0c0c0d;
  }

  .course-level-banner h3 {
    margin: 0 0 6px;
    font-size: 18px;
    letter-spacing: -.02em;
  }

  .course-level-banner p {
    margin: 0;
    max-width: 650px;
    color: #77777f;
    font-size: 13px;
    line-height: 1.5;
  }

  .course-level-pill {
    flex: 0 0 auto;
    padding: 7px 10px;
    border: 1px solid rgba(255,23,68,.22);
    border-radius: 999px;
    color: #ff91a5;
    background: rgba(255,23,68,.07);
    font-size: 11px;
    font-weight: 800;
  }

  .course-level-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border-bottom: 1px solid #202023;
  }

  .course-level-stats > div {
    padding: 17px 20px;
    border-right: 1px solid #202023;
  }

  .course-level-stats > div:last-child {
    border-right: 0;
  }

  .course-level-stats small,
  .course-level-stats strong {
    display: block;
  }

  .course-level-stats small {
    color: #686870;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .course-level-stats strong {
    margin-top: 5px;
    color: #f0f0f2;
    font-size: 20px;
  }

  .course-level-students {
    border-bottom: 1px solid #202023;
  }

  .course-level-students-header {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #202023;
  }

  .course-level-students-header strong,
  .course-level-students-header span {
    display: block;
  }

  .course-level-students-header strong {
    font-size: 13px;
  }

  .course-level-students-header span {
    margin-top: 3px;
    color: #65656d;
    font-size: 11px;
  }

  .course-level-students-header > span {
    margin: 0;
    white-space: nowrap;
  }

  .course-level-student-list {
    max-height: 420px;
    overflow-y: auto;
  }

  .course-level-student-row {
    min-height: 68px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #18181b;
  }

  .course-level-student-row:last-child {
    border-bottom: 0;
  }

  .student-avatar {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,23,68,.22);
    border-radius: 10px;
    color: #ff6d86;
    background: rgba(255,23,68,.07);
    font-size: 12px;
    font-weight: 850;
  }

  .student-main {
    min-width: 0;
    flex: 1;
  }

  .student-main strong,
  .student-main span {
    display: block;
  }

  .student-main strong {
    color: #e8e8ea;
    font-size: 12px;
    font-weight: 750;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .student-main span {
    margin-top: 4px;
    color: #65656d;
    font-size: 10px;
  }

  .student-payment-meta {
    display: flex;
    align-items: center;
    gap: 20px;
    flex: 0 0 auto;
  }

  .student-payment-meta span {
    min-width: 62px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: right;
  }

  .student-payment-meta small {
    color: #68686f;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: .06em;
  }

  .student-payment-meta strong {
    color: #e2e2e5;
    font-size: 10px;
  }

  .course-level-payments-header {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid #202023;
  }

  .course-level-payments-header strong,
  .course-level-payments-header span {
    display: block;
  }

  .course-level-payments-header strong {
    font-size: 13px;
  }

  .course-level-payments-header span {
    margin-top: 3px;
    color: #65656d;
    font-size: 11px;
  }

  .course-level-payments-header > span {
    margin: 0;
    white-space: nowrap;
  }

  .course-level-payment-row {
    min-height: 62px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid #18181b;
  }

  .course-level-payment-row:last-child {
    border-bottom: 0;
  }

  .course-level-payment-row strong,
  .course-level-payment-row span {
    display: block;
  }

  .course-level-payment-row strong {
    color: #e8e8ea;
    font-size: 13px;
  }

  .course-level-payment-row span {
    margin-top: 3px;
    color: #65656d;
    font-size: 11px;
  }

  .course-level-empty {
    padding: 30px 20px;
    color: #696970;
    font-size: 13px;
    text-align: center;
  }

  .course-level-action {
    margin: 16px 20px 20px;
    min-height: 40px;
    padding: 0 13px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #29292d;
    border-radius: 8px;
    color: #bdbdc3;
    background: #101011;
    font-size: 13px;
    font-weight: 750;
  }

  .course-level-action:hover {
    color: #fff;
    border-color: #3a3a40;
    background: #151517;
  }

  .batch-section {
    margin-top: 0;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-heading .section-kicker {
    margin-bottom: 5px;
  }

  .section-heading h2 {
    margin-bottom: 0;
    font-size: 20px;
    letter-spacing: -.03em;
  }

  .result-count {
    color: #77777f;
    font-size: 11px;
  }

  .batch-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .batch-card {
    position: relative;
    min-width: 0;
    padding: 18px;
    border: 1px solid #202023;
    border-radius: 11px;
    background: #0c0c0d;
    transition: .18s ease;
  }

  .batch-card:hover {
    border-color: #303035;
    background: #0e0e0f;
    transform: translateY(-1px);
  }

  .batch-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .batch-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,23,68,.28);
    border-radius: 11px;
    color: #ff1744;
    background: rgba(255,23,68,.07);
  }

  .batch-menu-wrap {
    position: relative;
  }

  .more-button {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #85858d;
    background: transparent;
    cursor: pointer;
    transition: .16s ease;
  }

  .more-button:hover {
    color: #fff;
    border-color: #29292d;
    background: #151516;
  }

  .batch-card-heading {
    margin-top: 15px;
    padding-bottom: 15px;
    border-bottom: 1px solid #202023;
  }

  .batch-name-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .batch-name-row h3 {
    margin-bottom: 0;
    color: #f1f1f2;
    font-size: 17px;
    letter-spacing: -.025em;
  }

  .batch-card-heading p {
    margin: 5px 0 0;
    color: #77777f;
    font-size: 11px;
  }

  .batch-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 12px;
    padding: 16px 0;
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    min-width: 0;
  }

  .detail-item svg {
    flex: 0 0 auto;
    margin-top: 1px;
    color: #9a9aa1;
  }

  .detail-item span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-item small {
    color: #68686f;
    font-size: 9px;
  }

  .detail-item strong {
    color: #e2e2e5;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .price-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
    padding-top: 14px;
    border-top: 1px solid #202023;
  }

  .price-strip > div {
    padding: 9px 8px;
    border: 1px solid #222225;
    border-radius: 8px;
    background: #101011;
  }

  .price-strip > .single-price {
    grid-column: 1 / -1;
  }

  .price-strip small,
  .price-strip strong {
    display: block;
  }

  .price-strip small {
    margin-bottom: 4px;
    color: #696970;
    font-size: 8px;
  }

  .price-strip strong {
    color: #f0f0f1;
    font-size: 10px;
  }

  .view-batch-button {
    width: 100%;
    height: 39px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 14px;
    padding: 0 12px;
    border: 1px solid rgba(255,23,68,.16);
    border-radius: 8px;
    color: #ff1744;
    background: rgba(255,23,68,.055);
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    transition: .16s ease;
  }

  .view-batch-button:hover {
    border-color: rgba(255,23,68,.32);
    background: rgba(255,23,68,.09);
  }

  .action-menu {
    position: absolute;
    z-index: 20;
    top: 39px;
    right: 0;
    width: 170px;
    padding: 5px;
    border: 1px solid #29292d;
    border-radius: 9px;
    background: #111112;
    box-shadow: 0 20px 50px rgba(0,0,0,.55);
  }

  .action-menu button {
    width: 100%;
    height: 33px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #a2a2a9;
    font: inherit;
    font-size: 10px;
    text-align: left;
    cursor: pointer;
  }

  .action-menu button:hover {
    color: #f5f5f5;
    background: rgba(255,255,255,.05);
  }

  .action-menu button.danger {
    color: #ff8ea1;
  }

  .empty-state {
    min-height: 270px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    border: 1px dashed #29292d;
    border-radius: 11px;
    background: #0a0a0b;
  }

  .empty-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    margin-bottom: 12px;
    border: 1px solid rgba(255,23,68,.22);
    border-radius: 10px;
    color: #ff1744;
    background: rgba(255,23,68,.06);
  }

  .empty-state h3 {
    margin-bottom: 6px;
    font-size: 14px;
  }

  .empty-state p {
    max-width: 390px;
    margin-bottom: 15px;
    color: #717178;
    font-size: 11px;
    line-height: 1.5;
  }

  .empty-state button,
  .not-found button {
    height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid rgba(255,23,68,.2);
    border-radius: 8px;
    color: #ff1744;
    background: rgba(255,23,68,.055);
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .loading-screen,
  .not-found {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #77777f;
    font-size: 11px;
  }

  .not-found h1 {
    margin-bottom: 7px;
  }

  .not-found p {
    color: #707078;
    font-size: 12px;
    margin-bottom: 15px;
  }

  .spinner,
  .small-spinner {
    border-radius: 50%;
    border-style: solid;
    border-color: rgba(255,255,255,.1);
    border-top-color: #ff1744;
    animation: spin .75s linear infinite;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border-width: 2px;
    margin-bottom: 9px;
  }

  .small-spinner {
    width: 13px;
    height: 13px;
    border-width: 2px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(0,0,0,.76);
    backdrop-filter: blur(8px);
  }

  .modal {
    width: min(600px,100%);
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    border: 1px solid #2a2a2e;
    border-radius: 13px;
    background: #0d0d0e;
    box-shadow: 0 35px 90px rgba(0,0,0,.58);
    padding: 21px;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 21px;
  }

  .modal-header h2 {
    margin-bottom: 5px;
    font-size: 20px;
    letter-spacing: -.03em;
  }

  .modal-header p {
    margin-bottom: 0;
    color: #74747c;
    font-size: 10px;
    line-height: 1.5;
  }

  .modal-close {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid #29292d;
    border-radius: 8px;
    color: #85858d;
    background: #121213;
    cursor: pointer;
  }

  .form {
    display: grid;
    gap: 15px;
  }

  .form label {
    display: grid;
    gap: 7px;
  }

  .form label > span {
    color: #b8b8be;
    font-size: 10px;
    font-weight: 750;
  }

  .form input {
    width: 100%;
    height: 42px;
    border: 1px solid #29292d;
    border-radius: 8px;
    outline: none;
    padding: 0 11px;
    background: #111112;
    color: #f4f4f5;
    font: inherit;
    font-size: 11px;
  }

  .form input:focus {
    border-color: rgba(255,23,68,.5);
    box-shadow: 0 0 0 3px rgba(255,23,68,.07);
  }

  .form input::placeholder {
    color: #5f5f66;
  }

  .date-grid,
  .payment-mode-section {
    display: grid;
    gap: 8px;
  }

  .form-label {
    color: #b8b8be;
    font-size: 10px;
    font-weight: 750;
  }

  .payment-mode-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .payment-mode-option {
    min-height: 66px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border: 1px solid #29292d;
    border-radius: 8px;
    background: #111112;
    color: #a2a2a9;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: .16s ease;
  }

  .payment-mode-option:hover {
    border-color: #3a3a3f;
    background: #151516;
  }

  .payment-mode-option.selected {
    border-color: rgba(255,23,68,.55);
    background: rgba(255,23,68,.06);
  }

  .payment-mode-option > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .payment-mode-option strong {
    color: #ededf0;
    font-size: 11px;
  }

  .payment-mode-option small {
    color: #717178;
    font-size: 9px;
    line-height: 1.35;
  }

  .payment-mode-radio {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
    border: 1px solid #55555d;
    border-radius: 50%;
    position: relative;
  }

  .payment-mode-option.selected .payment-mode-radio {
    border-color: #ff1744;
  }

  .payment-mode-option.selected .payment-mode-radio::after {
    content: "";
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: #ff1744;
  }

  .field-help {
    color: #66666d;
    font-size: 9px;
    line-height: 1.45;
  }

  .amount-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .amount-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .amount-input {
    height: 42px;
    display: flex;
    align-items: center;
    border: 1px solid #29292d;
    border-radius: 8px;
    background: #111112;
    overflow: hidden;
  }

  .amount-input > span {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 0 10px;
    color: #77777f;
    border-right: 1px solid #242427;
    font-size: 11px;
  }

  .amount-input input {
    height: 100%;
    border: 0;
    border-radius: 0;
    padding: 0 9px;
    background: transparent;
  }

  .whatsapp-links-section {
    padding: 14px;
    border: 1px solid #202023;
    border-radius: 10px;
    background: #0a0a0b;
  }

  .whatsapp-links-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .whatsapp-links-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(37,211,102,.22);
    border-radius: 8px;
    color: #25d366;
    background: rgba(37,211,102,.07);
  }

  .whatsapp-links-heading strong,
  .whatsapp-links-heading span {
    display: block;
  }

  .whatsapp-links-heading strong {
    color: #e8e8ea;
    font-size: 12px;
  }

  .whatsapp-links-heading span {
    margin-top: 3px;
    color: #686870;
    font-size: 10px;
  }

  .whatsapp-links-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .whatsapp-links-grid label {
    min-width: 0;
  }

  .whatsapp-links-grid input {
    width: 100%;
  }

  .rule-box {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 10px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 8px;
    background: rgba(255,255,255,.02);
  }

  .rule-icon {
    width: 25px;
    height: 25px;
    flex: 0 0 25px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: #e8e8eb;
    background: rgba(255,255,255,.06);
  }

  .rule-box strong,
  .rule-box span {
    display: block;
  }

  .rule-box strong {
    margin-bottom: 3px;
    color: #d7d7db;
    font-size: 9px;
  }

  .rule-box span {
    color: #77777f;
    font-size: 9px;
    line-height: 1.45;
  }

  .modal-error {
    padding: 9px 10px;
    border: 1px solid rgba(255,23,68,.18);
    border-radius: 8px;
    background: rgba(255,23,68,.05);
    color: #ffacba;
    font-size: 9px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #202023;
  }

  .cancel-button {
    height: 38px;
    padding: 0 13px;
    border: 1px solid #29292d;
    border-radius: 8px;
    color: #9999a0;
    background: #121213;
    font: inherit;
    font-size: 10px;
    font-weight: 750;
    cursor: pointer;
  }

  .save-button {
    height: 38px;
    min-width: 130px;
  }

  .save-button:disabled,
  .cancel-button:disabled,
  .modal-close:disabled {
    cursor: not-allowed;
    opacity: .55;
  }

  button:focus-visible,
  input:focus-visible {
    outline: 2px solid rgba(255,23,68,.55);
    outline-offset: 2px;
  }

  @media (max-width: 950px) {
    .batch-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .course-overview {
      align-items: flex-start;
      flex-direction: column;
    }

    .edit-course-button {
      align-self: flex-end;
    }
  }

  @media (max-width: 700px) {
    .page-shell {
      width: min(100% - 24px, 1100px);
      padding-top: 18px;
    }

    .page-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 18px;
    }

    .create-button {
      width: 100%;
    }

    .course-overview {
      padding: 18px;
    }

    .overview-course {
      align-items: flex-start;
      flex-direction: column;
    }

    .overview-meta {
      width: 100%;
      flex-wrap: wrap;
      gap: 18px;
    }

    .edit-course-button {
      width: 100%;
      align-self: stretch;
    }

    .batch-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 500px) {
    .title-line {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }

    h1 {
      font-size: 29px;
    }

    .course-badge {
      width: 60px;
      height: 60px;
      flex-basis: 60px;
      font-size: 24px;
    }

    .batch-details-grid {
      gap: 14px 8px;
    }

    .payment-mode-grid,
    .date-grid,
    .amount-grid {
      grid-template-columns: 1fr;
    }
  }
\n\n  /* Consultation / course-level dashboard */\n  .page-title-copy { min-width: 0; }\n  .title-separator { color: #8b8b93; font-weight: 500; }\n  .no-batch-header-pill { display:inline-flex; align-items:center; justify-content:center; padding:7px 12px; border-radius:999px; border:1px solid rgba(255,23,68,.34); background:rgba(255,23,68,.07); color:#ff8da2; font-size:11px; font-weight:800; }\n  .course-level-panel { border-radius:0; background:transparent; border:0; box-shadow:none; overflow:visible; }\n  .course-level-stats { grid-template-columns:repeat(3,minmax(0,1fr)); background:transparent; }\n  .course-level-stats > div { min-height:98px; padding:15px 18px 14px; position:relative; }\n  .course-level-stats small { margin-top:13px; font-size:10px; letter-spacing:.09em; }\n  .course-level-stats strong { margin-top:6px; font-size:21px; letter-spacing:-.025em; }\n  .stat-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:12px; border:1px solid #2c2c32; color:#ff4d70; background:rgba(255,23,68,.07); }\n  .stat-icon.payments { color:#4ee7c4; background:rgba(34,197,154,.07); border-color:rgba(34,197,154,.22); }\n  .stat-icon.revenue { color:#f5bf65; background:rgba(245,191,101,.07); border-color:rgba(245,191,101,.22); font-size:21px; font-weight:800; }\n  .stat-icon.date { color:#69a8ff; background:rgba(69,139,255,.07); border-color:rgba(69,139,255,.22); }\n  .student-table-card { margin:0; border:0; border-radius:0; overflow:visible; background:transparent; }\n  .student-table-toolbar { min-height:68px; padding:16px 0 14px; display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:1px solid #24242a; }\n  .student-table-title { display:flex; align-items:center; gap:12px; }\n  .student-table-title > svg { color:#ff4d70; }\n  .student-table-title h2 { margin:0; font-size:15px; }\n  .student-table-title p { margin:4px 0 0; color:#66666f; font-size:10px; }\n  .student-table-actions { display:flex; align-items:center; gap:10px; }\n  .student-search { width:min(360px,34vw); height:38px; display:flex; align-items:center; gap:9px; padding:0 12px; border:1px solid #292930; border-radius:10px; background:#08080a; color:#777780; }\n  .student-search input { width:100%; border:0; outline:0; background:transparent; color:#e8e8ea; font:inherit; font-size:11px; }\n  .student-search input::placeholder { color:#5e5e66; }\n  .student-count-pill { padding:8px 10px; border:1px solid #2a2a31; border-radius:999px; color:#9a9aa2; font-size:10px; white-space:nowrap; }\n  .student-table-scroll { overflow-x:auto; }\n  .student-table { width:100%; min-width:0; table-layout:fixed; border-collapse:collapse; }\n  .student-table th { padding:10px 9px; text-align:left; background:#101014; border-bottom:1px solid #24242a; color:#6e6e77; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; white-space:nowrap; }\n  .student-table td { padding:11px 9px; border-bottom:1px solid #1c1c21; color:#c7c7cc; font-size:11px; white-space:nowrap; }\n  .student-table tbody tr:hover { background:rgba(255,23,68,.025); }\n  .student-table tbody tr:last-child td { border-bottom:0; }\n  .student-table .row-number { width:42px; color:#5f5f67; }\n  .table-student { display:flex; align-items:center; gap:8px; min-width:0; }\n  .table-student > span:last-child { display:flex; flex-direction:column; gap:3px; }\n  .table-student strong { color:#ededf0; font-size:11px; }\n  .table-student small { color:#64646c; font-size:9px; }\n  .student-avatar { width:32px; height:32px; flex:0 0 32px; display:grid; place-items:center; border:1px solid rgba(255,23,68,.32); border-radius:50%; color:#ff4d70; background:rgba(255,23,68,.065); font-size:12px; font-weight:850; }\n  .email-cell { max-width:100%; overflow:hidden; text-overflow:ellipsis; }\n  .phone-cell { font-variant-numeric:tabular-nums; }\n  .payment-time { display:flex; flex-direction:column; gap:3px; }\n  .payment-time strong { color:#d9d9de; font-size:10px; }\n  .payment-time small { color:#66666f; font-size:9px; }\n  .paid-status { display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border:1px solid rgba(34,197,154,.34); border-radius:999px; background:rgba(34,197,154,.07); color:#50e0bc; font-size:9px; font-weight:800; }\n  .paid-status > span { width:6px; height:6px; border-radius:50%; background:currentColor; }\n  .student-table-footer { min-height:48px; display:flex; align-items:center; padding:0 16px; border-top:1px solid #24242a; color:#66666f; font-size:10px; }\n  .course-level-bottom { display:flex; align-items:center; gap:12px; padding:20px 0 0; }\n  .course-level-bottom > span { color:#62626a; font-size:10px; }\n  .course-level-action { margin:0; border-color:rgba(255,23,68,.35); color:#ff6f89; background:rgba(255,23,68,.035); }\n  .course-level-action:hover { border-color:rgba(255,23,68,.6); background:rgba(255,23,68,.07); color:#ff91a5; }\n  /* Final viewport-fit overrides */
  .page-shell { width: min(1400px, calc(100% - 48px)); padding-top: 22px; padding-bottom: 36px; }
  .course-level-panel { width: 100%; max-width: none; border-radius: 0; border: 0; box-shadow: none; }
  .course-level-banner { padding: 18px 20px; }
  .course-level-stats > div { min-height: 92px; padding: 14px 16px; }
  .student-table-card { margin: 0; border-radius: 0; }
  .student-table-toolbar { min-height: 62px; padding: 10px 12px; gap: 12px; }
  .student-search { width: min(320px, 30vw); height: 36px; }
  .student-table-scroll { overflow-x: hidden; }
  .student-table { width: 100%; min-width: 0; table-layout: fixed; }
  .student-table th { padding: 9px 7px; font-size: 8px; }
  .student-table td { padding: 10px 7px; font-size: 10px; overflow: hidden; text-overflow: ellipsis; }
  .student-table th:nth-child(1), .student-table td:nth-child(1) { width: 20%; }
  .student-table th:nth-child(2), .student-table td:nth-child(2) { width: 6%; text-align: center; }
  .student-table th:nth-child(3), .student-table td:nth-child(3) { width: 8%; }
  .student-table th:nth-child(4), .student-table td:nth-child(4) { width: 17%; }
  .student-table th:nth-child(5), .student-table td:nth-child(5) { width: 16%; }
  .student-table th:nth-child(6), .student-table td:nth-child(6) { width: 7%; text-align: center; }
  .student-table th:nth-child(7), .student-table td:nth-child(7) { width: 10%; }
  .student-table th:nth-child(8), .student-table td:nth-child(8) { width: 9%; }
  .student-table th:nth-child(9), .student-table td:nth-child(9) { width: 7%; text-align: center; }
  .table-student { gap: 7px; }
  .student-avatar { width: 30px; height: 30px; flex-basis: 30px; font-size: 11px; }
  .table-student strong { font-size: 10px; }
  .table-student small { font-size: 8px; }
  .phone-cell { font-size: 9px !important; }
  .payment-time strong { font-size: 9px; }
  .payment-time small { font-size: 8px; }
  .paid-status { padding: 4px 7px; font-size: 8px; }
  .course-level-bottom { padding: 20px 0 0; }
  @media (max-width: 900px) {
    .page-shell { width: calc(100% - 20px); }
    .student-table-scroll { overflow-x: auto; }
    .student-table { min-width: 760px; }
  }

  /* =========================================================
     CUSTOMER PAGE UI SYSTEM
     Apply the same typography, spacing, borders and controls
     used by the Customers page to Course Details.
     ========================================================= */

  .courses-page {
    min-height: 100vh;
    padding: 36px 44px 70px;
    overflow-x: hidden;
    overflow-y: auto;
    background:
      radial-gradient(circle at 12% 0%, rgba(255,23,68,.055), transparent 28%),
      radial-gradient(circle at 92% 8%, rgba(139,92,246,.035), transparent 24%),
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

  .page-shell {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 0;
  }

  .page-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 30px;
    padding: 0;
    margin: 0 0 28px;
    border-bottom: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 0;
  }

  .back-button {
    width: 40px;
    height: 40px;
    padding: 0;
    margin-top: 0;
    flex: 0 0 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 10px;
    background: rgba(255,255,255,.035);
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 4px 18px rgba(0,0,0,.18);
    transition:
      transform .18s ease,
      border-color .18s ease,
      background .18s ease,
      color .18s ease;
  }

  .back-button:hover {
    transform: translateX(-2px);
    border-color: rgba(255,23,68,.35);
    background: rgba(255,23,68,.07);
    color: #fff;
  }

  .page-title-copy {
    min-width: 0;
  }

  .eyebrow,
  .section-kicker {
    display: block;
    margin-bottom: 0;
    color: #ff1744;
    font-size: 11px;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: 1.1px;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .page-header h1 {
    margin: 8px 0 0;
    color: #fff;
    font-size: 34px;
    line-height: 1.15;
    font-weight: 650;
    letter-spacing: -.7px;
  }

  .page-header p {
    max-width: 680px;
    margin: 8px 0 0;
    color: #a1a1aa;
    font-size: 14px;
    line-height: 1.5;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
  }

  .status.active {
    color: #39d98a;
    background: rgba(57,217,138,.08);
  }

  .status.active > span {
    width: 6px;
    height: 6px;
    background: currentColor;
    box-shadow: none;
  }

  .status:not(.active) {
    color: #a1a1aa;
    background: rgba(255,255,255,.04);
  }

  .create-button,
  .save-button {
    height: 43px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid #ff1744;
    border-radius: 8px;
    background: #ff1744;
    color: #fff;
    box-shadow: none;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    transition: .18s ease;
  }

  .create-button:hover:not(:disabled),
  .save-button:hover:not(:disabled) {
    transform: none;
    background: #e9143d;
    box-shadow: none;
  }

  .error-banner {
    min-height: 44px;
    margin-bottom: 16px;
    padding: 10px 13px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid rgba(255,23,68,.25);
    border-radius: 8px;
    background: rgba(255,23,68,.06);
    color: #ff9bad;
    font-size: 13px;
  }

  .error-banner strong {
    margin-bottom: 0;
    font-size: 13px;
  }

  .error-banner span {
    color: #ff9bad;
    font-size: 13px;
  }

  /* Course overview uses the same boundary language as Customers. */
  .course-overview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 26px;
    margin-bottom: 16px;
    padding: 20px;
    border: 1px solid #202023;
    border-radius: 11px;
    background: #0c0c0d;
    box-shadow: none;
  }

  .overview-title-row h2 {
    margin-bottom: 0;
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0;
  }

  .overview-copy > p {
    margin-bottom: 14px;
    color: #8b8b93;
    font-size: 12px;
  }

  .overview-meta {
    gap: 24px;
  }

  .overview-meta small {
    color: #71717a;
    font-size: 10px;
  }

  .overview-meta strong {
    color: #e4e4e7;
    font-size: 12px;
    font-weight: 600;
  }

  .edit-course-button {
    height: 40px;
    padding: 0 14px;
    border: 1px solid #29292d;
    border-radius: 8px;
    background: #111112;
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 600;
  }

  /* Consultation summary — same card boundary and typography as Customers. */
  .course-level-panel {
    width: 100%;
    max-width: none;
    overflow: hidden;
    border: 1px solid #202023;
    border-radius: 11px;
    background: #0c0c0d;
    box-shadow: none;
  }

  .course-level-banner {
    padding: 18px 21px;
    background:
      radial-gradient(circle at 92% 0%, rgba(255,23,68,.055), transparent 30%),
      #0c0c0d;
  }

  .course-level-banner h3 {
    margin: 0 0 6px;
    color: #fff;
    font-size: 17px;
    font-weight: 600;
  }

  .course-level-banner p {
    color: #8b8b93;
    font-size: 12px;
  }

  .course-level-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 13px;
    padding: 13px;
    border-bottom: 1px solid #202023;
    background: #09090a;
  }

  .course-level-stats > div {
    min-height: 145px;
    padding: 20px;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px;
    background: rgba(15,15,17,.82);
    box-shadow: 0 10px 30px rgba(0,0,0,.16);
    transition: transform .18s ease, border-color .18s ease, background .18s ease;
  }

  .course-level-stats > div:hover {
    transform: translateY(-2px);
    border-color: rgba(255,255,255,.11);
    background: rgba(18,18,20,.92);
  }

  .course-level-stats small {
    display: block;
    margin-top: 19px;
    color: #71717a;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .7px;
    text-transform: uppercase;
  }

  .course-level-stats strong {
    display: block;
    margin-top: 8px;
    color: #fff;
    font-size: 28px;
    line-height: 1;
    font-weight: 650;
    letter-spacing: 0;
  }

  .stat-icon {
    width: 37px;
    height: 37px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 0;
    background: rgba(255,23,68,.08);
    color: #ff3159;
  }

  .stat-icon.payments {
    background: rgba(57,217,138,.08);
    color: #39d98a;
  }

  .stat-icon.revenue {
    background: rgba(230,184,78,.08);
    color: #e6b84e;
    font-size: 20px;
  }

  /* Student section follows the Customers table boundary exactly. */
  .student-table-card {
    margin: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .student-table-toolbar {
    min-height: 82px;
    padding: 18px 21px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid #202023;
  }

  .student-table-title {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .student-table-title > svg {
    color: #ff3159;
  }

  .student-table-title h2 {
    margin: 0;
    color: #fff;
    font-size: 17px;
    font-weight: 600;
  }

  .student-table-title p {
    margin: 5px 0 0;
    color: #8b8b93;
    font-size: 12px;
  }

  .student-table-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .student-search {
    width: 310px;
    height: 40px;
    padding: 0 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #29292d;
    border-radius: 8px;
    background: #111112;
    color: #71717a;
  }

  .student-search:focus-within {
    border-color: #505057;
  }

  .student-search input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: #fff;
    font: inherit;
    font-size: 13px;
  }

  .student-search input::placeholder {
    color: #71717a;
  }

  .student-count-pill {
    padding: 6px 9px;
    border-radius: 6px;
    background: rgba(255,23,68,.08);
    border: 0;
    color: #ff3159;
    font-size: 11px;
    font-weight: 600;
  }

  .student-table-scroll {
    width: 100%;
    overflow-x: auto;
  }

  .student-table {
    width: 100%;
    min-width: 1120px;
    border-collapse: collapse;
    table-layout: auto;
  }

  .student-table th {
    height: 50px;
    padding: 0 16px;
    background: #101011;
    color: #8b8b93;
    border-bottom: 0;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .35px;
    text-align: left;
    text-transform: none;
    white-space: nowrap;
  }

  .student-table td {
    height: 72px;
    padding: 0 16px;
    border-top: 1px solid #1e1e21;
    border-bottom: 0;
    color: #d4d4d8;
    font-size: 13px;
    white-space: nowrap;
  }

  .student-table tbody tr:hover {
    background: #101011;
  }

  .table-student {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .student-avatar {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9px;
    background: rgba(255,23,68,.08);
    color: #ff3159;
    font-size: 13px;
    font-weight: 650;
  }

  .table-student > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .table-student strong {
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }

  .table-student small {
    color: #71717a;
    font-size: 11px;
  }

  .payment-time {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .payment-time strong {
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 500;
  }

  .payment-time small {
    color: #71717a;
    font-size: 11px;
  }

  .paid-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 9px;
    border: 0;
    border-radius: 6px;
    color: #39d98a;
    background: rgba(57,217,138,.08);
    font-size: 11px;
    font-weight: 600;
  }

  .paid-status > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .student-table-footer {
    min-height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    border-top: 1px solid #202023;
    color: #71717a;
    font-size: 11px;
  }

  .student-table-footer {
    min-height: 58px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border-top: 1px solid #202023;
    color: #71717a;
    font-size: 11px;
  }

  .student-pagination {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
  }

  .pagination-pages {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .pagination-button,
  .pagination-page {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid #29292d;
    border-radius: 7px;
    background: #111112;
    color: #8f8f97;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: .16s ease;
  }

  .pagination-page {
    width: 30px;
  }

  .pagination-button:hover:not(:disabled),
  .pagination-page:hover {
    border-color: #3a3a40;
    background: #18181a;
    color: #fff;
  }

  .pagination-page.active {
    border-color: rgba(255,23,68,.5);
    background: rgba(255,23,68,.12);
    color: #ff5b77;
  }

  .pagination-button:disabled {
    opacity: .35;
    cursor: not-allowed;
  }

  @media (max-width: 700px) {
    .student-table-footer {
      align-items: flex-start;
      flex-direction: column;
      padding: 12px 16px;
    }

    .student-pagination {
      width: 100%;
      justify-content: flex-end;
    }
  }

  .course-level-bottom {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 21px 20px;
    border-top: 1px solid #202023;
  }

  .course-level-bottom > span {
    color: #71717a;
    font-size: 11px;
  }

  .course-level-action {
    margin: 0;
    min-height: 40px;
    padding: 0 13px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #29292d;
    border-radius: 8px;
    background: #111112;
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 600;
  }

  .course-level-action:hover {
    border-color: #44444a;
    background: #151517;
    color: #fff;
  }

  /* Batch cards use the same 11px border / 0c0c0d surface as Customers. */
  .batch-section {
    margin-top: 0;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-heading h2 {
    margin-bottom: 0;
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0;
  }

  .result-count {
    color: #71717a;
    font-size: 12px;
  }

  .batch-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 13px;
  }

  .batch-card {
    position: relative;
    min-width: 0;
    padding: 20px;
    border: 1px solid #202023;
    border-radius: 11px;
    background: #0c0c0d;
    box-shadow: none;
    transition: transform .18s ease, border-color .18s ease, background .18s ease;
  }

  .batch-card:hover {
    transform: translateY(-2px);
    border-color: #303035;
    background: #0e0e0f;
  }

  .batch-icon {
    width: 37px;
    height: 37px;
    border-radius: 8px;
    background: rgba(255,23,68,.08);
    color: #ff3159;
  }

  .batch-name-row h3 {
    color: #fff;
    font-size: 17px;
    font-weight: 600;
  }

  .batch-card-heading p {
    color: #71717a;
    font-size: 11px;
  }

  .batch-details-grid {
    gap: 12px;
    padding: 16px 0;
    border-top: 1px solid #202023;
    border-bottom: 1px solid #202023;
  }

  .detail-item {
    color: #a1a1aa;
  }

  .detail-item svg {
    color: #71717a;
  }

  .detail-item small {
    color: #71717a;
    font-size: 10px;
  }

  .detail-item strong {
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }

  .batch-card-footer {
    padding-top: 15px;
  }

  .batch-card-footer span,
  .batch-card-footer small {
    color: #71717a;
    font-size: 11px;
  }

  /* Shared controls / modal boundaries. */
  input,
  select,
  textarea {
    font-family: inherit;
  }

  .modal {
    border-radius: 11px;
    border: 1px solid #202023;
    background: #0c0c0d;
    box-shadow: 0 24px 70px rgba(0,0,0,.5);
  }

  .modal-header {
    padding: 20px 21px;
    border-bottom: 1px solid #202023;
  }

  .modal-header h2 {
    color: #fff;
    font-size: 17px;
    font-weight: 600;
  }

  .modal-header p {
    color: #8b8b93;
    font-size: 12px;
  }

  .modal-close,
  .cancel-button {
    border-radius: 8px;
    border-color: #29292d;
    background: #111112;
    color: #a1a1aa;
  }

  .form input,
  .form select,
  .form textarea,
  .amount-input {
    border-color: #29292d;
    border-radius: 8px;
    background: #111112;
    color: #f4f4f5;
    font-size: 13px;
  }

  .form input {
    height: 42px;
  }

  .form label > span,
  .form-label {
    color: #8b8b93;
    font-size: 11px;
    font-weight: 600;
  }

  .save-button {
    min-width: 130px;
  }

  /* Responsive sizing mirrors Customers page breakpoints. */
  @media (max-width: 1150px) {
    .courses-page {
      padding: 32px 28px 60px;
    }

    .batch-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 950px) {
    .page-header {
      align-items: flex-start;
    }

    .course-level-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    .courses-page {
      padding: 25px 16px 45px;
    }

    .page-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 18px;
    }

    .header-actions {
      width: 100%;
    }

    .create-button {
      width: 100%;
    }

    .course-overview {
      align-items: flex-start;
      flex-direction: column;
      padding: 18px;
    }

    .batch-grid {
      grid-template-columns: 1fr;
    }

    .course-level-stats {
      grid-template-columns: 1fr;
    }

    .student-table-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .student-table-actions,
    .student-search {
      width: 100%;
    }

    .student-search {
      width: 100%;
    }
  }

  @media (max-width: 500px) {
    .page-header h1 {
      font-size: 29px;
    }

    .course-level-stats > div {
      min-height: 125px;
      padding: 18px;
    }
  }


  /* =========================================================
     FINAL BATCH CARD + DESCRIPTION OVERRIDES
     ========================================================= */
  .batch-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 14px;
  }

  .batch-description {
    margin-top: 9px;
    color: #8a8a92;
    font-size: 11px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 33px;
  }

  .form textarea {
    width: 100%;
    min-height: 82px;
    resize: vertical;
    border: 1px solid #29292d;
    border-radius: 8px;
    outline: none;
    padding: 10px 11px;
    background: #111112;
    color: #f4f4f5;
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
  }

  .form textarea:focus {
    border-color: rgba(255,23,68,.5);
    box-shadow: 0 0 0 3px rgba(255,23,68,.07);
  }

  .form textarea::placeholder {
    color: #5f5f66;
  }

  .field-help {
    color: #66666d;
    font-size: 9px;
    line-height: 1.45;
  }

  /* Keep 4 cards in one row on desktop and normal laptops. */
  @media (min-width: 901px) {
    .batch-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 900px) {
    .batch-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 600px) {
    .batch-grid {
      grid-template-columns: 1fr !important;
    }
  }



  /* ===== FINAL RESPONSIVE OVERRIDES ===== */
  :global(html),
  :global(body) {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }

  .courses-page {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: hidden;
  }

  .page-shell,
  .page-header,
  .batch-section,
  .course-level-panel,
  .batch-grid {
    min-width: 0;
  }

  .page-header {
    flex-wrap: wrap;
  }

  .header-left,
  .page-title-copy,
  .title-line {
    min-width: 0;
  }

  .page-title-copy {
    overflow-wrap: anywhere;
  }

  .title-line h1 {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .create-button {
    flex: 0 0 auto;
  }

  .batch-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .batch-card,
  .batch-card-heading,
  .batch-name-row {
    min-width: 0;
  }

  .batch-name-row h3 {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .batch-description {
    overflow-wrap: anywhere;
  }

  .student-table-scroll {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
  }

  .student-table {
    min-width: 980px;
  }

  .student-table th,
  .student-table td {
    white-space: nowrap;
  }

  .table-student {
    white-space: normal;
  }

  .student-table-actions {
    min-width: 0;
  }

  .student-search {
    min-width: 0;
  }

  .modal-backdrop {
    padding: 20px;
    overflow-y: auto;
  }

  .modal {
    width: min(620px, 100%);
    max-width: 100%;
    max-height: calc(100dvh - 40px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header,
  .modal-footer {
    flex-shrink: 0;
  }

  .modal .form {
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .modal-header > div {
    min-width: 0;
  }

  .modal-header h2,
  .modal-header p {
    overflow-wrap: anywhere;
  }

  /* Tablet */
  @media (max-width: 900px) {
    .page-shell {
      width: min(100% - 28px, 1100px);
      padding-top: 20px;
      padding-bottom: 34px;
    }

    .page-header {
      align-items: flex-start;
      gap: 18px;
      margin-bottom: 20px;
    }

    .header-left {
      flex: 1 1 100%;
    }

    .create-button {
      width: 100%;
    }

    .course-overview {
      flex-direction: column;
      align-items: stretch;
      gap: 18px;
      padding: 20px;
    }

    .overview-course {
      min-width: 0;
    }

    .overview-meta {
      flex-wrap: wrap;
      gap: 14px 24px;
    }

    .edit-course-button {
      width: 100%;
    }

    .batch-grid {
      grid-template-columns: 1fr;
    }

    .course-level-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .student-table-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .student-table-actions {
      width: 100%;
      display: flex;
      gap: 10px;
    }

    .student-table-actions .student-search {
      flex: 1;
    }

    .student-table-scroll {
      overflow-x: auto;
    }

    .modal-backdrop {
      padding: 16px;
    }

    .modal {
      max-height: calc(100dvh - 32px);
    }
  }

  /* Phone */
  @media (max-width: 600px) {
    .page-shell {
      width: 100%;
      padding: 12px 10px 28px;
    }

    .page-header {
      gap: 12px;
      padding-bottom: 16px;
      margin-bottom: 16px;
    }

    .header-left {
      width: 100%;
      gap: 10px;
    }

    .back-button {
      width: 38px;
      height: 38px;
      flex-basis: 38px;
    }

    h1 {
      font-size: 25px;
      line-height: 1.12;
    }

    .page-header p {
      font-size: 12px;
      line-height: 1.45;
    }

    .title-line {
      flex-wrap: wrap;
      gap: 7px;
    }

    .title-separator {
      display: none;
    }

    .create-button {
      height: 42px;
      width: 100%;
    }

    .error-banner {
      padding: 11px;
      margin-bottom: 13px;
    }

    .error-banner span {
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .course-overview {
      padding: 15px;
      border-radius: 10px;
    }

    .overview-course {
      align-items: flex-start;
      gap: 12px;
    }

    .course-badge {
      width: 54px;
      height: 54px;
      flex-basis: 54px;
      border-radius: 12px;
      font-size: 21px;
    }

    .overview-title-row {
      flex-wrap: wrap;
      gap: 7px;
    }

    .overview-title-row h2 {
      font-size: 18px;
    }

    .overview-copy > p {
      margin-bottom: 13px;
      font-size: 11px;
    }

    .overview-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .overview-meta > div {
      min-width: 0;
    }

    .batch-section .section-heading {
      padding: 14px;
    }

    .course-level-panel {
      border-radius: 10px;
    }

    .course-level-banner {
      flex-direction: column;
      padding: 15px;
    }

    .course-level-banner h3 {
      font-size: 16px;
    }

    .course-level-banner p {
      font-size: 11px;
    }

    .course-level-pill {
      align-self: flex-start;
    }

    .course-level-stats {
      grid-template-columns: 1fr;
    }

    .course-level-stats > div {
      min-width: 0;
      padding: 14px 15px;
      border-right: 0;
      border-bottom: 1px solid #202023;
    }

    .course-level-stats > div:last-child {
      border-bottom: 0;
    }

    .course-level-stats strong {
      font-size: 19px;
    }

    .student-table-card {
      min-width: 0;
    }

    .student-table-toolbar {
      padding: 13px;
      gap: 11px;
    }

    .student-table-title {
      min-width: 0;
    }

    .student-table-title h2 {
      font-size: 16px;
    }

    .student-table-title p {
      font-size: 10px;
      overflow-wrap: anywhere;
    }

    .student-table-actions {
      width: 100%;
      flex-direction: column;
      gap: 8px;
    }

    .student-table-actions .student-search {
      width: 100%;
      height: 40px;
    }

    .student-count-pill {
      align-self: flex-start;
    }

    .student-table-scroll {
      border-top: 0;
      padding-bottom: 2px;
    }

    .student-table {
      min-width: 900px;
    }

    .student-table th {
      padding: 10px;
      font-size: 9px;
    }

    .student-table td {
      padding: 10px;
      font-size: 11px;
    }

    .table-student {
      min-width: 155px;
    }

    .student-avatar {
      width: 32px;
      height: 32px;
      flex-basis: 32px;
    }

    .student-table-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      padding: 11px 13px;
    }

    .student-pagination {
      width: 100%;
      justify-content: space-between;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .pagination-pages {
      display: flex;
      min-width: max-content;
    }

    .course-level-bottom {
      padding: 13px;
      align-items: stretch;
      flex-direction: column;
      gap: 9px;
    }

    .course-level-action {
      width: 100%;
      justify-content: center;
    }

    .course-level-bottom > span {
      text-align: center;
      line-height: 1.45;
    }

    .batch-card {
      padding: 14px;
      border-radius: 10px;
    }

    .batch-card-top {
      margin-bottom: 13px;
    }

    .batch-name-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 7px;
    }

    .batch-name-row h3 {
      font-size: 17px;
    }

    .batch-details-grid {
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }

    .detail-item {
      min-width: 0;
      padding: 10px;
    }

    .detail-item strong {
      overflow-wrap: anywhere;
    }

    .price-strip {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .price-strip > div,
    .single-price {
      padding: 10px 0;
      border-right: 0 !important;
      border-bottom: 1px solid #202023;
    }

    .price-strip > div:last-child,
    .single-price:last-child {
      border-bottom: 0;
    }

    .view-batch-button {
      min-height: 42px;
    }

    .action-menu {
      right: 0;
      max-width: calc(100vw - 40px);
    }

    .modal-backdrop {
      padding: 0;
      align-items: flex-end;
    }

    .modal {
      width: 100%;
      max-width: none;
      max-height: 96dvh;
      border-radius: 16px 16px 0 0;
      border-bottom: 0;
    }

    .modal-header {
      padding: 15px;
      gap: 10px;
    }

    .modal-header h2 {
      font-size: 18px;
    }

    .modal-header p {
      font-size: 11px;
      line-height: 1.45;
    }

    .modal-close {
      width: 34px;
      height: 34px;
      flex-basis: 34px;
    }

    .modal .form {
      padding: 14px;
      gap: 12px;
    }

    .payment-mode-grid,
    .date-grid,
    .amount-grid {
      grid-template-columns: 1fr;
    }

    .payment-mode-option {
      min-height: 62px;
      padding: 11px;
    }

    .modal-footer {
      padding: 11px 14px calc(11px + env(safe-area-inset-bottom));
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 8px;
    }

    .cancel-button,
    .save-button {
      width: 100%;
      min-height: 42px;
    }
  }

  /* Very small phones */
  @media (max-width: 600px) {
    .whatsapp-links-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 380px) {
    .page-shell {
      padding-left: 8px;
      padding-right: 8px;
    }

    h1 {
      font-size: 22px;
    }

    .overview-meta {
      grid-template-columns: 1fr;
    }

    .batch-details-grid {
      grid-template-columns: 1fr;
    }

    .modal-footer {
      grid-template-columns: 1fr;
    }

    .student-pagination {
      justify-content: flex-start;
      gap: 6px;
    }
  }

  /* Landscape / short-height phones */
  @media (max-height: 620px) and (max-width: 900px) {
    .page-shell {
      padding-top: 8px;
      padding-bottom: 20px;
    }

    .page-header {
      padding-bottom: 11px;
      margin-bottom: 12px;
    }

    .modal {
      max-height: 100dvh;
      border-radius: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: .01ms !important;
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
    }
  }

`;
