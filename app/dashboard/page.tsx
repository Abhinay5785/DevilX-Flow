
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  LayoutDashboard,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Settings,
  X,
  Check,
  Clock3,
  XCircle,
  Users,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type DashboardStats = {
  totalCustomers: number;
  totalRevenue: number;
  thisMonthRevenue: number;
  paymentsReceived: number;
};

type RecentPayment = {
  id: string;
  customerId: string;
  paymentId?: string | null;
  name: string;
  amount: number;
  status: string;
  course?: string | null;
  batch?: string | null;
  paymentTime: string;
  automationStatus: "sent" | "pending" | "processing" | "failed" | "cancelled" | "not_triggered";
};

function normalizeCourse(value: unknown) {
  const course = String(value ?? "").trim().replace(/\\s+/g, " ");

  if (course.toLowerCase() === "consultation") {
    return "Consultation";
  }

  return course;
}

function getDisplayBatch(course?: string | null, batch?: string | null) {
  if (normalizeCourse(course).toLowerCase() === "consultation") {
    return "No Batch";
  }

  return String(batch ?? "").trim() || "Not assigned";
}

type CustomerPayment = {
  id: string;
  amount: number;
  status: string;
  payment_time: string;
  failed_reason: string | null;
  course: string | null;
  batch: string | null;
};

type SelectedCustomer = {
  id: string;
  name: string;
  age: number | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  course: string | null;
  batch: string | null;
  custom_fields: Record<string, unknown> | null;
  payments: CustomerPayment[];
};

const EMPTY_STATS: DashboardStats = {
  totalCustomers: 0,
  totalRevenue: 0,
  thisMonthRevenue: 0,
  paymentsReceived: 0,
};




