"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";

type TabKey = "overview" | "templates" | "automations" | "campaigns" | "logs";

type TemplateVariable = {
  id: string;
  name: string;
  source:
    | "name"
    | "phone"
    | "email"
    | "city"
    | "course"
    | "batch"
    | "paid"
    | "balance"
    | "full_amount"
    | "payment_status"
    | "payment_id"
    | "payment_date"
    | "custom";
  customValue?: string;
};

type WhatsAppTemplate = {
  id: string;
  label: string;
  templateName: string;
  languageCode: string;
  variables: TemplateVariable[];
  createdAt: string;
};

type Automation = {
  id: string;
  name: string;
  trigger:
    | "advance_received"
    | "balance_received"
    | "full_received"
    | "payment_failed"
    | "student_added"
    | "batch_tomorrow"
    | "batch_today";
  waitValue: number;
  waitUnit: "minutes" | "hours" | "days";
  templateId: string;
  active: boolean;
  createdAt: string;
};

type Campaign = {
  id: string;
  name: string;
  audience: string;
  templateName: string;
  recipients: number;
  sent: number;
  failed: number;
  createdAt: string;
};

type MessageLog = {
  id: string;
  student: string;
  phone: string;
  templateName: string;
  status: "sent" | "delivered" | "failed" | "pending";
  source: string;
  time: string;
};

const STORAGE = {
  templates: "devilx_whatsapp_templates_v1",
  automations: "devilx_whatsapp_automations_v1",
  campaigns: "devilx_whatsapp_campaigns_v1",
  logs: "devilx_whatsapp_logs_v1",
};

const sourceLabels: Record<TemplateVariable["source"], string> = {
  name: "Student Name",
  phone: "Phone",
  email: "Email",
  city: "City",
  course: "Course",
  batch: "Batch",
  paid: "Total Paid",
  balance: "Remaining Balance",
  full_amount: "Full Amount",
  payment_status: "Payment Status",
  payment_id: "Payment ID",
  payment_date: "Payment Date",
  custom: "Manual Value",
};

const triggerLabels: Record<Automation["trigger"], string> = {
  advance_received: "Advance Payment Received",
  balance_received: "Balance Payment Received",
  full_received: "Full Payment Received",
  payment_failed: "Payment Failed",
  student_added: "Student Added",
  batch_tomorrow: "Batch Starts Tomorrow",
  batch_today: "Batch Starts Today",
};

const demoLogs: MessageLog[] = [
  {
    id: "log-1",
    student: "Devaraju Kasaram",
    phone: "+91••••••••21",
    templateName: "payment_confirmation",
    status: "delivered",
    source: "Payment Confirmation",
    time: "21 min ago",
  },
  {
    id: "log-2",
    student: "Prasanna",
    phone: "+91••••••••32",
    templateName: "balance_reminder",
    status: "sent",
    source: "Batch 04 Campaign",
    time: "1 hr ago",
  },
  {
    id: "log-3",
    student: "Srimanth T",
    phone: "+91••••••••46",
    templateName: "course_confirmation",
    status: "failed",
    source: "Course Confirmation",
    time: "3 hrs ago",
  },
];

