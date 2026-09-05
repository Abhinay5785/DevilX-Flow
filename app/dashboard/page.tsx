
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronDown,
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

const EMPTY_STATS: DashboardStats = {
  totalCustomers: 0,
  totalRevenue: 0,
  activeFlows: 0,
  paymentsReceived: 0,
};



const activities = [
  {
    name: "Rahul Sharma",
    action: "completed a WhatsApp flow",
    time: "2 min ago",
    type: "flow",
  },
  {
    name: "Priya Reddy",
    action: "joined as a new customer",
    time: "18 min ago",
    type: "customer",
  },
  {
    name: "Arjun Kumar",
    action: "opened your WhatsApp message",
    time: "32 min ago",
    type: "message",
  },
  {
    name: "Sneha Rao",
    action: "completed a WhatsApp flow",
    time: "1 hr ago",
    type: "flow",
  },
];

export default function DashboardPage() {
  const supabase = createClient();

  const [dashboardStats, setDashboardStats] =
    useState<DashboardStats>(EMPTY_STATS);

  const [statsLoading, setStatsLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardStats() {
      setStatsLoading(true);

      const { data, error } = await supabase
        .from("customers")
        .select(
          `
            id,
            course,
            batch,
            payments (
              amount,
              status
            )
          `,
        );

      if (cancelled) return;

      if (error) {
        console.error(
          "Failed to load dashboard customer data:",
          error,
        );
        setDashboardStats(EMPTY_STATS);
        setStatsLoading(false);
        return;
      }

      const customers = data || [];

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
                const status =
                  String(payment.status || "").toLowerCase();

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

      /*
       * A flow/program is represented by a unique
       * Course + Batch combination in the customer data.
       * This keeps the dashboard connected to the same
       * customer dataset used by the Customers page.
       */
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

      /*
       * "Payments Received" is the number of successful
       * payment records, derived from the customer payments.
       */
      const paymentsReceived = customers.reduce(
        (total, customer) => {
          const customerPayments =
            Array.isArray(customer.payments)
              ? customer.payments
              : [];

          return (
            total +
            customerPayments.filter((payment) => {
              const status =
                String(
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

      setStatsLoading(false);
    }

    loadDashboardStats();

    return () => {
      cancelled = true;
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

                <p className="mt-0.5 text-[9px] uppercase tracking-[2px] text-white/30">
                  Automation Platform
                </p>
              </div>

            </div>
          </div>

          {/* NAVIGATION */}
          <div className="flex-1 px-4">

            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[2px] text-white/25">
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

            <p className="mb-3 mt-9 px-3 text-[10px] font-semibold uppercase tracking-[2px] text-white/25">
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

                <p className="mt-1 text-[10px] leading-4 text-white/35">
                  Automate conversations and grow faster.
                </p>

                <Link
                  href="/dashboard/whatsapp"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-[11px] font-semibold text-black transition hover:bg-white/90"
                >
                  <Plus size={13} />
                  Create Flow
                </Link>

              </div>
            </div>
          </div>

          {/* USER */}
          <div className="border-t border-white/[0.06] px-4 py-4">

            <div className="flex items-center gap-3 rounded-xl p-2">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff1744] to-[#7a001d] text-xs font-bold">
                A
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  Admin
                </p>

                <p className="truncate text-[10px] text-white/30">
                  DevilX Workspace
                </p>
              </div>

              <ChevronDown
                size={14}
                className="text-white/30"
              />

            </div>

          </div>

        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1 bg-[#050505]">

          {/* TOP BAR */}
          <header className="flex h-[72px] items-center justify-between border-b border-white/[0.06] px-5 sm:px-7 lg:px-10">

            <div>
              <p className="text-[10px] uppercase tracking-[2px] text-white/25">
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

              <button className="flex items-center gap-2">

                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ff1744] to-[#7a001d] text-[10px] font-bold">
                  A
                </div>

                <span className="hidden text-xs font-medium text-white/70 md:block">
                  Admin
                </span>

                <ChevronDown
                  size={13}
                  className="hidden text-white/25 md:block"
                />

              </button>

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

                    <span className="text-[10px] font-semibold uppercase tracking-[2px] text-[#ff1744]">
                      DevilX Flow
                    </span>

                  </div>

                  <h2 className="text-3xl font-bold tracking-[-1px] sm:text-4xl lg:text-[42px] lg:leading-[1.1]">
                    Welcome back, Admin
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

                        <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                          <ArrowUpRight size={12} />
                          {stat.change}
                        </div>

                      </div>

                      <p className="text-[11px] text-white/30">
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

              {/* ACTIVITY */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

                <div className="mb-6 flex items-center justify-between">

                  <div>
                    <h3 className="text-sm font-semibold">
                      Recent Activity
                    </h3>

                    <p className="mt-1 text-[10px] text-white/25">
                      What&apos;s happening across your flows
                    </p>
                  </div>

                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-white/25 transition hover:bg-white/[0.05] hover:text-white">
                    <BarChart3 size={15} />
                  </button>

                </div>

                <div className="space-y-1">

                  {activities.map((activity) => (

                    <div
                      key={`${activity.name}-${activity.time}`}
                      className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/[0.025]"
                    >

                      <div
                        className={
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                          (activity.type === "flow"
                            ? "bg-[#ff1744]/10 text-[#ff1744]"
                            : "bg-white/[0.06] text-white/60")
                        }
                      >

                        {activity.type === "flow" ? (
                          <Workflow size={14} />
                        ) : activity.type === "customer" ? (
                          <Users size={14} />
                        ) : (
                          <MessageCircle size={14} />
                        )}

                      </div>

                      <div className="min-w-0 flex-1">

                        <p className="truncate text-xs">
                          <span className="font-semibold text-white/80">
                            {activity.name}
                          </span>{" "}
                          <span className="text-white/35">
                            {activity.action}
                          </span>
                        </p>

                        <p className="mt-1 text-[10px] text-white/20">
                          {activity.time}
                        </p>

                      </div>

                      <ArrowUpRight
                        size={13}
                        className="text-white/10 transition group-hover:text-white/40"
                      />

                    </div>

                  ))}

                </div>

              </div>

              {/* QUICK ACTIONS */}
              <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b0b] p-5 sm:p-6">

                <div className="mb-6">

                  <h3 className="text-sm font-semibold">
                    Quick Actions
                  </h3>

                  <p className="mt-1 text-[10px] text-white/25">
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

              <p className="text-[9px] uppercase tracking-[2px] text-white/15">
                DevilX Flow
              </p>

              <p className="text-[9px] text-white/15">
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
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all " +
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
        <p className="text-[11px] font-semibold text-white/75">
          {title}
        </p>
        <p className="mt-0.5 text-[9px] text-white/25">
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
