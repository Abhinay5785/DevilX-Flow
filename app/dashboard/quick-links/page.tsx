"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  Check,
  CircleDollarSign,
  Copy,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";

import {
  type QuickLink,
  normalizeLinkInput,
  validateLinkInput,
} from "@/lib/quick-links";

type LinkForm = {
  title: string;
  url: string;
};

const EMPTY_FORM: LinkForm = {
  title: "",
  url: "",
};

export default function QuickLinksPage() {
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null);
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      const response = await fetch("/api/quick-links", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load quick links.");
      }

      setLinks(payload.links || []);
      setError("");
    } catch (loadError) {
      setLinks([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load quick links.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/quick-links", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        return { response, payload };
      })
      .then(({ response, payload }) => {
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load quick links.");
        }

        setLinks(payload.links || []);
        setError("");
        setLoading(false);
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;

        setLinks([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load quick links.",
        );
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matched = query
      ? links.filter((link) =>
          [link.title, link.url].join(" ").toLowerCase().includes(query),
        )
      : links;

    return [...matched].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }

      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [links, search]);

  function openCreate() {
    setEditingLink(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowModal(true);
  }

  function openEdit(link: QuickLink) {
    setEditingLink(link);
    setForm({ title: link.title, url: link.url });
    setFormError("");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;
    setShowModal(false);
    setEditingLink(null);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  async function saveLink() {
    const { title, url } = normalizeLinkInput(form);
    const validationError = validateLinkInput(title, url);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const response = await fetch(
        editingLink ? `/api/quick-links/${editingLink.id}` : "/api/quick-links",
        {
          method: editingLink ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, url }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not save this link.");
      }

      setShowModal(false);
      setEditingLink(null);
      setForm(EMPTY_FORM);
      await loadLinks();
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this link.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(link: QuickLink) {
    setError("");

    const { error: requestError } = await requestJson(
      `/api/quick-links/${link.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: !link.is_pinned }),
      },
    );

    if (requestError) {
      setError(requestError);
      return;
    }

    await loadLinks();
  }

  async function deleteLink(link: QuickLink) {
    const confirmed = window.confirm(
      `Delete "${link.title}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    setError("");

    const { error: requestError } = await requestJson(
      `/api/quick-links/${link.id}`,
      { method: "DELETE" },
    );

    if (requestError) {
      setError(requestError);
      return;
    }

    await loadLinks();
  }

  async function copyUrl(link: QuickLink) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === link.id ? null : current));
      }, 1800);
    } catch {
      setError("Could not copy this URL. Check clipboard permissions.");
    }
  }

  function openUrl(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="devilx-dashboard min-h-screen bg-black text-white selection:bg-[#ff1744]/30">
      <div className="flex min-h-screen overflow-x-hidden">
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
              <SidebarItem icon={<LayoutDashboard size={17} />} label="Dashboard" href="/dashboard" />
              <SidebarItem icon={<Users size={17} />} label="Customers" href="/dashboard/customers" />
              <SidebarItem icon={<CalendarDays size={17} />} label="Consultations" href="/dashboard/consultations" />
              <SidebarItem icon={<CreditCard size={17} />} label="Courses" href="/dashboard/courses" />
              <SidebarItem icon={<CircleDollarSign size={17} />} label="Revenue" href="/dashboard/revenue" />
              <SidebarItem icon={<MessageCircle size={17} />} label="WhatsApp" href="/dashboard/whatsapp" />
              <SidebarItem icon={<Link2 size={17} />} label="Quick Links" href="/dashboard/quick-links" active />
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

        <main className="min-w-0 flex-1 bg-black pb-24 lg:pb-0">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.08] bg-black/90 px-3 py-3 backdrop-blur-xl lg:hidden sm:px-5">
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#ff1744]/25 bg-[#ff1744]/10 text-[#ff5d79] transition hover:bg-[#ff1744]/15"
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

          <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-9">
            <section className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff1744]">
                  Workspace
                </p>
                <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-white sm:text-3xl md:text-[34px]">
                  Quick Links
                </h1>
                <p className="mt-1.5 max-w-[620px] text-xs leading-5 text-slate-400 sm:text-sm">
                  Save and access your frequently used links in one place.
                </p>
              </div>

              <button
                type="button"
                onClick={openCreate}
                className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#ff1744] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(255,23,68,0.25)] transition hover:bg-[#e0103a]"
              >
                <Plus size={16} />
                Add Link
              </button>
            </section>

            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                  <X size={12} />
                </span>
                <p className="min-w-0 flex-1">{error}</p>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setError("")}
                  className="text-red-300 transition hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
            )}

            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#0b0c0e] px-3 py-2.5 sm:px-4">
              <Search size={16} className="shrink-0 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search links..."
                aria-label="Search links"
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="text-slate-500 transition hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {loading ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0c0e] px-4 py-16 text-center text-sm text-slate-500">
                Loading quick links...
              </div>
            ) : filteredLinks.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#0b0c0e] px-4 py-16 text-center shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff1744]/10 text-[#ff1744]">
                  <Link2 size={22} />
                </div>
                <h2 className="text-lg font-bold text-white">
                  {search ? "No matching links" : "No links saved yet"}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                  {search
                    ? "Try a different title or URL, or clear the search to see all saved links."
                    : "Save dashboards, portals, and tools you open often so they are one click away."}
                </p>
                {!search && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#ff1744] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0103a]"
                  >
                    <Plus size={16} />
                    Add Link
                  </button>
                )}
              </div>
            ) : (
              <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredLinks.map((link) => {
                  const copied = copiedId === link.id;

                  return (
                    <article
                      key={link.id}
                      className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d10] p-4 shadow-[0_14px_40px_rgba(0,0,0,0.3)] transition duration-300 hover:bg-[#101115] sm:p-5"
                    >
                      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#ff1744]/[0.06] blur-3xl" />
                      <div className="relative flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-[#ff1744]/10 text-[#ff6683]">
                          <Link2 size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100 sm:text-[15px]">
                              {link.title}
                            </h2>
                            <button
                              type="button"
                              onClick={() => togglePin(link)}
                              aria-label={link.is_pinned ? "Unpin link" : "Pin link"}
                              className={
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition " +
                                (link.is_pinned
                                  ? "border-[#ff1744]/30 bg-[#ff1744]/10 text-[#ff5d79]"
                                  : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:text-white")
                              }
                            >
                              <Pin size={14} fill={link.is_pinned ? "currentColor" : "none"} />
                            </button>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500" title={link.url}>
                            {link.url}
                          </p>
                        </div>
                      </div>

                      <div className="relative mt-4 flex min-w-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copyUrl(link)}
                          className={
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition sm:text-xs " +
                            (copied
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                              : "border-white/[0.08] bg-white/[0.02] text-slate-300 hover:bg-white/[0.06] hover:text-white")
                          }
                        >
                          {copied ? <Check size={13} /> : <Copy size={13} />}
                          {copied ? "Copied ✓" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openUrl(link.url)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white sm:text-xs"
                        >
                          <ExternalLink size={13} />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(link)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white sm:text-xs"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLink(link)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/15 sm:text-xs"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#050505]/95 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid max-w-[760px] grid-cols-7">
            <MobileNavItem icon={<LayoutDashboard size={17} />} label="Home" href="/dashboard" />
            <MobileNavItem icon={<Users size={17} />} label="Customers" href="/dashboard/customers" />
            <MobileNavItem icon={<CalendarDays size={17} />} label="Consultations" href="/dashboard/consultations" />
            <MobileNavItem icon={<CreditCard size={17} />} label="Courses" href="/dashboard/courses" />
            <MobileNavItem icon={<CircleDollarSign size={17} />} label="Revenue" href="/dashboard/revenue" />
            <MobileNavItem icon={<MessageCircle size={17} />} label="WhatsApp" href="/dashboard/whatsapp" />
            <MobileNavItem icon={<BarChart3 size={17} />} label="Analytics" href="/dashboard/analytics" />
          </div>
        </nav>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/76 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-link-modal-title"
            className="relative w-full max-w-[540px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101011] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.65)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-[#ff1744]" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ff1744]">
                  Workspace
                </p>
                <h2 id="quick-link-modal-title" className="mt-1 text-xl font-bold tracking-[-0.03em] text-white">
                  {editingLink ? "Edit Link" : "Add Link"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Save a title and a valid http:// or https:// URL.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#151516] text-slate-400 transition hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveLink();
              }}
            >
            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Title
              </span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Razorpay Dashboard"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0b0c0e] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#ff1744]/50 focus:ring-1 focus:ring-[#ff1744]/30"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                URL
              </span>
              <input
                value={form.url}
                onChange={(event) =>
                  setForm((current) => ({ ...current, url: event.target.value }))
                }
                placeholder="https://dashboard.razorpay.com/"
                className="w-full rounded-xl border border-white/[0.08] bg-[#0b0c0e] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#ff1744]/50 focus:ring-1 focus:ring-[#ff1744]/30"
              />
            </label>

            {formError && (
              <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
                {formError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.08] pt-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#ff1744] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e0103a] disabled:opacity-60"
              >
                {saving ? "Saving..." : editingLink ? "Save changes" : "Save link"}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        html {
          overflow-x: hidden;
        }

        .devilx-dashboard {
          overflow-x: hidden;
          -webkit-tap-highlight-color: transparent;
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

async function requestJson(input: string, init?: RequestInit) {
  try {
    const response = await fetch(input, init);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        error: String(payload.error || "Request failed."),
      };
    }

    return { error: "" };
  } catch {
    return { error: "Network error. Please try again." };
  }
}

function MobileNavItem({
  icon,
  label,
  href,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[9px] font-semibold transition-all " +
        (active
          ? "bg-[#ff1744]/10 text-[#ff5d79]"
          : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")
      }
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function SidebarItem({
  icon,
  label,
  href,
  active = false,
}: {
  icon: ReactNode;
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