export default function DashboardPage() {
  const supabase = createClient();

  const [dashboardStats, setDashboardStats] =
    useState<DashboardStats>(EMPTY_STATS);

  const [statsLoading, setStatsLoading] =
    useState(true);

  const [recentPayments, setRecentPayments] =
    useState<RecentPayment[]>([]);

  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [customerModalLoading, setCustomerModalLoading] =
    useState(false);

  async function openCustomerDetails(customerId: string) {
    if (!customerId) return;

    setCustomerModalLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select(`
        id,
        name,
        age,
        city,
        phone,
        email,
        course,
        batch,
        custom_fields,
        payments (
          id,
          amount,
          status,
          payment_time,
          failed_reason,
          course,
          batch
        )
      `)
      .eq("id", customerId)
      .single();

    setCustomerModalLoading(false);

    if (error || !data) {
      console.error("Failed to load customer details:", error);
      return;
    }

    setSelectedCustomer(data as SelectedCustomer);
  }

  // Render the date only after hydration so the server and browser
  // cannot disagree when the request crosses midnight/timezones.
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    setTodayLabel(
      new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setStatsLoading(true);

      const [
        customersResult,
        paymentsResult,
      ] = await Promise.all([
        supabase
          .from("customers")
          .select(
            `
              id,
              course,
              batch,
              payments (
                amount,
                status,
                payment_time,
                course,
                batch
              )
            `,
          ),
        supabase
          .from("payments")
          .select(
            `
              id,
              payment_id,
              amount,
              status,
              payment_time,
              customer_id,
              customers (
                name
              ),
              course,
              batch
            `,
          )
          .order("payment_time", { ascending: false })
          .limit(8),
      ]);

      if (cancelled) return;

      if (customersResult.error) {
        console.error(
          "Failed to load dashboard customer data:",
          customersResult.error,
        );
        setDashboardStats(EMPTY_STATS);
      } else {
        const customers = customersResult.data || [];

        const totalRevenue = customers.reduce(
          (customerTotal, customer) => {
            const customerPayments =
              Array.isArray(customer.payments)
                ? customer.payments
                : [];

            return (
              customerTotal +
              customerPayments.reduce(
                (paymentTotal, payment) => {
                  const status = String(
                    payment.status || "",
                  ).toLowerCase();

                  if (
                    status === "captured" ||
                    status === "paid" ||
                    status === "success" ||
                    status === "successful"
                  ) {
                    return (
                      paymentTotal +
                      Number(payment.amount || 0)
                    );
                  }

                  return paymentTotal;
                },
                0,
              )
            );
          },
          0,
        );

        // Calculate revenue for the current calendar month in IST.
        // The database stores payment_time as a timestamp, so comparing
        // against UTC boundaries derived from IST keeps the dashboard
        // correct for Indian business dates.
        const now = new Date();
        const istParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
        }).formatToParts(now);
        const istYear = Number(
          istParts.find((part) => part.type === "year")?.value || now.getUTCFullYear(),
        );
        const istMonth = Number(
          istParts.find((part) => part.type === "month")?.value || now.getUTCMonth() + 1,
        );

        const monthStartUtc = new Date(
          Date.UTC(istYear, istMonth - 1, 1, -5, -30, 0, 0),
        );
        const nextMonthStartUtc = new Date(
          Date.UTC(istYear, istMonth, 1, -5, -30, 0, 0),
        );

        const isSuccessfulPayment = (statusValue: unknown) => {
          const status = String(statusValue || "").toLowerCase();
          return (
            status === "captured" ||
            status === "paid" ||
            status === "success" ||
            status === "successful"
          );
        };

        const thisMonthRevenue = customers.reduce(
          (total, customer) => {
            const customerPayments = Array.isArray(customer.payments)
              ? customer.payments
              : [];

            return (
              total +
              customerPayments.reduce((paymentTotal, payment) => {
                if (!isSuccessfulPayment(payment.status)) return paymentTotal;

                const paymentDate = new Date(String(payment.payment_time || ""));
                if (
                  !Number.isFinite(paymentDate.getTime()) ||
                  paymentDate < monthStartUtc ||
                  paymentDate >= nextMonthStartUtc
                ) {
                  return paymentTotal;
                }

                return paymentTotal + Number(payment.amount || 0);
              }, 0)
            );
          },
          0,
        );

        const paymentsReceived = customers.reduce(
          (total, customer) => {
            const customerPayments =
              Array.isArray(customer.payments)
                ? customer.payments
                : [];

            return (
              total +
              customerPayments.filter((payment) => {
                const status = String(
                  payment.status || "",
                ).toLowerCase();

                return (
                  status === "captured" ||
                  status === "paid" ||
                  status === "success" ||
                  status === "successful"
                );
              }).length
            );
          },
          0,
        );

        setDashboardStats({
          totalCustomers: customers.length,
          totalRevenue,
          thisMonthRevenue,
          paymentsReceived,
        });
      }

      if (paymentsResult.error) {
        console.error(
          "Failed to load recent payments:",
          paymentsResult.error,
        );
        setRecentPayments([]);
      } else {
        const paymentRows = paymentsResult.data || [];

        // Load automation jobs for the recent payments so the dashboard
        // can show whether an email automation was sent, is pending,
        // processing, failed, or was not triggered.
        const paymentIds = paymentRows.map((payment) => String(payment.id));

        const { data: automationJobs, error: automationJobsError } =
          paymentIds.length > 0
            ? await supabase
                .from("automation_jobs")
                .select(
                  "payment_id,status,updated_at,send_at,sent_at,error_message",
                )
                .in("payment_id", paymentIds)
                .order("updated_at", { ascending: false })
            : { data: [], error: null };

        if (automationJobsError) {
          console.error(
            "Failed to load recent payment automation status:",
            automationJobsError,
          );
        }

        // Keep the newest automation job for each payment.
        const latestAutomationByPayment = new Map<
          string,
          {
            status: string;
          }
        >();

        for (const job of automationJobs || []) {
          const paymentId = String(job.payment_id || "");
          if (!paymentId || latestAutomationByPayment.has(paymentId)) {
            continue;
          }

          latestAutomationByPayment.set(paymentId, {
            status: String(job.status || "").toLowerCase(),
          });
        }

        setRecentPayments(
          paymentRows.map((payment) => {
            const customer = Array.isArray(payment.customers)
              ? payment.customers[0]
              : payment.customers;

            return {
              id: String(payment.id),
              customerId: String(payment.customer_id),
              paymentId: payment.payment_id,
              name: String(
                customer?.name || "Unknown customer",
              ),
              amount: Number(payment.amount || 0),
              status: String(payment.status || "pending"),
              course: normalizeCourse(payment.course) || null,
              batch: payment.batch || null,
              paymentTime: String(
                payment.payment_time ||
                  new Date().toISOString(),
              ),
              automationStatus:
                latestAutomationByPayment.get(String(payment.id))
                  ?.status === "sent"
                  ? "sent"
                  : latestAutomationByPayment.get(String(payment.id))
                        ?.status === "pending"
                    ? "pending"
                    : latestAutomationByPayment.get(String(payment.id))
                          ?.status === "processing"
                      ? "processing"
                      : latestAutomationByPayment.get(String(payment.id))
                            ?.status === "failed"
                        ? "failed"
                        : latestAutomationByPayment.get(String(payment.id))
                              ?.status === "cancelled"
                          ? "cancelled"
                          : "not_triggered",
            };
          }),
        );
      }

      setStatsLoading(false);
    }

    loadDashboard();

    const refreshDashboard = () => {
      loadDashboard();
    };

    const customersChannel = supabase
      .channel("dashboard-customers-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
        },
        refreshDashboard,
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel("dashboard-payments-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        refreshDashboard,
      )
      .subscribe();

    const automationJobsChannel = supabase
      .channel("dashboard-automation-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "automation_jobs",
        },
        refreshDashboard,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(customersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(automationJobsChannel);
    };
  }, []);


  const stats = [
    {
      title: "Total Customers",
      value: dashboardStats.totalCustomers.toLocaleString("en-IN"),
      change: statsLoading ? "Loading..." : "Live",
      icon: Users,
    },
    {
      title: "Total Revenue",
      value: `₹${dashboardStats.totalRevenue.toLocaleString(
        "en-IN",
        {
          maximumFractionDigits: 0,
        },
      )}`,
      change: statsLoading ? "Loading..." : "Live",
      icon: CircleDollarSign,
    },
    {
      title: "This Month Revenue",
      value: `₹${dashboardStats.thisMonthRevenue.toLocaleString(
        "en-IN",
        { maximumFractionDigits: 0 },
      )}`,
      change: statsLoading ? "Loading..." : "Live",
      icon: CircleDollarSign,
    },
    {
      title: "Payments Received",
      value: dashboardStats.paymentsReceived.toLocaleString("en-IN"),
      change: statsLoading ? "Loading..." : "Live",
      icon: MessageCircle,
    },
  ];

  return (
    <div className="devilx-dashboard min-h-screen bg-black text-white selection:bg-[#ff1744]/30">
      <div className="flex min-h-screen overflow-x-hidden">
        {/* SIDEBAR */}
        <aside className="hidden w-[252px] shrink-0 flex-col border-r border-white/[0.08] bg-[#050505] lg:flex">
          <div className="border-b border-white/[0.06] px-5 pb-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#ff1744] to-[#c90032] shadow-[0_0_28px_rgba(255,23,68,0.25)]">
                <span className="text-xl font-black">X</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[18px] font-bold tracking-tight">DevilX</span>
                  <span className="text-[18px] font-bold tracking-tight text-[#ff1744]">Flow</span>
                </div>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Automation Platform
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-6">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Workspace
            </p>
            <nav className="space-y-1">
              <SidebarItem icon={<LayoutDashboard size={17} />} label="Dashboard" href="/dashboard" active />
              <SidebarItem icon={<Users size={17} />} label="Customers" href="/dashboard/customers" />
              <SidebarItem icon={<CalendarDays size={17} />} label="Consultations" href="/dashboard/consultations" />
              <SidebarItem icon={<CreditCard size={17} />} label="Courses" href="/dashboard/courses" />
              <SidebarItem icon={<CircleDollarSign size={17} />} label="Revenue" href="/dashboard/revenue" />
              <SidebarItem icon={<Zap size={17} />} label="Automations" href="/dashboard/automations" />
              <SidebarItem icon={<Link2 size={17} />} label="Quick Links" href="/dashboard/quick-links" />
            </nav>

            <div className="my-7 h-px bg-white/[0.06]" />

            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              System
            </p>
            <nav>
              <SidebarItem icon={<Settings size={17} />} label="Settings" href="/dashboard/settings" />
            </nav>
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#111216] to-[#08090a] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff1744]/10 text-[#ff1744]">
                  <Zap size={15} />
                </div>
                <span className="text-[10px] font-semibold text-emerald-400">ONLINE</span>
              </div>
              <p className="text-sm font-semibold text-slate-100">DevilX Flow</p>
              <p className="mt-1 text-xs text-slate-500">All services operational</p>
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-slate-600">
              <span>DevilX Flow</span>
              <span>v1.0.0</span>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1 bg-black pb-28 sm:pb-28 lg:pb-0">
          {/* MOBILE HEADER */}
          <header className="sticky top-0 z-30 flex min-h-[62px] items-center justify-between gap-2 border-b border-white/[0.08] bg-black/90 px-3 py-3 backdrop-blur-xl lg:hidden sm:px-5">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff1744] to-[#c90032] shadow-[0_0_24px_rgba(255,23,68,0.22)]">
                <span className="text-base font-black">X</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[16px] font-bold tracking-tight">DevilX</span>
                  <span className="text-[16px] font-bold tracking-tight text-[#ff1744]">Flow</span>
                </div>
                <p className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-slate-600">
                  Automation Platform
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/quick-links"
                aria-label="Quick Links"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Link2 size={16} />
              </Link>
              <Link
                href="/dashboard/settings"
                aria-label="Settings"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Settings size={16} />
              </Link>
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-9 xl:px-10">
            <section className="mb-4 flex flex-col gap-3 sm:mb-5 sm:gap-4 md:flex-row md:items-end md:justify-between xl:gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff1744]">Overview</p>
                <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-white sm:text-3xl md:text-[34px]">Dashboard</h1>
                <p className="mt-1.5 max-w-[620px] text-xs leading-5 text-slate-400 sm:text-sm">
                  Monitor customers, revenue, payments and automation activity.
                </p>
              </div>

              <div className="flex w-full max-w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0b0c0e] px-2.5 py-2 sm:w-fit sm:px-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff1744]/10 text-[#ff1744]">
                  <CalendarDays size={15} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">Today</p>
                  <p className="text-[10px] text-slate-500">
                    {todayLabel || "Loading date..."}
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4 sm:mb-5">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                const accents = [
                  {
                    border: "border-[#ff1744]/35",
                    glow: "bg-[#ff1744]/[0.08]",
                    icon: "bg-[#ff1744]/10 text-[#ff6683]",
                    line: "from-transparent via-[#ff1744] to-transparent",
                  },
                  {
                    border: "border-[#ff1744]/30",
                    glow: "bg-[#ff1744]/[0.06]",
                    icon: "bg-[#ff1744]/10 text-[#ff6683]",
                    line: "from-transparent via-[#ff1744]/80 to-transparent",
                  },
                  {
                    border: "border-[#7c3aed]/30",
                    glow: "bg-[#7c3aed]/[0.07]",
                    icon: "bg-[#7c3aed]/10 text-[#a78bfa]",
                    line: "from-transparent via-[#8b5cf6]/80 to-transparent",
                  },
                  {
                    border: "border-[#f97316]/30",
                    glow: "bg-[#f97316]/[0.07]",
                    icon: "bg-[#f97316]/10 text-[#fb923c]",
                    line: "from-transparent via-[#f97316]/80 to-transparent",
                  },
                ][index % 4];

                return (
                  <div
                    key={stat.title}
                    className={`group relative min-w-0 overflow-hidden rounded-2xl border ${accents.border} bg-[#0c0d10] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.3)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#101115] sm:p-5`}
                  >
                    <div className={`absolute -right-10 -top-10 h-28 w-28 rounded-full ${accents.glow} blur-3xl`} />
                    <div className={`absolute inset-x-6 top-0 h-px bg-gradient-to-r ${accents.line}`} />
                    <div className="relative">
                      <div className="flex items-start justify-between">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] ${accents.icon}`}>
                          <Icon size={18} />
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-emerald-400/[0.07] px-2 py-1 text-[10px] font-semibold text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {stat.change}
                        </span>
                      </div>
                      <p className="mt-5 text-xs font-medium text-slate-400 sm:mt-6">{stat.title}</p>
                      <p className="mt-1 break-words text-[24px] font-bold tracking-tight text-white sm:text-[29px]">{stat.value}</p>
                    </div>
                  </div>
                );
              })}
            </section>

            <section>
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0c0e] shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3.5 py-3.5 sm:px-5 sm:py-4 md:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ff1744]/10 text-[#ff1744]">
                      <CreditCard size={17} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-100">Recent Payments</h2>
                      <p className="mt-0.5 text-xs text-slate-500">Latest activity from Razorpay</p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/customers"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white sm:px-3 sm:text-xs"
                  >
                    View all
                    <ArrowUpRight size={13} />
                  </Link>
                </div>

                <div className="px-2.5 pb-3 pt-2 sm:px-4 md:px-5">
                  <div className="hidden grid-cols-[minmax(130px,1.3fr)_minmax(80px,0.8fr)_80px_90px_88px_70px_90px_28px] gap-3 rounded-lg bg-[#111317] px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600 md:grid">
                    <span>Student</span>
                    <span>Course</span>
                    <span>Batch</span>
                    <span>Amount</span>
                    <span>Status</span>
                    <span>Time</span>
                    <span>Automation</span>
                    <span />
                  </div>

                  <div className="divide-y divide-white/[0.05]">
                    {statsLoading && recentPayments.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-500">Loading latest payments...</div>
                    ) : recentPayments.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-500">No payments received yet.</div>
                    ) : (
                      recentPayments.map((payment) => {
                        const status = payment.status.toLowerCase();
                        const captured =
                          status === "captured" ||
                          status === "paid" ||
                          status === "success" ||
                          status === "successful";
                        const failed = status === "failed";

                        return (
                          <div
                            key={payment.id}
                            className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-1.5 py-3.5 transition hover:bg-white/[0.025] sm:px-3 md:items-center md:grid-cols-[minmax(130px,1.3fr)_minmax(80px,0.8fr)_80px_90px_88px_70px_90px_28px] md:py-3"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold sm:h-8 sm:w-8 ${
                                  captured
                                    ? "bg-[#ff1744]/15 text-[#ff6b88]"
                                    : failed
                                      ? "bg-red-500/10 text-red-400"
                                      : "bg-amber-400/10 text-amber-300"
                                }`}
                              >
                                {payment.name
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-slate-100 sm:text-sm">{payment.name}</p>
                                <p className="mt-0.5 truncate text-[9px] text-slate-600 sm:text-[10px]">
                                  {payment.paymentId || "Payment"}
                                </p>

                                {/* Mobile-only payment details */}
                                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
                                  <span className="max-w-[150px] truncate text-[10px] font-medium text-slate-500">
                                    {normalizeCourse(payment.course) || "—"}
                                  </span>
                                  <span className="text-slate-700">•</span>
                                  <span className="text-[10px] text-slate-500">
                                    {getDisplayBatch(payment.course, payment.batch)}
                                  </span>
                                  <span
                                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                      captured
                                        ? "bg-emerald-400/10 text-emerald-300"
                                        : failed
                                          ? "bg-red-400/10 text-red-300"
                                          : "bg-amber-400/10 text-amber-300"
                                    }`}
                                  >
                                    {captured ? "Captured" : failed ? "Failed" : "Pending"}
                                  </span>
                                  <span className="text-[9px] text-slate-600">
                                    {formatRelativeTime(payment.paymentTime)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <span className="hidden truncate text-xs font-medium text-slate-400 md:block">
                              {normalizeCourse(payment.course) || "—"}
                            </span>
                            <span className="hidden text-xs text-slate-400 md:block">
                              {getDisplayBatch(payment.course, payment.batch)}
                            </span>
                            <span className="pt-0.5 text-right text-sm font-bold text-slate-100 md:pt-0 md:text-left">
                              ₹{payment.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </span>

                            <span
                              className={`hidden w-fit rounded-full px-2 py-1 text-[10px] font-bold md:block ${
                                captured
                                  ? "bg-emerald-400/10 text-emerald-300"
                                  : failed
                                    ? "bg-red-400/10 text-red-300"
                                    : "bg-amber-400/10 text-amber-300"
                              }`}
                            >
                              {captured ? "Captured" : failed ? "Failed" : "Pending"}
                            </span>
                            <span className="hidden text-[10px] text-slate-500 md:block">
                              {formatRelativeTime(payment.paymentTime)}
                            </span>

                            <AutomationStatus status={payment.automationStatus} />

                            <button
                              type="button"
                              aria-label={`View details for ${payment.name}`}
                              title="View customer details"
                              onClick={() => openCustomerDetails(payment.customerId)}
                              className="hidden h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/[0.05] hover:text-slate-300 md:flex"
                            >
                              <MoreHorizontal size={15} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* CUSTOMER DETAILS MODAL — same structure as Customers page */}
        {(customerModalLoading || selectedCustomer) && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/[0.78] p-3 backdrop-blur-[9px] sm:p-5"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !customerModalLoading) {
                setSelectedCustomer(null);
              }
            }}
          >
            <div className="w-full max-w-[720px] max-h-[calc(100dvh-16px)] overflow-y-auto overscroll-contain rounded-2xl border border-[#29292d] bg-[#09090a] shadow-[0_30px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100dvh-32px)]">
              {customerModalLoading ? (
                <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">
                  Loading customer details...
                </div>
              ) : selectedCustomer ? (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-[#202023] px-4 py-4 sm:gap-4 sm:px-[22px] sm:py-5">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
                        CUSTOMER
                      </span>
                      <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
                        {selectedCustomer.name}
                      </h2>
                      <p className="mt-1 max-w-[calc(100vw-110px)] truncate text-xs text-[#71717a] sm:max-w-[560px]">
                        {selectedCustomer.email || selectedCustomer.phone || "Customer details"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#71717a] transition hover:bg-white/[0.06] hover:text-white"
                      onClick={() => setSelectedCustomer(null)}
                      aria-label="Close customer details"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-4 sm:p-[22px]">
                    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[9px] border border-[#202023] bg-[#202023] sm:grid-cols-2">
                      {[
                        ["Age", selectedCustomer.age ?? "—"],
                        ["City", selectedCustomer.city || "—"],
                        ["Phone", selectedCustomer.phone || "—"],
                        ["Email", selectedCustomer.email || "—"],
                        [
                          "Courses",
                          Array.from(new Set((selectedCustomer.payments || []).map((payment) => normalizeCourse(payment.course)).filter(Boolean))).join(", ") || normalizeCourse(selectedCustomer.course) || "—",
                        ],
                        [
                          "Batches",
                          Array.from(new Set((selectedCustomer.payments || []).map((payment) => getDisplayBatch(payment.course, payment.batch)).filter(Boolean))).join(", ") || (normalizeCourse(selectedCustomer.course).toLowerCase() === "consultation" ? "No Batch" : selectedCustomer.batch || "—"),
                        ],
                        ["Payments", selectedCustomer.payments.length],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="flex min-h-[75px] flex-col justify-center gap-1.5 bg-[#0c0c0d] p-[13px]">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-[#71717a]">
                            {label}
                          </span>
                          <strong className="break-words text-[13px] font-semibold text-[#e4e4e7]">
                            {String(value)}
                          </strong>
                        </div>
                      ))}
                    </div>

                    {Object.keys(selectedCustomer.custom_fields || {}).length > 0 && (
                      <div className="mt-[22px] border-t border-[#202023] pt-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-slate-100">Additional information</h3>
                          <span className="text-[10px] uppercase tracking-[0.08em] text-[#71717a]">Dynamic fields</span>
                        </div>
                        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[#202023] bg-[#202023] sm:grid-cols-2">
                          {Object.entries(selectedCustomer.custom_fields || {}).map(([key, value]) => (
                            <div key={key} className="bg-[#0c0c0d] p-3">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.4px] text-[#71717a]">{key}</span>
                              <strong className="mt-1 block break-words text-[13px] font-semibold text-[#e4e4e7]">{String(value ?? "—") || "—"}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-[22px] border-t border-[#202023] pt-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-100">Payment history</h3>
                        <span className="text-[11px] text-[#71717a]">{selectedCustomer.payments.length} payments</span>
                      </div>

                      {selectedCustomer.payments.length === 0 ? (
                        <div className="rounded-lg border border-[#202023] bg-[#101011] p-5 text-center text-sm text-[#71717a]">
                          No payment records.
                        </div>
                      ) : (
                        [...selectedCustomer.payments]
                          .sort((a, b) => new Date(b.payment_time).getTime() - new Date(a.payment_time).getTime())
                          .map((payment) => {
                            const captured = isCapturedPayment(payment.status);
                            const failed = isFailedPayment(payment.status);
                            return (
                              <div key={payment.id} className="rounded-lg border border-[#202023] bg-[#101011] p-3.5 [&+&]:mt-2">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <strong className="text-sm font-bold text-slate-100">
                                      ₹{Number(payment.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                    </strong>
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${captured ? "bg-emerald-400/10 text-emerald-300" : failed ? "bg-red-400/10 text-red-300" : "bg-amber-400/10 text-amber-300"}`}>
                                      {captured ? <Check size={12} /> : failed ? <XCircle size={12} /> : <Clock3 size={12} />}
                                      {captured ? "Captured" : failed ? "Failed" : "Pending"}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-[#71717a]">{formatDateTimeIST(payment.payment_time)}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#71717a]">
                                  <span>Course</span>
                                  <strong className="text-slate-400">{normalizeCourse(payment.course) || "Not recorded"}</strong>
                                  <span className="text-slate-700">•</span>
                                  <span>Batch</span>
                                  <strong className="text-slate-400">{getDisplayBatch(payment.course, payment.batch)}</strong>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>

                </>
              ) : null}
            </div>
          </div>
        )}

        {/* MOBILE BOTTOM NAV */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#050505]/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid max-w-[760px] grid-cols-6 gap-0.5 sm:gap-1">
            <MobileNavItem icon={<LayoutDashboard size={18} />} label="Home" href="/dashboard" active />
            <MobileNavItem icon={<Users size={18} />} label="Customers" href="/dashboard/customers" />
            <MobileNavItem icon={<CalendarDays size={18} />} label="Consultations" href="/dashboard/consultations" />
            <MobileNavItem icon={<CreditCard size={18} />} label="Courses" href="/dashboard/courses" />
            <MobileNavItem icon={<CircleDollarSign size={18} />} label="Revenue" href="/dashboard/revenue" />
            <MobileNavItem icon={<Zap size={18} />} label="Automations" href="/dashboard/automations" />
          </div>
        </nav>
      </div>

      <style jsx global>{`
        html {
          overflow-x: hidden;
        }

        .devilx-dashboard {
          overflow-x: hidden;
          min-height: 100dvh;
          -webkit-tap-highlight-color: transparent;
        }

        @media (max-width: 639px) {
          .devilx-dashboard button,
          .devilx-dashboard a {
            -webkit-tap-highlight-color: transparent;
          }
        }

        .devilx-dashboard,
        .devilx-dashboard button,
        .devilx-dashboard a,
        .devilx-dashboard input,
        .devilx-dashboard textarea,
        .devilx-dashboard select {
          font-family: Arial, Helvetica, sans-serif;
        }
      `}</style>
    </div>
  );
}




