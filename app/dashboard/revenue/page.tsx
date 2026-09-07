"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* ============================================================
   TYPES
============================================================ */

type Customer = {
  id: string;
  name: string | null;
  course: string | null;
  batch: string | null;
};

type Payment = {
  id: string;
  customer_id: string | null;
  payment_id: string | null;
  amount: number | string | null;
  status: string | null;
  payment_time: string | null;
  course?: string | null;
  batch?: string | null;
};

type RevenuePayment = {
  id: string;
  customerId: string;
  paymentId: string;
  amount: number;
  course: string;
  batch: string;
  paymentTime: string;
};

type BatchSummary = {
  batch: string;
  revenue: number;
  people: number;
};

type CourseSummary = {
  course: string;
  revenue: number;
  batches: BatchSummary[];
};

type FilterKey =
  | "today"
  | "month"
  | "7"
  | "30"
  | "60"
  | "90"
  | "6m"
  | "12m"
  | "all"
  | "custom";

/* ============================================================
   CONSTANTS
============================================================ */

const SUCCESS_STATUSES = new Set([
  "captured",
  "paid",
  "success",
  "successful",
]);

const FILTERS: {
  key: FilterKey;
  label: string;
}[] = [
  { key: "today", label: "Today" },
  { key: "month", label: "This Month" },
  { key: "7", label: "7 Days" },
  { key: "30", label: "30 Days" },
  { key: "60", label: "60 Days" },
  { key: "90", label: "90 Days" },
  { key: "6m", label: "6 Months" },
  { key: "12m", label: "12 Months" },
  { key: "all", label: "All Time" },
];

/* ============================================================
   HELPERS
============================================================ */

function clean(value: unknown) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStartOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function getEndOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(23, 59, 59, 999);

  return result;
}

function getCurrentMonthRangeIST(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = Number(
    parts.find((part) => part.type === "year")?.value ||
      now.getUTCFullYear()
  );

  const month = Number(
    parts.find((part) => part.type === "month")?.value ||
      now.getUTCMonth() + 1
  );

  // IST is UTC+05:30. These are UTC instants representing
  // midnight on the first day of the current/next month in India.
  const from = new Date(
    Date.UTC(year, month - 1, 1, -5, -30, 0, 0)
  );

  const to = new Date(
    Date.UTC(year, month, 1, -5, -30, 0, 0)
  );

  return { from, to };
}

function getPaymentKey(payment: Payment) {
  return (
    clean(payment.payment_id) ||
    clean(payment.id)
  );
}

/*
 * Correct numeric batch sorting.
 *
 * 1
 * 2
 * 3
 * 05
 * 10
 *
 * instead of:
 *
 * 1
 * 10
 * 2
 * 3
 */
