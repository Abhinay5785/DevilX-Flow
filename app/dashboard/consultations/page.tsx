"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";


/* =========================================================
   TYPES
========================================================= */

type ConsultationStatus =
  | "Pending"
  | "Scheduled"
  | "In Progress"
  | "Completed"
  | "Cancelled"
  | "No Show";

type TableMode = "upcoming" | "payments";

type Consultation = {
  id: string;

  /* CUSTOMER */
  customerId: string;
  studentName: string;
  email: string;
  phone: string;

  /* PAYMENT */
  // Exact payments.id row. This is the payment identity sent to the server.
  paymentRecordId: string;
  paymentId: string;
  paymentAmount: number;
  paymentStatus: "Paid" | "Pending" | "Failed";
  paymentTime: string;

  /* CONSULTATION BOOKING */
  bookingDate: string;
  bookingTime: string;
  status: ConsultationStatus;

  /* GOOGLE */
  meetLink: string;
  recordingLink: string | null;

  /* DEVILX */
  notes: string;
  followUpRequired: boolean;
  followUpDate: string | null;

  completedAt: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(date: string) {
  if (!date) return "—";

  return new Date(`${date}T00:00:00`).toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(date: string) {
  if (!date) return "—";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Any Consultation payment made before 10 Sep 2026 is treated as completed.
const AUTO_COMPLETE_BEFORE_DATE = "2026-09-10";
const AUTO_COMPLETE_PAYMENT_CUTOFF = new Date("2026-09-10T00:00:00+05:30").getTime();

function getBookingTimestamp(date: string, time: string) {
  if (!date) return null;

  const rawTime = String(time || "").trim();
  let hour = 0;
  let minute = 0;

  const match12 = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const match24 = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (match12) {
    hour = Number(match12[1]);
    minute = Number(match12[2]);
    const period = match12[3].toUpperCase();

    if (hour === 12) hour = 0;
    if (period === "PM") hour += 12;
  } else if (match24) {
    hour = Number(match24[1]);
    minute = Number(match24[2]);
  }

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const timestamp = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`
  ).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusClass(status: ConsultationStatus) {
  switch (status) {
    case "Completed":
      return "status completed";

    case "Scheduled":
      return "status scheduled";

    case "In Progress":
      return "status progress";

    case "Pending":
      return "status pending";

    case "Cancelled":
      return "status cancelled";

    case "No Show":
      return "status noshow";

    default:
      return "status";
  }
}

/* =========================================================
   FOLLOW-UP HELPERS
========================================================= */

function getISTDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function addDaysToDateString(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatFollowUpDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function followUpBucket(dateString: string | null, today: string) {
  if (!dateString) return "none";
  if (dateString < today) return "overdue";
  if (dateString === today) return "today";
  if (dateString === addDaysToDateString(today, 1)) return "tomorrow";
  return "upcoming";
}

/* =========================================================
   PAGE
========================================================= */

export default function ConsultationsPage() {
  const supabase = createClient();

  const [consultations, setConsultations] =
    useState<Consultation[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [showFollowUps, setShowFollowUps] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [dateFilter, setDateFilter] =
    useState("All");

  const [tableMode, setTableMode] =
    useState<TableMode>(() => {
      if (typeof window === "undefined") return "payments";

      return new URLSearchParams(window.location.search).get("view") ===
        "upcoming"
        ? "upcoming"
        : "payments";
    });

  const [view, setView] =
    useState<"list" | "calendar">("list");

  const [page, setPage] = useState(1);

  const [notesSaved, setNotesSaved] =
    useState(false);

  const [showManualComplete, setShowManualComplete] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [showCancelConsultation, setShowCancelConsultation] = useState(false);
  const [cancellationNote, setCancellationNote] = useState("");

  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] =
    useState(false);

  // Keep the Upcoming Slots view live as time passes.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const perPage = 15;

  // Dashboard links open this page with ?view=upcoming.
  // Read the query string in an effect instead of useSearchParams(), so
  // Next.js can prerender this client page without requiring Suspense.
  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get(
      "view",
    );

    if (requestedView === "upcoming") {
      setTableMode("upcoming");
      setDateFilter("All");
      setStatusFilter("All");
      setSearch("");
      setPage(1);
    } else if (!requestedView) {
      setTableMode("payments");
    }
  }, []);

  /* =======================================================
     LIVE SUPABASE DATA
  ======================================================= */

  useEffect(() => {
    let cancelled = false;

    async function loadConsultations() {
      setLoading(true);
      setLoadError("");

      /*
       * The page is payment-led:
       * - A captured Consultation payment creates the person in this list.
       * - If a matching consultation booking exists, show its slot and Scheduled status.
       * - If no booking exists yet, keep the person visible with Pending booking/status.
       */
      const [paymentsResult, customersResult, consultationsResult] = await Promise.all([
        supabase
          .from("payments")
          .select("id,payment_id,customer_id,amount,status,payment_time,payment_type,method,course,batch")
          .eq("status", "captured")
          .ilike("course", "Consultation")
          .order("payment_time", { ascending: false }),
        supabase
          .from("customers")
          .select("id,name,email,phone"),
        supabase
          .from("consultations")
          .select("*")
          .order("booking_date", { ascending: true })
          .order("booking_time", { ascending: true }),
      ]);

      if (cancelled) return;

      if (paymentsResult.error) {
        console.error("Failed to load consultation payments:", paymentsResult.error);
        setLoadError(paymentsResult.error.message);
        setConsultations([]);
        setLoading(false);
        return;
      }

      if (customersResult.error) {
        console.error("Failed to load customers:", customersResult.error);
        setLoadError(customersResult.error.message);
        setConsultations([]);
        setLoading(false);
        return;
      }

      if (consultationsResult.error) {
        console.error("Failed to load consultation bookings:", consultationsResult.error);
        setLoadError(consultationsResult.error.message);
        setConsultations([]);
        setLoading(false);
        return;
      }

      const customerMap = new Map<string, any>(
        (customersResult.data || []).map((customer: any) => [String(customer.id), customer])
      );

      const bookingRows = consultationsResult.data || [];

      /*
       * IMPORTANT:
       * A customer can have MULTIPLE consultations.
       * Therefore a consultation must NEVER be selected by customer_id alone.
       *
       * Every captured Consultation payment is treated as its own consultation
       * slot. The only safe automatic relationship is:
       *
       *     payments.payment_id  ->  consultations.payment_id
       *
       * We intentionally do NOT keep a bookingByCustomerId fallback because
       * that would make two different payments for the same person point to
       * the same consultation record.
       */
      const bookingByPaymentId = new Map<string, any>();

      bookingRows.forEach((row: any) => {
        const paymentId = String(row.payment_id || "").trim();

        if (paymentId) {
          bookingByPaymentId.set(paymentId, row);
        }
      });

      const rows = (paymentsResult.data || []).map((payment: any, index: number): Consultation => {
        const paymentId = String(payment.payment_id || payment.id || "");
        const customerId = String(payment.customer_id || "");
        const customer = customerMap.get(customerId) || {};

        // IMPORTANT: match the consultation ONLY to this payment.
        // Never fall back to customer_id because one person can purchase
        // multiple consultations and each payment must represent a separate
        // consultation slot.
        const booking = bookingByPaymentId.get(paymentId);
        const hasBooking = Boolean(booking);

        const rawBookingStatus = String(booking?.status || "");
        const validBookingStatus = [
          "Scheduled",
          "In Progress",
          "Completed",
          "Cancelled",
          "No Show",
        ].includes(rawBookingStatus)
          ? rawBookingStatus
          : "Scheduled";

        const bookingDate = hasBooking
          ? String(booking?.booking_date || "")
          : "";

        const paymentTimestamp = payment.payment_time
          ? new Date(String(payment.payment_time)).getTime()
          : null;

        const shouldAutoComplete =
          paymentTimestamp !== null &&
          Number.isFinite(paymentTimestamp) &&
          paymentTimestamp < AUTO_COMPLETE_PAYMENT_CUTOFF;

        return {
          // Keep every payment as a distinct UI row. A booking ID is used when
          // the payment already has a consultation record; otherwise the
          // payment's own database ID identifies this payment-only row.
          id: String(booking?.id || payment.id || `${paymentId}-${index}`),
          paymentRecordId: String(payment.id || ""),
          customerId,
          studentName: String(
            booking?.student_name || customer.name || "Unknown student"
          ),
          email: String(booking?.email || customer.email || ""),
          phone: String(booking?.phone || customer.phone || ""),
          paymentId,
          paymentAmount: Number(payment.amount || booking?.payment_amount || 0),
          paymentStatus: "Paid",
          paymentTime: String(payment.payment_time || booking?.payment_time || ""),
          bookingDate,
          bookingTime: hasBooking ? String(booking?.booking_time || "") : "",
          status: shouldAutoComplete
            ? "Completed"
            : hasBooking
              ? (booking?.recording_link ? "Completed" : validBookingStatus) as ConsultationStatus
              : "Pending",
          meetLink: String(booking?.meet_link || ""),
          recordingLink: booking?.recording_link ? String(booking.recording_link) : null,
          notes: String(booking?.notes || ""),
          followUpRequired: Boolean(booking?.follow_up_required),
          followUpDate: booking?.follow_up_date ? String(booking.follow_up_date) : null,
          completedAt: booking?.completed_at ? String(booking.completed_at) : null,
        };
      });

      // Keep the raw data stable here. The visible table has its own
      // sorting mode so Upcoming Slots can be chronological while
      // Latest Payments can remain payment-time driven.
      rows.sort((a, b) => {
        const aPayment = a.paymentTime
          ? new Date(a.paymentTime).getTime()
          : 0;
        const bPayment = b.paymentTime
          ? new Date(b.paymentTime).getTime()
          : 0;

        return bPayment - aPayment;
      });

      setConsultations(rows);
      // IMPORTANT: do not auto-select a user. Details appear only after clicking a row.
      setSelectedId((current) => current && rows.some((item) => item.id === current) ? current : null);

      /*
       * IMPORTANT:
       * Only update REAL consultation row IDs here.
       *
       * A payment-only row uses payment.id as its UI fallback ID when
       * no consultation booking exists. That is NOT a consultations.id.
       * Updating it could silently affect nothing and make the UI look
       * completed until the next refresh.
       *
       * Also never downgrade a manually selected terminal status such as
       * Completed, Cancelled or No Show.
       */
      const bookingRowsById = new Map(
        bookingRows.map((row: any) => [String(row.id), row])
      );

      const idsToComplete = Array.from(
        new Set(
          rows
            .filter((item) => {
              const originalRow = bookingRowsById.get(String(item.id));

              if (!originalRow) return false;

              const originalStatus = String(originalRow.status || "");

              if (
                originalStatus === "Completed" ||
                originalStatus === "Cancelled" ||
                originalStatus === "No Show"
              ) {
                return false;
              }

              const paymentTimestamp = item.paymentTime
                ? new Date(item.paymentTime).getTime()
                : null;

              const historicalPayment =
                paymentTimestamp !== null &&
                Number.isFinite(paymentTimestamp) &&
                paymentTimestamp < AUTO_COMPLETE_PAYMENT_CUTOFF;

              const recordedCompleted =
                Boolean(item.recordingLink) &&
                item.status === "Completed";

              return historicalPayment || recordedCompleted;
            })
            .map((item) => String(item.id))
            .filter(Boolean)
        )
      );

      if (idsToComplete.length > 0) {
        const completedAt = new Date().toISOString();

        const { error: completionSyncError } = await supabase
          .from("consultations")
          .update({
            status: "Completed",
            completed_at: completedAt,
          })
          .in("id", idsToComplete)
          .select("id");

        if (completionSyncError) {
          console.error(
            "Failed to sync historical consultations as completed:",
            completionSyncError
          );
        }
      }

      setLoading(false);
    }

    loadConsultations();

    const channel = supabase
      .channel("consultations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "consultations" }, () => loadConsultations())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  /* =======================================================
     SELECTED
  ======================================================= */

  const selectedConsultation =
    consultations.find(
      (item) => item.id === selectedId
    );

  /* =======================================================
     TODAY
  ======================================================= */

  const todayString = getISTDateString();

  /* =======================================================
     FILTER
  ======================================================= */

  const filteredConsultations =
    useMemo(() => {
      const rows = consultations.filter((consultation) => {
        const searchValue = search.toLowerCase().trim();

        const matchesSearch =
          !searchValue ||
          consultation.studentName.toLowerCase().includes(searchValue) ||
          consultation.email.toLowerCase().includes(searchValue) ||
          consultation.phone.toLowerCase().includes(searchValue) ||
          consultation.paymentId.toLowerCase().includes(searchValue);

        const matchesStatus =
          statusFilter === "All" ||
          consultation.status === statusFilter;

        const bookingTimestamp = getBookingTimestamp(
          consultation.bookingDate,
          consultation.bookingTime
        );

        let matchesDate = true;

        // Upcoming Slots = ONLY real future appointment date + time.
        if (tableMode === "upcoming") {
          matchesDate =
            bookingTimestamp !== null &&
            bookingTimestamp > nowMs &&
            consultation.status !== "Completed" &&
            consultation.status !== "Cancelled" &&
            consultation.status !== "No Show";

          // Allow Today to narrow Upcoming Slots to today's remaining slots.
          if (matchesDate && dateFilter === "Today") {
            matchesDate = consultation.bookingDate === todayString;
          }

          // Past cannot logically be part of Upcoming Slots.
          if (dateFilter === "Past") {
            matchesDate = false;
          }
        } else if (tableMode === "payments") {
          // Latest Payments is based only on payment_time.
          matchesDate = true;
        } else {
          if (dateFilter === "Today") {
            matchesDate = consultation.bookingDate === todayString;
          }

          if (dateFilter === "Upcoming") {
            matchesDate =
              bookingTimestamp !== null &&
              bookingTimestamp > nowMs &&
              consultation.status !== "Completed" &&
              consultation.status !== "Cancelled" &&
              consultation.status !== "No Show";
          }

          if (dateFilter === "Past") {
            matchesDate =
              bookingTimestamp !== null &&
              bookingTimestamp <= nowMs;
          }
        }

        return matchesSearch && matchesStatus && matchesDate;
      });

      rows.sort((a, b) => {
        if (tableMode === "upcoming") {
          const aTime = getBookingTimestamp(a.bookingDate, a.bookingTime);
          const bTime = getBookingTimestamp(b.bookingDate, b.bookingTime);

          // Earliest future slot FIRST.
          if (aTime === null && bTime === null) return 0;
          if (aTime === null) return 1;
          if (bTime === null) return -1;
          return aTime - bTime;
        }

        if (tableMode === "payments") {
          const aTime = a.paymentTime ? new Date(a.paymentTime).getTime() : 0;
          const bTime = b.paymentTime ? new Date(b.paymentTime).getTime() : 0;
          // Latest payment FIRST.
          return bTime - aTime;
        }

        const aPayment = a.paymentTime ? new Date(a.paymentTime).getTime() : 0;
        const bPayment = b.paymentTime ? new Date(b.paymentTime).getTime() : 0;
        return bPayment - aPayment;
      });

      return rows;
    }, [
      consultations,
      search,
      statusFilter,
      dateFilter,
      tableMode,
      todayString,
      nowMs,
    ]);

  /* =======================================================
     PAGINATION
  ======================================================= */

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredConsultations.length /
        perPage
    )
  );

  const safePage = Math.min(
    page,
    totalPages
  );

  const paginatedConsultations =
    filteredConsultations.slice(
      (safePage - 1) * perPage,
      safePage * perPage
    );

  /* =======================================================
     STATS
  ======================================================= */

  const todayCount =
    consultations.filter(
      (item) =>
        item.bookingDate === todayString
    ).length;

  const upcomingCount =
    consultations.filter((item) => {
      const bookingTimestamp = getBookingTimestamp(
        item.bookingDate,
        item.bookingTime
      );

      return (
        bookingTimestamp !== null &&
        bookingTimestamp > nowMs &&
        item.status !== "Completed" &&
        item.status !== "Cancelled" &&
        item.status !== "No Show"
      );
    }).length;

  const pendingCount =
    consultations.filter(
      (item) =>
        item.status === "Pending"
    ).length;

  const completedCount =
    consultations.filter(
      (item) =>
        item.status === "Completed"
    ).length;

  // Latest captured consultation payment, ordered strictly by payment_time.
  // This is separate from the Upcoming Slots ordering.
  const latestPayment = useMemo(() => {
    return consultations.reduce<Consultation | null>((latest, current) => {
      if (!current.paymentTime) return latest;

      if (!latest || !latest.paymentTime) return current;

      const currentTime = new Date(current.paymentTime).getTime();
      const latestTime = new Date(latest.paymentTime).getTime();

      if (!Number.isFinite(currentTime)) return latest;
      if (!Number.isFinite(latestTime)) return current;

      return currentTime > latestTime ? current : latest;
    }, null);
  }, [consultations]);

  const followUps = consultations.filter(
    (item) => item.followUpRequired && item.followUpDate
  );

  const overdueFollowUps = followUps.filter(
    (item) => (item.followUpDate as string) < todayString
  );

  const todayFollowUps = followUps.filter(
    (item) => item.followUpDate === todayString
  );

  const tomorrowFollowUps = followUps.filter(
    (item) => item.followUpDate === addDaysToDateString(todayString, 1)
  );

  const upcomingFollowUps = followUps.filter(
    (item) => (item.followUpDate as string) > addDaysToDateString(todayString, 1)
  );

  const dueFollowUpCount = overdueFollowUps.length + todayFollowUps.length;

  /* =======================================================
     NOTES
  ======================================================= */

  function updateNotes(value: string) {
    if (!selectedConsultation) return;

    setNotesSaved(false);
    setConsultations((current) => current.map((consultation) => consultation.id === selectedConsultation.id ? { ...consultation, notes: value } : consultation));
  }

  async function saveNotes() {
    if (!selectedConsultation) return;

    const { error } = await supabase
      .from("consultations")
      .update({ notes: selectedConsultation.notes })
      .eq("id", selectedConsultation.id);

    if (error) {
      console.error("Failed to save consultation notes:", error);
      alert(`Could not save notes: ${error.message}`);
      return;
    }

    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  /* =======================================================
     FOLLOW-UP
  ======================================================= */

  async function toggleFollowUp() {
    if (!selectedConsultation) return;

    const enabled = !selectedConsultation.followUpRequired;
    const nextDate = enabled ? selectedConsultation.followUpDate || todayString : null;

    setConsultations((current) => current.map((consultation) => consultation.id === selectedConsultation.id ? { ...consultation, followUpRequired: enabled, followUpDate: nextDate } : consultation));

    const { error } = await supabase
      .from("consultations")
      .update({ follow_up_required: enabled, follow_up_date: nextDate })
      .eq("id", selectedConsultation.id);

    if (error) {
      console.error("Failed to save follow-up:", error);
      alert(`Could not save follow-up: ${error.message}`);
    }
  }

  async function updateFollowUpDate(value: string) {
    if (!selectedConsultation) return;

    setConsultations((current) => current.map((consultation) => consultation.id === selectedConsultation.id ? { ...consultation, followUpDate: value || null } : consultation));

    const { error } = await supabase
      .from("consultations")
      .update({ follow_up_date: value || null })
      .eq("id", selectedConsultation.id);

    if (error) {
      console.error("Failed to save follow-up date:", error);
      alert(`Could not save follow-up date: ${error.message}`);
    }
  }

  /* =======================================================
     BROWSER NOTIFICATIONS
  ======================================================= */

  async function enableBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Browser notifications are not supported in this browser.");
      return;
    }

    const permission = await Notification.requestPermission();
    setBrowserNotificationsEnabled(permission === "granted");

    if (permission === "granted") {
      new Notification("DevilX Follow-ups enabled", {
        body: "DevilX will alert you when follow-ups are due while this dashboard is open.",
      });
    }
  }

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    setBrowserNotificationsEnabled(Notification.permission === "granted");

    if (Notification.permission !== "granted" || dueFollowUpCount === 0) return;

    const notificationKey = `devilx_followup_notice_${todayString}_${dueFollowUpCount}`;
    if (window.sessionStorage.getItem(notificationKey)) return;

    const body = overdueFollowUps.length > 0
      ? `${overdueFollowUps.length} overdue and ${todayFollowUps.length} due today.`
      : `${todayFollowUps.length} follow-up${todayFollowUps.length === 1 ? "" : "s"} due today.`;

    new Notification("DevilX Follow-up Reminder", { body });
    window.sessionStorage.setItem(notificationKey, "shown");
  }, [todayString, dueFollowUpCount, overdueFollowUps.length, todayFollowUps.length]);

  /* =======================================================
     COMPLETE
  ======================================================= */

  function openManualComplete() {
    if (!selectedConsultation) return;

    // Default to today and the current IST time, but let the user change it.
    const now = new Date();
    const istParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const year = istParts.find((part) => part.type === "year")?.value || "";
    const month = istParts.find((part) => part.type === "month")?.value || "";
    const day = istParts.find((part) => part.type === "day")?.value || "";

    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const hour = timeParts.find((part) => part.type === "hour")?.value || "12";
    const minute = timeParts.find((part) => part.type === "minute")?.value || "00";

    setManualDate(selectedConsultation.bookingDate || `${year}-${month}-${day}`);
    setManualTime(
      selectedConsultation.bookingTime
        ? (() => {
            const match12 = selectedConsultation.bookingTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (match12) {
              let h = Number(match12[1]);
              const period = match12[3].toUpperCase();
              if (period === "AM" && h === 12) h = 0;
              if (period === "PM" && h !== 12) h += 12;
              return `${String(h).padStart(2, "0")}:${match12[2]}`;
            }
            return selectedConsultation.bookingTime.slice(0, 5);
          })()
        : `${hour}:${minute}`
    );
    setShowManualComplete(true);
  }

  async function saveManualConsultation(markCompleted: boolean) {
    if (!selectedConsultation) return;

    if (!selectedConsultation.paymentRecordId) {
      alert("This consultation does not have a valid payment record.");
      return;
    }

    if (!selectedConsultation.paymentId) {
      alert("This payment does not have a payment ID and cannot be linked to a consultation.");
      return;
    }

    if (!manualDate || !manualTime) {
      alert("Please select the consultation date and time.");
      return;
    }

    const bookingTimestamp = getBookingTimestamp(
      manualDate,
      manualTime
    );

    if (bookingTimestamp === null) {
      alert("Please enter a valid consultation date and time.");
      return;
    }

    setManualSaving(true);

    try {
      /*
       * Manual completion is intentionally handled by the server.
       *
       * The browser sends the exact payments.id and payment_id.
       * The server then:
       * 1. Finds that exact payment.
       * 2. Gets its customer.
       * 3. Finds consultation by payment_id ONLY.
       * 4. Updates or creates the consultation.
       * 5. Uses the service-role client, so no broad RLS policy is needed.
       */
      const response = await fetch(
        "/api/consultations/manual-complete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentRecordId:
              selectedConsultation.paymentRecordId,
            paymentId:
              selectedConsultation.paymentId,
            bookingDate: manualDate,
            bookingTime: manualTime,
            markCompleted,
          }),
        }
      );

      const rawResponse = await response.text();
      let result: any = null;

      try {
        result = rawResponse ? JSON.parse(rawResponse) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        console.error(
          "Manual consultation API failed:",
          {
            status: response.status,
            statusText: response.statusText,
            result,
            rawResponse,
          }
        );

        const serverMessage =
          result?.error ||
          result?.details ||
          rawResponse ||
          `Server returned HTTP ${response.status}.`;

        alert(
          `Could not save consultation: ${serverMessage}`
        );
        return;
      }

      if (!result?.ok || !result?.consultation?.id) {
        console.error(
          "Manual consultation API returned an unexpected response:",
          {
            result,
            rawResponse,
          }
        );

        alert(
          result?.error ||
            "The server did not return the saved consultation."
        );
        return;
      }

      const savedConsultation = result.consultation;
      const savedId = String(savedConsultation.id);
      const savedStatus = String(
        savedConsultation.status ||
          (markCompleted ? "Completed" : "Scheduled")
      ) as ConsultationStatus;
      const completedAt = markCompleted
        ? String(
            savedConsultation.completed_at ||
              new Date().toISOString()
          )
        : null;

      /*
       * Replace the payment-only UI row with the real consultation row.
       * The database is already updated by the server, so refreshes will
       * continue to show Completed.
       */
      setConsultations((current) =>
        current.map((consultation) =>
          consultation.paymentRecordId ===
            selectedConsultation.paymentRecordId
            ? {
                ...consultation,
                id: savedId,
                customerId: String(
                  savedConsultation.customer_id ||
                    consultation.customerId
                ),
                studentName: String(
                  savedConsultation.student_name ||
                    consultation.studentName
                ),
                email: String(
                  savedConsultation.email ||
                    consultation.email
                ),
                phone: String(
                  savedConsultation.phone ||
                    consultation.phone
                ),
                paymentRecordId: String(
                  savedConsultation.payment_record_id ||
                    consultation.paymentRecordId
                ),
                paymentId: String(
                  savedConsultation.payment_id ||
                    consultation.paymentId
                ),
                paymentAmount: Number(
                  savedConsultation.payment_amount ??
                    consultation.paymentAmount
                ),
                paymentStatus:
                  String(
                    savedConsultation.payment_status ||
                      consultation.paymentStatus
                  ) as Consultation["paymentStatus"],
                paymentTime: String(
                  savedConsultation.payment_time ||
                    consultation.paymentTime
                ),
                bookingDate: String(
                  savedConsultation.booking_date ||
                    manualDate
                ),
                bookingTime: String(
                  savedConsultation.booking_time ||
                    manualTime
                ),
                status: savedStatus,
                completedAt,
                meetLink: String(
                  savedConsultation.meet_link || ""
                ),
                recordingLink:
                  savedConsultation.recording_link
                    ? String(
                        savedConsultation.recording_link
                      )
                    : null,
                notes: String(
                  savedConsultation.notes || ""
                ),
                followUpRequired: Boolean(
                  savedConsultation.follow_up_required
                ),
                followUpDate:
                  savedConsultation.follow_up_date
                    ? String(
                        savedConsultation.follow_up_date
                      )
                    : null,
              }
            : consultation
        )
      );

      setSelectedId(savedId);
      setShowManualComplete(false);

      alert(
        markCompleted
          ? result.created
            ? "Consultation created and marked as completed successfully."
            : "Consultation updated and marked as completed successfully."
          : result.created
            ? "Consultation slot saved successfully. It is still scheduled."
            : "Consultation slot updated successfully. It is still scheduled."
      );
    } catch (error) {
      console.error(
        "Manual consultation request failed:",
        error
      );

      alert(
        `Could not save consultation: ${
          error instanceof Error
            ? error.message
            : "Network error. Please try again."
        }`
      );
    } finally {
      setManualSaving(false);
    }
  }

  function openCancelConsultation() {
    if (!selectedConsultation) return;

    if (!selectedConsultation.id) {
      alert("This payment does not have a consultation slot to cancel yet.");
      return;
    }

    if (selectedConsultation.status === "Completed") {
      alert("A completed consultation cannot be cancelled. Use the notes if you need to record a post-consultation issue.");
      return;
    }

    if (selectedConsultation.status === "Cancelled") {
      return;
    }

    setCancellationNote("");
    setShowCancelConsultation(true);
  }

  async function cancelConsultation() {
    if (!selectedConsultation) return;

    const note = cancellationNote.trim();

    if (!note) {
      alert("Please enter a cancellation note/reason.");
      return;
    }

    if (!selectedConsultation.paymentRecordId || !selectedConsultation.paymentId) {
      alert("This consultation does not have valid payment details.");
      return;
    }

    if (!selectedConsultation.id) {
      alert("This payment does not have a consultation slot to cancel.");
      return;
    }

    setManualSaving(true);

    try {
      const response = await fetch("/api/consultations/manual-complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actionType: "cancel",
          consultationId: selectedConsultation.id,
          paymentRecordId: selectedConsultation.paymentRecordId,
          paymentId: selectedConsultation.paymentId,
          cancellationNote: note,
        }),
      });

      const rawResponse = await response.text();
      let result: any = null;

      try {
        result = rawResponse ? JSON.parse(rawResponse) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        console.error("Consultation cancellation failed:", {
          status: response.status,
          statusText: response.statusText,
          result,
          rawResponse,
        });

        alert(
          `Could not cancel consultation: ${
            result?.error ||
            result?.details ||
            rawResponse ||
            `Server returned HTTP ${response.status}.`
          }`
        );
        return;
      }

      if (!result?.ok || !result?.consultation?.id) {
        console.error("Cancellation API returned an unexpected response:", {
          result,
          rawResponse,
        });

        alert(result?.error || "The server did not return the cancelled consultation.");
        return;
      }

      const cancelledConsultation = result.consultation;
      const cancelledId = String(cancelledConsultation.id);

      setConsultations((current) =>
        current.map((consultation) =>
          consultation.paymentRecordId === selectedConsultation.paymentRecordId
            ? {
                ...consultation,
                id: cancelledId,
                bookingDate: String(
                  cancelledConsultation.booking_date || consultation.bookingDate
                ),
                bookingTime: String(
                  cancelledConsultation.booking_time || consultation.bookingTime
                ),
                status: "Cancelled",
                completedAt: null,
                notes: String(cancelledConsultation.notes || ""),
                followUpRequired: Boolean(cancelledConsultation.follow_up_required),
                followUpDate: cancelledConsultation.follow_up_date
                  ? String(cancelledConsultation.follow_up_date)
                  : null,
              }
            : consultation
        )
      );

      setSelectedId(cancelledId);
      setShowCancelConsultation(false);
      setCancellationNote("");

      alert("Consultation cancelled successfully.");
    } catch (error) {
      console.error("Consultation cancellation request failed:", error);
      alert(
        `Could not cancel consultation: ${
          error instanceof Error ? error.message : "Network error. Please try again."
        }`
      );
    } finally {
      setManualSaving(false);
    }
  }

  async function completeConsultation() {
    if (!selectedConsultation) return;
    if (selectedConsultation.status === "Completed") return;

    /*
     * If this payment has no consultation yet, the user must choose
     * the actual consultation date/time before the server creates it.
     */
    const { data: existingByPayment, error } = await supabase
      .from("consultations")
      .select("id,status,booking_date,booking_time")
      .eq("payment_id", selectedConsultation.paymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to check consultation:", error);
      alert(`Could not check consultation: ${error.message}`);
      return;
    }

    if (!existingByPayment?.id) {
      openManualComplete();
      return;
    }

    /*
     * Even when a consultation already exists, use the same server action.
     * This avoids direct client-side UPDATE calls and keeps all completion
     * logic in one protected server path.
     */
    const confirmed = window.confirm(
      `Mark ${selectedConsultation.studentName}'s consultation as completed?`
    );

    if (!confirmed) return;

    const existingDate = String(
      existingByPayment.booking_date ||
        selectedConsultation.bookingDate ||
        ""
    );

    const existingTime = String(
      existingByPayment.booking_time ||
        selectedConsultation.bookingTime ||
        ""
    );

    if (!existingDate || !existingTime) {
      openManualComplete();
      return;
    }

    setManualDate(existingDate);
    setManualTime(
      (() => {
        const match12 = existingTime.match(
          /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
        );

        if (match12) {
          let hour = Number(match12[1]);
          const period = match12[3].toUpperCase();

          if (period === "AM" && hour === 12) hour = 0;
          if (period === "PM" && hour !== 12) hour += 12;

          return `${String(hour).padStart(2, "0")}:${match12[2]}`;
        }

        return existingTime.slice(0, 5);
      })()
    );

    /*
     * Reuse the same server-side completion function. We temporarily set
     * the manual slot state, then call the exact same protected API path.
     */
    setManualSaving(true);

    try {
      const response = await fetch(
        "/api/consultations/manual-complete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentRecordId:
              selectedConsultation.paymentRecordId,
            paymentId:
              selectedConsultation.paymentId,
            bookingDate: existingDate,
            bookingTime: existingTime,
          }),
        }
      );

      const rawResponse = await response.text();
      let result: any = null;

      try {
        result = rawResponse ? JSON.parse(rawResponse) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        console.error(
          "Complete consultation API failed:",
          {
            status: response.status,
            statusText: response.statusText,
            result,
            rawResponse,
          }
        );

        alert(
          `Could not update consultation: ${
            result?.error ||
            result?.details ||
            rawResponse ||
            `Server returned HTTP ${response.status}.`
          }`
        );
        return;
      }

      if (!result?.ok || !result?.consultation?.id) {
        alert(
          result?.error ||
            "The server did not return the completed consultation."
        );
        return;
      }

      const updatedConsultation = result.consultation;
      const savedId = String(updatedConsultation.id);

      setConsultations((current) =>
        current.map((consultation) =>
          consultation.paymentRecordId ===
            selectedConsultation.paymentRecordId
            ? {
                ...consultation,
                id: savedId,
                customerId: String(
                  updatedConsultation.customer_id ||
                    consultation.customerId
                ),
                studentName: String(
                  updatedConsultation.student_name ||
                    consultation.studentName
                ),
                email: String(
                  updatedConsultation.email ||
                    consultation.email
                ),
                phone: String(
                  updatedConsultation.phone ||
                    consultation.phone
                ),
                paymentRecordId: String(
                  updatedConsultation.payment_record_id ||
                    consultation.paymentRecordId
                ),
                paymentId: String(
                  updatedConsultation.payment_id ||
                    consultation.paymentId
                ),
                bookingDate: String(
                  updatedConsultation.booking_date ||
                    consultation.bookingDate
                ),
                bookingTime: String(
                  updatedConsultation.booking_time ||
                    consultation.bookingTime
                ),
                status: "Completed",
                completedAt: String(
                  updatedConsultation.completed_at ||
                    new Date().toISOString()
                ),
                recordingLink:
                  updatedConsultation.recording_link
                    ? String(
                        updatedConsultation.recording_link
                      )
                    : consultation.recordingLink,
                meetLink: String(
                  updatedConsultation.meet_link ||
                    consultation.meetLink
                ),
              }
            : consultation
        )
      );

      setSelectedId(savedId);
    } catch (error) {
      console.error(
        "Complete consultation request failed:",
        error
      );

      alert(
        `Could not update consultation: ${
          error instanceof Error
            ? error.message
            : "Network error. Please try again."
        }`
      );
    } finally {
      setManualSaving(false);
    }
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="consultation-page">

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .consultation-page {
          min-height: 100vh;
          background: #000000;
          color: #ffffff;
          padding: 28px;
          font-family: Arial, Helvetica, sans-serif;
        }

        .container {
          max-width: 1800px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 25px;
        }

        .header-title h1 {
          margin: 0;
          color: #ffffff;
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.7px;
        }

        .header-title p {
          margin: 6px 0 0;
          color: #7f8792;
          font-size: 13px;
        }

        .dashboard-back-button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 36px;
          padding: 0 12px;
          margin-bottom: 10px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 8px;
          background: #111317;
          color: #aeb5be;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
          transition: 0.15s ease;
        }

        .dashboard-back-button:hover {
          background: rgba(255, 23, 68, 0.08);
          border-color: rgba(255, 23, 68, 0.35);
          color: #ffffff;
        }

        .primary-button {
          height: 40px;
          padding: 0 15px;
          border: 1px solid rgba(255, 23, 68, 0.35);
          border-radius: 9px;
          background: #ff1744;
          color: white;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(255, 23, 68, 0.12);
          transition: .2s ease;
        }

        .primary-button:hover {
          background: #ff3158;
          transform: translateY(-1px);
          box-shadow: 0 10px 30px rgba(255, 23, 68, 0.22);
        }

        .stat-subtext {
          margin-top: 6px;
          color: #777f8b;
          font-size: 10px;
        }

        .follow-up-center {
          margin: 0 0 15px;
          background: #0b0c0e;
          border: 1px solid rgba(255, 23, 68, .22);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 18px 55px rgba(0, 0, 0, .3);
        }

        .follow-up-center-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, .07);
        }

        .follow-up-center-title {
          font-size: 14px;
          font-weight: 700;
        }

        .follow-up-center-subtitle {
          margin-top: 4px;
          color: #777f8b;
          font-size: 10px;
        }

        .follow-up-center-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .notification-button {
          height: 32px;
          border: 1px solid rgba(255, 255, 255, .1);
          background: #111317;
          color: #dfe3e8;
          border-radius: 7px;
          padding: 0 11px;
          font-size: 10px;
          cursor: pointer;
        }

        .notification-button.enabled {
          border-color: rgba(255, 23, 68, .4);
          color: #ff6b86;
        }

        .follow-up-groups {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 14px 17px 17px;
        }

        .follow-up-group {
          border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 8px;
          overflow: hidden;
        }

        .follow-up-group-title {
          padding: 9px 11px;
          background: #0f1013;
          color: #858d98;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        .follow-up-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 10px 11px;
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, .05);
          background: transparent;
          color: white;
          text-align: left;
          cursor: pointer;
        }

        .follow-up-item:hover {
          background: rgba(255, 255, 255, .025);
        }

        .follow-up-item-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 28px;
          background: rgba(255, 23, 68, .12);
          color: #ff6b86;
          font-size: 9px;
          font-weight: 700;
        }

        .follow-up-item-main {
          min-width: 0;
          flex: 1;
        }

        .follow-up-item-name {
          font-size: 11px;
          font-weight: 650;
        }

        .follow-up-item-meta {
          margin-top: 2px;
          color: #747c87;
          font-size: 9px;
        }

        .follow-up-open {
          color: #ff5d79;
          font-size: 9px;
          white-space: nowrap;
        }

        .follow-up-empty {
          grid-column: 1 / -1;
          padding: 22px;
          text-align: center;
          color: #737b86;
          font-size: 11px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .stat-card {
          position: relative;
          overflow: hidden;
          background: #0c0d10;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 14px;
          padding: 17px;
          box-shadow: 0 14px 40px rgba(0, 0, 0, .3);
        }

        .stat-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 24px;
          right: 24px;
          height: 1px;
          background: linear-gradient(
            to right,
            transparent,
            rgba(255, 23, 68, .9),
            transparent
          );
        }

        .stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .stat-label {
          color: #8a929d;
          font-size: 11px;
          font-weight: 600;
        }

        .stat-icon {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 23, 68, .10);
          border: 1px solid rgba(255, 23, 68, .12);
          border-radius: 9px;
          color: #ff5d79;
          font-size: 15px;
        }

        .stat-number {
          margin-top: 12px;
          color: #ffffff;
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.4px;
        }

        .toolbar {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          background: #0b0c0e;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 15px;
        }

        .search-wrapper {
          position: relative;
          flex: 1;
          min-width: 240px;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #646b75;
          font-size: 13px;
        }

        .search-input,
        .select {
          color: #e9edf2;
          background: #111317;
          border: 1px solid rgba(255, 255, 255, .09);
        }

        .search-input {
          width: 100%;
          height: 38px;
          border-radius: 8px;
          padding: 0 12px 0 34px;
          outline: none;
          font-size: 12px;
        }

        .search-input::placeholder {
          color: #59616b;
        }

        .search-input:focus,
        .select:focus {
          border-color: rgba(255, 23, 68, .55);
          box-shadow: 0 0 0 3px rgba(255, 23, 68, .08);
        }

        .select {
          height: 38px;
          border-radius: 8px;
          padding: 0 28px 0 11px;
          font-size: 12px;
          outline: none;
          cursor: pointer;
        }

        .select option {
          background: #0b0c0e;
          color: white;
        }

        .view-switch {
          height: 38px;
          display: flex;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 8px;
          overflow: hidden;
          background: #111317;
        }

        .view-button {
          border: none;
          background: transparent;
          padding: 0 13px;
          font-size: 12px;
          color: #747c87;
          cursor: pointer;
        }

        .view-button.active {
          background: #ff1744;
          color: white;
          box-shadow: 0 0 20px rgba(255, 23, 68, .15);
        }

        .table-mode-switch {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          background: #111317;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 9px;
        }

        .table-mode-button {
          height: 30px;
          border: 0;
          border-radius: 6px;
          padding: 0 11px;
          background: transparent;
          color: #737b86;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: .15s ease;
          white-space: nowrap;
        }

        .table-mode-button:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, .04);
        }

        .table-mode-button.active {
          background: #ff1744;
          color: #ffffff;
          box-shadow: 0 0 18px rgba(255, 23, 68, .14);
        }

        .latest-payment-highlight {
          margin-top: 6px;
          color: #777f8b;
          font-size: 10px;
        }

        .latest-payment-highlight strong {
          color: #f2f4f7;
        }

        .content-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 430px;
          gap: 15px;
          align-items: start;
          transition: grid-template-columns .2s ease;
        }

        .content-layout.full-width {
          grid-template-columns: minmax(0, 1fr);
        }

        .table-card {
          min-width: 0;
          background: #0b0c0e;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 16px 50px rgba(0, 0, 0, .28);
        }

        .table-header {
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 17px;
          border-bottom: 1px solid rgba(255, 255, 255, .06);
        }

        .table-header h2 {
          margin: 0;
          color: #f5f7fa;
          font-size: 14px;
          font-weight: 700;
        }

        .result-count {
          color: #646c76;
          font-size: 11px;
        }

        .table-scroll {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 980px;
        }

        th {
          text-align: left;
          padding: 11px 17px;
          background: #111317;
          border-bottom: 1px solid rgba(255, 255, 255, .06);
          color: #626a75;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        td {
          padding: 13px 17px;
          border-bottom: 1px solid rgba(255, 255, 255, .05);
          color: #dce0e6;
          font-size: 12px;
          vertical-align: middle;
        }

        tbody tr {
          cursor: pointer;
          transition: background .15s ease;
        }

        tbody tr:hover {
          background: rgba(255, 255, 255, .025);
        }

        tbody tr.selected {
          background: rgba(255, 23, 68, .065);
          box-shadow: inset 2px 0 0 #ff1744;
        }

        .student {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .avatar,
        .profile-avatar {
          flex-shrink: 0;
          border-radius: 50%;
          background: rgba(255, 23, 68, .12);
          border: 1px solid rgba(255, 23, 68, .20);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ff6683;
          font-weight: 700;
        }

        .avatar {
          width: 34px;
          height: 34px;
          font-size: 10px;
        }

        .student-name {
          color: #f1f3f6;
          font-size: 12px;
          font-weight: 650;
        }

        .student-email,
        .payment-date,
        .booking-time {
          color: #6f7782;
          font-size: 10px;
          margin-top: 2px;
        }

        .pending-booking {
          color: #fcd34d;
          font-weight: 700;
        }

        .payment-amount,
        .booking-date {
          color: #f2f4f7;
          font-weight: 650;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .status.completed {
          background: rgba(52, 211, 153, .10);
          color: #6ee7b7;
        }

        .status.scheduled {
          background: rgba(255, 23, 68, .10);
          color: #ff6b88;
        }

        .status.progress {
          background: rgba(255, 23, 68, .16);
          color: #ff6683;
        }

        .status.pending {
          background: rgba(251, 191, 36, .10);
          color: #fcd34d;
        }

        .status.cancelled {
          background: rgba(248, 113, 113, .10);
          color: #fca5a5;
        }

        .status.noshow {
          background: rgba(148, 163, 184, .10);
          color: #94a3b8;
        }

        .meet-link {
          color: #ff5d79;
          text-decoration: none;
          font-weight: 700;
          font-size: 11px;
        }

        .meet-link:hover {
          color: #ff8aa0;
        }

        .watch-recording-button {
          height: 31px;
          padding: 0 9px;
          border: 1px solid rgba(255, 23, 68, .28);
          border-radius: 7px;
          background: rgba(255, 23, 68, .08);
          color: #ff6683;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
          transition: .15s ease;
        }

        .watch-recording-button:hover {
          background: rgba(255, 23, 68, .15);
          border-color: rgba(255, 23, 68, .45);
          color: #ff8aa0;
        }

        .no-recording {
          color: #555c66;
          font-size: 10px;
          white-space: nowrap;
        }

        .pagination {
          padding: 12px 17px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .pagination-text {
          color: #626a75;
          font-size: 11px;
        }

        .pagination-buttons {
          display: flex;
          gap: 4px;
        }

        .page-button {
          min-width: 30px;
          height: 30px;
          border: 1px solid rgba(255, 255, 255, .09);
          background: #111317;
          color: #aeb5be;
          border-radius: 7px;
          font-size: 11px;
          cursor: pointer;
        }

        .page-button.active {
          background: #ff1744;
          color: white;
          border-color: #ff1744;
          box-shadow: 0 0 18px rgba(255, 23, 68, .16);
        }

        .page-button:hover:not(:disabled) {
          border-color: rgba(255, 23, 68, .35);
          color: white;
        }

        .page-button:disabled {
          opacity: .35;
          cursor: not-allowed;
        }

        .detail-panel {
          background: #0b0c0e;
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 12px;
          overflow-y: auto;
          position: sticky;
          top: 20px;
          max-height: calc(100vh - 40px);
          box-shadow: 0 16px 50px rgba(0, 0, 0, .35);
        }

        .detail-header {
          padding: 17px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid rgba(255, 255, 255, .06);
          background: linear-gradient(
            135deg,
            rgba(255, 23, 68, .08),
            transparent 60%
          );
        }

        .detail-header h2 {
          margin: 0;
          color: #f7f8fa;
          font-size: 15px;
          font-weight: 700;
        }

        .detail-header p {
          margin: 4px 0 0;
          color: #626a75;
          font-size: 10px;
        }

        .close-button {
          width: 30px;
          height: 30px;
          border: 1px solid rgba(255, 255, 255, .08);
          background: rgba(255, 255, 255, .03);
          color: #858d97;
          border-radius: 8px;
          cursor: pointer;
          font-size: 17px;
          transition: .15s ease;
        }

        .close-button:hover {
          background: rgba(255, 23, 68, .12);
          border-color: rgba(255, 23, 68, .3);
          color: #ff6683;
        }

        .detail-section {
          padding: 17px;
          border-bottom: 1px solid rgba(255, 255, 255, .06);
        }

        .detail-title {
          margin: 0 0 12px;
          color: #737c87;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .7px;
        }

        .profile {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .profile-avatar {
          width: 46px;
          height: 46px;
          font-size: 12px;
        }

        .profile-name {
          color: #ffffff;
          font-size: 15px;
          font-weight: 700;
        }

        .profile-info {
          color: #737c87;
          font-size: 11px;
          margin-top: 3px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .info-item {
          background: #111317;
          border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 8px;
          padding: 10px;
        }

        .info-label {
          color: #626a75;
          font-size: 9px;
          margin-bottom: 4px;
        }

        .info-value {
          color: #e9edf2;
          font-size: 12px;
          font-weight: 650;
        }

        .amount-value {
          color: #ffffff;
        }

        .info-value.success {
          color: #6ee7b7;
        }

        .booking-status {
          margin-top: 11px;
        }

        .payment-id {
          margin-top: 10px;
        }

        .payment-id-value {
          color: #777f8a;
          font-size: 10px;
          word-break: break-all;
        }

        .link-card {
          border: 1px solid rgba(255, 255, 255, .08);
          border-radius: 10px;
          padding: 12px;
          background: #101114;
        }

        .link-card + .link-card {
          margin-top: 9px;
        }

        .link-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }

        .link-label {
          color: #e8ebef;
          font-size: 11px;
          font-weight: 700;
        }

        .link-url {
          color: #68717c;
          font-size: 10px;
          word-break: break-all;
          margin-top: 5px;
          line-height: 1.5;
        }

        .link-dot {
          width: 8px;
          height: 8px;
          flex-shrink: 0;
          border-radius: 50%;
          margin-top: 3px;
        }

        .link-dot.live {
          background: #ff1744;
          box-shadow: 0 0 10px rgba(255, 23, 68, .7);
        }

        .link-dot.recording {
          background: #f87171;
          box-shadow: 0 0 10px rgba(248, 113, 113, .45);
        }

        .meeting-button,
        .recording-button {
          width: 100%;
          height: 35px;
          margin-top: 11px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: .15s ease;
        }

        .meeting-button {
          border: 1px solid rgba(255, 23, 68, .35);
          background: #ff1744;
          color: white;
        }

        .meeting-button:hover {
          background: #ff3158;
          box-shadow: 0 8px 22px rgba(255, 23, 68, .18);
        }

        .recording-button {
          border: 1px solid rgba(255, 23, 68, .22);
          background: rgba(255, 23, 68, .08);
          color: #ff6683;
        }

        .recording-button:hover {
          background: rgba(255, 23, 68, .14);
          border-color: rgba(255, 23, 68, .4);
        }

        .follow-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .follow-label {
          color: #e8ebef;
          font-size: 11px;
          font-weight: 650;
        }

        .follow-description {
          margin: 4px 0 0;
          color: #626a75;
          font-size: 10px;
        }

        .toggle {
          width: 40px;
          height: 22px;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, .10);
          background: #191c20;
          border-radius: 999px;
          position: relative;
          cursor: pointer;
          flex-shrink: 0;
          transition: .15s ease;
        }

        .toggle.active {
          background: #ff1744;
          border-color: #ff1744;
          box-shadow: 0 0 16px rgba(255, 23, 68, .22);
        }

        .toggle-dot {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          transition: .15s;
        }

        .toggle.active .toggle-dot {
          left: 20px;
        }

        .follow-up-status {
          margin-top: 7px;
          font-size: 10px;
          font-weight: 650;
        }

        .follow-up-status.overdue,
        .follow-up-status.today {
          color: #ff5575;
        }

        .follow-up-status.tomorrow,
        .follow-up-status.upcoming {
          color: #8e96a1;
        }

        .follow-date-wrap {
          margin-top: 12px;
        }

        .date-input {
          width: 100%;
          height: 36px;
          margin-top: 7px;
          color: #e9edf2;
          background: #111317;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 7px;
          padding: 0 9px;
          font-size: 11px;
          outline: none;
          color-scheme: dark;
        }

        .date-input:focus {
          border-color: rgba(255, 23, 68, .5);
        }

        .notes {
          width: 100%;
          min-height: 105px;
          resize: vertical;
          color: #e9edf2;
          background: #111317;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 8px;
          padding: 10px;
          font-family: inherit;
          font-size: 11px;
          outline: none;
        }

        .notes::placeholder {
          color: #59616b;
        }

        .notes:focus {
          border-color: rgba(255, 23, 68, .5);
          box-shadow: 0 0 0 3px rgba(255, 23, 68, .06);
        }

        .save-notes {
          margin-top: 8px;
          width: 100%;
          height: 34px;
          border: 1px solid rgba(255, 255, 255, .09);
          background: #15171a;
          color: #d8dde3;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
        }

        .save-notes:hover {
          border-color: rgba(255, 23, 68, .35);
          color: white;
        }

        .saved-message {
          text-align: center;
          color: #6ee7b7;
          font-size: 10px;
          margin-top: 6px;
        }

        .actions {
          padding: 15px 17px;
        }

        .manual-slot-button {
          width: 100%;
          height: 38px;
          margin-bottom: 8px;
          border: 1px solid rgba(255, 255, 255, .10);
          border-radius: 8px;
          background: #111317;
          color: #dfe3e8;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: .15s ease;
        }

        .manual-slot-button:hover:not(:disabled) {
          border-color: rgba(255, 23, 68, .38);
          background: rgba(255, 23, 68, .07);
          color: #ffffff;
        }

        .manual-slot-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .consultation-primary-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .complete-button,
        .cancel-consultation-button {
          width: 100%;
          min-width: 0;
          height: 40px;
          border-radius: 9px;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
          transition: all .18s ease;
        }

        .complete-button {
          border: 1px solid rgba(255, 23, 68, .42);
          background: linear-gradient(180deg, #ff2450 0%, #f31240 100%);
          color: #ffffff;
          box-shadow: 0 7px 22px rgba(255, 23, 68, .12);
        }

        .complete-button:hover:not(:disabled) {
          transform: translateY(-1px);
          background: linear-gradient(180deg, #ff3158 0%, #ff1744 100%);
          border-color: rgba(255, 23, 68, .62);
          box-shadow: 0 10px 28px rgba(255, 23, 68, .20);
        }

        .complete-button:active:not(:disabled),
        .cancel-consultation-button:active:not(:disabled),
        .manual-slot-button:active:not(:disabled),
        .secondary-button:active {
          transform: translateY(0);
        }

        .complete-button:disabled {
          background: rgba(52, 211, 153, .08);
          border-color: rgba(52, 211, 153, .18);
          color: #6ee7b7;
          cursor: default;
          box-shadow: none;
        }

        .consultation-primary-actions .cancel-consultation-button {
          margin: 0;
          padding: 0 10px;
          border: 1px solid rgba(255, 82, 82, .28);
          background: rgba(255, 82, 82, .045);
          color: #ff9a9a;
          box-shadow: none;
        }

        .consultation-primary-actions .cancel-consultation-button:hover:not(:disabled) {
          transform: translateY(-1px);
          background: rgba(255, 82, 82, .10);
          border-color: rgba(255, 82, 82, .48);
          color: #ffb7b7;
        }

        .consultation-primary-actions .cancel-consultation-button:disabled {
          opacity: .72;
          cursor: default;
          background: rgba(255, 255, 255, .025);
          border-color: rgba(255, 255, 255, .08);
          color: #737b86;
        }

        .secondary-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
        }

        .secondary-button {
          height: 35px;
          border: 1px solid rgba(255, 255, 255, .09);
          background: #111317;
          color: #c1c7cf;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
        }

        .secondary-button:hover {
          border-color: rgba(255, 23, 68, .35);
          background: rgba(255, 23, 68, .06);
          color: white;
        }

        .calendar-container {
          padding: 15px;
          overflow-x: auto;
        }

        .calendar-grid {
          min-width: 750px;
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          border-left: 1px solid rgba(255, 255, 255, .07);
          border-top: 1px solid rgba(255, 255, 255, .07);
        }

        .calendar-day-name {
          padding: 9px;
          text-align: center;
          background: #111317;
          border-right: 1px solid rgba(255, 255, 255, .07);
          border-bottom: 1px solid rgba(255, 255, 255, .07);
          color: #6f7782;
          font-size: 10px;
          font-weight: 650;
        }

        .calendar-day {
          min-height: 120px;
          padding: 8px;
          border-right: 1px solid rgba(255, 255, 255, .07);
          border-bottom: 1px solid rgba(255, 255, 255, .07);
          background: #0b0c0e;
        }

        .calendar-date {
          color: #d9dde3;
          font-size: 11px;
          font-weight: 650;
          margin-bottom: 6px;
        }

        .calendar-event {
          background: rgba(255, 23, 68, .08);
          border: 1px solid rgba(255, 23, 68, .18);
          border-radius: 6px;
          padding: 6px;
          margin-bottom: 4px;
          cursor: pointer;
        }

        .calendar-event:hover {
          background: rgba(255, 23, 68, .14);
        }

        .event-time {
          color: #ff6683;
          font-size: 9px;
        }

        .event-name {
          color: #e7eaf0;
          font-size: 10px;
          font-weight: 650;
          margin-top: 2px;
        }

        .empty {
          padding: 50px 20px;
          text-align: center;
          color: #626a75;
          font-size: 12px;
        }

        @media (max-width: 1200px) {
          .content-layout,
          .content-layout.full-width {
            grid-template-columns: 1fr;
          }

          .detail-panel {
            position: relative;
            top: auto;
            max-height: none;
          }
        }

        @media (max-width: 800px) {
          .follow-up-center-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .follow-up-center-actions {
            width: 100%;
          }

          .notification-button {
            flex: 1;
          }

          .follow-up-groups {
            grid-template-columns: 1fr;
          }

          .consultation-page {
            padding: 15px;
          }

        .stat-subtext {
          margin-top: 6px;
          color: #777f8b;
          font-size: 10px;
        }

        .follow-up-center {
          margin: 0 0 15px;
          background: #0b0c0e;
          border: 1px solid rgba(255, 23, 68, .22);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 18px 55px rgba(0, 0, 0, .3);
        }

        .follow-up-center-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, .07);
        }

        .follow-up-center-title {
          font-size: 14px;
          font-weight: 700;
        }

        .follow-up-center-subtitle {
          margin-top: 4px;
          color: #777f8b;
          font-size: 10px;
        }

        .follow-up-center-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .notification-button {
          height: 32px;
          border: 1px solid rgba(255, 255, 255, .1);
          background: #111317;
          color: #dfe3e8;
          border-radius: 7px;
          padding: 0 11px;
          font-size: 10px;
          cursor: pointer;
        }

        .notification-button.enabled {
          border-color: rgba(255, 23, 68, .4);
          color: #ff6b86;
        }

        .follow-up-groups {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 14px 17px 17px;
        }

        .follow-up-group {
          border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 8px;
          overflow: hidden;
        }

        .follow-up-group-title {
          padding: 9px 11px;
          background: #0f1013;
          color: #858d98;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        .follow-up-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 10px 11px;
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, .05);
          background: transparent;
          color: white;
          text-align: left;
          cursor: pointer;
        }

        .follow-up-item:hover {
          background: rgba(255, 255, 255, .025);
        }

        .follow-up-item-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 28px;
          background: rgba(255, 23, 68, .12);
          color: #ff6b86;
          font-size: 9px;
          font-weight: 700;
        }

        .follow-up-item-main {
          min-width: 0;
          flex: 1;
        }

        .follow-up-item-name {
          font-size: 11px;
          font-weight: 650;
        }

        .follow-up-item-meta {
          margin-top: 2px;
          color: #747c87;
          font-size: 9px;
        }

        .follow-up-open {
          color: #ff5d79;
          font-size: 9px;
          white-space: nowrap;
        }

        .follow-up-empty {
          grid-column: 1 / -1;
          padding: 22px;
          text-align: center;
          color: #737b86;
          font-size: 11px;
        }

        .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .toolbar {
            flex-direction: column;
          }

          .search-wrapper {
            width: 100%;
          }

          .select {
            width: 100%;
          }

          .view-switch {
            width: 100%;
          }

          .view-button {
            flex: 1;
          }

          .table-mode-switch {
            width: 100%;
          }

          .table-mode-button {
            flex: 1;
            padding: 0 7px;
          }
        }

        @media (max-width: 500px) {

        .stat-subtext {
          margin-top: 6px;
          color: #777f8b;
          font-size: 10px;
        }

        .follow-up-center {
          margin: 0 0 15px;
          background: #0b0c0e;
          border: 1px solid rgba(255, 23, 68, .22);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 18px 55px rgba(0, 0, 0, .3);
        }

        .follow-up-center-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, .07);
        }

        .follow-up-center-title {
          font-size: 14px;
          font-weight: 700;
        }

        .follow-up-center-subtitle {
          margin-top: 4px;
          color: #777f8b;
          font-size: 10px;
        }

        .follow-up-center-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .notification-button {
          height: 32px;
          border: 1px solid rgba(255, 255, 255, .1);
          background: #111317;
          color: #dfe3e8;
          border-radius: 7px;
          padding: 0 11px;
          font-size: 10px;
          cursor: pointer;
        }

        .notification-button.enabled {
          border-color: rgba(255, 23, 68, .4);
          color: #ff6b86;
        }

        .follow-up-groups {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 14px 17px 17px;
        }

        .follow-up-group {
          border: 1px solid rgba(255, 255, 255, .07);
          border-radius: 8px;
          overflow: hidden;
        }

        .follow-up-group-title {
          padding: 9px 11px;
          background: #0f1013;
          color: #858d98;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        .follow-up-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 10px 11px;
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, .05);
          background: transparent;
          color: white;
          text-align: left;
          cursor: pointer;
        }

        .follow-up-item:hover {
          background: rgba(255, 255, 255, .025);
        }

        .follow-up-item-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 28px;
          background: rgba(255, 23, 68, .12);
          color: #ff6b86;
          font-size: 9px;
          font-weight: 700;
        }

        .follow-up-item-main {
          min-width: 0;
          flex: 1;
        }

        .follow-up-item-name {
          font-size: 11px;
          font-weight: 650;
        }

        .follow-up-item-meta {
          margin-top: 2px;
          color: #747c87;
          font-size: 9px;
        }

        .follow-up-open {
          color: #ff5d79;
          font-size: 9px;
          white-space: nowrap;
        }

        .follow-up-empty {
          grid-column: 1 / -1;
          padding: 22px;
          text-align: center;
          color: #737b86;
          font-size: 11px;
        }

        .stats-grid {
            grid-template-columns: 1fr;
          }

          .info-grid {
            grid-template-columns: 1fr;
          }

          .pagination {
            flex-direction: column;
            align-items: flex-start;
          }

          .page-header {
            margin-bottom: 18px;
          }

          .header-title h1 {
            font-size: 26px;
          }
        }


        .manual-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, .78);
          backdrop-filter: blur(7px);
        }

        .manual-modal {
          width: min(460px, 100%);
          background: #0c0d10;
          border: 1px solid rgba(255, 23, 68, .28);
          border-radius: 14px;
          box-shadow: 0 25px 90px rgba(0, 0, 0, .65);
          overflow: hidden;
        }

        .manual-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          padding: 18px;
          border-bottom: 1px solid rgba(255, 255, 255, .07);
          background: linear-gradient(135deg, rgba(255, 23, 68, .10), transparent 65%);
        }

        .manual-modal-title {
          margin: 0;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
        }

        .manual-modal-subtitle {
          margin: 5px 0 0;
          color: #737c87;
          font-size: 10px;
          line-height: 1.5;
        }

        .manual-modal-close {
          width: 30px;
          height: 30px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 8px;
          background: #111317;
          color: #8b939d;
          cursor: pointer;
          font-size: 17px;
        }

        .manual-modal-body {
          padding: 18px;
        }

        .manual-modal-person {
          margin-bottom: 15px;
          padding: 11px 12px;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 9px;
          background: #111317;
        }

        .manual-modal-person-name {
          color: #fff;
          font-size: 12px;
          font-weight: 700;
        }

        .manual-modal-person-payment {
          margin-top: 4px;
          color: #737c87;
          font-size: 9px;
          word-break: break-all;
        }

        .manual-field-label {
          display: block;
          margin-bottom: 6px;
          color: #8a929d;
          font-size: 10px;
          font-weight: 650;
        }

        .manual-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .manual-input {
          width: 100%;
          height: 40px;
          padding: 0 11px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 8px;
          outline: none;
          background: #111317;
          color: #f1f3f6;
          font-size: 12px;
        }

        .manual-input:focus {
          border-color: rgba(255, 23, 68, .55);
          box-shadow: 0 0 0 3px rgba(255, 23, 68, .08);
        }

        .manual-modal-note {
          margin-top: 12px;
          padding: 10px 11px;
          border-radius: 8px;
          background: rgba(52, 211, 153, .06);
          border: 1px solid rgba(52, 211, 153, .12);
          color: #8fe8c3;
          font-size: 9px;
          line-height: 1.5;
        }

        .manual-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 18px;
        }

        .manual-cancel-button,
        .manual-save-button {
          height: 38px;
          padding: 0 13px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .manual-cancel-button {
          border: 1px solid rgba(255,255,255,.09);
          background: #111317;
          color: #aeb5be;
        }

        .manual-save-button {
          border: 1px solid rgba(255,23,68,.35);
          background: #ff1744;
          color: #fff;
        }

        /* The consultation action-row styles above control the cancel button. */

        .cancel-warning-note {
          margin-top: 12px;
          padding: 10px 11px;
          border-radius: 8px;
          background: rgba(255, 193, 7, .06);
          border: 1px solid rgba(255, 193, 7, .16);
          color: #f3d57a;
          font-size: 9px;
          line-height: 1.5;
        }

        .cancel-note-field {
          position: relative;
          margin-top: 14px;
        }

        .manual-textarea {
          width: 100%;
          min-height: 105px;
          padding: 10px 11px 24px;
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 8px;
          outline: none;
          resize: vertical;
          background: #111317;
          color: #f1f3f6;
          font-family: inherit;
          font-size: 11px;
          line-height: 1.5;
        }

        .manual-textarea::placeholder {
          color: #5f6772;
        }

        .manual-textarea:focus {
          border-color: rgba(255, 82, 82, .45);
          box-shadow: 0 0 0 3px rgba(255, 82, 82, .07);
        }

        .cancel-note-counter {
          position: absolute;
          right: 9px;
          bottom: 7px;
          color: #626a75;
          font-size: 9px;
        }

        .cancel-confirm-button {
          height: 38px;
          padding: 0 15px;
          border: 1px solid rgba(255, 82, 82, .35);
          border-radius: 8px;
          background: #d92d3f;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: .15s ease;
        }

        .cancel-confirm-button:hover:not(:disabled) {
          background: #e53b4e;
        }

        .cancel-confirm-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .manual-save-only-button {
          height: 38px;
          padding: 0 15px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px;
          background: #17191d;
          color: #e5e7eb;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: .15s ease;
        }

        .manual-save-only-button:hover:not(:disabled) {
          background: #202329;
          border-color: rgba(255,255,255,.2);
        }

        .manual-save-button:hover:not(:disabled) {
          background: #ff3158;
        }

        .manual-modal-note.schedule-note {
          background: rgba(255, 193, 7, .06);
          border-color: rgba(255, 193, 7, .16);
          color: #f3d57a;
        }

        .manual-modal-note.complete-note {
          background: rgba(52, 211, 153, .06);
          border-color: rgba(52, 211, 153, .12);
          color: #8fe8c3;
        }

        .manual-save-button:disabled,
        .manual-save-only-button:disabled,
        .manual-cancel-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }
      `}</style>

      <div className="container">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="page-header">

          <div className="header-title">

            <button
              type="button"
              className="dashboard-back-button"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
            >
              ← Dashboard
            </button>

            <h1>
              Consultations
            </h1>

            <p>
              Manage consultation bookings,
              meetings and follow-ups.
            </p>

          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className="primary-button"
              onClick={() =>
                alert(
                  "New consultation will use your existing Google Form booking workflow."
                )
              }
            >
              + New Consultation
            </button>
          </div>

        </div>

        {/* =====================================================
            STATS
        ===================================================== */}

        <div className="stats-grid">

          <div className="stat-card">

            <div className="stat-top">

              <div className="stat-label">
                Today's Consultations
              </div>

              <div className="stat-icon">
                📅
              </div>

            </div>

            <div className="stat-number">
              {todayCount}
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-top">

              <div className="stat-label">
                Upcoming
              </div>

              <div className="stat-icon">
                🕐
              </div>

            </div>

            <div className="stat-number">
              {upcomingCount}
            </div>

            <div className="stat-subtext">
              {latestPayment
                ? `Latest payment: ${latestPayment.studentName} • ${formatDateTime(latestPayment.paymentTime)}`
                : "No captured payments"}
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-top">

              <div className="stat-label">
                Pending
              </div>

              <div className="stat-icon">
                ⏳
              </div>

            </div>

            <div className="stat-number">
              {pendingCount}
            </div>

          </div>

          <div className="stat-card">

            <div className="stat-top">

              <div className="stat-label">
                Completed
              </div>

              <div className="stat-icon">
                ✓
              </div>

            </div>

            <div className="stat-number">
              {completedCount}
            </div>

          </div>

          <button
            type="button"
            className={`stat-card follow-up-stat ${followUps.length > 0 ? "has-due" : ""}`}
            onClick={() => setShowFollowUps((current) => !current)}
          >
            <div className="stat-top">
              <div className="stat-label">
                Follow-ups
              </div>
              <div className="stat-icon">
                ↗
              </div>
            </div>
            <div className="stat-number">
              {followUps.length}
            </div>
            <div className="stat-subtext">
              {showFollowUps ? "Hide follow-ups" : "View active follow-ups"}
            </div>
          </button>

        </div>

        {/* =====================================================
            FOLLOW-UP CENTER
        ===================================================== */}

        {followUps.length > 0 && showFollowUps && (
          <div className="follow-up-center">
            <div className="follow-up-center-header">
              <div>
                <div className="follow-up-center-title">Follow-up Center</div>
                <div className="follow-up-center-subtitle">
                  Reminders are saved in Supabase and stay with the consultation.
                </div>
              </div>
              <div className="follow-up-center-actions">
                <button
                  type="button"
                  className={`notification-button ${browserNotificationsEnabled ? "enabled" : ""}`}
                  onClick={enableBrowserNotifications}
                >
                  {browserNotificationsEnabled ? "✓ Browser Alerts On" : "Enable Browser Alerts"}
                </button>

              </div>
            </div>



            <div className="follow-up-groups">
              {[
                ["Overdue", overdueFollowUps],
                ["Due Today", todayFollowUps],
                ["Tomorrow", tomorrowFollowUps],
                ["Upcoming", upcomingFollowUps],
              ].map(([label, items]) => {
                const groupItems = items as Consultation[];
                if (groupItems.length === 0) return null;

                return (
                  <div className="follow-up-group" key={label as string}>
                    <div className="follow-up-group-title">{label as string}</div>
                    {groupItems.map((item) => (
                      <button
                        type="button"
                        className="follow-up-item"
                        key={item.id}
                        onClick={() => {
                          setSelectedId(item.id);
                        }}
                      >
                        <div className="follow-up-item-avatar">{getInitials(item.studentName)}</div>
                        <div className="follow-up-item-main">
                          <div className="follow-up-item-name">{item.studentName}</div>
                          <div className="follow-up-item-meta">
                            {item.followUpDate ? formatFollowUpDate(item.followUpDate) : "No date"} · {item.bookingTime}
                          </div>
                        </div>
                        <span className="follow-up-open">Open →</span>
                      </button>
                    ))}
                  </div>
                );
              })}

              {followUps.length === 0 && (
                <div className="follow-up-empty">
                  No follow-ups are scheduled. Open a consultation and enable <strong>Follow-up required</strong> to create one.
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            FILTERS
        ===================================================== */}

        <div className="toolbar">

          <div className="table-mode-switch" aria-label="Consultation table mode">
            <button
              type="button"
              className={`table-mode-button ${tableMode === "upcoming" ? "active" : ""}`}
              onClick={() => {
                setTableMode("upcoming");
                setDateFilter("All");
                setPage(1);
              }}
            >
              Upcoming Slots
            </button>

            <button
              type="button"
              className={`table-mode-button ${tableMode === "payments" ? "active" : ""}`}
              onClick={() => {
                setTableMode("payments");
                setDateFilter("All");
                setPage(1);
              }}
            >
              Latest Payments
            </button>

          </div>

          <div className="search-wrapper">

            <span className="search-icon">
              🔍
            </span>

            <input
              className="search-input"
              placeholder="Search student, email, phone or payment ID..."
              value={search}
              onChange={(event) => {
                setSearch(
                  event.target.value
                );
                setPage(1);
              }}
            />

          </div>

          <select
            className="select"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value
              );
              setPage(1);
            }}
          >

            <option value="All">
              All Status
            </option>

            <option value="Pending">
              Pending
            </option>

            <option value="Scheduled">
              Scheduled
            </option>

            <option value="In Progress">
              In Progress
            </option>

            <option value="Completed">
              Completed
            </option>

            <option value="Cancelled">
              Cancelled
            </option>

            <option value="No Show">
              No Show
            </option>

          </select>

          <select
            className="select"
            value={dateFilter}
            disabled={tableMode === "payments"}
            onChange={(event) => {
              setDateFilter(
                event.target.value
              );
              setPage(1);
            }}
          >

            <option value="All">
              All Dates
            </option>

            <option value="Today">
              Today
            </option>

            <option value="Upcoming">
              Upcoming
            </option>

            <option value="Past">
              Past
            </option>

          </select>

          <div className="view-switch">

            <button
              className={`view-button ${
                view === "list"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setView("list")
              }
            >
              ☷ List
            </button>

            <button
              className={`view-button ${
                view === "calendar"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setView("calendar")
              }
            >
              ▦ Calendar
            </button>

          </div>

        </div>

        {/* =====================================================
            MAIN CONTENT
        ===================================================== */}

        <div className={`content-layout ${selectedConsultation ? "with-details" : "full-width"}`}>

          {/* ===================================================
              LIST / CALENDAR
          =================================================== */}

          <div className="table-card">

            <div className="table-header">

              <h2>
                {view === "list"
                  ? tableMode === "upcoming"
                    ? "Upcoming Consultation Slots"
                    : tableMode === "payments"
                      ? "Latest Payments"
                      : "All Consultations"
                  : "Consultation Calendar"}
              </h2>

              <div className="result-count">
                {filteredConsultations.length}{" "}
                {tableMode === "payments" ? "payments" : "consultations"}
              </div>

            </div>

            {/* =================================================
                LIST
            ================================================= */}

            {loadError && (
              <div className="empty" style={{ color: "#ff6b86" }}>
                Failed to load consultations: {loadError}
              </div>
            )}

            {loading ? (
              <div className="empty">Loading real consultations…</div>
            ) : view === "list" && (
              <>
                {paginatedConsultations.length ===
                0 ? (
                  <div className="empty">
                    No consultations found.
                  </div>
                ) : (
                  <div className="table-scroll">

                    <table>

                      <thead>

                        <tr>

                          <th>
                            Student
                          </th>

                          <th>
                            Payment
                          </th>

                          <th>
                            Consultation
                          </th>

                          <th>
                            Status
                          </th>

                          <th>
                            Meeting
                          </th>

                          <th>
                            Watch Recording
                          </th>
</tr>

                      </thead>

                      <tbody>

                        {paginatedConsultations.map(
                          (consultation, rowIndex) => (
                            <tr
                              key={`${consultation.id}-${(safePage - 1) * perPage + rowIndex}`}
                              className={
                                selectedId ===
                                consultation.id
                                  ? "selected"
                                  : ""
                              }
                              onClick={() =>
                                setSelectedId(
                                  consultation.id
                                )
                              }
                            >

                              {/* STUDENT */}

                              <td>

                                <div className="student">

                                  <div className="avatar">
                                    {getInitials(
                                      consultation.studentName
                                    )}
                                  </div>

                                  <div>

                                    <div className="student-name">
                                      {
                                        consultation.studentName
                                      }
                                    </div>

                                    <div className="student-email">
                                      {
                                        consultation.email
                                      }
                                    </div>

                                  </div>

                                </div>

                              </td>

                              {/* PAYMENT */}

                              <td>

                                <div className="payment-amount">
                                  {formatAmount(
                                    consultation.paymentAmount
                                  )}
                                </div>

                                <div className="payment-date">
                                  {formatDateTime(
                                    consultation.paymentTime
                                  )}
                                </div>

                              </td>

                              {/* CONSULTATION SLOT */}

                              <td>
                                {consultation.status === "Pending" ||
                                !consultation.bookingDate ||
                                !consultation.bookingTime ? (
                                  <div className="booking-time pending-booking">
                                    Pending
                                  </div>
                                ) : (
                                  <>
                                    <div className="booking-date">
                                      {formatDate(consultation.bookingDate)}
                                    </div>
                                    <div className="booking-time">
                                      {consultation.bookingTime}
                                    </div>
                                  </>
                                )}
                              </td>

                              {/* STATUS */}

                              <td>

                                <span
                                  className={statusClass(
                                    consultation.status
                                  )}
                                >
                                  ●{" "}
                                  {
                                    consultation.status
                                  }
                                </span>

                              </td>

                              {/* MEET */}

                              <td>

                                {consultation.meetLink ? (
                                  <a
                                    className="meet-link"
                                    href={
                                      consultation.meetLink
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) =>
                                      event.stopPropagation()
                                    }
                                  >
                                    Join Meet →
                                  </a>
                                ) : (
                                  <span
                                    style={{
                                      color:
                                        "#858a91",
                                    }}
                                  >
                                    —
                                  </span>
                                )}

                              </td>
                              <td>
                                <div className="row-actions">
                                  {consultation.recordingLink ? (
                                    <button
                                      type="button"
                                      className="watch-recording-button"
                                      title="Watch recording"
                                      aria-label={`Watch recording for ${consultation.studentName}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        window.open(consultation.recordingLink!, "_blank", "noopener,noreferrer");
                                      }}
                                    >
                                      ▶ Watch Recording
                                    </button>
                                  ) : (
                                    <span className="no-recording">No recording</span>
                                  )}
                                
                                </div>
                              </td>

                            </tr>
                          )
                        )}

                      </tbody>

                    </table>

                  </div>
                )}

                {/* PAGINATION */}

                <div className="pagination">

                  <div className="pagination-text">

                    Showing{" "}
                    {filteredConsultations.length ===
                    0
                      ? 0
                      : (safePage - 1) *
                          perPage +
                        1}
                    –
                    {Math.min(
                      safePage * perPage,
                      filteredConsultations.length
                    )}{" "}
                    of{" "}
                    {filteredConsultations.length}

                  </div>

                  <div className="pagination-buttons">

                    <button
                      className="page-button"
                      disabled={
                        safePage <= 1
                      }
                      onClick={() =>
                        setPage(
                          Math.max(
                            1,
                            safePage - 1
                          )
                        )
                      }
                    >
                      ←
                    </button>

                    {Array.from(
                      {
                        length: totalPages,
                      },
                      (_, index) =>
                        index + 1
                    )
                      .slice(
                        Math.max(
                          0,
                          safePage - 3
                        ),
                        Math.min(
                          totalPages,
                          safePage + 2
                        )
                      )
                      .map(
                        (pageNumber) => (
                          <button
                            key={
                              pageNumber
                            }
                            className={`page-button ${
                              safePage ===
                              pageNumber
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setPage(
                                pageNumber
                              )
                            }
                          >
                            {pageNumber}
                          </button>
                        )
                      )}

                    <button
                      className="page-button"
                      disabled={
                        safePage >=
                        totalPages
                      }
                      onClick={() =>
                        setPage(
                          Math.min(
                            totalPages,
                            safePage + 1
                          )
                        )
                      }
                    >
                      →
                    </button>

                  </div>

                </div>
              </>
            )}

            {/* =================================================
                CALENDAR
            ================================================= */}

            {view === "calendar" && (
              <div className="calendar-container">

                <div className="calendar-grid">

                  {[
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                    "Sun",
                  ].map((day) => (
                    <div
                      key={day}
                      className="calendar-day-name"
                    >
                      {day}
                    </div>
                  ))}

                  {Array.from(
                    { length: 35 },
                    (_, index) => {

                      const day =
                        index + 1;

                      const dateString =
                        `2026-09-${String(
                          day
                        ).padStart(2, "0")}`;

                      const events =
                        consultations.filter(
                          (item) =>
                            item.bookingDate ===
                            dateString
                        );

                      return (
                        <div
                          key={index}
                          className="calendar-day"
                        >

                          {day <= 30 && (
                            <>
                              <div className="calendar-date">
                                {day}
                              </div>

                              {events.map(
                                (event) => (
                                  <div
                                    key={
                                      event.id
                                    }
                                    className="calendar-event"
                                    onClick={() =>
                                      setSelectedId(
                                        event.id
                                      )
                                    }
                                  >

                                    <div className="event-time">
                                      {
                                        event.bookingTime
                                      }
                                    </div>

                                    <div className="event-name">
                                      {
                                        event.studentName
                                      }
                                    </div>

                                  </div>
                                )
                              )}

                            </>
                          )}

                        </div>
                      );
                    }
                  )}

                </div>

              </div>
            )}

          </div>

          {/* ===================================================
              DETAIL PANEL
          =================================================== */}

          {selectedConsultation && (
            <aside className="detail-panel">

              {/* HEADER */}

              <div className="detail-header">

                <div>
                  <h2>Consultation Details</h2>
                  <p>{selectedConsultation.id}</p>
                </div>

                <button
                  className="close-button"
                  aria-label="Close consultation details"
                  onClick={() => setSelectedId(null)}
                >
                  ×
                </button>

              </div>

              {/* STUDENT */}

              <div className="detail-section">

                <h3 className="detail-title">
                  Student
                </h3>

                <div className="profile">

                  <div className="profile-avatar">
                    {getInitials(
                      selectedConsultation.studentName
                    )}
                  </div>

                  <div>
                    <div className="profile-name">
                      {selectedConsultation.studentName}
                    </div>

                    <div className="profile-info">
                      {selectedConsultation.email}
                    </div>

                    <div className="profile-info">
                      {selectedConsultation.phone}
                    </div>
                  </div>

                </div>

              </div>

              {/* CONSULTATION BOOKING */}

              <div className="detail-section">

                <h3 className="detail-title">
                  Consultation Booking
                </h3>

                <div className="info-grid">

                  <div className="info-item">
                    <div className="info-label">
                      Booking Date
                    </div>

                    <div className="info-value">
                      {selectedConsultation.bookingDate
                        ? formatDate(selectedConsultation.bookingDate)
                        : "Pending"}
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-label">
                      Consultation Time
                    </div>

                    <div className="info-value">
                      {selectedConsultation.bookingTime || "Pending"}
                    </div>
                  </div>

                </div>

                <div className="booking-status">
                  <span
                    className={statusClass(
                      selectedConsultation.status
                    )}
                  >
                    ● {selectedConsultation.status}
                  </span>
                </div>

              </div>

              {/* PAYMENT */}

              <div className="detail-section">

                <h3 className="detail-title">
                  Payment Details
                </h3>

                <div className="info-grid">

                  <div className="info-item">
                    <div className="info-label">
                      Amount
                    </div>

                    <div className="info-value amount-value">
                      {formatAmount(
                        selectedConsultation.paymentAmount
                      )}
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-label">
                      Status
                    </div>

                    <div className={`info-value ${selectedConsultation.paymentStatus === "Paid" ? "success" : ""}`}>
                      {selectedConsultation.paymentStatus === "Paid" ? "✓ " : ""}{selectedConsultation.paymentStatus}
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-label">
                      Payment Date
                    </div>

                    <div className="info-value">
                      {selectedConsultation.paymentTime
                        ? formatDate(selectedConsultation.paymentTime.slice(0, 10))
                        : "—"}
                    </div>
                  </div>

                  <div className="info-item">
                    <div className="info-label">
                      Payment Time
                    </div>

                    <div className="info-value">
                      {selectedConsultation.paymentTime
                        ? new Date(selectedConsultation.paymentTime).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </div>
                  </div>

                </div>

                <div className="payment-id">
                  <div className="info-label">
                    Payment ID
                  </div>

                  <div className="payment-id-value">
                    {selectedConsultation.paymentId}
                  </div>
                </div>

              </div>

              {/* LINKS */}

              <div className="detail-section">

                <h3 className="detail-title">
                  Links
                </h3>

                <div className="link-card meet-card">

                  <div className="link-card-top">
                    <div>
                      <div className="link-label">
                        Google Meet
                      </div>

                      <div className="link-url">
                        {selectedConsultation.meetLink ||
                          "No meeting link available"}
                      </div>
                    </div>

                    {selectedConsultation.meetLink && (
                      <span className="link-dot live" />
                    )}
                  </div>

                  {selectedConsultation.meetLink && (
                    <button
                      className="meeting-button"
                      onClick={() =>
                        window.open(
                          selectedConsultation.meetLink,
                          "_blank"
                        )
                      }
                    >
                      Join Google Meet →
                    </button>
                  )}

                </div>

                <div className="link-card recording-card">

                  <div className="link-card-top">
                    <div>
                      <div className="link-label">
                        Meeting Recording
                      </div>

                      <div className="link-url">
                        {selectedConsultation.recordingLink
                          ? selectedConsultation.recordingLink
                          : "Recording is not available yet."}
                      </div>
                    </div>

                    {selectedConsultation.recordingLink && (
                      <span className="link-dot recording" />
                    )}
                  </div>

                  {selectedConsultation.recordingLink && (
                    <button
                      className="recording-button"
                      onClick={() =>
                        window.open(
                          selectedConsultation.recordingLink!,
                          "_blank"
                        )
                      }
                    >
                      Watch Recording →
                    </button>
                  )}

                </div>

              </div>

              {/* FOLLOW-UP REMINDER */}

              <div className="detail-section">

                <h3 className="detail-title">
                  Follow-up Reminder
                </h3>

                <div className="follow-row">

                  <div>
                    <span className="follow-label">
                      Follow-up required
                    </span>

                    <p className="follow-description">
                      Set a reminder for this student. It will appear in the Follow-up Center.
                    </p>
                  </div>

                  <button
                    type="button"
                    aria-label="Toggle follow-up reminder"
                    className={`toggle ${
                      selectedConsultation.followUpRequired
                        ? "active"
                        : ""
                    }`}
                    onClick={toggleFollowUp}
                  >
                    <span className="toggle-dot" />
                  </button>

                </div>

                {selectedConsultation.followUpRequired && (
                  <div className="follow-date-wrap">
                    <label className="info-label">
                      Reminder Date
                    </label>

                    <input
                      type="date"
                      className="date-input"
                      value={
                        selectedConsultation.followUpDate || ""
                      }
                      onChange={(event) =>
                        updateFollowUpDate(
                          event.target.value
                        )
                      }
                    />

                    {selectedConsultation.followUpDate && (
                      <div className={`follow-up-status ${followUpBucket(selectedConsultation.followUpDate, todayString)}`}>
                        {followUpBucket(selectedConsultation.followUpDate, todayString) === "overdue"
                          ? "⚠ Overdue — needs attention"
                          : followUpBucket(selectedConsultation.followUpDate, todayString) === "today"
                            ? "● Due today"
                            : followUpBucket(selectedConsultation.followUpDate, todayString) === "tomorrow"
                              ? "○ Due tomorrow"
                              : `○ Scheduled for ${formatFollowUpDate(selectedConsultation.followUpDate)}`}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* NOTES */}

              <div className="detail-section">

                <h3 className="detail-title">
                  Consultation Notes
                </h3>

                <textarea
                  className="notes"
                  placeholder="Add notes about this consultation..."
                  value={selectedConsultation.notes}
                  onChange={(event) =>
                    updateNotes(event.target.value)
                  }
                />

                <button
                  className="save-notes"
                  onClick={saveNotes}
                >
                  Save Notes
                </button>

                {notesSaved && (
                  <div className="saved-message">
                    ✓ Notes saved
                  </div>
                )}

              </div>

              {/* ACTIONS */}

              <div className="actions">

                <button
                  className="manual-slot-button"
                  onClick={openManualComplete}
                  disabled={manualSaving}
                >
                  + Add Manual Slot
                </button>

                <div className="consultation-primary-actions">
                  <button
                    className="complete-button"
                    disabled={
                      selectedConsultation.status ===
                      "Completed"
                    }
                    onClick={completeConsultation}
                  >
                    {selectedConsultation.status ===
                    "Completed"
                      ? "✓ Completed"
                      : "Mark Completed"}
                  </button>

                  <button
                    className="cancel-consultation-button"
                    disabled={
                      manualSaving ||
                      selectedConsultation.status === "Completed" ||
                      selectedConsultation.status === "Cancelled" ||
                      !selectedConsultation.id
                    }
                    onClick={openCancelConsultation}
                  >
                    {selectedConsultation.status === "Cancelled"
                      ? "✓ Cancelled"
                      : "Cancel Consultation"}
                  </button>
                </div>

                <div className="secondary-actions">

                  <button
                    className="secondary-button"
                    onClick={() =>
                      window.open(
                        `mailto:${selectedConsultation.email}`,
                        "_blank"
                      )
                    }
                  >
                    ✉ Email
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() =>
                      window.open(
                        `https://wa.me/${selectedConsultation.phone.replace(
                          /\D/g,
                          ""
                        )}`,
                        "_blank"
                      )
                    }
                  >
                    WhatsApp
                  </button>

                </div>

              </div>

            </aside>
          )}

        </div>

        {showCancelConsultation && selectedConsultation && (
          <div className="manual-modal-backdrop">
            <div className="manual-modal cancel-modal">
              <div className="manual-modal-header">
                <div>
                  <h2>Cancel Consultation</h2>
                  <p>
                    Cancel the scheduled consultation for this client. A cancellation
                    note is required so you can keep a clear record of why it was cancelled.
                  </p>
                </div>

                <button
                  type="button"
                  className="manual-modal-close"
                  disabled={manualSaving}
                  onClick={() => setShowCancelConsultation(false)}
                >
                  ×
                </button>
              </div>

              <div className="manual-modal-body">
                <div className="manual-modal-person">
                  <div className="manual-modal-person-name">
                    {selectedConsultation.studentName}
                  </div>
                  <div className="manual-modal-person-payment">
                    Payment: {selectedConsultation.paymentId || "—"}
                  </div>
                </div>

                <div className="cancel-warning-note">
                  <strong>Important:</strong> This will change the consultation status to
                  <strong> Cancelled</strong>. The payment will remain unchanged.
                </div>

                <div className="cancel-note-field">
                  <label
                    className="manual-field-label"
                    htmlFor="cancellation-note"
                  >
                    Cancellation Note / Reason
                  </label>
                  <textarea
                    id="cancellation-note"
                    className="manual-textarea"
                    value={cancellationNote}
                    onChange={(event) => setCancellationNote(event.target.value)}
                    placeholder="Example: Client requested cancellation due to personal reasons."
                    rows={5}
                    maxLength={1000}
                    disabled={manualSaving}
                  />
                  <div className="cancel-note-counter">
                    {cancellationNote.length}/1000
                  </div>
                </div>

                <div className="manual-modal-actions">
                  <button
                    type="button"
                    className="manual-cancel-button"
                    disabled={manualSaving}
                    onClick={() => setShowCancelConsultation(false)}
                  >
                    Keep Consultation
                  </button>

                  <button
                    type="button"
                    className="cancel-confirm-button"
                    disabled={manualSaving || !cancellationNote.trim()}
                    onClick={cancelConsultation}
                  >
                    {manualSaving ? "Cancelling..." : "Cancel Consultation"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showManualComplete && selectedConsultation && (
          <div
            className="manual-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !manualSaving) {
                setShowManualComplete(false);
              }
            }}
          >
            <div className="manual-modal" role="dialog" aria-modal="true" aria-labelledby="manual-consultation-title">
              <div className="manual-modal-header">
                <div>
                  <h2 id="manual-consultation-title" className="manual-modal-title">
                    Add Manual Consultation Slot
                  </h2>
                  <p className="manual-modal-subtitle">
                    This payment does not have a consultation booking yet. Add the actual slot, then choose whether the consultation is already completed.
                  </p>
                </div>

                <button
                  type="button"
                  className="manual-modal-close"
                  disabled={manualSaving}
                  onClick={() => setShowManualComplete(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="manual-modal-body">
                <div className="manual-modal-person">
                  <div className="manual-modal-person-name">
                    {selectedConsultation.studentName}
                  </div>
                  <div className="manual-modal-person-payment">
                    Payment: {selectedConsultation.paymentId || "—"}
                  </div>
                </div>

                <div className="manual-field-row">
                  <div>
                    <label className="manual-field-label" htmlFor="manual-consultation-date">
                      Consultation Date
                    </label>
                    <input
                      id="manual-consultation-date"
                      className="manual-input"
                      type="date"
                      value={manualDate}
                      onChange={(event) => setManualDate(event.target.value)}
                      disabled={manualSaving}
                    />
                  </div>

                  <div>
                    <label className="manual-field-label" htmlFor="manual-consultation-time">
                      Consultation Time
                    </label>
                    <input
                      id="manual-consultation-time"
                      className="manual-input"
                      type="time"
                      value={manualTime}
                      onChange={(event) => setManualTime(event.target.value)}
                      disabled={manualSaving}
                    />
                  </div>
                </div>

                <div className="manual-modal-note">
                  <strong>Save:</strong> creates/updates the slot as <strong>Scheduled</strong>. You can complete it later.
                  <br />
                  <strong>Save &amp; Mark Completed:</strong> creates/updates the slot as <strong>Completed</strong>. A recording is not required.
                </div>

                <div className="manual-modal-actions">
                  <button
                    type="button"
                    className="manual-cancel-button"
                    disabled={manualSaving}
                    onClick={() => setShowManualComplete(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="manual-save-only-button"
                    disabled={manualSaving}
                    onClick={() => saveManualConsultation(false)}
                  >
                    {manualSaving ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    className="manual-save-button"
                    disabled={manualSaving}
                    onClick={() => saveManualConsultation(true)}
                  >
                    {manualSaving ? "Saving..." : "Save & Mark Completed"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}