export default function WhatsAppPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [templateModal, setTemplateModal] = useState(false);
  const [automationModal, setAutomationModal] = useState(false);

  const [templateLabel, setTemplateLabel] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [languageCode, setLanguageCode] = useState("en_US");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);

  const [automationName, setAutomationName] = useState("");
  const [automationTrigger, setAutomationTrigger] =
    useState<Automation["trigger"]>("advance_received");
  const [automationWaitValue, setAutomationWaitValue] = useState("0");
  const [automationWaitUnit, setAutomationWaitUnit] =
    useState<Automation["waitUnit"]>("days");
  const [automationTemplateId, setAutomationTemplateId] = useState("");

  const [search, setSearch] = useState("");

  useEffect(() => {
    const safeParse = <T,>(key: string, fallback: T): T => {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
      } catch {
        return fallback;
      }
    };

    setTemplates(safeParse<WhatsAppTemplate[]>(STORAGE.templates, []));
    setAutomations(safeParse<Automation[]>(STORAGE.automations, []));
    setCampaigns(safeParse<Campaign[]>(STORAGE.campaigns, []));
    setLogs(safeParse<MessageLog[]>(STORAGE.logs, demoLogs));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE.templates, JSON.stringify(templates));
  }, [templates, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE.automations, JSON.stringify(automations));
  }, [automations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE.campaigns, JSON.stringify(campaigns));
  }, [campaigns, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE.logs, JSON.stringify(logs));
  }, [logs, hydrated]);

  const stats = useMemo(() => {
    const delivered = logs.filter((item) => item.status === "delivered").length;
    const sent = logs.filter(
      (item) => item.status === "sent" || item.status === "delivered",
    ).length;
    const failed = logs.filter((item) => item.status === "failed").length;
    const pending = logs.filter((item) => item.status === "pending").length;

    return { sent, delivered, failed, pending };
  }, [logs]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((item) =>
      [item.label, item.templateName, item.languageCode]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [templates, search]);

  const filteredAutomations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return automations;
    return automations.filter((item) =>
      [item.name, triggerLabels[item.trigger]]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [automations, search]);

  const resetTemplateForm = () => {
    setTemplateLabel("");
    setTemplateName("");
    setLanguageCode("en_US");
    setVariables([]);
  };

  const addVariable = () => {
    setVariables((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        name: String(current.length + 1),
        source: "name",
      },
    ]);
  };

  const saveTemplate = () => {
    const cleanLabel = templateLabel.trim();
    const cleanName = templateName.trim();
    const cleanLanguage = languageCode.trim() || "en_US";

    if (!cleanLabel || !cleanName) return;

    setTemplates((current) => [
      {
        id: crypto.randomUUID(),
        label: cleanLabel,
        templateName: cleanName,
        languageCode: cleanLanguage,
        variables,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);

    resetTemplateForm();
    setTemplateModal(false);
  };

  const saveAutomation = () => {
    if (!automationName.trim() || !automationTemplateId) return;

    setAutomations((current) => [
      {
        id: crypto.randomUUID(),
        name: automationName.trim(),
        trigger: automationTrigger,
        waitValue: Math.max(0, Number(automationWaitValue || 0)),
        waitUnit: automationWaitUnit,
        templateId: automationTemplateId,
        active: true,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);

    setAutomationName("");
    setAutomationTrigger("advance_received");
    setAutomationWaitValue("0");
    setAutomationWaitUnit("days");
    setAutomationTemplateId("");
    setAutomationModal(false);
  };

  const deleteTemplate = (id: string) => {
    setTemplates((current) => current.filter((item) => item.id !== id));
    setAutomations((current) =>
      current.filter((item) => item.templateId !== id),
    );
  };

  const deleteAutomation = (id: string) => {
    setAutomations((current) => current.filter((item) => item.id !== id));
  };

  const toggleAutomation = (id: string) => {
    setAutomations((current) =>
      current.map((item) =>
        item.id === id ? { ...item, active: !item.active } : item,
      ),
    );
  };

  const templateById = (id: string) =>
    templates.find((template) => template.id === id);

  return (
    <main className="wa-page">
      <div className="wa-shell">
        <header className="hero">
          <div>
            <div className="eyebrow">
              <MessageCircle size={15} />
              WHATSAPP
            </div>
            <h1>Automation & Messaging</h1>
            <p>
              Manage templates, payment reminders, campaigns and WhatsApp
              activity from one place.
            </p>
          </div>

          <div className="hero-actions">
            <button
              className="button secondary"
              onClick={() => {
                setTab("templates");
                setTemplateModal(true);
              }}
            >
              <Plus size={16} />
              Add Template
            </button>
            <button
              className="button whatsapp"
              onClick={() => setTab("campaigns")}
            >
              <Send size={16} />
              New Campaign
            </button>
          </div>
        </header>

        <section className="stats">
          <Stat
            icon={<Send size={18} />}
            label="Messages Sent"
            value={stats.sent}
            note="Sent + delivered"
          />
          <Stat
            icon={<CheckCircle2 size={18} />}
            label="Delivered"
            value={stats.delivered}
            note="Confirmed delivery"
          />
          <Stat
            icon={<X size={18} />}
            label="Failed"
            value={stats.failed}
            note="Needs attention"
            danger
          />
          <Stat
            icon={<Clock3 size={18} />}
            label="Pending"
            value={stats.pending}
            note="Waiting"
          />
        </section>

        <section className="workspace">
          <nav className="tabs">
            {([
              { value: "overview", label: "Overview", Icon: Activity },
              { value: "templates", label: "Templates", Icon: FileText },
              { value: "automations", label: "Automations", Icon: Zap },
              { value: "campaigns", label: "Campaigns", Icon: Send },
              { value: "logs", label: "Logs", Icon: BarChart3 },
            ] as const).map(({ value, label, Icon }) => (
              <button
                key={String(value)}
                className={tab === value ? "tab active" : "tab"}
                onClick={() => {
                  setTab(value as TabKey);
                  setSearch("");
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <Overview
              automations={automations}
              templates={templates}
              campaigns={campaigns}
              logs={logs}
              onOpenTemplates={() => setTab("templates")}
              onOpenAutomations={() => setTab("automations")}
              onOpenLogs={() => setTab("logs")}
            />
          )}

          {tab === "templates" && (
            <div className="section">
              <SectionHeader
                title="Templates"
                description="Save the exact approved WhatsApp template names and map their variables."
                action={
                  <button
                    className="button primary"
                    onClick={() => setTemplateModal(true)}
                  >
                    <Plus size={16} />
                    Add Template
                  </button>
                }
              />

              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search templates..."
              />

              {filteredTemplates.length === 0 ? (
                <EmptyState
                  icon={<FileText size={26} />}
                  title="No templates yet"
                  text="Add your first approved WhatsApp template."
                  buttonText="Add Template"
                  onClick={() => setTemplateModal(true)}
                />
              ) : (
                <div className="cards-grid">
                  {filteredTemplates.map((item) => (
                    <article className="template-card" key={item.id}>
                      <div className="card-top">
                        <div className="icon-box">
                          <FileText size={18} />
                        </div>
                        <button
                          className="icon-button danger"
                          onClick={() => deleteTemplate(item.id)}
                          title="Delete template"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <h3>{item.label}</h3>
                      <code>{item.templateName}</code>

                      <div className="meta-row">
                        <span>{item.languageCode}</span>
                        <span>{item.variables.length} variables</span>
                      </div>

                      <div className="variable-tags">
                        {item.variables.length === 0 ? (
                          <span className="muted">No variables</span>
                        ) : (
                          item.variables.map((variable, index) => (
                            <span key={variable.id}>
                              {`{{${index + 1}}}`}{" "}
                              {sourceLabels[variable.source]}
                            </span>
                          ))
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "automations" && (
            <div className="section">
              <SectionHeader
                title="Automations"
                description="Create rules for payments, students and batches."
                action={
                  <button
                    className="button primary"
                    onClick={() => setAutomationModal(true)}
                    disabled={templates.length === 0}
                  >
                    <Plus size={16} />
                    Add Automation
                  </button>
                }
              />

              {templates.length === 0 && (
                <div className="warning">
                  <Sparkles size={16} />
                  Add at least one WhatsApp template before creating an
                  automation.
                </div>
              )}

              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search automations..."
              />

              {filteredAutomations.length === 0 ? (
                <EmptyState
                  icon={<Zap size={26} />}
                  title="No automations yet"
                  text="Create payment reminders and confirmation flows."
                  buttonText="Add Automation"
                  onClick={() => setAutomationModal(true)}
                  disabled={templates.length === 0}
                />
              ) : (
                <div className="automation-list">
                  {filteredAutomations.map((item) => {
                    const linkedTemplate = templateById(item.templateId);
                    return (
                      <article className="automation-row" key={item.id}>
                        <div
                          className={
                            item.active ? "flow-icon active" : "flow-icon"
                          }
                        >
                          <Zap size={18} />
                        </div>

                        <div className="automation-main">
                          <div className="automation-title">
                            <h3>{item.name}</h3>
                            <span
                              className={
                                item.active
                                  ? "state-pill active"
                                  : "state-pill paused"
                              }
                            >
                              {item.active ? "Active" : "Paused"}
                            </span>
                          </div>
                          <p>
                            {triggerLabels[item.trigger]}
                            {item.waitValue > 0
                              ? ` → Wait ${item.waitValue} ${item.waitUnit}`
                              : ""}
                            {" → "}
                            {linkedTemplate?.label || "Missing template"}
                          </p>
                        </div>

                        <div className="automation-actions">
                          <button
                            className="icon-button"
                            onClick={() => toggleAutomation(item.id)}
                            title={item.active ? "Pause" : "Activate"}
                          >
                            {item.active ? (
                              <Pause size={15} />
                            ) : (
                              <Play size={15} />
                            )}
                          </button>
                          <button
                            className="icon-button danger"
                            onClick={() => deleteAutomation(item.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "campaigns" && (
            <div className="section">
              <SectionHeader
                title="Campaigns"
                description="One-time bulk messages should be created from a course or batch filter."
                action={
                  <button
                    className="button whatsapp"
                    onClick={() => {
                      alert(
                        "Open a Course → Batch, select the payment filter, then click Send WhatsApp.",
                      );
                    }}
                  >
                    <MessageCircle size={16} />
                    Open Batch Sender
                  </button>
                }
              />

              <div className="campaign-guide">
                <div>
                  <span>1</span>
                  <strong>Select Course + Batch</strong>
                  <small>Open the batch you want to message.</small>
                </div>
                <div>
                  <span>2</span>
                  <strong>Choose Payment Filter</strong>
                  <small>Advance Only, Full Payment, etc.</small>
                </div>
                <div>
                  <span>3</span>
                  <strong>Send WhatsApp</strong>
                  <small>Choose template and variables.</small>
                </div>
              </div>

              {campaigns.length === 0 ? (
                <EmptyState
                  icon={<Send size={26} />}
                  title="No campaign history yet"
                  text="Campaign history can be connected to your WhatsApp send API logs."
                />
              ) : (
                <div className="automation-list">
                  {campaigns.map((item) => (
                    <article className="automation-row" key={item.id}>
                      <div className="flow-icon">
                        <Send size={18} />
                      </div>
                      <div className="automation-main">
                        <h3>{item.name}</h3>
                        <p>
                          {item.audience} · {item.templateName}
                        </p>
                      </div>
                      <div className="campaign-numbers">
                        <span>{item.sent} sent</span>
                        <span>{item.failed} failed</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "logs" && (
            <div className="section">
              <SectionHeader
                title="Message Logs"
                description="Track what was sent, to whom and whether it succeeded."
                action={
                  <button
                    className="button secondary"
                    onClick={() => setLogs([])}
                  >
                    <Trash2 size={15} />
                    Clear Local Logs
                  </button>
                }
              />

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Phone</th>
                      <th>Template</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="empty-cell">
                          No logs yet.
                        </td>
                      </tr>
                    ) : (
                      logs.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.student}</strong>
                          </td>
                          <td>{item.phone}</td>
                          <td>
                            <code>{item.templateName}</code>
                          </td>
                          <td>{item.source}</td>
                          <td>
                            <span className={`log-status ${item.status}`}>
                              {item.status}
                            </span>
                          </td>
                          <td>{item.time}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {templateModal && (
        <Modal
          title="Add WhatsApp Template"
          kicker="TEMPLATE"
          onClose={() => {
            resetTemplateForm();
            setTemplateModal(false);
          }}
        >
          <div className="form-grid">
            <label className="field full">
              <span>Display Name *</span>
              <input
                value={templateLabel}
                onChange={(e) => setTemplateLabel(e.target.value)}
                placeholder="Payment Balance Reminder"
              />
            </label>

            <label className="field">
              <span>Template Name *</span>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="payment_balance_reminder"
              />
            </label>

            <label className="field">
              <span>Language Code</span>
              <input
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                placeholder="en_US"
              />
            </label>
          </div>

          <div className="subsection-head">
            <div>
              <strong>Variables</strong>
              <small>Add them in exactly the same order as WhatsApp.</small>
            </div>
            <button className="button secondary" onClick={addVariable}>
              <Plus size={15} />
              Add Variable
            </button>
          </div>

          <div className="variable-editor">
            {variables.length === 0 ? (
              <div className="mini-empty">
                No variables. Add variables only if this template uses them.
              </div>
            ) : (
              variables.map((variable, index) => (
                <div className="variable-row" key={variable.id}>
                  <div className="variable-index">{index + 1}</div>

                  <input
                    value={variable.name}
                    onChange={(e) =>
                      setVariables((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: e.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder={`{{${index + 1}}}`}
                  />

                  <select
                    value={variable.source}
                    onChange={(e) =>
                      setVariables((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                source: e.target.value as TemplateVariable["source"],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    {Object.entries(sourceLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  {variable.source === "custom" && (
                    <input
                      value={variable.customValue || ""}
                      onChange={(e) =>
                        setVariables((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, customValue: e.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Manual value"
                    />
                  )}

                  <button
                    className="icon-button danger"
                    onClick={() =>
                      setVariables((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => {
                resetTemplateForm();
                setTemplateModal(false);
              }}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={saveTemplate}
              disabled={!templateLabel.trim() || !templateName.trim()}
            >
              Save Template
            </button>
          </div>
        </Modal>
      )}

      {automationModal && (
        <Modal
          title="Create Automation"
          kicker="AUTOMATION"
          onClose={() => setAutomationModal(false)}
        >
          <div className="form-grid">
            <label className="field full">
              <span>Automation Name *</span>
              <input
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                placeholder="Advance → Balance Reminder"
              />
            </label>

            <label className="field full">
              <span>When</span>
              <select
                value={automationTrigger}
                onChange={(e) =>
                  setAutomationTrigger(e.target.value as Automation["trigger"])
                }
              >
                {Object.entries(triggerLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Wait</span>
              <input
                type="number"
                min={0}
                value={automationWaitValue}
                onChange={(e) => setAutomationWaitValue(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Unit</span>
              <select
                value={automationWaitUnit}
                onChange={(e) =>
                  setAutomationWaitUnit(e.target.value as Automation["waitUnit"])
                }
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </label>

            <label className="field full">
              <span>Then Send Template *</span>
              <select
                value={automationTemplateId}
                onChange={(e) => setAutomationTemplateId(e.target.value)}
              >
                <option value="">Select template</option>
                {templates.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.label} — {item.templateName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="automation-preview">
            <span>FLOW PREVIEW</span>
            <strong>{triggerLabels[automationTrigger]}</strong>
            <div className="flow-arrow">↓</div>
            <strong>
              {Number(automationWaitValue) > 0
                ? `Wait ${automationWaitValue} ${automationWaitUnit}`
                : "Immediately"}
            </strong>
            <div className="flow-arrow">↓</div>
            <strong>
              {templateById(automationTemplateId)?.label ||
                "Select WhatsApp Template"}
            </strong>
          </div>

          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setAutomationModal(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={saveAutomation}
              disabled={!automationName.trim() || !automationTemplateId}
            >
              Create Automation
            </button>
          </div>
        </Modal>
      )}

      <Styles />
    </main>
  );
}

function Overview({
  automations,
  templates,
  campaigns,
  logs,
  onOpenTemplates,
  onOpenAutomations,
  onOpenLogs,
}: {
  automations: Automation[];
  templates: WhatsAppTemplate[];
  campaigns: Campaign[];
  logs: MessageLog[];
  onOpenTemplates: () => void;
  onOpenAutomations: () => void;
  onOpenLogs: () => void;
}) {
  const active = automations.filter((item) => item.active).length;

  return (
    <div className="overview-grid">
      <section className="overview-card large">
        <div className="overview-card-head">
          <div>
            <span className="section-kicker">AUTOMATION STATUS</span>
            <h2>Active flows</h2>
          </div>
          <button className="text-button" onClick={onOpenAutomations}>
            View all
          </button>
        </div>

        {automations.length === 0 ? (
          <div className="overview-empty">
            <Bot size={28} />
            <strong>No automations yet</strong>
            <span>Create your first automated WhatsApp flow.</span>
          </div>
        ) : (
          <div className="overview-list">
            {automations.slice(0, 4).map((item) => (
              <div key={item.id}>
                <span className={item.active ? "live-dot active" : "live-dot"} />
                <div>
                  <strong>{item.name}</strong>
                  <small>{triggerLabels[item.trigger]}</small>
                </div>
                <span className={item.active ? "state-pill active" : "state-pill paused"}>
                  {item.active ? "Active" : "Paused"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overview-card">
        <div className="mini-stat-icon">
          <FileText size={19} />
        </div>
        <span className="section-kicker">TEMPLATES</span>
        <strong className="big-number">{templates.length}</strong>
        <p>Saved WhatsApp templates</p>
        <button className="text-button" onClick={onOpenTemplates}>
          Manage templates
        </button>
      </section>

      <section className="overview-card">
        <div className="mini-stat-icon">
          <Zap size={19} />
        </div>
        <span className="section-kicker">ACTIVE</span>
        <strong className="big-number">{active}</strong>
        <p>Automations currently running</p>
        <button className="text-button" onClick={onOpenAutomations}>
          Manage automations
        </button>
      </section>

      <section className="overview-card large">
        <div className="overview-card-head">
          <div>
            <span className="section-kicker">RECENT ACTIVITY</span>
            <h2>Latest messages</h2>
          </div>
          <button className="text-button" onClick={onOpenLogs}>
            View logs
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="overview-empty">
            <MessageCircle size={28} />
            <strong>No message activity</strong>
          </div>
        ) : (
          <div className="overview-list">
            {logs.slice(0, 4).map((item) => (
              <div key={item.id}>
                <div className="avatar">{item.student.charAt(0)}</div>
                <div>
                  <strong>{item.student}</strong>
                  <small>{item.templateName}</small>
                </div>
                <span className={`log-status ${item.status}`}>{item.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overview-card wide">
        <div className="overview-card-head">
          <div>
            <span className="section-kicker">QUICK START</span>
            <h2>Recommended DevilX flow</h2>
          </div>
        </div>

        <div className="quick-flow">
          <div>
            <span>01</span>
            <strong>Save Template</strong>
            <small>Enter approved template name + variables.</small>
          </div>
          <div className="flow-line" />
          <div>
            <span>02</span>
            <strong>Create Automation</strong>
            <small>Choose trigger, wait time and template.</small>
          </div>
          <div className="flow-line" />
          <div>
            <span>03</span>
            <strong>Track Logs</strong>
            <small>Review sent, delivered and failed messages.</small>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  danger?: boolean;
}) {
  return (
    <article className={danger ? "stat danger" : "stat"}>
      <div className="stat-head">
        <div className="stat-icon">{icon}</div>
        <span className="live-badge">
          <span />
          Live
        </span>
      </div>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  buttonText,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  buttonText?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {buttonText && onClick && (
        <button className="button primary" onClick={onClick} disabled={disabled}>
          <Plus size={15} />
          {buttonText}
        </button>
      )}
    </div>
  );
}

function Modal({
  title,
  kicker,
  onClose,
  children,
}: {
  title: string;
  kicker: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="section-kicker">{kicker}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
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
        background: #050505;
        color: #f7f7f8;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      button,
      input,
      select {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .wa-page {
        min-height: 100vh;
        background:
          radial-gradient(circle at 78% 0%, rgba(255, 23, 68, 0.07), transparent 24%),
          #050505;
        color: #f7f7f8;
        padding: 30px 34px 70px;
      }

      .wa-shell {
        width: 100%;
        max-width: 1380px;
        margin: 0 auto;
      }

      .hero {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 24px;
        margin-bottom: 24px;
      }

      .eyebrow,
      .section-kicker {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: #ff1744;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .hero h1 {
        margin: 8px 0 6px;
        font-size: clamp(30px, 4vw, 46px);
        line-height: 1;
        letter-spacing: -0.04em;
      }

      .hero p,
      .section-header p,
      .overview-card p {
        margin: 0;
        color: #7f8ea8;
        font-size: 13px;
        line-height: 1.6;
      }

      .hero-actions,
      .modal-actions,
      .automation-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .button {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid transparent;
        font-size: 12px;
        font-weight: 800;
        transition: 0.16s ease;
      }

      .button.primary {
        color: #fff;
        background: #ff1744;
        border-color: #ff1744;
        box-shadow: 0 10px 25px rgba(255, 23, 68, 0.15);
      }

      .button.primary:hover:not(:disabled) {
        background: #ff2d56;
        transform: translateY(-1px);
      }

      .button.secondary {
        color: #c2c6cf;
        background: #0d0d0f;
        border-color: #26262b;
      }

      .button.secondary:hover:not(:disabled) {
        color: #fff;
        border-color: #3a3a40;
      }

      .button.whatsapp {
        color: #fff;
        background: linear-gradient(180deg, #25d366, #128c7e);
        border-color: rgba(37, 211, 102, 0.45);
        box-shadow: 0 10px 25px rgba(37, 211, 102, 0.13);
      }

      .button.whatsapp:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 12px 30px rgba(37, 211, 102, 0.2);
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }

      .stat {
        min-height: 170px;
        padding: 20px;
        border-radius: 15px;
        border: 1px solid #242429;
        background: #0b0b0d;
      }

      .stat:first-child {
        border-color: rgba(255, 23, 68, 0.5);
      }

      .stat.danger {
        border-color: rgba(255, 90, 90, 0.24);
      }

      .stat-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }

      .stat-icon,
      .mini-stat-icon,
      .icon-box {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: 12px;
        color: #ff4167;
        background: rgba(255, 23, 68, 0.1);
        border: 1px solid rgba(255, 23, 68, 0.16);
      }

      .live-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: #43dda1;
        background: rgba(23, 194, 128, 0.08);
        border-radius: 999px;
        padding: 5px 8px;
        font-size: 10px;
        font-weight: 800;
      }

      .live-badge span {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #20e49a;
      }

      .stat-label {
        display: block;
        color: #8ea0bc;
        font-size: 12px;
        margin-bottom: 5px;
      }

      .stat > strong {
        display: block;
        font-size: 31px;
        line-height: 1;
        margin-bottom: 9px;
      }

      .stat > small {
        color: #66738a;
        font-size: 11px;
      }

      .workspace {
        border: 1px solid #202024;
        border-radius: 15px;
        overflow: hidden;
        background: #09090b;
      }

      .tabs {
        display: flex;
        gap: 4px;
        padding: 10px;
        border-bottom: 1px solid #1f1f23;
        overflow-x: auto;
      }

      .tab {
        min-height: 39px;
        padding: 0 13px;
        border: 1px solid transparent;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: #7f8796;
        background: transparent;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .tab:hover {
        color: #fff;
        background: #101013;
      }

      .tab.active {
        color: #fff;
        background: rgba(255, 23, 68, 0.11);
        border-color: rgba(255, 23, 68, 0.24);
      }

      .section {
        padding: 22px;
      }

      .section-header,
      .overview-card-head,
      .subsection-head,
      .modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }

      .section-header {
        margin-bottom: 17px;
      }

      .section-header h2,
      .overview-card-head h2,
      .modal-head h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }

      .search-box {
        width: min(430px, 100%);
        min-height: 42px;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 12px;
        border: 1px solid #26262b;
        border-radius: 9px;
        background: #0d0d0f;
        color: #747d8d;
        margin-bottom: 18px;
      }

      .search-box input {
        width: 100%;
        border: 0;
        outline: 0;
        background: transparent;
        color: #fff;
        font-size: 12px;
      }

      .search-box button {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border: 0;
        color: #6f7784;
        background: transparent;
      }

      .cards-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .template-card {
        min-height: 230px;
        padding: 18px;
        border: 1px solid #232328;
        border-radius: 12px;
        background: #0d0d10;
      }

      .card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }

      .template-card h3 {
        margin: 0 0 7px;
        font-size: 16px;
      }

      .template-card code,
      td code {
        color: #ff6685;
        font-size: 11px;
      }

      .meta-row {
        display: flex;
        gap: 7px;
        margin: 15px 0 12px;
      }

      .meta-row span,
      .variable-tags span {
        border: 1px solid #28282d;
        border-radius: 6px;
        background: #111115;
        padding: 5px 7px;
        color: #8d96a6;
        font-size: 10px;
      }

      .variable-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .muted {
        color: #666f7f !important;
      }

      .icon-button {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid #29292e;
        border-radius: 8px;
        background: #101012;
        color: #8e96a5;
      }

      .icon-button:hover {
        color: #fff;
      }

      .icon-button.danger:hover {
        color: #ff6682;
        border-color: rgba(255, 23, 68, 0.32);
      }

      .warning {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 15px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 160, 32, 0.2);
        border-radius: 8px;
        background: rgba(255, 160, 32, 0.05);
        color: #d6a55c;
        font-size: 12px;
      }

      .automation-list {
        display: flex;
        flex-direction: column;
        border: 1px solid #222227;
        border-radius: 11px;
        overflow: hidden;
      }

      .automation-row {
        min-height: 84px;
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 14px 16px;
        background: #0c0c0e;
        border-bottom: 1px solid #1d1d21;
      }

      .automation-row:last-child {
        border-bottom: 0;
      }

      .flow-icon {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        color: #7b8392;
        background: #131317;
        border: 1px solid #26262c;
      }

      .flow-icon.active {
        color: #ff456b;
        background: rgba(255, 23, 68, 0.09);
        border-color: rgba(255, 23, 68, 0.2);
      }

      .automation-main {
        min-width: 0;
        flex: 1;
      }

      .automation-main h3,
      .automation-title h3 {
        margin: 0;
        font-size: 13px;
      }

      .automation-main p {
        margin: 5px 0 0;
        color: #748097;
        font-size: 11px;
      }

      .automation-title {
        display: flex;
        align-items: center;
        gap: 9px;
      }

      .state-pill,
      .log-status {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 7px;
        font-size: 9px;
        font-weight: 900;
        text-transform: capitalize;
      }

      .state-pill.active,
      .log-status.delivered,
      .log-status.sent {
        color: #49e0a4;
        background: rgba(29, 199, 133, 0.1);
      }

      .state-pill.paused,
      .log-status.pending {
        color: #c5a368;
        background: rgba(217, 156, 52, 0.1);
      }

      .log-status.failed {
        color: #ff728e;
        background: rgba(255, 23, 68, 0.1);
      }

      .campaign-guide {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }

      .campaign-guide > div {
        padding: 16px;
        border: 1px solid #242429;
        border-radius: 11px;
        background: #0c0c0f;
      }

      .campaign-guide span {
        width: 27px;
        height: 27px;
        display: grid;
        place-items: center;
        border-radius: 7px;
        color: #ff456b;
        background: rgba(255, 23, 68, 0.1);
        font-size: 10px;
        font-weight: 900;
        margin-bottom: 14px;
      }

      .campaign-guide strong,
      .campaign-guide small {
        display: block;
      }

      .campaign-guide strong {
        margin-bottom: 5px;
        font-size: 12px;
      }

      .campaign-guide small {
        color: #727d91;
        font-size: 10px;
        line-height: 1.5;
      }

      .campaign-numbers {
        display: flex;
        gap: 7px;
        color: #838c9b;
        font-size: 10px;
      }

      .table-wrap {
        border: 1px solid #222227;
        border-radius: 11px;
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 850px;
      }

      th {
        padding: 11px 14px;
        text-align: left;
        color: #50617d;
        background: #101014;
        font-size: 9px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      td {
        padding: 13px 14px;
        border-top: 1px solid #1d1d21;
        color: #8995a9;
        font-size: 11px;
      }

      td strong {
        color: #f1f1f4;
      }

      .empty-cell {
        text-align: center;
        padding: 38px;
      }

      .empty-state,
      .overview-empty {
        min-height: 250px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .empty-state h3,
      .overview-empty strong {
        margin: 12px 0 5px;
      }

      .empty-state p,
      .overview-empty span {
        max-width: 430px;
        margin: 0 0 15px;
        color: #727d90;
        font-size: 12px;
      }

      .empty-icon {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        color: #ff496e;
        background: rgba(255, 23, 68, 0.08);
      }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        padding: 18px;
      }

      .overview-card {
        min-height: 205px;
        padding: 18px;
        border: 1px solid #232328;
        border-radius: 12px;
        background: #0c0c0f;
      }

      .overview-card.large {
        grid-column: span 2;
      }

      .overview-card.wide {
        grid-column: 1 / -1;
      }

      .big-number {
        display: block;
        margin: 14px 0 6px;
        font-size: 36px;
      }

      .text-button {
        padding: 0;
        border: 0;
        background: transparent;
        color: #ff526f;
        font-size: 11px;
        font-weight: 800;
      }

      .overview-card > .text-button {
        margin-top: 14px;
      }

      .overview-list {
        margin-top: 14px;
      }

      .overview-list > div {
        min-height: 52px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-top: 1px solid #1f1f23;
      }

      .overview-list > div:first-child {
        border-top: 0;
      }

      .overview-list > div > div:nth-child(2),
      .overview-list > div > div:first-of-type {
        min-width: 0;
        flex: 1;
      }

      .overview-list strong,
      .overview-list small {
        display: block;
      }

      .overview-list strong {
        font-size: 11px;
      }

      .overview-list small {
        margin-top: 3px;
        color: #6f798d;
        font-size: 9px;
      }

      .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #555c69;
      }

      .live-dot.active {
        background: #24d792;
        box-shadow: 0 0 0 5px rgba(36, 215, 146, 0.06);
      }

      .avatar {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        flex: 0 0 30px !important;
        border-radius: 50%;
        color: #ff5878;
        background: rgba(255, 23, 68, 0.12);
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
      }

      .quick-flow {
        min-height: 120px;
        display: grid;
        grid-template-columns: 1fr 80px 1fr 80px 1fr;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
      }

      .quick-flow > div:not(.flow-line) {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .quick-flow span {
        color: #ff3f64;
        font-size: 10px;
        font-weight: 900;
        margin-bottom: 8px;
      }

      .quick-flow strong {
        font-size: 12px;
      }

      .quick-flow small {
        color: #6f7a8d;
        font-size: 9px;
        margin-top: 5px;
      }

      .flow-line {
        height: 1px;
        background: #2b2b31;
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.78);
        backdrop-filter: blur(7px);
      }

      .modal {
        width: min(760px, 100%);
        max-height: 90vh;
        overflow: auto;
        border: 1px solid #2a2a30;
        border-radius: 14px;
        background: #0b0b0d;
        box-shadow: 0 30px 100px rgba(0, 0, 0, 0.55);
      }

      .modal-head {
        padding: 18px 20px;
        border-bottom: 1px solid #222227;
      }

      .modal-body {
        padding: 20px;
      }

      .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .field.full {
        grid-column: 1 / -1;
      }

      .field span {
        color: #8a94a7;
        font-size: 10px;
        font-weight: 800;
      }

      .field input,
      .field select,
      .variable-row input,
      .variable-row select {
        min-height: 42px;
        width: 100%;
        border: 1px solid #2a2a30;
        border-radius: 8px;
        outline: 0;
        background: #101013;
        color: #f2f2f4;
        padding: 0 11px;
        font-size: 12px;
      }

      .field input:focus,
      .field select:focus,
      .variable-row input:focus,
      .variable-row select:focus {
        border-color: rgba(255, 23, 68, 0.55);
        box-shadow: 0 0 0 3px rgba(255, 23, 68, 0.06);
      }

      .subsection-head {
        margin: 22px 0 10px;
      }

      .subsection-head strong,
      .subsection-head small {
        display: block;
      }

      .subsection-head strong {
        font-size: 12px;
      }

      .subsection-head small {
        color: #6f798c;
        font-size: 10px;
        margin-top: 3px;
      }

      .variable-editor {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .variable-row {
        display: grid;
        grid-template-columns: 34px 120px 1fr 1fr 34px;
        gap: 7px;
        align-items: center;
      }

      .variable-row:has(select:not([value="custom"])) {
        grid-template-columns: 34px 120px 1fr 34px;
      }

      .variable-index {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 7px;
        background: rgba(255, 23, 68, 0.09);
        color: #ff4e70;
        font-size: 10px;
        font-weight: 900;
      }

      .mini-empty {
        padding: 20px;
        text-align: center;
        border: 1px dashed #29292f;
        border-radius: 8px;
        color: #687285;
        font-size: 11px;
      }

      .modal-actions {
        justify-content: flex-end;
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #222227;
      }

      .automation-preview {
        margin-top: 18px;
        padding: 16px;
        border: 1px solid #242429;
        border-radius: 10px;
        background: #0e0e11;
        text-align: center;
      }

      .automation-preview > span {
        display: block;
        color: #ff496c;
        font-size: 9px;
        font-weight: 900;
        letter-spacing: 0.14em;
        margin-bottom: 12px;
      }

      .automation-preview strong {
        display: block;
        font-size: 11px;
      }

      .flow-arrow {
        margin: 6px 0;
        color: #4d5667;
      }

      @media (max-width: 1050px) {
        .stats {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .cards-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .overview-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .overview-card.large {
          grid-column: span 2;
        }
      }

      @media (max-width: 760px) {
        .wa-page {
          padding: 18px 13px 45px;
        }

        .hero,
        .section-header,
        .subsection-head {
          align-items: stretch;
          flex-direction: column;
        }

        .hero-actions,
        .section-header > .button,
        .section-header > div + button {
          width: 100%;
        }

        .hero-actions .button,
        .section-header .button {
          flex: 1;
        }

        .stats {
          grid-template-columns: 1fr 1fr;
        }

        .stat {
          min-height: 145px;
          padding: 15px;
        }

        .stat > strong {
          font-size: 25px;
        }

        .section {
          padding: 14px;
        }

        .cards-grid,
        .campaign-guide {
          grid-template-columns: 1fr;
        }

        .overview-grid {
          grid-template-columns: 1fr;
          padding: 12px;
        }

        .overview-card.large,
        .overview-card.wide {
          grid-column: auto;
        }

        .quick-flow {
          grid-template-columns: 1fr;
        }

        .flow-line {
          width: 1px;
          height: 24px;
          justify-self: center;
        }

        .automation-row {
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .automation-main {
          min-width: calc(100% - 60px);
        }

        .automation-actions {
          margin-left: 55px;
        }

        .form-grid {
          grid-template-columns: 1fr;
        }

        .field.full {
          grid-column: auto;
        }

        .variable-row,
        .variable-row:has(select:not([value="custom"])) {
          grid-template-columns: 34px 1fr;
        }

        .variable-row > *:not(.variable-index) {
          grid-column: 2;
        }

        .variable-row .icon-button {
          grid-column: 2;
        }
      }

      @media (max-width: 480px) {
        .stats {
          grid-template-columns: 1fr;
        }

        .hero-actions {
          flex-direction: column;
        }

        .hero-actions .button {
          width: 100%;
        }
      }
    `}</style>
  );
}