function compareBatches(
  a: string,
  b: string
) {
  const aNumber = Number(
    a.replace(/\D/g, "")
  );

  const bNumber = Number(
    b.replace(/\D/g, "")
  );

  const aHasNumber =
    Number.isFinite(aNumber) &&
    a.replace(/\D/g, "") !== "";

  const bHasNumber =
    Number.isFinite(bNumber) &&
    b.replace(/\D/g, "") !== "";

  if (aHasNumber && bHasNumber) {
    return aNumber - bNumber;
  }

  return a.localeCompare(
    b,
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function displayBatch(batch: string) {
  const value = clean(batch);

  if (!value) {
    return "Unknown";
  }

  if (/^batch[\s-_]*/i.test(value)) {
    return value
      .replace(/^batch[\s-_]*/i, "")
      .trim();
  }

  return value;
}

/* ============================================================
   ANIMATED NUMBER
============================================================ */

function AnimatedNumber({
  value,
  loading,
  currency = false,
}: {
  value: number;
  loading: boolean;
  currency?: boolean;
}) {
  const [animatedValue, setAnimatedValue] =
    useState(0);

  useEffect(() => {
    if (loading) {
      return;
    }

    const duration = 900;
    const startTime = performance.now();
    const startValue = animatedValue;

    let frame = 0;

    const animate = (
      currentTime: number
    ) => {
      const progress = Math.min(
        (currentTime - startTime) /
          duration,
        1
      );

      const eased =
        1 -
        Math.pow(
          1 - progress,
          3
        );

      setAnimatedValue(
        startValue +
          (value - startValue) *
            eased
      );

      if (progress < 1) {
        frame =
          requestAnimationFrame(
            animate
          );
      }
    };

    frame =
      requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, loading]);

  if (loading) {
    return <span>—</span>;
  }

  if (currency) {
    return (
      <span>
        {formatCurrency(animatedValue)}
      </span>
    );
  }

  return (
    <span>
      {Math.round(
        animatedValue
      ).toLocaleString("en-IN")}
    </span>
  );
}

/* ============================================================
   PAGE
============================================================ */

export default function RevenuePage() {
  const router = useRouter();

  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [payments, setPayments] =
    useState<Payment[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [filter, setFilter] =
    useState<FilterKey>("30");

  const [customFrom, setCustomFrom] =
    useState("");

  const [customTo, setCustomTo] =
    useState("");

  const [showCustom, setShowCustom] =
    useState(false);

  /* ==========================================================
     LOAD DATA
  ========================================================== */

  async function loadRevenue(
    isRefresh = false
  ) {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const {
        data: customerData,
        error: customerError,
      } = await supabase
        .from("customers")
        .select(
          "id, name, course, batch"
        );

      if (customerError) {
        console.error(
          "Customer error:",
          customerError
        );

        return;
      }

      const {
        data: paymentData,
        error: paymentError,
      } = await supabase
        .from("payments")
        .select(
          "id, customer_id, payment_id, amount, status, payment_time, course, batch"
        );

      if (paymentError) {
        console.error(
          "Payment error:",
          paymentError
        );

        return;
      }

      setCustomers(
        (customerData ||
          []) as Customer[]
      );

      setPayments(
        (paymentData ||
          []) as Payment[]
      );
    } catch (error) {
      console.error(
        "Revenue loading error:",
        error
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  /* ==========================================================
     INITIAL + REALTIME
  ========================================================== */

  useEffect(() => {
    loadRevenue();

    const customerChannel =
      supabase
        .channel(
          "devilx-revenue-customer-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "customers",
          },
          () => {
            loadRevenue(true);
          }
        )
        .subscribe();

    const paymentChannel =
      supabase
        .channel(
          "devilx-revenue-payment-live"
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "payments",
          },
          () => {
            loadRevenue(true);
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        customerChannel
      );

      supabase.removeChannel(
        paymentChannel
      );
    };
  }, []);

  /* ==========================================================
     CUSTOMER MAP
  ========================================================== */

  const customerMap = useMemo(() => {
    const map = new Map<
      string,
      Customer
    >();

    customers.forEach((customer) => {
      map.set(
        customer.id,
        customer
      );
    });

    return map;
  }, [customers]);

  /* ==========================================================
     CLEAN PAYMENTS
  ========================================================== */

  const revenuePayments =
    useMemo<RevenuePayment[]>(() => {
      const seen = new Set<string>();

      const result: RevenuePayment[] =
        [];

      for (const payment of payments) {
        const status = clean(
          payment.status
        ).toLowerCase();

        if (
          !SUCCESS_STATUSES.has(status)
        ) {
          continue;
        }

        const paymentKey =
          getPaymentKey(payment);

        if (
          !paymentKey ||
          seen.has(paymentKey)
        ) {
          continue;
        }

        const paymentDate =
          payment.payment_time
            ? new Date(
                payment.payment_time
              )
            : null;

        if (
          !paymentDate ||
          Number.isNaN(
            paymentDate.getTime()
          )
        ) {
          continue;
        }

        const amount = Number(
          payment.amount || 0
        );

        if (
          !Number.isFinite(amount)
        ) {
          continue;
        }

        seen.add(paymentKey);

        const customer =
          payment.customer_id
            ? customerMap.get(
                payment.customer_id
              )
            : undefined;

        /*
         * CURRENT DATA RULE:
         * Payment-level course/batch are authoritative because a customer
         * can have payments for different courses/batches. Customer values
         * are used only as a legacy fallback when payment-level values are
         * missing.
         */
        const course =
          clean(payment.course) ||
          clean(customer?.course) ||
          "Unknown Course";

        const rawBatch =
          clean(payment.batch) ||
          clean(customer?.batch) ||
          "Unknown Batch";

        const batch =
          course.toLowerCase() === "consultation"
            ? "No Batch"
            : rawBatch;

        result.push({
          id: clean(payment.id),
          customerId: clean(
            payment.customer_id
          ),
          paymentId: paymentKey,
          amount,
          course,
          batch,
          paymentTime:
            paymentDate.toISOString(),
        });
      }

      return result;
    }, [
      payments,
      customerMap,
    ]);

  /* ==========================================================
     DATE RANGE
  ========================================================== */

  const dateRange = useMemo(() => {
    const now = new Date();

    if (filter === "all") {
      return {
        from: null,
        to: null,
      };
    }

    if (filter === "custom") {
      if (
        !customFrom ||
        !customTo
      ) {
        return {
          from: null,
          to: null,
        };
      }

      return {
        from: new Date(
          `${customFrom}T00:00:00`
        ),
        to: new Date(
          `${customTo}T23:59:59.999`
        ),
      };
    }

    if (filter === "month") {
      const { from, to } = getCurrentMonthRangeIST(now);

      return {
        from,
        to: new Date(Math.min(to.getTime() - 1, now.getTime())),
      };
    }

    if (filter === "today") {
      return {
        from: getStartOfDay(now),
        to: getEndOfDay(now),
      };
    }

    if (
      filter === "7" ||
      filter === "30" ||
      filter === "60" ||
      filter === "90"
    ) {
      const days = Number(filter);

      const from =
        getStartOfDay(now);

      from.setDate(
        from.getDate() -
          (days - 1)
      );

      return {
        from,
        to: getEndOfDay(now),
      };
    }

    if (filter === "6m") {
      const from =
        getStartOfDay(now);

      from.setMonth(
        from.getMonth() - 6
      );

      return {
        from,
        to: getEndOfDay(now),
      };
    }

    if (filter === "12m") {
      const from =
        getStartOfDay(now);

      from.setMonth(
        from.getMonth() - 12
      );

      return {
        from,
        to: getEndOfDay(now),
      };
    }

    return {
      from: null,
      to: null,
    };
  }, [
    filter,
    customFrom,
    customTo,
  ]);

  /* ==========================================================
     FILTERED PAYMENTS
  ========================================================== */

  const filteredPayments =
    useMemo(() => {
      if (
        filter === "custom" &&
        (!customFrom ||
          !customTo)
      ) {
        return [];
      }

      return revenuePayments.filter(
        (payment) => {
          if (
            !dateRange.from ||
            !dateRange.to
          ) {
            return true;
          }

          const date =
            new Date(
              payment.paymentTime
            );

          return (
            date >= dateRange.from &&
            date <= dateRange.to
          );
        }
      );
    }, [
      revenuePayments,
      dateRange,
      filter,
      customFrom,
      customTo,
    ]);

  /* ==========================================================
     TOTAL REVENUE
  ========================================================== */

  const totalRevenue =
    useMemo(() => {
      return filteredPayments.reduce(
        (sum, payment) =>
          sum + payment.amount,
        0
      );
    }, [filteredPayments]);

  /* ==========================================================
     TOTAL PEOPLE
  ========================================================== */

  const totalPeople =
    useMemo(() => {
      return new Set(
        filteredPayments
          .map(
            (payment) =>
              payment.customerId
          )
          .filter(Boolean)
      ).size;
    }, [filteredPayments]);

  /* ==========================================================
     COURSE + BATCH DATA
  ========================================================== */

  const courseSummaries =
    useMemo<CourseSummary[]>(() => {
      const courseMap =
        new Map<
          string,
          {
            course: string;
            revenue: number;
            batches: Map<
              string,
              {
                revenue: number;
                people: Set<string>;
              }
            >;
          }
        >();

      filteredPayments.forEach(
        (payment) => {
          if (
            !courseMap.has(
              payment.course
            )
          ) {
            courseMap.set(
              payment.course,
              {
                course:
                  payment.course,
                revenue: 0,
                batches:
                  new Map(),
              }
            );
          }

          const course =
            courseMap.get(
              payment.course
            )!;

          course.revenue +=
            payment.amount;

          if (
            !course.batches.has(
              payment.batch
            )
          ) {
            course.batches.set(
              payment.batch,
              {
                revenue: 0,
                people:
                  new Set<string>(),
              }
            );
          }

          const batch =
            course.batches.get(
              payment.batch
            )!;

          batch.revenue +=
            payment.amount;

          if (
            payment.customerId
          ) {
            batch.people.add(
              payment.customerId
            );
          }
        }
      );

      return Array.from(
        courseMap.values()
      )
        .map((course) => ({
          course: course.course,
          revenue: course.revenue,
          batches: Array.from(
            course.batches.entries()
          )
            .map(
              ([
                batch,
                data,
              ]) => ({
                batch,
                revenue:
                  data.revenue,
                people:
                  data.people.size,
              })
            )
            .sort((a, b) =>
              compareBatches(
                a.batch,
                b.batch
              )
            ),
        }))
        .sort(
          (a, b) =>
            b.revenue -
            a.revenue
        );
    }, [filteredPayments]);

  /* ==========================================================
     PERIOD LABEL
  ========================================================== */

  const periodLabel =
    useMemo(() => {
      if (filter === "today")
        return "Today";

      if (filter === "month")
        return "This Month";

      if (filter === "7")
        return "Last 7 Days";

      if (filter === "30")
        return "Last 30 Days";

      if (filter === "60")
        return "Last 60 Days";

      if (filter === "90")
        return "Last 90 Days";

      if (filter === "6m")
        return "Last 6 Months";

      if (filter === "12m")
        return "Last 12 Months";

      if (filter === "all")
        return "All Time";

      if (
        filter === "custom" &&
        customFrom &&
        customTo
      ) {
        return `${formatDisplayDate(
          new Date(
            `${customFrom}T00:00:00`
          )
        )} — ${formatDisplayDate(
          new Date(
            `${customTo}T00:00:00`
          )
        )}`;
      }

      return "Select Date Range";
    }, [
      filter,
      customFrom,
      customTo,
    ]);

  /* ==========================================================
     HANDLERS
  ========================================================== */

  function selectFilter(
    value: FilterKey
  ) {
    setFilter(value);

    if (value === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
    }
  }

  function applyCustomRange() {
    if (
      !customFrom ||
      !customTo
    ) {
      return;
    }

    if (
      new Date(customFrom) >
      new Date(customTo)
    ) {
      return;
    }

    setFilter("custom");
    setShowCustom(false);
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #050505;
        }

        body {
          color: #fff;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button,
        input {
          font: inherit;
        }

        /* =====================================================
           PAGE
        ===================================================== */

        .page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          padding: 28px 32px 60px;

          background:
            radial-gradient(
              650px 420px at 90% -10%,
              rgba(
                239,
                68,
                68,
                0.13
              ),
              transparent 68%
            ),
            radial-gradient(
              500px 350px at -10% 45%,
              rgba(
                255,
                255,
                255,
                0.025
              ),
              transparent 70%
            ),
            #050505;
        }

        .page::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;

          background-image:
            linear-gradient(
              rgba(
                255,
                255,
                255,
                0.018
              )
                1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(
                255,
                255,
                255,
                0.018
              )
                1px,
              transparent 1px
            );

          background-size: 42px 42px;

          mask-image: linear-gradient(
            to bottom,
            black 0%,
            transparent 85%
          );
        }

        .container {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        /* =====================================================
           TOP
        ===================================================== */

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 32px;
        }

        .back {
          display: inline-flex;
          align-items: center;
          gap: 8px;

          height: 38px;
          padding: 0 13px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );

          border-radius: 9px;

          background:
            linear-gradient(
              145deg,
              rgba(
                255,
                255,
                255,
                0.04
              ),
              rgba(
                255,
                255,
                255,
                0.01
              )
            );

          color: #858585;

          font-size: 11px;
          font-weight: 700;

          cursor: pointer;

          transition: 0.25s ease;
        }

        .back:hover {
          color: #fff;
          transform: translateX(-3px);

          border-color:
            rgba(
              239,
              68,
              68,
              0.3
            );

          box-shadow:
            0 10px 30px
              rgba(
                0,
                0,
                0,
                0.3
              );
        }

        .back-icon {
          font-size: 19px;
          line-height: 1;
        }

        .live {
          display: inline-flex;
          align-items: center;
          gap: 8px;

          padding: 8px 11px;

          border: 1px solid
            rgba(
              34,
              197,
              94,
              0.14
            );

          border-radius: 999px;

          background:
            rgba(
              34,
              197,
              94,
              0.035
            );

          color: #676767;

          font-size: 8px;
          font-weight: 800;

          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .live-dot {
          width: 6px;
          height: 6px;

          border-radius: 50%;

          background: #22c55e;

          box-shadow:
            0 0 0 4px
              rgba(
                34,
                197,
                94,
                0.07
              ),
            0 0 13px
              rgba(
                34,
                197,
                94,
                0.8
              );

          animation:
            pulse 1.8s
              ease-in-out infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.85);
          }

          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* =====================================================
           HEADER
        ===================================================== */

        .header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 30px;

          margin-bottom: 24px;

          animation:
            slideUp 0.65s
              cubic-bezier(
                0.16,
                1,
                0.3,
                1
              );
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(
              15px
            );
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            );
          }
        }

        .eyebrow {
          color: #4f4f4f;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 2px;
          text-transform: uppercase;

          margin-bottom: 8px;
        }

        .title {
          margin: 0;

          font-size: clamp(
            36px,
            5vw,
            52px
          );

          line-height: 0.9;
          font-weight: 950;
          letter-spacing: -3px;

          background:
            linear-gradient(
              180deg,
              #fff,
              #888
            );

          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .red-line {
          width: 48px;
          height: 3px;

          margin-top: 13px;

          border-radius: 20px;

          background: #ef4444;

          box-shadow:
            0 0 18px
              rgba(
                239,
                68,
                68,
                0.65
              );
        }

        .period {
          text-align: right;
        }

        .period-label {
          color: #484848;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .period-value {
          margin-top: 5px;
          color: #bbb;
          font-size: 11px;
          font-weight: 650;
        }

        /* =====================================================
           FILTER
        ===================================================== */

        .filters {
          margin-bottom: 19px;

          padding: 8px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.065
            );

          border-radius: 13px;

          background:
            linear-gradient(
              135deg,
              rgba(
                255,
                255,
                255,
                0.035
              ),
              rgba(
                255,
                255,
                255,
                0.008
              )
            );

          box-shadow:
            0 18px 50px
              rgba(
                0,
                0,
                0,
                0.25
              ),
            inset 0 1px 0
              rgba(
                255,
                255,
                255,
                0.03
              );

          backdrop-filter: blur(15px);
        }

        .filter-row {
          display: flex;
          align-items: center;
          gap: 4px;

          overflow-x: auto;

          scrollbar-width: none;
        }

        .filter-row::-webkit-scrollbar {
          display: none;
        }

        .filter {
          flex: 0 0 auto;

          height: 35px;
          padding: 0 13px;

          border: 1px solid transparent;
          border-radius: 8px;

          background: transparent;

          color: #666;

          font-size: 10px;
          font-weight: 750;

          cursor: pointer;

          transition: 0.22s ease;
        }

        .filter:hover {
          color: #ddd;
          background:
            rgba(
              255,
              255,
              255,
              0.035
            );
        }

        .filter.active {
          color: #fff;

          border-color:
            rgba(
              239,
              68,
              68,
              0.25
            );

          background:
            linear-gradient(
              135deg,
              rgba(
                239,
                68,
                68,
                0.14
              ),
              rgba(
                239,
                68,
                68,
                0.035
              )
            );

          box-shadow:
            0 0 20px
              rgba(
                239,
                68,
                68,
                0.045
              );
        }

        .filter.active::before {
          content: "";

          display: inline-block;

          width: 4px;
          height: 4px;

          margin-right: 7px;

          vertical-align: middle;

          border-radius: 50%;

          background: #ef4444;

          box-shadow:
            0 0 10px
              rgba(
                239,
                68,
                68,
                0.8
              );
        }

        .filter-divider {
          width: 1px;
          height: 20px;

          margin: 0 5px;

          background: #242424;
        }

        .custom {
          flex: 0 0 auto;

          height: 35px;
          padding: 0 12px;

          display: inline-flex;
          align-items: center;
          gap: 7px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );

          border-radius: 8px;

          background:
            rgba(
              255,
              255,
              255,
              0.025
            );

          color: #777;

          font-size: 10px;
          font-weight: 750;

          cursor: pointer;

          transition: 0.22s ease;
        }

        .custom:hover,
        .custom.active {
          color: #fff;

          border-color:
            rgba(
              239,
              68,
              68,
              0.25
            );

          background:
            rgba(
              239,
              68,
              68,
              0.06
            );
        }

        .calendar {
          color: #ef4444;
        }

        /* =====================================================
           CUSTOM DATES
        ===================================================== */

        .custom-panel {
          display: grid;

          grid-template-columns:
            1fr 1fr auto;

          gap: 10px;

          padding: 11px 3px 2px;

          margin-top: 9px;

          border-top: 1px solid
            rgba(
              255,
              255,
              255,
              0.05
            );

          animation:
            fadeIn 0.25s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(
              -4px
            );
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            );
          }
        }

        .date-label {
          display: block;

          margin-bottom: 5px;

          color: #505050;

          font-size: 8px;
          font-weight: 800;

          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .date-input {
          width: 100%;
          height: 35px;

          padding: 0 10px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );

          border-radius: 7px;

          outline: none;

          background: #101010;

          color: #bbb;

          font-size: 10px;

          color-scheme: dark;
        }

        .date-input:focus {
          border-color:
            rgba(
              239,
              68,
              68,
              0.35
            );

          box-shadow:
            0 0 0 3px
              rgba(
                239,
                68,
                68,
                0.06
              );
        }

        .apply {
          height: 35px;

          padding: 0 15px;

          border: 0;
          border-radius: 7px;

          background: #ef4444;

          color: #fff;

          font-size: 10px;
          font-weight: 800;

          cursor: pointer;

          transition: 0.2s ease;

          box-shadow:
            0 7px 22px
              rgba(
                239,
                68,
                68,
                0.17
              );
        }

        .apply:hover {
          background: #dc2626;

          transform: translateY(
            -1px
          );

          box-shadow:
            0 10px 28px
              rgba(
                239,
                68,
                68,
                0.25
              );
        }

        /* =====================================================
           SECTION
        ===================================================== */

        .section {
          position: relative;

          margin-bottom: 19px;

          padding: 18px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.06
            );

          border-radius: 15px;

          background:
            linear-gradient(
              145deg,
              rgba(
                255,
                255,
                255,
                0.025
              ),
              rgba(
                255,
                255,
                255,
                0.006
              )
            ),
            #090909;

          box-shadow:
            0 22px 60px
              rgba(
                0,
                0,
                0,
                0.2
              ),
            inset 0 1px 0
              rgba(
                255,
                255,
                255,
                0.025
              );

          animation:
            slideUp 0.65s
              cubic-bezier(
                0.16,
                1,
                0.3,
                1
              );
        }

        .section::before {
          content: "";

          position: absolute;

          top: 0;
          left: 0;

          width: 100px;
          height: 1px;

          background:
            linear-gradient(
              90deg,
              #ef4444,
              transparent
            );

          box-shadow:
            0 0 10px
              rgba(
                239,
                68,
                68,
                0.35
              );
        }

        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;

          margin-bottom: 13px;
        }

        .section-title {
          margin: 0;

          color: #ddd;

          font-size: 12px;
          font-weight: 800;
        }

        .section-meta {
          color: #4b4b4b;

          font-size: 8px;
          font-weight: 800;

          letter-spacing: 1px;
          text-transform: uppercase;
        }

        /* =====================================================
           OVERVIEW CARDS
        ===================================================== */

        .overview {
          display: grid;

          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );

          gap: 11px;
        }

        .overview-card {
          position: relative;

          min-height: 155px;

          overflow: hidden;

          padding: 22px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.075
            );

          border-radius: 12px;

          background:
            radial-gradient(
              230px 130px at
                100% 0%,
              rgba(
                239,
                68,
                68,
                0.09
              ),
              transparent
            ),
            #101010;

          transition:
            transform 0.35s
              cubic-bezier(
                0.16,
                1,
                0.3,
                1
              ),
            border-color 0.3s ease,
            box-shadow 0.3s ease;
        }

        .overview-card:hover {
          transform: translateY(
            -4px
          );

          border-color:
            rgba(
              239,
              68,
              68,
              0.22
            );

          box-shadow:
            0 20px 50px
              rgba(
                0,
                0,
                0,
                0.35
              ),
            0 0 35px
              rgba(
                239,
                68,
                68,
                0.045
              );
        }

        .overview-label {
          color: #626262;

          font-size: 8px;
          font-weight: 850;

          letter-spacing: 1.2px;
          text-transform: uppercase;
        }

        .overview-value {
          margin-top: 13px;

          color: #fff;

          font-size: clamp(
            28px,
            3.5vw,
            40px
          );

          line-height: 1;

          font-weight: 900;

          letter-spacing: -1.7px;
        }

        .overview-sub {
          margin-top: 10px;

          color: #464646;

          font-size: 9px;
        }

        .overview-line {
          position: absolute;

          left: 22px;
          bottom: 19px;

          width: 28px;
          height: 2px;

          border-radius: 20px;

          background: #ef4444;

          box-shadow:
            0 0 15px
              rgba(
                239,
                68,
                68,
                0.65
              );
        }

        /* =====================================================
           COURSE GRID
        ===================================================== */

        .course-grid {
          display: grid;

          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );

          gap: 12px;
        }

        .course-card {
          position: relative;

          overflow: hidden;

          padding: 20px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.065
            );

          border-radius: 13px;

          background:
            linear-gradient(
              145deg,
              rgba(
                255,
                255,
                255,
                0.035
              ),
              rgba(
                255,
                255,
                255,
                0.008
              )
            ),
            #101010;

          opacity: 0;

          animation:
            courseEnter
              0.65s
              cubic-bezier(
                0.16,
                1,
                0.3,
                1
              )
            forwards;

          transition:
            transform 0.35s
              cubic-bezier(
                0.16,
                1,
                0.3,
                1
              ),
            border-color 0.3s ease,
            box-shadow 0.3s ease;
        }

        @keyframes courseEnter {
          from {
            opacity: 0;
            transform:
              translateY(14px)
              scale(0.985);
          }

          to {
            opacity: 1;
            transform:
              translateY(0)
              scale(1);
          }
        }

        .course-card:nth-child(1) {
          animation-delay: 0.05s;
        }

        .course-card:nth-child(2) {
          animation-delay: 0.1s;
        }

        .course-card:nth-child(3) {
          animation-delay: 0.15s;
        }

        .course-card:nth-child(4) {
          animation-delay: 0.2s;
        }

        .course-card:hover {
          transform: translateY(
            -5px
          );

          border-color:
            rgba(
              239,
              68,
              68,
              0.2
            );

          box-shadow:
            0 25px 55px
              rgba(
                0,
                0,
                0,
                0.38
              ),
            0 0 35px
              rgba(
                239,
                68,
                68,
                0.04
              );
        }

        .course-top {
          display: flex;

          align-items: flex-start;

          justify-content: space-between;

          gap: 20px;
        }

        .course-index {
          color: #3e3e3e;

          font-size: 8px;
          font-weight: 850;

          letter-spacing: 1.2px;
        }

        .course-name {
          margin: 5px 0 0;

          color: #f4f4f4;

          font-size: 19px;
          font-weight: 850;

          letter-spacing: -0.6px;
        }

        .course-icon {
          width: 35px;
          height: 35px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid
            rgba(
              239,
              68,
              68,
              0.15
            );

          border-radius: 9px;

          background:
            rgba(
              239,
              68,
              68,
              0.045
            );

          color: #ef4444;

          font-size: 12px;
          font-weight: 900;

          transition: 0.3s ease;
        }

        .course-card:hover
          .course-icon {
          transform:
            rotate(-7deg)
            scale(1.08);

          box-shadow:
            0 0 20px
              rgba(
                239,
                68,
                68,
                0.12
              );
        }

        .course-divider {
          height: 1px;

          margin: 19px 0 15px;

          background:
            rgba(
              255,
              255,
              255,
              0.055
            );
        }

        /* =====================================================
           BATCHES
        ===================================================== */

        .batch-header {
          display: flex;

          align-items: center;

          justify-content: space-between;

          margin-bottom: 9px;
        }

        .batch-title {
          color: #505050;

          font-size: 8px;
          font-weight: 850;

          letter-spacing: 0.9px;

          text-transform: uppercase;
        }

        .batch-count {
          color: #6a6a6a;

          font-size: 8px;
          font-weight: 750;
        }

        .batch-grid {
          display: grid;

          grid-template-columns:
            repeat(
              auto-fit,
              minmax(
                100px,
                1fr
              )
            );

          gap: 7px;
        }

        .batch-card {
          position: relative;

          min-height: 78px;

          padding: 11px;

          overflow: hidden;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.065
            );

          border-radius: 8px;

          background:
            linear-gradient(
              145deg,
              rgba(
                255,
                255,
                255,
                0.025
              ),
              transparent
            ),
            #0d0d0d;

          transition:
            transform 0.25s ease,
            border-color 0.25s ease,
            background 0.25s ease;
        }

        .batch-card:hover {
          transform:
            translateY(-2px);

          border-color:
            rgba(
              239,
              68,
              68,
              0.2
            );

          background:
            rgba(
              239,
              68,
              68,
              0.035
            );
        }

        .batch-number {
          color: #ef4444;

          font-size: 11px;
          font-weight: 850;

          letter-spacing: -0.1px;
        }

        .batch-people {
          margin-top: 4px;

          color: #505050;

          font-size: 7px;
          font-weight: 650;

          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .batch-revenue {
          margin-top: 8px;

          color: #ddd;

          font-size: 11px;
          font-weight: 800;

          letter-spacing: -0.2px;
        }

        .batch-red-dot {
          position: absolute;

          top: 10px;
          right: 10px;

          width: 4px;
          height: 4px;

          border-radius: 50%;

          background: #ef4444;

          box-shadow:
            0 0 9px
              rgba(
                239,
                68,
                68,
                0.8
              );
        }

        /* =====================================================
           COURSE TOTAL
        ===================================================== */

        .course-total {
          display: flex;

          align-items: flex-end;

          justify-content: space-between;

          gap: 20px;

          margin-top: 17px;

          padding-top: 15px;

          border-top: 1px solid
            rgba(
              255,
              255,
              255,
              0.055
            );
        }

        .course-total-label {
          color: #505050;

          font-size: 8px;
          font-weight: 850;

          letter-spacing: 0.9px;

          text-transform: uppercase;
        }

        .course-total-value {
          margin-top: 5px;

          color: #fff;

          font-size: 23px;

          line-height: 1;

          font-weight: 900;

          letter-spacing: -0.8px;
        }

        .course-total-badge {
          display: inline-flex;

          align-items: center;

          gap: 5px;

          padding: 6px 8px;

          border: 1px solid
            rgba(
              239,
              68,
              68,
              0.13
            );

          border-radius: 6px;

          background:
            rgba(
              239,
              68,
              68,
              0.035
            );

          color: #777;

          font-size: 7px;
          font-weight: 750;

          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        /* =====================================================
           EMPTY
        ===================================================== */

        .empty {
          min-height: 210px;

          display: flex;
          flex-direction: column;

          align-items: center;
          justify-content: center;

          border: 1px dashed
            rgba(
              255,
              255,
              255,
              0.08
            );

          border-radius: 10px;
        }

        .empty-icon {
          width: 42px;
          height: 42px;

          display: flex;
          align-items: center;
          justify-content: center;

          margin-bottom: 12px;

          border: 1px solid
            rgba(
              239,
              68,
              68,
              0.15
            );

          border-radius: 10px;

          background:
            rgba(
              239,
              68,
              68,
              0.035
            );

          color: #ef4444;
        }

        .empty-title {
          color: #999;

          font-size: 12px;
          font-weight: 750;
        }

        .empty-text {
          margin-top: 5px;

          color: #4b4b4b;

          font-size: 9px;
        }

        /* =====================================================
           LOADING
        ===================================================== */

        .skeleton-grid {
          display: grid;

          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );

          gap: 12px;
        }

        .skeleton {
          height: 280px;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.04
            );

          border-radius: 13px;

          background:
            linear-gradient(
              100deg,
              #0c0c0c 25%,
              #171717 50%,
              #0c0c0c 75%
            );

          background-size:
            200% 100%;

          animation:
            skeleton 1.4s
              ease-in-out infinite;
        }

        @keyframes skeleton {
          from {
            background-position:
              200% 0;
          }

          to {
            background-position:
              -200% 0;
          }
        }

        /* =====================================================
           RESPONSIVE
        ===================================================== */

        @media (max-width: 900px) {
          .course-grid,
          .skeleton-grid {
            grid-template-columns:
              1fr;
          }
        }

        @media (max-width: 700px) {
          .page {
            padding: 20px 14px
              45px;
          }

          .header {
            align-items: flex-start;

            flex-direction: column;

            gap: 15px;
          }

          .period {
            text-align: left;
          }

          .overview {
            grid-template-columns:
              1fr;
          }

          .custom-panel {
            grid-template-columns:
              1fr;
          }

          .apply {
            width: 100%;
          }

          .section {
            padding: 14px;
          }
        }

        @media (max-width: 450px) {
          .title {
            font-size: 36px;
          }

          .course-total-value {
            font-size: 20px;
          }

          .batch-grid {
            grid-template-columns:
              repeat(2, 1fr);
          }
        }
      `}</style>

      <main className="page">
        <div className="container">

          {/* ==================================================
              TOP BAR
          ================================================== */}

          <div className="topbar">

            <button
              type="button"
              className="back"
              onClick={() =>
                router.back()
              }
            >
              <span className="back-icon">
                ‹
              </span>

              Back
            </button>

            <div className="live">
              <span className="live-dot" />
              Live Revenue
            </div>

          </div>

          {/* ==================================================
              HEADER
          ================================================== */}

          <header className="header">

            <div>
              <div className="eyebrow">
                DevilX / Finance
              </div>

              <h1 className="title">
                REVENUE
              </h1>

              <div className="red-line" />
            </div>

            <div className="period">
              <div className="period-label">
                Selected Period
              </div>

              <div className="period-value">
                {periodLabel}
              </div>
            </div>

          </header>

          {/* ==================================================
              FILTERS
          ================================================== */}

          <section className="filters">

            <div className="filter-row">

              {FILTERS.map(
                (item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`filter ${
                      filter ===
                      item.key
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      selectFilter(
                        item.key
                      )
                    }
                  >
                    {item.label}
                  </button>
                )
              )}

              <div className="filter-divider" />

              <button
                type="button"
                className={`custom ${
                  filter ===
                  "custom"
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  setFilter(
                    "custom"
                  );

                  setShowCustom(
                    (value) =>
                      !value
                  );
                }}
              >
                <span className="calendar">
                  ▣
                </span>

                Custom Date
              </button>

            </div>

            {showCustom && (
              <div className="custom-panel">

                <div>
                  <label className="date-label">
                    From
                  </label>

                  <input
                    type="date"
                    className="date-input"
                    value={
                      customFrom
                    }
                    onChange={(e) =>
                      setCustomFrom(
                        e.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label className="date-label">
                    To
                  </label>

                  <input
                    type="date"
                    className="date-input"
                    value={
                      customTo
                    }
                    onChange={(e) =>
                      setCustomTo(
                        e.target.value
                      )
                    }
                  />
                </div>

                <button
                  type="button"
                  className="apply"
                  onClick={
                    applyCustomRange
                  }
                >
                  Apply Range
                </button>

              </div>
            )}

          </section>

          {/* ==================================================
              OVERVIEW
          ================================================== */}

          <section className="section">

            <div className="section-head">

              <h2 className="section-title">
                Revenue Overview
              </h2>

              <span className="section-meta">
                {refreshing
                  ? "Updating..."
                  : periodLabel}
              </span>

            </div>

            <div className="overview">

              <div className="overview-card">

                <div className="overview-label">
                  Total Revenue
                </div>

                <div className="overview-value">
                  <AnimatedNumber
                    value={
                      totalRevenue
                    }
                    loading={
                      loading
                    }
                    currency
                  />
                </div>

                <div className="overview-sub">
                  Successful payments
                  in selected period
                </div>

                <div className="overview-line" />

              </div>

              <div className="overview-card">

                <div className="overview-label">
                  Total People
                </div>

                <div className="overview-value">
                  <AnimatedNumber
                    value={
                      totalPeople
                    }
                    loading={
                      loading
                    }
                  />
                </div>

                <div className="overview-sub">
                  Unique paying people
                </div>

                <div className="overview-line" />

              </div>

            </div>

          </section>

          {/* ==================================================
              COURSE REVENUE
          ================================================== */}

          <section className="section">

            <div className="section-head">

              <h2 className="section-title">
                Course Revenue
              </h2>

              {!loading && (
                <span className="section-meta">
                  {
                    courseSummaries.length
                  }{" "}
                  Courses
                </span>
              )}

            </div>

            {loading ? (
              <div className="skeleton-grid">
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            ) : courseSummaries.length ===
              0 ? (
              <div className="empty">

                <div className="empty-icon">
                  ₹
                </div>

                <div className="empty-title">
                  No revenue found
                </div>

                <div className="empty-text">
                  No successful
                  payments were found
                  for this period.
                </div>

              </div>
            ) : (
              <div className="course-grid">

                {courseSummaries.map(
                  (
                    course,
                    index
                  ) => (
                    <article
                      className="course-card"
                      key={
                        course.course
                      }
                    >

                      {/* COURSE HEADER */}

                      <div className="course-top">

                        <div>

                          <div className="course-index">
                            COURSE{" "}
                            {String(
                              index +
                                1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </div>

                          <h3 className="course-name">
                            {
                              course.course
                            }
                          </h3>

                        </div>

                        <div className="course-icon">
                          ₹
                        </div>

                      </div>

                      <div className="course-divider" />

                      {/* BATCH HEADER */}

                      <div className="batch-header">

                        <span className="batch-title">
                          Batches
                        </span>

                        <span className="batch-count">
                          {
                            course
                              .batches
                              .length
                          }{" "}
                          Active
                        </span>

                      </div>

                      {/* ACTUAL BATCH NUMBERS */}

                      <div className="batch-grid">

                        {course.batches.map(
                          (
                            batch
                          ) => (
                            <div
                              className="batch-card"
                              key={
                                batch.batch
                              }
                            >

                              <span className="batch-red-dot" />

                              <div className="batch-number">
                                BATCH{" "}
                                {
                                  displayBatch(
                                    batch.batch
                                  )
                                }
                              </div>

                              <div className="batch-people">
                                {
                                  batch.people
                                }{" "}
                                People
                              </div>

                              <div className="batch-revenue">
                                {formatCurrency(
                                  batch.revenue
                                )}
                              </div>

                            </div>
                          )
                        )}

                      </div>

                      {/* COURSE TOTAL */}

                      <div className="course-total">

                        <div>

                          <div className="course-total-label">
                            Total Course
                            Revenue
                          </div>

                          <div className="course-total-value">
                            {formatCurrency(
                              course.revenue
                            )}
                          </div>

                        </div>

                        <div className="course-total-badge">
                          <span className="live-dot" />
                          Live
                        </div>

                      </div>

                    </article>
                  )
                )}

              </div>
            )}

          </section>

        </div>
      </main>
    </>
  );
}