function isCapturedPayment(status: string) {
  const value = String(status || "").toLowerCase();
  return value === "captured" || value === "paid" || value === "success" || value === "successful";
}

function isFailedPayment(status: string) {
  const value = String(status || "").toLowerCase();
  return value === "failed" || value === "failure";
}

function formatDateTimeIST(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Just now";
  }

  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000),
  );

  if (diffSeconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(diffSeconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AutomationStatus({
  status,
}: {
  status: RecentPayment["automationStatus"];
}) {
  const config = {
    sent: {
      label: "Sent",
      className: "bg-emerald-400/10 text-emerald-300",
      dot: "bg-emerald-400",
    },
    pending: {
      label: "Pending",
      className: "bg-amber-400/10 text-amber-300",
      dot: "bg-amber-400",
    },
    processing: {
      label: "Sending",
      className: "bg-blue-400/10 text-blue-300",
      dot: "bg-blue-400",
    },
    failed: {
      label: "Failed",
      className: "bg-red-400/10 text-red-300",
      dot: "bg-red-400",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-slate-400/10 text-slate-400",
      dot: "bg-slate-500",
    },
    not_triggered: {
      label: "Not Triggered",
      className: "bg-slate-400/10 text-slate-500",
      dot: "bg-slate-600",
    },
  }[status];

  return (
    <span
      title={
        status === "not_triggered"
          ? "No email automation was triggered for this payment."
          : `Email automation: ${config.label}`
      }
      className={`hidden w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold md:flex ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function MobileNavItem({
  icon,
  label,
  href,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "flex min-w-0 min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl px-0 py-1 text-[8px] font-semibold leading-tight transition-all sm:min-h-[48px] sm:gap-1 sm:px-0.5 sm:text-[9px] " +
        (active
          ? "bg-[#ff1744]/10 text-[#ff5d79]"
          : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")
      }
    >
      {icon}
      <span className="max-w-full truncate text-center">{label}</span>
    </Link>
  );
}

function SidebarItem({
  icon,
  label,
  href,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all " +
        (active
          ? "bg-[#ff1744]/10 text-white ring-1 ring-inset ring-[#ff1744]/25 shadow-[0_8px_25px_rgba(255,23,68,0.08)]"
          : "text-white hover:bg-white/[0.04] hover:text-white")
      }
    >
      {icon}
      <span>{label}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_7px_rgba(255,255,255,0.8)]" />
      )}
    </Link>
  );
}
