"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Edit3,
  Layers3,
  Loader2,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Course = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
};

type Batch = {
  id: string;
  course_id: string;
  name: string;
  advance_amount: number;
  balance_amount: number;
  full_amount: number;
  status: "active" | "inactive";
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at: string;
};

type StudentPayment = {
  id: string;
  payment_id: string | null;
  customer_id: string | null;
  amount: number;
  status: string | null;
  method: string | null;
  payment_time: string | null;
  payment_type: string | null;
  batch: string | null;
  course: string | null;
  failed_reason: string | null;
};

type Student = {
  id: string;
  name: string;
  age: number | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  totalPaid: number;
  paymentStatus: "Full Payment" | "Advance + Balance" | "Advance Only" | "Balance Only" | "Partial / Other" | "No Payment";
  payments: StudentPayment[];
};

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

export default function BatchDetailsPage() {
  const params = useParams<{ courseId: string; batchId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const courseId = params?.courseId;
  const batchId = params?.batchId;

  const [course, setCourse] = useState<Course | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "full" | "advance_balance" | "advance_only" | "balance_only" | "other" | "no_payment">("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [advance, setAdvance] = useState("");
  const [balance, setBalance] = useState("");
  const [full, setFull] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const getPaymentKind = (
    payment: StudentPayment,
    advanceAmount: number,
    balanceAmount: number,
    fullAmount: number,
  ): "advance" | "balance" | "full" | "other" => {
    const type = (payment.payment_type || "").trim().toLowerCase();

    if (type === "advance" || type === "advance payment") return "advance";
    if (type === "balance" || type === "balance payment") return "balance";
    if (type === "full" || type === "full payment") return "full";

    const amount = Number(payment.amount || 0);

    if (Math.abs(amount - fullAmount) <= 0.01) return "full";
    if (Math.abs(amount - advanceAmount) <= 0.01) return "advance";
    if (Math.abs(amount - balanceAmount) <= 0.01) return "balance";

    return "other";
  };

  const loadStudents = async (
    courseName?: string,
    batchName?: string,
    batchConfig?: Batch,
  ) => {
    if (!courseName || !batchName || !batchConfig) return;

    setStudentsLoading(true);
    setMessage("");

    /*
     * Batch membership is derived from PAYMENT-LEVEL routing first, with
     * CUSTOMERS used to keep students visible even when they have no payment.
     *
     * This is important because one customer can make payments for different
     * courses/batches over time. We must never attach every payment belonging
     * to a customer to the currently viewed batch.
     */
    const [{ data: customerRows, error: customerError }, { data: paymentRows, error: paymentError }] =
      await Promise.all([
        supabase
          .from("customers")
          .select("id,name,age,city,phone,email,course,batch")
          .ilike("course", courseName)
          .ilike("batch", batchName),

        supabase
          .from("payments")
          .select(
            "id,payment_id,customer_id,amount,status,method,payment_time,payment_type,batch,course,failed_reason",
          )
          .ilike("course", courseName)
          .ilike("batch", batchName)
          .eq("status", "captured")
          .order("payment_time", { ascending: false }),
      ]);

    if (customerError) {
      setMessage(`Could not load students: ${customerError.message}`);
      setStudents([]);
      setStudentsLoading(false);
      return;
    }

    if (paymentError) {
      setMessage(`Could not load student payments: ${paymentError.message}`);
      setStudents([]);
      setStudentsLoading(false);
      return;
    }

    let customers = [...(customerRows || [])];
    const routedPayments = (paymentRows || []) as StudentPayment[];

    /*
     * If a routed payment belongs to a customer whose CURRENT customer row
     * no longer has this batch, still include that customer in the historical
     * batch view.
     */
    const knownCustomerIds = new Set(customers.map((customer) => customer.id));
    const routedCustomerIds = Array.from(
      new Set(
        routedPayments
          .map((payment) => payment.customer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const missingCustomerIds = routedCustomerIds.filter(
      (id) => !knownCustomerIds.has(id),
    );

    if (missingCustomerIds.length > 0) {
      const { data: historicalCustomers, error: historicalCustomerError } =
        await supabase
          .from("customers")
          .select("id,name,age,city,phone,email,course,batch")
          .in("id", missingCustomerIds);

      if (historicalCustomerError) {
        setMessage(
          `Could not load historical batch students: ${historicalCustomerError.message}`,
        );
        setStudents([]);
        setStudentsLoading(false);
        return;
      }

      customers = [...customers, ...(historicalCustomers || [])];
    }

    const customerMap = new Map(
      customers.map((customer) => [customer.id, customer]),
    );
    const paymentsByCustomer = new Map<string, StudentPayment[]>();

    for (const payment of routedPayments) {
      if (!payment.customer_id || !customerMap.has(payment.customer_id)) continue;

      const existing = paymentsByCustomer.get(payment.customer_id) || [];
      existing.push(payment);
      paymentsByCustomer.set(payment.customer_id, existing);
    }

    const advanceAmount = Number(batchConfig.advance_amount || 0);
    const balanceAmount = Number(batchConfig.balance_amount || 0);
    const fullAmount = Number(batchConfig.full_amount || 0);

    const nextStudents: Student[] = customers.map((customer) => {
      const customerPayments = paymentsByCustomer.get(customer.id) || [];
      const totalPaid = customerPayments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0,
      );

      const kinds = new Set(
        customerPayments.map((payment) =>
          getPaymentKind(payment, advanceAmount, balanceAmount, fullAmount),
        ),
      );

      const hasAdvance = kinds.has("advance");
      const hasBalance = kinds.has("balance");
      const hasFull = kinds.has("full");

      let paymentStatus: Student["paymentStatus"] = "No Payment";

      if (hasFull || totalPaid >= fullAmount - 0.01) {
        paymentStatus =
          hasAdvance && hasBalance
            ? "Advance + Balance"
            : "Full Payment";
      } else if (hasAdvance && hasBalance) {
        paymentStatus = "Advance + Balance";
      } else if (hasAdvance) {
        paymentStatus = "Advance Only";
      } else if (hasBalance) {
        paymentStatus = "Balance Only";
      } else if (customerPayments.length > 0) {
        paymentStatus = "Partial / Other";
      }

      return {
        id: customer.id,
        name: customer.name || "Student",
        age: customer.age ?? null,
        city: customer.city ?? null,
        phone: customer.phone ?? null,
        email: customer.email ?? null,
        totalPaid,
        paymentStatus,
        payments: customerPayments,
      };
    });

    // Customers with routed payments are shown first, ordered by latest payment.
    nextStudents.sort((a, b) => {
      const latestA = a.payments[0]?.payment_time
        ? new Date(a.payments[0].payment_time).getTime()
        : 0;
      const latestB = b.payments[0]?.payment_time
        ? new Date(b.payments[0].payment_time).getTime()
        : 0;

      return latestB - latestA;
    });

    setStudents(nextStudents);
    setStudentsLoading(false);
  };

  const loadData = async () => {
    if (!courseId || !batchId) return;

    setLoading(true);
    setMessage("");

    const [{ data: courseData, error: courseError }, { data: batchData, error: batchError }] =
      await Promise.all([
        supabase
          .from("courses")
          .select("id,name,description,status")
          .eq("id", courseId)
          .single(),
        supabase
          .from("course_batches")
          .select(
            "id,course_id,name,advance_amount,balance_amount,full_amount,status,start_date,end_date,created_at,updated_at",
          )
          .eq("id", batchId)
          .eq("course_id", courseId)
          .single(),
      ]);

    if (courseError || batchError) {
      setMessage(courseError?.message || batchError?.message || "Unable to load batch.");
      setCourse(courseData ?? null);
      setBatch(batchData ?? null);
      setLoading(false);
      return;
    }

    setCourse(courseData);
    setBatch(batchData);
    setName(batchData.name);
    setAdvance(String(batchData.advance_amount));
    setBalance(String(batchData.balance_amount));
    setFull(String(batchData.full_amount));
    setStartDate(batchData.start_date || "");
    setEndDate(batchData.end_date || "");
    await loadStudents(courseData.name, batchData.name, batchData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    if (!courseId || !batchId) return;

    const channel = supabase
      .channel(`batch-details-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "course_batches",
          filter: `id=eq.${batchId}`,
        },
        () => loadData(),
      )
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
          table: "payments",
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courseId, batchId]);

  const advanceValue = Number(advance);
  const balanceValue = Number(balance);
  const fullValue = Number(full);
  const fullAmount = Number(batch?.full_amount || fullValue || 0);

  const calculatedFull = advanceValue + balanceValue;
  const pricingValid =
    Number.isFinite(advanceValue) &&
    Number.isFinite(balanceValue) &&
    Number.isFinite(fullValue) &&
    advanceValue >= 0 &&
    balanceValue >= 0 &&
    fullValue > 0 &&
    Math.abs(calculatedFull - fullValue) <= 0.01;

  const saveBatch = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setMessage("Batch name is required.");
      return;
    }

    if (!pricingValid) {
      setMessage("Full amount must equal Advance + Balance.");
      return;
    }

    if (!courseId || !batchId) return;

    setSaving(true);
    setMessage("");

    const { data: duplicate } = await supabase
      .from("course_batches")
      .select("id")
      .eq("course_id", courseId)
      .ilike("name", trimmedName)
      .neq("id", batchId)
      .maybeSingle();

    if (duplicate) {
      setMessage("A batch with this name already exists in this course.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("course_batches")
      .update({
        name: trimmedName,
        advance_amount: advanceValue,
        balance_amount: balanceValue,
        full_amount: fullValue,
        start_date: startDate || null,
        end_date: endDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId)
      .eq("course_id", courseId)
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setBatch(data);
    setName(data.name);
    setAdvance(String(data.advance_amount));
    setBalance(String(data.balance_amount));
    setFull(String(data.full_amount));
    setStartDate(data.start_date || "");
    setEndDate(data.end_date || "");
    setEditing(false);
    await loadStudents(course?.name, data.name, data);
    setMessage("Batch configuration saved.");
    setSaving(false);
  };

  const toggleStatus = async () => {
    if (!batch) return;

    const nextStatus = batch.status === "active" ? "inactive" : "active";

    setSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("course_batches")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setBatch(data);
    setSaving(false);
    setMessage(`Batch ${nextStatus === "active" ? "activated" : "disabled"}.`);
  };

  const cancelEditing = () => {
    if (!batch) return;
    setName(batch.name);
    setAdvance(String(batch.advance_amount));
    setBalance(String(batch.balance_amount));
    setFull(String(batch.full_amount));
    setStartDate(batch.start_date || "");
    setEndDate(batch.end_date || "");
    setEditing(false);
    setMessage("");
  };

  // Live overview statistics.
  // Total People Paid = unique students in this batch.
  // Advance Payments = students who currently have ONLY an advance payment.
  // Full Payments = students who completed the full amount, either by:
  // 1) paying the full amount directly, or
  // 2) paying Advance + Balance.
  //
  // Therefore, when an Advance Only student pays the Balance:
  // Advance Payments decreases by 1 and Full Payments increases by 1.
  const overviewPaymentCounts = useMemo(() => {
    const counts = {
      all: students.length,
      advance: 0,
      full: 0,
    };

    students.forEach((student) => {
      switch (student.paymentStatus) {
        case "Advance Only":
          counts.advance += 1;
          break;
        case "Full Payment":
        case "Advance + Balance":
          counts.full += 1;
          break;
      }
    });

    return counts;
  }, [students]);

  const searchedStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();

    if (!query) return students;

    return students.filter((student) =>
      [
        student.name,
        student.phone,
        student.email,
        student.city,
        student.paymentStatus,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [students, studentSearch]);

  const studentFilterCounts = useMemo(() => {
    const counts: Record<
      "all" | "full" | "advance_balance" | "advance_only" | "balance_only" | "other" | "no_payment",
      number
    > = {
      all: searchedStudents.length,
      full: 0,
      advance_balance: 0,
      advance_only: 0,
      balance_only: 0,
      other: 0,
      no_payment: 0,
    };

    searchedStudents.forEach((student) => {
      switch (student.paymentStatus) {
        case "Full Payment":
          counts.full += 1;
          break;
        case "Advance + Balance":
          counts.advance_balance += 1;
          break;
        case "Advance Only":
          counts.advance_only += 1;
          break;
        case "Balance Only":
          counts.balance_only += 1;
          break;
        case "No Payment":
          counts.no_payment += 1;
          break;
        default:
          counts.other += 1;
          break;
      }
    });

    return counts;
  }, [searchedStudents]);

  if (loading) {
    return (
      <main className="page-shell">
        <div className="loading-state">
          <Loader2 className="spin" size={22} />
          <span>Loading batch...</span>
        </div>
        <Styles />
      </main>
    );
  }

  if (!course || !batch) {
    return (
      <main className="page-shell">
        <div className="topbar">
          <button
            className="back-button"
            onClick={() => router.push(courseId ? `/dashboard/courses/${courseId}` : "/dashboard/courses")}
          >
            <ArrowLeft size={16} />
            Back to Course
          </button>
        </div>
        <section className="empty-panel">
          <Layers3 size={30} />
          <h2>Batch not found</h2>
          <p>{message || "This batch may have been removed or is no longer available."}</p>
        </section>
        <Styles />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="topbar">
        <button
          className="back-button"
          onClick={() => router.push(`/dashboard/courses/${course.id}`)}
        >
          <ArrowLeft size={16} />
          Back to {course.name}
        </button>

        <div className="top-actions">
          <span className={`status-pill ${batch.status}`}>
            <span className="status-dot" />
            {batch.status}
          </span>

          <button className="secondary-button" onClick={toggleStatus} disabled={saving}>
            {batch.status === "active" ? (
              <ToggleRight size={18} />
            ) : (
              <ToggleLeft size={18} />
            )}
            {batch.status === "active" ? "Disable Batch" : "Activate Batch"}
          </button>

          {!editing && (
            <button className="primary-button" onClick={() => setEditing(true)}>
              <Edit3 size={17} />
              Edit Batch
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`notice ${message.includes("saved") || message.includes("activated") || message.includes("disabled") ? "success" : "error"}`}>
          {message.includes("saved") || message.includes("activated") || message.includes("disabled") ? (
            <Check size={17} />
          ) : (
            <X size={17} />
          )}
          {message}
        </div>
      )}

      {editing ? (
        <form className="edit-panel" onSubmit={saveBatch}>
          <div className="section-heading">
            <div>
              <span className="section-kicker">EDIT CONFIGURATION</span>
              <h2>Batch pricing</h2>
            </div>
            <span className={`validation ${pricingValid ? "valid" : "invalid"}`}>
              {pricingValid ? "Pricing valid" : "Check pricing"}
            </span>
          </div>

          <div className="form-grid">
            <label className="field wide">
              <span>Batch Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Batch 1" />
            </label>

            <label className="field">
              <span>Advance Amount</span>
              <div className="input-wrap">
                <span>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span>Balance Amount</span>
              <div className="input-wrap">
                <span>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span>Full Amount</span>
              <div className="input-wrap">
                <span>₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={full}
                  onChange={(e) => setFull(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span>Start Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>

            <label className="field">
              <span>End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <div className={`formula ${pricingValid ? "valid" : "invalid"}`}>
            <span>Pricing rule</span>
            <strong>
              {money(advanceValue || 0)} + {money(balanceValue || 0)} = {money(calculatedFull || 0)}
            </strong>
            <span>
              {pricingValid
                ? "Matches the configured Full amount."
                : "Full amount must exactly equal Advance + Balance."}
            </span>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={cancelEditing} disabled={saving}>
              <X size={17} />
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving || !pricingValid}>
              {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
              Save Changes
            </button>
          </div>
        </form>
      ) : (
        <>

          <section className="batch-summary">
            <div className="batch-summary-header">
              <div>
                <span className="section-kicker">BATCH OVERVIEW</span>
                <h2>{batch.name}</h2>
                <p>Live student and payment summary for this batch.</p>
              </div>

              <div className="batch-date-strip">
                <div className="date-box">
                  <span>START DATE</span>
                  <strong>{formatDate(batch.start_date)}</strong>
                </div>
                <div className="date-divider" />
                <div className="date-box">
                  <span>END DATE</span>
                  <strong>{formatDate(batch.end_date)}</strong>
                </div>
              </div>
            </div>

            <div className="stats-grid">
              <StatCard
                label="Total People Paid"
                value={String(overviewPaymentCounts.all)}
                detail="Unique students"
                accent="primary"
              />
              <StatCard
                label="Advance Payments"
                value={String(overviewPaymentCounts.advance)}
                detail="Advance Only"
                accent="advance"
              />
              <StatCard
                label="Full Payments"
                value={String(overviewPaymentCounts.full)}
                detail="Full Payment + Advance + Balance"
                accent="full"
              />
            </div>
          </section>

          <section className="students-section">
            <div className="students-heading">
              <div>
                <span className="section-kicker">STUDENT PAYMENTS</span>
                <h2>Students</h2>
                <p>
                  All captured payments linked to students in {course.name} / {batch.name}. Click a
                  student to view their complete payment history.
                </p>
              </div>

              <div className="student-summary">
                <strong>{students.length}</strong>
                <span>Total people</span>
              </div>
            </div>

            <div className="student-toolbar">
              <div className="toolbar-main">
                <div className="student-search">
                  <Search size={16} />
                  <input
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search name, phone, email or city"
                    aria-label="Search students"
                  />
                  {studentSearch && (
                    <button
                      type="button"
                      className="clear-search"
                      onClick={() => setStudentSearch("")}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="filter-area">
                  <div className="filter-heading">
                    <span>FILTER BY PAYMENT STATUS</span>
                    <strong>{studentFilterCounts[paymentFilter]} students</strong>
                  </div>

                  <div className="filter-row">
                    {[
                      ["all", "All", studentFilterCounts.all],
                      ["full", "Full Payment", studentFilterCounts.full],
                      ["advance_balance", "Advance + Balance", studentFilterCounts.advance_balance],
                      ["advance_only", "Advance Only", studentFilterCounts.advance_only],
                      ["balance_only", "Balance Only", studentFilterCounts.balance_only],
                      ["other", "Partial / Other", studentFilterCounts.other],
                      ["no_payment", "No Payment", studentFilterCounts.no_payment],
                    ].map(([value, label, count]) => (
                      <button
                        key={value}
                        type="button"
                        className={paymentFilter === value ? "filter active" : "filter"}
                        onClick={() =>
                          setPaymentFilter(
                            value as
                              | "all"
                              | "full"
                              | "advance_balance"
                              | "advance_only"
                              | "balance_only"
                              | "other"
                              | "no_payment",
                          )
                        }
                      >
                        <span>{label}</span>
                        <b>{count}</b>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(studentSearch || paymentFilter !== "all") && (
                <button
                  type="button"
                  className="clear-filters"
                  onClick={() => {
                    setStudentSearch("");
                    setPaymentFilter("all");
                  }}
                >
                  <X size={13} />
                  Clear filters
                </button>
              )}
            </div>

            {studentsLoading ? (
              <div className="students-loading">
                <Loader2 className="spin" size={20} />
                Loading students...
              </div>
            ) : (() => {
              const query = studentSearch.trim().toLowerCase();

              const filteredStudents = students.filter((student) => {
                const matchesSearch =
                  !query ||
                  [
                    student.name,
                    student.phone,
                    student.email,
                    student.city,
                    student.paymentStatus,
                  ]
                    .filter(Boolean)
                    .some((value) =>
                      String(value).toLowerCase().includes(query),
                    );

                const matchesFilter =
                  paymentFilter === "all" ||
                  (paymentFilter === "full" && student.paymentStatus === "Full Payment") ||
                  (paymentFilter === "advance_balance" &&
                    student.paymentStatus === "Advance + Balance") ||
                  (paymentFilter === "advance_only" &&
                    student.paymentStatus === "Advance Only") ||
                  (paymentFilter === "balance_only" &&
                    student.paymentStatus === "Balance Only") ||
                  (paymentFilter === "other" &&
                    student.paymentStatus === "Partial / Other") ||
                  (paymentFilter === "no_payment" &&
                    student.paymentStatus === "No Payment");

                return matchesSearch && matchesFilter;
              });

              if (filteredStudents.length === 0) {
                return (
                  <div className="students-empty">
                    <UserRound size={25} />
                    <h3>
                      {students.length === 0
                        ? "No customers in this batch"
                        : "No students match this filter"}
                    </h3>
                    <p>
                      {students.length === 0
                        ? "No customer is currently linked to this course and batch."
                        : "Try another payment filter or search term."}
                    </p>
                  </div>
                );
              }

              return (
                <div className="students-table-wrap">
                  <table className="students-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Payment Status</th>
                        <th>Total Paid</th>
                        <th>Payments</th>
                        <th>Latest Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr
                          key={student.id}
                          className={
                            selectedStudentId === student.id ? "selected" : ""
                          }
                          onClick={() =>
                            setSelectedStudentId(
                              selectedStudentId === student.id
                                ? null
                                : student.id,
                            )
                          }
                        >
                          <td>
                            <div className="student-name-cell">
                              <div className="student-avatar">
                                {(student.name || "S").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong>{student.name}</strong>
                                <span>
                                  {student.age
                                    ? `${student.age} yrs`
                                    : "Age not provided"}
                                  {student.city ? ` · ${student.city}` : ""}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span className="table-value">
                              {student.phone || "—"}
                            </span>
                          </td>

                          <td>
                            <span className="table-value email-value">
                              {student.email || "—"}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`payment-status ${student.paymentStatus
                                .toLowerCase()
                                .replace(/[^a-z]+/g, "-")}`}
                            >
                              {student.paymentStatus}
                            </span>
                          </td>

                          <td>
                            <strong className="paid-amount">
                              {money(student.totalPaid)}
                            </strong>
                            <span className="paid-progress">
                              {Math.min(
                                100,
                                Math.round(
                                  (student.totalPaid /
                                    Math.max(batch.full_amount, 1)) *
                                    100,
                                ),
                              )}
                              % of full
                            </span>
                          </td>

                          <td>
                            <strong>{student.payments.length}</strong>
                            <span className="muted-cell">
                              payment
                              {student.payments.length === 1 ? "" : "s"}
                            </span>
                          </td>

                          <td>
                            <span className="date-cell">
                              {student.payments[0]?.payment_time
                                ? new Date(
                                    student.payments[0].payment_time,
                                  ).toLocaleString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {selectedStudentId &&
              (() => {
                const student = students.find(
                  (item) => item.id === selectedStudentId,
                );
                if (!student) return null;

                return (
                  <div className="student-detail-panel">
                    <div className="student-detail-header">
                      <div>
                        <span className="section-kicker">STUDENT DETAILS</span>
                        <h3>{student.name}</h3>
                        <p>
                          {student.paymentStatus} · {student.payments.length}{" "}
                          payment
                          {student.payments.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="student-close"
                        onClick={() => setSelectedStudentId(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="student-detail-grid">
                      <div>
                        <span>Age</span>
                        <strong>{student.age ?? "Not provided"}</strong>
                      </div>
                      <div>
                        <span>City</span>
                        <strong>{student.city || "Not provided"}</strong>
                      </div>
                      <div>
                        <span>Phone</span>
                        <strong>{student.phone || "Not provided"}</strong>
                      </div>
                      <div>
                        <span>Email</span>
                        <strong>{student.email || "Not provided"}</strong>
                      </div>
                      <div>
                        <span>Total Paid</span>
                        <strong>{money(student.totalPaid)}</strong>
                      </div>
                      <div>
                        <span>Remaining</span>
                        <strong>
                          {money(
                            Math.max(
                              0,
                              batch.full_amount - student.totalPaid,
                            ),
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="payment-history">
                      <div className="history-heading">
                        <h4>Payment history</h4>
                        <span>Captured payments</span>
                      </div>

                      {student.payments.map((payment) => {
                        const kind = getPaymentKind(
                          payment,
                          batch.advance_amount,
                          batch.balance_amount,
                          batch.full_amount,
                        );

                        return (
                          <div
                            className="payment-history-row"
                            key={payment.id}
                          >
                            <div>
                              <span className={`history-kind ${kind}`}>
                                {kind === "advance"
                                  ? "Advance"
                                  : kind === "balance"
                                    ? "Balance"
                                    : kind === "full"
                                      ? "Full"
                                      : "Other"}
                              </span>
                              <strong>
                                {payment.payment_id ||
                                  "Payment ID unavailable"}
                              </strong>
                              <span>
                                {payment.method
                                  ? payment.method.toUpperCase()
                                  : "Method unavailable"}
                              </span>
                            </div>

                            <div className="history-right">
                              <strong>
                                {money(Number(payment.amount || 0))}
                              </strong>
                              <span>
                                {payment.payment_time
                                  ? new Date(
                                      payment.payment_time,
                                    ).toLocaleString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
          </section>
        </>
      )}

      <Styles />
    </main>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  detail,
  accent = "primary",
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "primary" | "advance" | "full";
}) {
  return (
    <div className={`stat-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Styles() {
  return (
    <style jsx global>{`
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        background: #050505;
        color: #f5f5f5;
      }

      button,
      input {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .page-shell {
        min-height: 100vh;
        background:
          radial-gradient(circle at 90% 0%, rgba(255, 23, 68, .065), transparent 28%),
          #050505;
        padding: 36px 44px 70px;
      }

      .topbar,
      .notice,
      .edit-panel,
      .content-grid,
      .students-section {
        max-width: 1180px;
        margin-left: auto;
        margin-right: auto;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 22px;
        border-bottom: 1px solid #202023;
      }

      .back-button,
      .secondary-button,
      .primary-button {
        min-height: 40px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 750;
        transition: .16s ease;
      }

      .back-button,
      .secondary-button {
        border: 1px solid #29292d;
        color: #a2a2aa;
        background: #0d0d0e;
      }

      .back-button:hover,
      .secondary-button:hover {
        color: #fff;
        border-color: #38383d;
        background: #131314;
      }

      .top-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .primary-button {
        border: 1px solid #ff1744;
        color: #fff;
        background: #ff1744;
        box-shadow: 0 10px 25px rgba(255,23,68,.13);
      }

      .primary-button:hover {
        background: #ff2852;
        transform: translateY(-1px);
      }

      .status-pill {
        height: 34px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border: 1px solid #29292d;
        border-radius: 8px;
        color: #888890;
        background: #0d0d0e;
        font-size: 13px;
        font-weight: 800;
        text-transform: capitalize;
      }

      .status-pill.active {
        color: #75e693;
        border-color: rgba(46,216,102,.2);
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .notice {
        margin-bottom: 16px;
        padding: 11px 13px;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #29292d;
        border-radius: 8px;
        background: #0c0c0d;
        color: #bdbdc3;
        font-size: 13px;
      }

      .notice.success {
        border-color: rgba(46,216,102,.18);
        color: #9be7ae;
      }

      .notice.error {
        border-color: rgba(255,23,68,.2);
        color: #ff9caf;
      }

      .content-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.45fr) minmax(300px, .8fr);
        gap: 14px;
      }

      .panel,
      .edit-panel,
      .students-section {
        border: 1px solid #202023;
        border-radius: 11px;
        background: #0c0c0d;
        overflow: hidden;
      }

      .section-heading {
        padding: 18px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid #202023;
      }

      .section-kicker {
        display: block;
        margin-bottom: 5px;
        color: #ff1744;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .14em;
      }

      .section-heading h2 {
        margin: 0;
        font-size: 16px;
        letter-spacing: -.025em;
      }

      .payment-row {
        min-height: 76px;
        padding: 14px 20px;
        display: grid;
        grid-template-columns: 35px 1fr auto;
        align-items: center;
        gap: 13px;
        border-bottom: 1px solid #1b1b1e;
      }

      .payment-row:last-child {
        border-bottom: 0;
      }

      .payment-row.total {
        background: rgba(255,23,68,.025);
      }

      .step-number {
        color: #55555c;
        font-size: 13px;
        font-weight: 800;
      }

      .payment-copy strong {
        display: block;
        margin-bottom: 3px;
        font-size: 14px;
      }

      .payment-copy span {
        color: #707078;
        font-size: 13px;
      }

      .payment-row > strong {
        font-size: 14px;
      }

      .details-panel {
        padding-bottom: 5px;
      }

      .detail-row {
        min-height: 48px;
        padding: 0 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
        border-bottom: 1px solid #1b1b1e;
      }

      .detail-row span {
        color: #6d6d74;
        font-size: 13px;
      }

      .detail-row strong {
        color: #dedee1;
        font-size: 13px;
        text-align: right;
      }

      .students-section {
        margin-top: 14px;
      }

      .students-heading {
        padding: 19px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border-bottom: 1px solid #202023;
      }

      .students-heading h2 {
        margin: 0 0 5px;
        font-size: 20px;
        letter-spacing: -.025em;
      }

      .students-heading p {
        margin: 0;
        color: #707078;
        font-size: 13px;
      }

      .student-summary {
        min-width: 78px;
        padding-left: 18px;
        border-left: 1px solid #29292d;
        text-align: right;
      }

      .student-summary strong,
      .student-summary span {
        display: block;
      }

      .student-summary strong {
        font-size: 22px;
      }

      .student-summary span {
        margin-top: 2px;
        color: #6d6d74;
        font-size: 12px;
      }

      .student-toolbar {
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid #202023;
      }

      .student-search {
        width: min(340px, 100%);
        height: 38px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 10px;
        border: 1px solid #29292d;
        border-radius: 8px;
        background: #101011;
        color: #66666e;
      }

      .student-search:focus-within {
        border-color: rgba(255,23,68,.35);
      }

      .student-search input {
        width: 100%;
        height: 100%;
        border: 0;
        outline: 0;
        background: transparent;
        color: #eee;
        font-size: 13px;
      }

      .student-search input::placeholder {
        color: #5f5f67;
      }

      .payment-counts {
        display: flex;
        align-items: center;
        gap: 14px;
        color: #6d6d74;
        font-size: 12px;
      }

      .payment-counts b {
        color: #d9d9dc;
        font-size: 13px;
      }

      .students-table-wrap {
        width: 100%;
        overflow-x: auto;
      }

      .students-table {
        width: 100%;
        min-width: 860px;
        border-collapse: collapse;
      }

      .students-table th {
        padding: 11px 14px;
        border-bottom: 1px solid #202023;
        color: #626269;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
        text-align: left;
        text-transform: uppercase;
      }

      .students-table td {
        padding: 13px 14px;
        border-bottom: 1px solid #18181b;
        color: #d7d7da;
        font-size: 13px;
        vertical-align: middle;
      }

      .students-table tbody tr {
        cursor: pointer;
        transition: .15s ease;
      }

      .students-table tbody tr:hover,
      .students-table tbody tr.selected {
        background: #111112;
      }

      .student-name-cell {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 180px;
      }

      .student-avatar {
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,23,68,.22);
        border-radius: 9px;
        color: #ff1744;
        background: rgba(255,23,68,.06);
        font-size: 14px;
        font-weight: 800;
      }

      .student-name-cell strong,
      .student-name-cell span,
      .contact-cell span,
      .paid-progress,
      .muted-cell,
      .date-cell {
        display: block;
      }

      .student-name-cell strong {
        color: #ededf0;
        font-size: 13px;
      }

      .student-name-cell span,
      .contact-cell span,
      .paid-progress,
      .muted-cell,
      .date-cell {
        margin-top: 3px;
        color: #686870;
        font-size: 11px;
      }

      .contact-cell {
        min-width: 190px;
      }

      .contact-cell span {
        display: flex;
        align-items: center;
        gap: 5px;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .payment-status {
        display: inline-flex;
        padding: 6px 8px;
        border: 1px solid #29292d;
        border-radius: 7px;
        color: #bcbcc2;
        background: #101011;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      .payment-status.full-payment,
      .payment-status.advance-balance {
        border-color: rgba(46,216,102,.18);
        color: #8fe2a5;
      }

      .payment-status.advance-only {
        border-color: rgba(255,23,68,.2);
        color: #ff9aad;
      }

      .payment-status.balance-only {
        border-color: #36363b;
        color: #b7b7bd;
      }

      .paid-amount {
        color: #f1f1f2;
        font-size: 13px;
      }

      .students-loading,
      .students-empty {
        min-height: 190px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: #77777f;
        font-size: 13px;
      }

      .students-empty svg {
        margin-bottom: 10px;
        color: #ff1744;
      }

      .students-empty h3 {
        margin: 0 0 5px;
        color: #dedee1;
        font-size: 13px;
      }

      .students-empty p {
        max-width: 420px;
        margin: 0;
        color: #686870;
        line-height: 1.5;
      }

      .student-detail-panel {
        border-top: 1px solid #202023;
        background: #0a0a0b;
      }

      .student-detail-header {
        padding: 16px 20px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        border-bottom: 1px solid #1c1c1f;
      }

      .student-detail-header h3 {
        margin: 0;
        font-size: 16px;
      }

      .student-close {
        width: 31px;
        height: 31px;
        display: grid;
        place-items: center;
        border: 1px solid #29292d;
        border-radius: 7px;
        color: #85858d;
        background: #111112;
      }

      .student-detail-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        border-bottom: 1px solid #1c1c1f;
      }

      .student-detail-grid > div {
        min-height: 65px;
        padding: 12px 20px;
        border-right: 1px solid #1c1c1f;
      }

      .student-detail-grid > div:last-child {
        border-right: 0;
      }

      .student-detail-grid span,
      .student-detail-grid strong {
        display: block;
      }

      .student-detail-grid span {
        margin-bottom: 5px;
        color: #64646b;
        font-size: 11px;
      }

      .student-detail-grid strong {
        color: #dddde0;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .payment-history {
        padding: 4px 20px;
      }

      .payment-history-row {
        min-height: 58px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 15px;
        border-bottom: 1px solid #18181b;
      }

      .payment-history-row:last-child {
        border-bottom: 0;
      }

      .payment-history-row > div:last-child {
        text-align: right;
      }

      .payment-history-row strong,
      .payment-history-row span {
        display: block;
      }

      .payment-history-row strong {
        color: #e8e8ea;
        font-size: 13px;
      }

      .payment-history-row span {
        margin-top: 3px;
        color: #66666e;
        font-size: 11px;
      }

      .edit-panel {
        overflow: hidden;
      }

      .form-grid {
        padding: 20px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 15px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .field.wide {
        grid-column: 1 / -1;
      }

      .field > span {
        color: #929299;
        font-size: 13px;
        font-weight: 700;
      }

      .field input {
        width: 100%;
        height: 42px;
        border: 1px solid #29292d;
        border-radius: 8px;
        outline: none;
        padding: 0 11px;
        background: #101011;
        color: #eee;
        font-size: 13px;
      }

      .field input:focus {
        border-color: rgba(255,23,68,.42);
        box-shadow: 0 0 0 3px rgba(255,23,68,.06);
      }

      .input-wrap {
        height: 42px;
        display: flex;
        align-items: center;
        border: 1px solid #29292d;
        border-radius: 8px;
        background: #101011;
        overflow: hidden;
      }

      .input-wrap > span {
        padding-left: 11px;
        color: #66666e;
        font-size: 13px;
      }

      .input-wrap input {
        border: 0;
        background: transparent;
      }

      .formula {
        margin: 0 20px 18px;
        padding: 11px 12px;
        display: flex;
        align-items: center;
        gap: 9px;
        flex-wrap: wrap;
        border: 1px solid #29292d;
        border-radius: 8px;
        color: #77777f;
        font-size: 12px;
      }

      .formula strong {
        color: #dddde0;
      }

      .formula.valid {
        border-color: rgba(46,216,102,.18);
      }

      .formula.invalid {
        border-color: rgba(255,23,68,.2);
      }

      .validation {
        padding: 5px 8px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 800;
      }

      .validation.valid {
        color: #8ee0a4;
        background: rgba(46,216,102,.06);
      }

      .validation.invalid {
        color: #ff9bab;
        background: rgba(255,23,68,.06);
      }

      .form-actions {
        padding: 13px 20px;
        display: flex;
        justify-content: flex-end;
        gap: 7px;
        border-top: 1px solid #202023;
      }

      .loading-state {
        min-height: 70vh;
        display: grid;
        place-items: center;
        align-content: center;
        gap: 10px;
        color: #77777f;
        font-size: 13px;
      }

      .empty-panel {
        max-width: 600px;
        margin: 120px auto;
        padding: 42px;
        border: 1px solid #202023;
        border-radius: 11px;
        background: #0c0c0d;
        text-align: center;
        color: #77777f;
      }

      .empty-panel h2 {
        margin: 14px 0 7px;
        color: #eee;
        font-size: 20px;
      }

      .empty-panel p {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
      }

      .spin {
        animation: spin .9s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .batch-summary {
        max-width: 1180px;
        margin: 14px auto 0;
        border: 1px solid #202023;
        border-radius: 11px;
        background: #0c0c0d;
        overflow: hidden;
      }

      .batch-summary-header {
        padding: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        border-bottom: 1px solid #202023;
      }

      .batch-summary-header h2 {
        margin: 0 0 5px;
        font-size: 20px;
        letter-spacing: -.025em;
      }

      .batch-summary-header p {
        margin: 0;
        color: #686870;
        font-size: 13px;
      }

      .batch-date-strip {
        min-width: 330px;
        display: flex;
        align-items: center;
        border: 1px solid #29292d;
        border-radius: 9px;
        background: #101011;
      }

      .date-box {
        min-width: 145px;
        padding: 11px 14px;
      }

      .date-box span {
        display: block;
        margin-bottom: 5px;
        color: #606067;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .09em;
      }

      .date-box strong {
        color: #ededf0;
        font-size: 13px;
      }

      .date-divider {
        width: 1px;
        align-self: stretch;
        background: #29292d;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .stat-card {
        position: relative;
        min-height: 112px;
        padding: 18px 19px;
        border-right: 1px solid #202023;
        background: #0c0c0d;
      }

      .stat-card:last-child {
        border-right: 0;
      }

      .stat-card::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 2px;
        background: #2b2b2f;
      }

      .stat-card.primary::before,
      .stat-card.full::before {
        background: #ff1744;
      }

      .stat-card.advance::before {
        background: #b83a50;
      }

      .stat-card.balance::before {
        background: #7f283a;
      }

      .stat-card span,
      .stat-card strong,
      .stat-card small {
        display: block;
      }

      .stat-card span {
        margin-bottom: 9px;
        color: #77777f;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .07em;
        text-transform: uppercase;
      }

      .stat-card strong {
        color: #f2f2f3;
        font-size: 25px;
        line-height: 1;
        letter-spacing: -.04em;
      }

      .stat-card small {
        margin-top: 8px;
        color: #64646b;
        font-size: 12px;
      }

      .student-toolbar {
        padding: 16px 20px 17px;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid #202023;
        background: #0b0b0c;
      }

      .toolbar-main {
        min-width: 0;
        flex: 1;
      }

      .student-search {
        width: min(420px, 100%);
        height: 40px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 11px;
        border: 1px solid #29292d;
        border-radius: 8px;
        background: #101011;
        color: #66666e;
      }

      .student-search input {
        min-width: 0;
      }

      .clear-search {
        width: 24px;
        height: 24px;
        flex: 0 0 24px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 6px;
        color: #77777f;
        background: transparent;
      }

      .clear-search:hover {
        color: #fff;
        background: #1b1b1e;
      }

      .filter-area {
        margin-top: 14px;
      }

      .filter-heading {
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .filter-heading span {
        color: #5f5f66;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .1em;
      }

      .filter-heading strong {
        color: #9999a1;
        font-size: 12px;
        font-weight: 700;
      }

      .filter-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }

      .filter {
        min-height: 32px;
        padding: 0 9px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #29292d;
        border-radius: 7px;
        color: #808087;
        background: #101011;
        font-size: 12px;
        font-weight: 750;
        transition: .15s ease;
      }

      .filter b {
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        display: inline-grid;
        place-items: center;
        border-radius: 5px;
        color: #696970;
        background: #19191b;
        font-size: 11px;
      }

      .filter:hover {
        color: #e8e8ea;
        border-color: #39393e;
      }

      .filter.active {
        border-color: rgba(255,23,68,.42);
        color: #fff;
        background: rgba(255,23,68,.08);
      }

      .filter.active b {
        color: #fff;
        background: #ff1744;
      }

      .clear-filters {
        height: 32px;
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        border: 1px solid #29292d;
        border-radius: 7px;
        color: #85858c;
        background: #101011;
        font-size: 12px;
        font-weight: 750;
      }

      .clear-filters:hover {
        color: #fff;
        border-color: #3a3a3f;
      }

      @media (max-width: 900px) {
        .batch-summary-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .batch-date-strip {
          width: 100%;
          min-width: 0;
        }

        .date-box {
          flex: 1;
        }

        .stats-grid {
          grid-template-columns: 1fr 1fr;
        }

        .stat-card:nth-child(2) {
          border-right: 0;
        }

        .stat-card:nth-child(-n+2) {
          border-bottom: 1px solid #202023;
        }

        .student-toolbar {
          align-items: stretch;
          flex-direction: column;
        }

        .clear-filters {
          align-self: flex-start;
        }
      }

      @media (max-width: 900px) {
        .page-shell {
          padding: 28px 24px 55px;
        }

        .content-grid {
          grid-template-columns: 1fr;
        }

        .student-detail-grid {
          grid-template-columns: 1fr 1fr;
        }

        .student-detail-grid > div:nth-child(2) {
          border-right: 0;
        }

        .student-detail-grid > div:nth-child(-n+2) {
          border-bottom: 1px solid #1c1c1f;
        }
      }

      @media (max-width: 650px) {
        .page-shell {
          padding: 22px 14px 45px;
        }

        .topbar,

        .top-actions {
          width: 100%;
        }

        .top-actions > * {
          flex: 1;
        }

        .student-toolbar,
        .students-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .student-search {
          width: 100%;
        }

        .filter-row {
          overflow-x: auto;
          flex-wrap: nowrap;
          padding-bottom: 2px;
        }

        .filter {
          flex: 0 0 auto;
        }

        .payment-counts {
          flex-wrap: wrap;
        }

        .student-summary {
          padding-left: 0;
          border-left: 0;
          text-align: left;
        }

        .form-grid {
          grid-template-columns: 1fr;
        }

        .field.wide {
          grid-column: auto;
        }
      }

      @media (max-width: 450px) {

        .student-detail-grid {
          grid-template-columns: 1fr;
        }

        .student-detail-grid > div {
          border-right: 0;
          border-bottom: 1px solid #1c1c1f;
        }

        .student-detail-grid > div:last-child {
          border-bottom: 0;
        }

        .payment-history-row {
          align-items: flex-start;
          flex-direction: column;
          justify-content: center;
          padding: 10px 0;
        }

        .payment-history-row > div:last-child {
          text-align: left;
        }
      }

      /* ===== FINAL RESPONSIVE OVERRIDES ===== */
      html,
      body {
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
      }

      .page-shell {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: hidden;
      }

      .topbar,
      .notice,
      .edit-panel,
      .batch-summary,
      .students-section {
        width: 100%;
        max-width: 1180px;
      }

      .topbar {
        flex-wrap: wrap;
      }

      .top-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .batch-summary-header,
      .students-heading,
      .student-toolbar {
        min-width: 0;
      }

      .batch-summary-header > div:first-child,
      .students-heading > div:first-child,
      .toolbar-main {
        min-width: 0;
      }

      .batch-summary-header h2,
      .students-heading h2,
      .students-heading p,
      .batch-summary-header p {
        overflow-wrap: anywhere;
      }

      .batch-date-strip {
        flex-shrink: 0;
      }

      .student-toolbar {
        flex-wrap: wrap;
      }

      .toolbar-main {
        width: 100%;
        display: flex;
        align-items: flex-start;
        gap: 14px;
        min-width: 0;
      }

      .student-search {
        flex: 0 1 340px;
      }

      .filter-area {
        min-width: 0;
        flex: 1 1 500px;
      }

      .filter-row {
        min-width: 0;
        flex-wrap: wrap;
      }

      .students-table-wrap {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-x: contain;
        scrollbar-width: thin;
      }

      .students-table {
        min-width: 860px;
      }

      .students-table th,
      .students-table td {
        white-space: nowrap;
      }

      .student-name-cell {
        white-space: normal;
      }

      .student-detail-grid {
        min-width: 0;
      }

      .payment-history-row > div:first-child {
        min-width: 0;
      }

      .payment-history-row strong,
      .payment-history-row span {
        overflow-wrap: anywhere;
      }

      /* Tablet */
      @media (max-width: 900px) {
        .page-shell {
          padding: 24px 20px 48px;
        }

        .content-grid {
          grid-template-columns: 1fr;
        }

        .topbar {
          align-items: flex-start;
          gap: 14px;
        }

        .top-actions {
          width: 100%;
          justify-content: flex-start;
        }

        .batch-summary-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .batch-date-strip {
          width: 100%;
        }

        .date-box {
          flex: 1;
        }

        .students-heading {
          align-items: flex-start;
          flex-direction: column;
        }

        .student-summary {
          width: 100%;
          padding: 12px 0 0;
          border-left: 0;
          border-top: 1px solid #29292d;
          text-align: left;
        }

        .toolbar-main {
          flex-direction: column;
        }

        .student-search {
          width: 100%;
          max-width: none;
          flex-basis: auto;
        }

        .filter-area {
          width: 100%;
          flex-basis: auto;
        }

        .clear-filters {
          align-self: flex-start;
        }

        .student-detail-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .student-detail-grid > div:nth-child(2n) {
          border-right: 0;
        }

        .student-detail-grid > div:nth-child(-n + 4) {
          border-bottom: 1px solid #1c1c1f;
        }
      }

      /* Phone */
      @media (max-width: 600px) {
        .page-shell {
          padding: 14px 12px 30px;
        }

        .topbar {
          padding-bottom: 14px;
          gap: 10px;
        }

        .back-button,
        .secondary-button,
        .primary-button {
          min-height: 42px;
          padding: 0 11px;
          font-size: 12px;
        }

        .back-button {
          width: 100%;
        }

        .top-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          width: 100%;
          gap: 8px;
        }

        .top-actions .status-pill {
          grid-column: 1 / -1;
          width: 100%;
          justify-content: center;
        }

        .top-actions .secondary-button,
        .top-actions .primary-button {
          width: 100%;
        }

        .notice {
          padding: 10px 11px;
          margin-bottom: 12px;
          font-size: 12px;
          align-items: flex-start;
        }

        .edit-panel,
        .students-section,
        .panel {
          border-radius: 9px;
        }

        .section-heading,
        .students-heading {
          padding: 15px;
        }

        .section-kicker {
          font-size: 10px;
          letter-spacing: .12em;
        }

        .section-heading h2 {
          font-size: 15px;
        }

        .batch-summary {
          width: 100%;
        }

        .batch-summary-header {
          padding: 15px;
        }

        .batch-summary-header h2 {
          font-size: 20px;
        }

        .batch-summary-header p,
        .students-heading p {
          font-size: 12px;
          line-height: 1.45;
        }

        .batch-date-strip {
          display: grid;
          grid-template-columns: 1fr 1px 1fr;
          width: 100%;
        }

        .date-box {
          min-width: 0;
          padding: 11px;
        }

        .date-box strong {
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .stats-grid {
          grid-template-columns: 1fr;
          gap: 8px;
          padding: 0 12px 12px;
        }

        .stat-card {
          min-height: 88px;
          padding: 14px;
        }

        .stat-card strong {
          font-size: 24px;
        }

        .form-grid {
          grid-template-columns: 1fr;
          gap: 11px;
          padding: 15px;
        }

        .form-grid .field.wide {
          grid-column: auto;
        }

        .field input {
          min-width: 0;
          width: 100%;
        }

        .formula {
          margin: 0 15px 15px;
          padding: 12px;
          gap: 5px;
        }

        .formula strong {
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .form-actions {
          padding: 0 15px 15px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .form-actions button {
          width: 100%;
        }

        .students-heading {
          gap: 12px;
        }

        .student-toolbar {
          padding: 12px;
          align-items: stretch;
        }

        .filter-heading {
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-heading strong {
          margin-left: auto;
        }

        .filter-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }

        .filter {
          width: 100%;
          min-width: 0;
          min-height: 40px;
          padding: 7px 8px;
          justify-content: space-between;
          font-size: 11px;
        }

        .filter span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .clear-filters {
          width: 100%;
          min-height: 38px;
          justify-content: center;
        }

        .students-table-wrap {
          margin: 0;
        }

        .students-table {
          min-width: 760px;
        }

        .students-table th {
          padding: 10px 11px;
          font-size: 10px;
        }

        .students-table td {
          padding: 11px;
          font-size: 12px;
        }

        .student-avatar {
          width: 32px;
          height: 32px;
          flex-basis: 32px;
        }

        .student-name-cell {
          min-width: 165px;
        }

        .student-detail-header {
          padding: 14px;
        }

        .student-detail-grid > div {
          min-height: 62px;
          padding: 11px 14px;
        }

        .payment-history {
          padding: 4px 14px;
        }

        .payment-history-row {
          align-items: flex-start;
          flex-direction: column;
          gap: 7px;
          padding: 11px 0;
        }

        .payment-history-row > div:last-child {
          width: 100%;
          text-align: left;
        }

        .students-loading,
        .students-empty {
          min-height: 160px;
          padding: 20px 14px;
        }
      }

      /* Small phones */
      @media (max-width: 380px) {
        .page-shell {
          padding-left: 9px;
          padding-right: 9px;
        }

        .top-actions {
          grid-template-columns: 1fr;
        }

        .top-actions .status-pill {
          grid-column: auto;
        }

        .form-actions {
          grid-template-columns: 1fr;
        }

        .filter-row {
          grid-template-columns: 1fr;
        }

        .filter {
          justify-content: space-between;
        }

        .batch-date-strip {
          grid-template-columns: 1fr;
        }

        .date-divider {
          display: none;
        }

        .date-box + .date-divider + .date-box {
          border-top: 1px solid #202023;
        }

        .student-detail-grid {
          grid-template-columns: 1fr;
        }

        .student-detail-grid > div {
          border-right: 0 !important;
          border-bottom: 1px solid #1c1c1f !important;
        }

        .student-detail-grid > div:last-child {
          border-bottom: 0 !important;
        }
      }

      /* Landscape / short viewport phones */
      @media (max-height: 620px) and (max-width: 900px) {
        .page-shell {
          padding-top: 10px;
          padding-bottom: 22px;
        }

        .topbar {
          padding-bottom: 10px;
        }

        .students-empty,
        .students-loading {
          min-height: 120px;
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

    `}</style>
  );
}
