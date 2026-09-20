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

type Consultation = {
  id: string;

  /* CUSTOMER */
  customerId: string;
  studentName: string;
  email: string;
  phone: string;

  /* PAYMENT */
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

  const [view, setView] =
    useState<"list" | "calendar">("list");

  const [page, setPage] = useState(1);

  const [notesSaved, setNotesSaved] =
    useState(false);

  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] =
    useState(false);


  const perPage = 15;

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
      const bookingByPaymentId = new Map<string, any>();
      const bookingByCustomerId = new Map<string, any>();

      bookingRows.forEach((row: any) => {
        if (row.payment_id) {
          bookingByPaymentId.set(String(row.payment_id), row);
        }
        if (row.customer_id) {
          bookingByCustomerId.set(String(row.customer_id), row);
        }
      });

      const rows = (paymentsResult.data || []).map((payment: any, index: number): Consultation => {
        const paymentId = String(payment.payment_id || payment.id || "");
        const customerId = String(payment.customer_id || "");
        const customer = customerMap.get(customerId) || {};
        const booking = bookingByPaymentId.get(paymentId) || bookingByCustomerId.get(customerId);
        // A consultation record can exist without a booking slot (for example,
        // historical/manual records). Treat any real consultation row as a
        // consultation when it has status/completion/payment metadata, so a
        // manually completed historical record does not fall back to Pending.
        const hasBooking = Boolean(
          booking &&
          (
            booking.booking_date ||
            booking.booking_time ||
            booking.meet_link ||
            booking.status ||
            booking.completed_at ||
            booking.recording_link
          )
        );

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

        return {
          id: String(booking?.id || payment.id || `${paymentId}-${index}`),
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
          bookingDate: hasBooking ? String(booking?.booking_date || "") : "",
          bookingTime: hasBooking ? String(booking?.booking_time || "") : "",
          status: hasBooking ? (booking?.recording_link ? "Completed" : validBookingStatus) as ConsultationStatus : "Pending",
          meetLink: String(booking?.meet_link || ""),
          recordingLink: booking?.recording_link ? String(booking.recording_link) : null,
          notes: String(booking?.notes || ""),
          followUpRequired: Boolean(booking?.follow_up_required),
          followUpDate: booking?.follow_up_date ? String(booking.follow_up_date) : null,
          completedAt: booking?.completed_at ? String(booking.completed_at) : null,
        };
      });

      // Always show the latest CONSULTATION date/time first.
      // Do not use new Date(`${date}T${time}`) here because booking_time can
      // be stored as a 12-hour value such as "09:30 AM", which makes that
      // ISO string invalid in JavaScript and incorrectly falls back to payment time.
      rows.sort((a, b) => {
        const getSortKey = (item: Consultation) => {
          // Prefer the actual consultation/booking date.
          if (item.bookingDate) {
            let minutes = 0;
            const rawTime = String(item.bookingTime || "").trim();

            if (rawTime) {
              const match12 = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
              const match24 = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

              if (match12) {
                let hour = Number(match12[1]);
                const minute = Number(match12[2]);
                const period = match12[3].toUpperCase();
                if (hour === 12) hour = 0;
                if (period === "PM") hour += 12;
                minutes = hour * 60 + minute;
              } else if (match24) {
                minutes = Number(match24[1]) * 60 + Number(match24[2]);
              }
            }

            // YYYY-MM-DD sorts chronologically as a string.
            return `${item.bookingDate}T${String(minutes).padStart(4, "0")}`;
          }

          // Rows without a consultation date fall back to payment timestamp.
          const paymentTime = item.paymentTime
            ? new Date(item.paymentTime).getTime()
            : 0;
          return Number.isFinite(paymentTime) ? paymentTime : 0;
        };

        const aKey = getSortKey(a);
        const bKey = getSortKey(b);

        if (typeof aKey === "string" && typeof bKey === "string") {
          return bKey.localeCompare(aKey);
        }
        if (typeof aKey === "string") return -1;
        if (typeof bKey === "string") return 1;
        return bKey - aKey;
      });

      setConsultations(rows);
      // IMPORTANT: do not auto-select a user. Details appear only after clicking a row.
      setSelectedId((current) => current && rows.some((item) => item.id === current) ? current : null);

      // Keep recorded bookings synchronized as Completed.
      const needsCompletionSync = rows.filter(
        (item) => item.recordingLink && item.status === "Completed"
      ).filter((item) => {
        const originalRow = bookingRows.find((row: any) => String(row.id) === item.id);
        return originalRow && String(originalRow.status || "") !== "Completed";
      });

      if (needsCompletionSync.length > 0) {
        const completedAt = new Date().toISOString();
        const { error: completionSyncError } = await supabase
          .from("consultations")
          .update({ status: "Completed", completed_at: completedAt })
          .in("id", needsCompletionSync.map((item) => item.id));

        if (completionSyncError) {
          console.error("Failed to sync recorded consultations as completed:", completionSyncError);
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
      return consultations.filter(
        (consultation) => {
          const searchValue =
            search.toLowerCase().trim();

          const matchesSearch =
            !searchValue ||
            consultation.studentName
              .toLowerCase()
              .includes(searchValue) ||
            consultation.email
              .toLowerCase()
              .includes(searchValue) ||
            consultation.phone
              .toLowerCase()
              .includes(searchValue) ||
            consultation.paymentId
              .toLowerCase()
              .includes(searchValue);

          const matchesStatus =
            statusFilter === "All" ||
            consultation.status ===
              statusFilter;

          let matchesDate = true;

          if (dateFilter === "Today") {
            matchesDate =
              consultation.bookingDate ===
              todayString;
          }

          if (dateFilter === "Upcoming") {
            matchesDate =
              Boolean(consultation.bookingDate) &&
              consultation.bookingDate >= todayString &&
              consultation.status !== "Completed" &&
              consultation.status !== "Cancelled";
          }

          if (dateFilter === "Past") {
            matchesDate =
              consultation.bookingDate <
              todayString;
          }

          return (
            matchesSearch &&
            matchesStatus &&
            matchesDate
          );
        }
      );
    }, [
      consultations,
      search,
      statusFilter,
      dateFilter,
      todayString,
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
    consultations.filter(
      (item) =>
        item.bookingDate >= todayString &&
        item.status !== "Completed" &&
        item.status !== "Cancelled"
    ).length;

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

  async function completeConsultation() {
    if (!selectedConsultation) return;

    if (selectedConsultation.status === "Completed") return;

    const confirmed = window.confirm(
      `Mark ${selectedConsultation.studentName}'s consultation as completed?`
    );

    if (!confirmed) return;

    const completedAt = new Date().toISOString();

    setConsultations((current) => current.map((consultation) => consultation.id === selectedConsultation.id ? { ...consultation, status: "Completed", completedAt } : consultation));

    const { error } = await supabase
      .from("consultations")
      .update({ status: "Completed", completed_at: completedAt })
      .eq("id", selectedConsultation.id);

    if (error) {
      console.error("Failed to complete consultation:", error);
      alert(`Could not update consultation: ${error.message}`);
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

        .complete-button {
          width: 100%;
          height: 40px;
          border: 1px solid rgba(255, 23, 68, .35);
          border-radius: 8px;
          background: #ff1744;
          color: white;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(255, 23, 68, .10);
        }

        .complete-button:hover:not(:disabled) {
          background: #ff3158;
          box-shadow: 0 10px 30px rgba(255, 23, 68, .18);
        }

        .complete-button:disabled {
          background: rgba(52, 211, 153, .10);
          border-color: rgba(52, 211, 153, .18);
          color: #6ee7b7;
          cursor: default;
          box-shadow: none;
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
                  ? "All Consultations"
                  : "Consultation Calendar"}
              </h2>

              <div className="result-count">
                {filteredConsultations.length}{" "}
                consultations
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
                          (consultation) => (
                            <tr
                              key={
                                consultation.id
                              }
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
                  className="complete-button"
                  disabled={
                    selectedConsultation.status ===
                    "Completed"
                  }
                  onClick={completeConsultation}
                >
                  {selectedConsultation.status ===
                  "Completed"
                    ? "✓ Consultation Completed"
                    : "Mark Consultation Completed"}
                </button>

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

      </div>
    </div>
  );
}