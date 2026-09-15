"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Edit3,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Automation = {
  id: string;
  name: string;
  active: boolean;
  trigger?: {
    field?: string;
    operator?: string;
    value?: string;
  };
  recipient?: {
    name?: string;
    email?: string;
  };
  subject?: string;
  delay_minutes?: number;
  triggered_count?: number;
  sent_count?: number;
  failed_count?: number;
  created_at?: string;
  updated_at?: string;
};

type GmailStatus = {
  connected: boolean;
  email: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  amount: "Payment Amount",
  status: "Payment Status",
  paymentMethod: "Payment Method",
  name: "Customer Name",
  email: "Customer Email",
  paymentId: "Payment ID",
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "Equals",
  not_equals: "Does not equal",
  contains: "Contains",
  greater_than: "Greater than",
  less_than: "Less than",
};

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function triggerText(automation: Automation) {
  const field =
    FIELD_LABELS[automation.trigger?.field ?? ""] ??
    automation.trigger?.field ??
    "Field";

  const operator =
    OPERATOR_LABELS[automation.trigger?.operator ?? ""] ??
    automation.trigger?.operator ??
    "operator";

  const value = automation.trigger?.value ?? "";

  return `WHEN ${field} ${operator.toLowerCase()} ${value}`;
}

export default function EmailAutomationsPage() {
  const router = useRouter();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [gmail, setGmail] = useState<GmailStatus>({
    connected: false,
    email: null,
  });
  const [gmailLoading, setGmailLoading] = useState(true);

  const loadAutomations = async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/automations/email", {
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load automations."
        );
      }

      setAutomations(
        Array.isArray(data.automations)
          ? data.automations
          : []
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load automations."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    setSettingsLoading(true);

    try {
      const response = await fetch(
        "/api/automations/settings",
        { cache: "no-store" }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load automation settings."
        );
      }

      setEmailEnabled(
        data?.settings?.emailEnabled !== false
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load automation settings."
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadGmailStatus = async () => {
    setGmailLoading(true);

    try {
      const response = await fetch(
        "/api/gmail/status",
        { cache: "no-store" }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load Gmail status."
        );
      }

      setGmail({
        connected: Boolean(data?.connected),
        email: data?.connection?.email ?? null,
      });
    } catch (error) {
      setGmail({
        connected: false,
        email: null,
      });

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load Gmail status."
      );
    } finally {
      setGmailLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      loadAutomations(),
      loadSettings(),
      loadGmailStatus(),
    ]);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const toggleGlobalEmail = async () => {
    if (settingsSaving || settingsLoading) return;

    const nextEnabled = !emailEnabled;

    setEmailEnabled(nextEnabled);
    setSettingsSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/automations/settings",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            emailEnabled: nextEnabled,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to update automation settings."
        );
      }

      setEmailEnabled(
        data?.settings?.emailEnabled !== false
      );
    } catch (error) {
      setEmailEnabled(!nextEnabled);

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update automation settings."
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const toggleAutomation = async (
    automation: Automation
  ) => {
    const nextActive = !automation.active;

    setAutomations((current) =>
      current.map((item) =>
        item.id === automation.id
          ? { ...item, active: nextActive }
          : item
      )
    );

    try {
      const response = await fetch(
        `/api/automations/email?id=${encodeURIComponent(
          automation.id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            active: nextActive,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to update automation."
        );
      }
    } catch (error) {
      setAutomations((current) =>
        current.map((item) =>
          item.id === automation.id
            ? { ...item, active: automation.active }
            : item
        )
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update automation."
      );
    }
  };

  const deleteAutomation = async (
    automation: Automation
  ) => {
    const confirmed = window.confirm(
      `Delete "${automation.name}"?`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/automations/email?id=${encodeURIComponent(
          automation.id
        )}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to delete automation."
        );
      }

      setAutomations((current) =>
        current.filter(
          (item) => item.id !== automation.id
        )
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete automation."
      );
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-red-600/[0.035] blur-[120px]" />
        <div className="absolute right-0 top-[30%] h-[360px] w-[360px] rounded-full bg-red-600/[0.025] blur-[110px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                router.push("/dashboard/automations")
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/50 transition hover:border-white/20 hover:text-white"
            >
              <ArrowLeft size={16} />
            </button>

            <div>
              <div className="text-[10px] font-bold tracking-[0.25em] text-red-400">
                DEVILX
              </div>
              <div className="text-sm font-semibold text-white">
                Email Automation
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gmailLoading ? (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-white/40">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white/30" />
                Checking Gmail...
              </div>
            ) : gmail.connected ? (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 text-xs font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                Connected
                {gmail.email && (
                  <span className="hidden max-w-[180px] truncate font-normal text-emerald-400/60 xl:inline">
                    {gmail.email}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  (window.location.href = "/api/gmail/connect")
                }
                className="flex h-9 items-center gap-2 rounded-lg border border-red-500/35 bg-red-500/[0.07] px-3 text-xs font-semibold text-red-300 shadow-[0_0_18px_rgba(239,68,68,0.06)] transition hover:border-red-500/60 hover:bg-red-500/[0.12] hover:text-red-200"
              >
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Connect now
              </button>
            )}

            <button
              type="button"
              onClick={toggleGlobalEmail}
              disabled={settingsLoading || settingsSaving}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                emailEnabled
                  ? "border-red-500/30 bg-red-500/[0.06] text-red-300 hover:border-red-500/50 hover:bg-red-500/[0.1]"
                  : "border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/65"
              } ${settingsSaving ? "cursor-wait opacity-60" : ""}`}
              aria-label={
                emailEnabled
                  ? "Turn off all email automations"
                  : "Turn on all email automations"
              }
            >
              <span
                className={`relative h-4 w-7 shrink-0 rounded-full transition ${
                  emailEnabled ? "bg-red-600" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow transition ${
                    emailEnabled ? "left-3.5" : "left-0.5"
                  }`}
                />
              </span>
              <span className="hidden sm:inline">
                Automation {emailEnabled ? "ON" : "OFF"}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/dashboard/automations/email/new"
                )
              }
              className="flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white shadow-lg shadow-red-600/10 transition hover:bg-red-500"
            >
              <Plus size={14} />
              Create Automation
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/25">
              Automation System
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
              Email Automations
            </h1>

            <p className="mt-1 text-sm text-white/35">
              Manage your automated payment emails.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshAll}
            disabled={
              loading ||
              settingsLoading ||
              gmailLoading
            }
            className="flex h-9 items-center gap-2 self-start rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-white/55 transition hover:border-white/20 hover:text-white disabled:opacity-50 sm:self-auto"
          >
            <RefreshCw
              size={13}
              className={
                loading ||
                settingsLoading ||
                gmailLoading
                  ? "animate-spin"
                  : ""
              }
            />
            Refresh
          </button>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-red-500/15 bg-red-500/[0.04] px-4 py-3 text-xs text-red-300">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#090909] px-6 py-16 text-center text-sm text-white/35">
            Loading automations...
          </div>
        ) : automations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#090909] px-6 py-20 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/[0.05]">
              <Mail
                size={20}
                className="text-red-400"
              />
            </div>

            <h2 className="mt-4 text-sm font-semibold text-white">
              No email automations yet
            </h2>

            <p className="mt-1 text-xs text-white/30">
              Create your first automation to start
              sending payment emails automatically.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/dashboard/automations/email/new"
                )
              }
              className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              <Plus size={14} />
              Create Automation
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className="group rounded-2xl border border-white/10 bg-[#090909] p-4 transition hover:border-white/[0.16]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-white">
                        {automation.name}
                      </h2>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          automation.active
                            ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400"
                            : "border-white/10 bg-white/[0.03] text-white/35"
                        }`}
                      >
                        {automation.active
                          ? "Active"
                          : "Paused"}
                      </span>

                      {!emailEnabled && (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.04] px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                          Globally Paused
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-white/35">
                      {triggerText(automation)}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-white/25">
                      <span>
                        To:{" "}
                        <span className="text-white/45">
                          {automation.recipient?.email ||
                            "—"}
                        </span>
                      </span>

                      <span>
                        Delay:{" "}
                        <span className="text-white/45">
                          {automation.delay_minutes ?? 0} min
                        </span>
                      </span>

                      <span>
                        Created:{" "}
                        <span className="text-white/45">
                          {formatDate(
                            automation.created_at
                          )}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        toggleAutomation(automation)
                      }
                      className={`relative h-6 w-11 rounded-full border transition ${
                        automation.active
                          ? "border-red-500/40 bg-red-600/70"
                          : "border-white/10 bg-white/[0.05]"
                      }`}
                      aria-label={
                        automation.active
                          ? "Pause automation"
                          : "Activate automation"
                      }
                    >
                      <span
                        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition ${
                          automation.active
                            ? "left-6"
                            : "left-1"
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/automations/email/new?id=${encodeURIComponent(
                            automation.id
                          )}`
                        )
                      }
                      className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 text-xs text-white/55 transition hover:border-red-500/25 hover:text-white"
                    >
                      <Edit3 size={13} />
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deleteAutomation(automation)
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/25 transition hover:border-red-500/25 hover:bg-red-500/[0.04] hover:text-red-400"
                      aria-label="Delete automation"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
