
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  CircleDollarSign,
  LayoutDashboard,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type DashboardStats = {
  totalCustomers: number;
  totalRevenue: number;
  activeFlows: number;
  paymentsReceived: number;
};

type RecentPayment = {
  id: string;
  paymentId?: string | null;
  name: string;
  amount: number;
  status: string;
  course?: string | null;
  batch?: string | null;
  paymentTime: string;
};

const EMPTY_STATS: DashboardStats = {
  totalCustomers: 0,
  totalRevenue: 0,
  activeFlows: 0,
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
                payment_time
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
                name,
                course,
                batch
              )
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

        const flowKeys = new Set<string>();

        customers.forEach((customer) => {
          const course = String(
            customer.course || "",
          ).trim();

          const batch = String(
            customer.batch || "",
          ).trim();

          if (course || batch) {
            flowKeys.add(
              `${course.toLowerCase()}::${batch.toLowerCase()}`,
            );
          }
        });

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
          activeFlows: flowKeys.size,
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

        setRecentPayments(
          paymentRows.map((payment) => {
            const customer = Array.isArray(payment.customers)
              ? payment.customers[0]
              : payment.customers;

            return {
              id: String(payment.id),
              paymentId: payment.payment_id,
              name: String(
                customer?.name || "Unknown customer",
              ),
              amount: Number(payment.amount || 0),
              status: String(payment.status || "pending"),
              course: customer?.course || null,
              batch: customer?.batch || null,
              paymentTime: String(
                payment.payment_time ||
                  new Date().toISOString(),
              ),
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

    return () => {
      cancelled = true;
      supabase.removeChannel(customersChannel);
      supabase.removeChannel(paymentsChannel);
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
      title: "Active Flows",
      value: dashboardStats.activeFlows.toLocaleString("en-IN"),
      change: statsLoading ? "Loading..." : "Live",
      icon: Workflow,
    },
    {
      title: "Payments Received",
      value: dashboardStats.paymentsReceived.toLocaleString("en-IN"),
      change: statsLoading ? "Loading..." : "Live",
      icon: MessageCircle,
    },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="flex min-h-screen">

        {/* SIDEBAR */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-white/[0.06] bg-[#080808] lg:flex">

          {/* BRAND */}
          <div className="px-6 pb-8 pt-7">
            <div className="flex items-center gap-3">

              <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#ff1744] shadow-[0_0_30px_rgba(255,23,68,0.25)]">
                <span className="relative z-10 text-lg font-black">
                  X
                </span>

                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[17px] font-bold tracking-tight">
                    DevilX
                  </span>

                  <span className="text-[17px] font-bold tracking-tight text-[#ff1744]">
                    Flow
                  </span>
                </div>

                <p className="mt-0.5 text-xs uppercase tracking-[2px] text-white/30">
                  Automation Platform
                </p>
              </div>

            </div>
          </div>

          {/* NAVIGATION */}
          <div className="flex-1 px-4">

            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-[2px] text-white/25">
              Workspace
            </p>

            <nav className="space-y-1">

              <SidebarItem
                icon={<LayoutDashboard size={17} />}
                label="Dashboard"
                href="/dashboard"
                active
              />

              <SidebarItem
                icon={<Users size={17} />}
                label="Customers"
                href="/dashboard/customers"
                
              />

              <SidebarItem
                icon={<CircleDollarSign size={17} />}
                label="Revenue"
                href="/dashboard/revenue"
                
              />

              <SidebarItem
                icon={<MessageCircle size={17} />}
                label="WhatsApp"
                href="/dashboard/whatsapp"
                
              />

              <SidebarItem
                icon={<BarChart3 size={17} />}
                label="Analytics"
                href="/dashboard/analytics"
                
              />

            </nav>

            <p className="mb-3 mt-9 px-3 text-xs font-semibold uppercase tracking-[2px] text-white/25">
              System
            </p>

            <nav>
              <SidebarItem
                icon={<Settings size={17} />}
                label="Settings"
                href="/dashboard/settings"
                
              />
            </nav>

          </div>

          {/* CREATE FLOW CARD */}
          <div className="px-4 pb-4">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#101010] p-4">

              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#ff1744]/10 blur-2xl" />

              <div className="relative">

                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff1744]/10 text-[#ff1744]">
                  <Zap size={15} />
                </div>

                <p className="text-xs font-semibold">
                  Build your next flow
                </p>

                <p className="mt-1 text-xs leading-4 text-white/35">
                  Automate conversations and grow faster.
                </p>

                <Link
                  href="/dashboard/whatsapp"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-xs font-semibold text-black transition hover:bg-white/90"
                >
                  <Plus size={13} />
                  Create Flow
                </Link>

              </div>
            </div>
          </div>


        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1 bg-[#050505]">

          {/* TOP BAR */}
          <header className="flex h-[72px] items-center justify-between border-b border-white/[0.06] px-5 sm:px-7 lg:px-10">

            <div>
              <p className="text-xs uppercase tracking-[2px] text-white/25">
                Overview
              </p>

              <h1 className="mt-1 text-sm font-medium text-white/80">
                Dashboard
              </h1>
            </div>

            <div className="flex items-center gap-3">

              <button className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-white/50 transition hover:bg-white/[0.06] hover:text-white">

                <Bell size={16} />

                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#ff1744] shadow-[0_0_8px_#ff1744]" />

              </button>

              <div className="hidden h-6 w-px bg-white/[0.08] sm:block" />

              <div className="hidden items-center gap-2 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                <span className="text-xs font-medium text-white/45">
                  Live
                </span>
              </div>

            </div>

          </header>

          {/* CONTENT */}
          <div className="px-5 py-7 sm:px-7 lg:px-10 lg:py-9">

            {/* WELCOME */}
            <section className="relative mb-7 overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0c0c0c]">

              <div className="absolute -right-24 -top-32 h-[320px] w-[320px] rounded-full bg-[#ff1744]/10 blur-[100px]" />

              <div className="absolute -bottom-32 left-1/3 h-[220px] w-[220px] rounded-full bg-[#ff1744]/5 blur-[90px]" />

              {/* FLOW DECORATION */}
              <div className="pointer-events-none absolute right-0 top-0 h-full w-[45%] overflow-hidden opacity-40">

                <div className="flow-line flow-line-one" />
                <div className="flow-line flow-line-two" />
                <div className="flow-line flow-line-three" />

              </div>

              <div className="relative z-10 px-6 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">

                <div className="max-w-2xl">

                  <div className="mb-4 flex items-center gap-2">

                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff1744]/10 text-[#ff1744]">
                      <Sparkles size={13} />
                    </div>

                    <span className="text-xs font-semibold uppercase tracking-[2px] text-[#ff1744]">
                      DevilX Flow
                    </span>

                  </div>

                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[40px] lg:leading-[1.1]">
                    Welcome back
                    <span className="text-[#ff1744]">
                      .
                    </span>
                  </h2>

                  <p className="mt-4 max-w-xl text-sm leading-6 text-white/40">
                    Everything is flowing. Monitor your customers,
                    revenue, and automations from one powerful
                    workspace.
                  </p>

                  <div className="mt-7 flex flex-wrap gap-3">

                    <Link
                      href="/dashboard/whatsapp"
                      className="flex items-center gap-2 rounded-xl bg-[#ff1744] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_0_25px_rgba(255,23,68,0.18)] transition hover:bg-[#e9143e]"
                    >
                      <Plus size={14} />
                      Create Flow
                    </Link>

                    <Link
                      href="/dashboard/analytics"
                      className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      View Analytics
                      <ArrowUpRight size={14} />
                    </Link>

                  </div>

                </div>

              </div>

            </section>

            {/* STATS */}
            <section className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

              {stats.map((stat) => {

                const Icon = stat.icon;

                return (
                  <div
                    key={stat.title}
                    className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-5 transition duration-300 hover:border-white/[0.12]"
                  >

                    <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#ff1744]/0 blur-2xl transition duration-500 group-hover:bg-[#ff1744]/5" />

                    <div className="relative">

                      <div className="mb-6 flex items-center justify-between">

                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-white/60">
                          <Icon size={16} />
                        </div>

                        <div className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                          <ArrowUpRight size={12} />
                          {stat.change}
                        </div>

                      </div>

                      <p className="text-xs text-white/30">
                        {stat.title}
                      </p>

                      <p className="mt-1 text-2xl font-bold tracking-tight">
                        {stat.value}
                      </p>

                    </div>

                  </div>
                );
              })}

            </section>

            {/* LOWER CONTENT */}
            <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">

              {/* RECENT PAYMENTS */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

                <div className="mb-6 flex items-center justify-between">

                  <div>
                    <h3 className="text-base font-semibold">
                      Recent Payments
                    </h3>

                    <p className="mt-1 text-xs text-white/30">
                      Latest payment activity from Razorpay
                    </p>
                  </div>

                  <Link
                    href="/dashboard/customers"
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    View all
                    <ArrowUpRight size={13} />
                  </Link>

                </div>

                <div className="space-y-1">

                  {statsLoading && recentPayments.length === 0 ? (
                    <div className="py-10 text-center text-sm text-white/30">
                      Loading latest payments...
                    </div>
                  ) : recentPayments.length === 0 ? (
                    <div className="py-10 text-center text-sm text-white/30">
                      No payments received yet.
                    </div>
                  ) : (
                    recentPayments.map((payment) => {
                      const status = payment.status.toLowerCase();
                      const captured =
                        status === "captured" ||
                        status === "paid" ||
                        status === "success" ||
                        status === "successful";

                      const failed =
                        status === "failed";

                      return (
                        <div
                          key={payment.id}
                          className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/[0.025]"
                        >
                          <div
                            className={
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold " +
                              (captured
                                ? "bg-emerald-400/10 text-emerald-400"
                                : failed
                                  ? "bg-red-400/10 text-red-400"
                                  : "bg-amber-400/10 text-amber-400")
                            }
                          >
                            ₹
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-white/85">
                                {payment.name}
                              </p>

                              <span
                                className={
                                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                                  (captured
                                    ? "bg-emerald-400/10 text-emerald-400"
                                    : failed
                                      ? "bg-red-400/10 text-red-400"
                                      : "bg-amber-400/10 text-amber-400")
                                }
                              >
                                {captured
                                  ? "Captured"
                                  : failed
                                    ? "Failed"
                                    : "Pending"}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/30">
                              <span>
                                {payment.course || "Payment"}
                              </span>

                              {payment.batch && (
                                <>
                                  <span>•</span>
                                  <span>
                                    Batch {payment.batch}
                                  </span>
                                </>
                              )}

                              <span>•</span>

                              <span>
                                {formatRelativeTime(
                                  payment.paymentTime,
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-semibold text-white/90">
                              ₹
                              {payment.amount.toLocaleString(
                                "en-IN",
                                {
                                  maximumFractionDigits: 0,
                                },
                              )}
                            </p>

                            {payment.paymentId && (
                              <p className="mt-1 max-w-[105px] truncate text-xs text-white/20">
                                {payment.paymentId}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                </div>

              </div>

              {/* QUICK ACTIONS */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

                <div className="mb-6">

                  <h3 className="text-sm font-semibold">
                    Quick Actions
                  </h3>

                  <p className="mt-1 text-xs text-white/25">
                    Jump into your workspace
                  </p>

                </div>

                <div className="space-y-2">

                  <QuickAction
                    icon={<Workflow size={15} />}
                    title="Create WhatsApp Flow"
                    description="Build an automation"
                    href="/dashboard/whatsapp" accent
                  />

                  <QuickAction
                    icon={<Users size={15} />}
                    title="Add Customer"
                    description="Add a new customer"
                  href="/dashboard/customers"/>

                  <QuickAction
                    icon={<BarChart3 size={15} />}
                    title="View Analytics"
                    description="Track performance"
                  href="/dashboard/analytics"/>

                  <QuickAction
                    icon={<CircleDollarSign size={15} />}
                    title="View Revenue"
                    description="Check your earnings"
                  href="/dashboard/revenue"/>

                </div>

              </div>

            </section>

            {/* FOOTER */}
            <div className="mt-8 flex items-center justify-between border-t border-white/[0.05] pt-5">

              <p className="text-xs uppercase tracking-[2px] text-white/15">
                DevilX Flow
              </p>

              <p className="text-xs text-white/15">
                Automation made simple.
              </p>

            </div>

          </div>

        </main>

      </div>

      {/* FLOW LINE ANIMATION */}
      <style jsx global>{`
        .flow-line {
          position: absolute;
          width: 500px;
          height: 180px;
          border: 1px solid rgba(255, 23, 68, 0.12);
          border-left: 0;
          border-bottom: 0;
          border-radius: 0 180px 0 0;
          transform: rotate(-20deg);
          animation: devilxFlowMove 5s ease-in-out infinite;
        }

        .flow-line-one {
          right: -120px;
          top: 40px;
        }

        .flow-line-two {
          right: -180px;
          top: 90px;
          opacity: 0.6;
          animation-delay: 0.7s;
        }

        .flow-line-three {
          right: -230px;
          top: 140px;
          opacity: 0.35;
          animation-delay: 1.4s;
        }

        @keyframes devilxFlowMove {
          0%,
          100% {
            transform: rotate(-20deg) translateX(0);
            opacity: 0.35;
          }

          50% {
            transform: rotate(-20deg) translateX(-35px);
            opacity: 1;
          }
        }

        @media (max-width: 600px) {
          .flow-line {
            width: 300px;
            height: 130px;
          }
        }
      `}</style>
    </div>
  );
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
          ? "bg-[#ff1744] text-white shadow-[0_0_20px_rgba(255,23,68,0.12)]"
          : "text-white/35 hover:bg-white/[0.04] hover:text-white/80")
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

function QuickAction({
  icon,
  title,
  description,
  href,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-left transition hover:border-white/[0.1] hover:bg-white/[0.035]"
    >
      <div
        className={
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
          (accent
            ? "bg-[#ff1744]/10 text-[#ff1744]"
            : "bg-white/[0.04] text-white/50")
        }
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white/75">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-white/25">
          {description}
        </p>
      </div>
      <ArrowUpRight
        size={13}
        className="text-white/15 transition group-hover:translate-x-0.5 group-hover:text-white/50"
      />
    </Link>
  );
}
