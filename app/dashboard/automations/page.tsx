"use client";

import Image from "next/image";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AutomationsPage() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[180px] top-[10%] h-[520px] w-[520px] rounded-full bg-red-600/[0.045] blur-[140px]" />

        <div className="absolute right-[-180px] top-[25%] h-[520px] w-[520px] rounded-full bg-red-600/[0.035] blur-[150px]" />

        <div className="absolute bottom-[-250px] left-[35%] h-[500px] w-[500px] rounded-full bg-red-600/[0.025] blur-[150px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-6 lg:px-10">
          {/* Logo */}
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="group flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/[0.04] shadow-lg shadow-red-600/[0.05] transition group-hover:border-red-500/40">
              <span className="text-sm font-black italic text-red-500">
                D
              </span>
            </div>

            <div className="text-left">
              <div className="text-[10px] font-black tracking-[0.28em] text-red-500">
                DEVILX
              </div>

              <div className="text-[11px] font-medium tracking-wide text-white/35">
                FLOW
              </div>
            </div>
          </button>

          {/* Right label */}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-lg shadow-red-500/60" />

            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
              Automation System
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] max-w-[1500px] flex-col px-6 py-10 lg:px-10 lg:py-14">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-[11px] font-medium text-white/25">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="transition hover:text-white/60"
          >
            Dashboard
          </button>

          <span className="text-white/10">/</span>

          <span className="text-red-400/70">
            Automations
          </span>
        </div>

        {/* Heading */}
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-px w-8 bg-red-500/60" />

            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400/70">
              DEVILX FLOW
            </span>
          </div>

          <h1 className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            Automations
            <span className="text-red-500">.</span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-white/35 sm:text-base">
            Automate your business workflows with powerful
            email and WhatsApp actions.
          </p>
        </div>

        {/* Automation cards */}
        <div className="mt-10 grid flex-1 gap-5 lg:grid-cols-2">
          {/* Email Automation */}
          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/automations/email")
            }
            className="group relative flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090909] text-left transition-all duration-500 hover:border-red-500/40 hover:bg-[#0b0b0b] hover:shadow-[0_0_80px_rgba(220,38,38,0.10)]"
          >
            {/* Glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-red-600/[0.08] blur-[90px] transition-all duration-500 group-hover:bg-red-600/[0.16]" />

            {/* Graphic */}
            <div className="absolute right-[-25px] top-[-15px] h-[280px] w-[280px] opacity-50 transition-all duration-700 group-hover:scale-105 group-hover:opacity-80 sm:h-[330px] sm:w-[330px]">
              <Image
                src="/automation/email-graphic.png"
                alt=""
                fill
                priority
                className="object-contain"
              />
            </div>

            {/* Content */}
            <div className="relative z-10 flex h-full flex-col p-7 sm:p-9">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/[0.06] text-red-400 transition-all duration-300 group-hover:border-red-500/40 group-hover:bg-red-500/[0.10]">
                <Mail size={19} />
              </div>

              <div className="mt-auto max-w-md">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-red-400/60">
                  Communication
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Email Automation
                </h2>

                <p className="mt-3 max-w-sm text-sm leading-6 text-white/35">
                  Automatically send personalized emails based
                  on your business events and conditions.
                </p>

                <div className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-red-400 transition-all duration-300 group-hover:gap-3 group-hover:text-red-300">
                  Create Automation
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </button>

          {/* WhatsApp Automation */}
          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/automations/whatsapp")
            }
            className="group relative flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090909] text-left transition-all duration-500 hover:border-[#25D366]/40 hover:bg-[#090909] hover:shadow-[0_0_80px_rgba(37,211,102,0.09)]"
          >
            {/* Glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#25D366]/[0.05] blur-[90px] transition-all duration-500 group-hover:bg-[#25D366]/[0.14]" />

            {/* Graphic */}
            <div className="absolute right-[-25px] top-[-15px] h-[280px] w-[280px] opacity-50 transition-all duration-700 group-hover:scale-105 group-hover:opacity-80 sm:h-[330px] sm:w-[330px]">
              <Image
                src="/automation/whatsapp-graphic.png"
                alt=""
                fill
                className="object-contain"
              />
            </div>

            {/* Content */}
            <div className="relative z-10 flex h-full flex-col p-7 sm:p-9">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#25D366]/20 bg-[#25D366]/[0.05] text-[#25D366] transition-all duration-300 group-hover:border-[#25D366]/40 group-hover:bg-[#25D366]/[0.10]">
                <MessageCircle size={19} />
              </div>

              <div className="mt-auto max-w-md">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#25D366]/60">
                  Messaging
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  WhatsApp Automation
                </h2>

                <p className="mt-3 max-w-sm text-sm leading-6 text-white/35">
                  Send automated WhatsApp messages when
                  payments, events, or conditions are triggered.
                </p>

                <div className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-[#25D366] transition-all duration-300 group-hover:gap-3 group-hover:text-[#25D366]">
                  Create Automation
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-5">
          <span className="text-[9px] font-bold tracking-[0.28em] text-white/15">
            DEVILX AUTOMATION SYSTEM
          </span>

          <span className="text-[9px] tracking-[0.18em] text-white/10">
            FLOW
          </span>
        </div>
      </div>
    </main>
  );
}