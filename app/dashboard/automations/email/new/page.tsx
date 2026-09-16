"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import {
  ArrowLeft,
  ChevronDown,
  GripVertical,
  Heading1,
  Link as LinkIcon,
  Mail,
  Minus,
  Plus,
  Save,
  Send,
  Settings2,
  Table2,
  Trash2,
  Type,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

type TriggerType = "specific" | "fallback";

type FieldKey =
  | "amount"
  | "status"
  | "paymentMethod"
  | "name"
  | "email"
  | "paymentId";

type OperatorKey =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than";

type FooterLink = {
  id: string;
  label: string;
  url: string;
};

type EmailBlock =
  | {
      id: string;
      type: "heading";
      text: string;
      align: "left" | "center" | "right";
      color: string;
      size: number;
    }
  | {
      id: string;
      type: "text";
      text: string;
      align: "left" | "center" | "right";
      color: string;
      size: number;
    }
  | {
      id: string;
      type: "table";
      headers: string[];
      rows: string[][];
      headerBg: string;
      headerText: string;
      cellBg: string;
      cellText: string;
      borderColor: string;
    }
  | {
      id: string;
      type: "button";
      text: string;
      url: string;
      bg: string;
      textColor: string;
      align: "left" | "center" | "right";
    }
  | {
      id: string;
      type: "divider";
      color: string;
    };

type ActiveField =
  | {
      type: "subject";
    }
  | {
      type: "toName";
    }
  | {
      type: "toEmail";
    }
  | {
      type: "footerText";
    }
  | {
      type: "footerLinkLabel";
      index: number;
    }
  | {
      type: "footerLinkUrl";
      index: number;
    }
  | {
      type: "heading";
      blockIndex: number;
    }
  | {
      type: "text";
      blockIndex: number;
    }
  | {
      type: "buttonText";
      blockIndex: number;
    }
  | {
      type: "buttonUrl";
      blockIndex: number;
    }
  | {
      type: "tableHeader";
      blockIndex: number;
      colIndex: number;
    }
  | {
      type: "tableCell";
      blockIndex: number;
      rowIndex: number;
      colIndex: number;
    }
  | null;

const FIELD_OPTIONS: {
  value: FieldKey;
  label: string;
}[] = [
  {
    value: "amount",
    label: "Payment Amount",
  },
  {
    value: "status",
    label: "Payment Status",
  },
  {
    value: "paymentMethod",
    label: "Payment Method",
  },
  {
    value: "name",
    label: "Customer Name",
  },
  {
    value: "email",
    label: "Customer Email",
  },
  {
    value: "paymentId",
    label: "Payment ID",
  },
];

const OPERATOR_OPTIONS: {
  value: OperatorKey;
  label: string;
}[] = [
  {
    value: "equals",
    label: "Equals",
  },
  {
    value: "not_equals",
    label: "Does not equal",
  },
  {
    value: "contains",
    label: "Contains",
  },
  {
    value: "greater_than",
    label: "Greater than",
  },
  {
    value: "less_than",
    label: "Less than",
  },
];

const VARIABLES = [
  "{{name}}",
  "{{email}}",
  "{{phone}}",
  "{{amount}}",
  "{{paymentId}}",
  "{{paymentMethod}}",
  "{{paymentDateTime}}",
  "{{status}}",
];

const uid = () =>
  Math.random().toString(36).substring(2, 10) +
  Date.now().toString(36);

/* -------------------------------------------------------
   HTML helpers
------------------------------------------------------- */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function previewVariables(value: string) {
  return value
    .replaceAll("{{name}}", "Devil")
    .replaceAll("{{email}}", "Devil@example.com")
    .replaceAll("{{phone}}", "+91 XXXXX XXXXX")
    .replaceAll("{{amount}}", "₹299")
    .replaceAll("{{paymentId}}", "pay_demo_12345")
    .replaceAll("{{paymentMethod}}", "UPI")
    .replaceAll(
      "{{paymentDateTime}}",
      "15 Sept 2026, 12:10 pm"
    )
    .replaceAll("{{status}}", "Success");
}

function fieldLabel(field: FieldKey) {
  return (
    FIELD_OPTIONS.find(
      (item) => item.value === field
    )?.label ?? ""
  );
}

function operatorLabel(operator: OperatorKey) {
  return (
    OPERATOR_OPTIONS.find(
      (item) => item.value === operator
    )?.label ?? ""
  );
}

function getExample(
  field: FieldKey,
  operator: OperatorKey,
  value: string
) {
  const displayValue = value || "value";

  if (field === "amount") {
    if (operator === "greater_than") {
      return `When payment amount is greater than ₹${displayValue}`;
    }

    if (operator === "less_than") {
      return `When payment amount is less than ₹${displayValue}`;
    }
  }

  return `When ${fieldLabel(field).toLowerCase()} ${operatorLabel(
    operator
  ).toLowerCase()} ${displayValue}`;
}

/* -------------------------------------------------------
   Footer HTML
------------------------------------------------------- */

function generateFooterHtml(
  footerText: string,
  footerLinks: FooterLink[],
  usePreviewValues: boolean
) {
  const processedText = usePreviewValues
    ? previewVariables(footerText)
    : footerText;

  const textHtml = escapeHtml(processedText).replace(
    /\n/g,
    "<br/>"
  );

  const linksHtml = footerLinks
    .filter(
      (link) =>
        link.label.trim() && link.url.trim()
    )
    .map((link) => {
      const label = usePreviewValues
        ? previewVariables(link.label)
        : link.label;

      const url = usePreviewValues
        ? previewVariables(link.url)
        : link.url;

      return `
<a
  href="${escapeHtml(url)}"
  style="
    color:#777777;
    text-decoration:underline;
    font-weight:600;
  "
>
  ${escapeHtml(label)}
</a>`;
    })
    .join(`
<span style="color:#aaaaaa;">&nbsp;•&nbsp;</span>
`);

  return `
<tr>
<td
  style="
    padding:20px 0 0 0;
    border-top:1px solid #e5e5e5;
    font-family:Arial,Helvetica,sans-serif;
    font-size:11px;
    line-height:1.6;
    color:#777777;
    text-align:center;
  "
>
  ${textHtml}

  ${
    linksHtml
      ? `
  <div style="padding-top:8px;">
    ${linksHtml}
  </div>
  `
      : ""
  }
</td>
</tr>`;
}

/* -------------------------------------------------------
   Email HTML
------------------------------------------------------- */

function generateEmailHtml(
  blocks: EmailBlock[],
  footerText: string,
  footerLinks: FooterLink[],
  usePreviewValues = false
) {
  const renderText = (value: string) => {
    const processed = usePreviewValues
      ? previewVariables(value)
      : value;

    return escapeHtml(processed).replace(
      /\n/g,
      "<br/>"
    );
  };

  const content = blocks
    .map((block) => {
      if (block.type === "heading") {
        return `
<tr>
<td
  style="
    padding:0 0 10px 0;
    font-family:Arial,Helvetica,sans-serif;
    font-size:${block.size}px;
    line-height:1.25;
    font-weight:700;
    color:${block.color};
    text-align:${block.align};
  "
>
  ${renderText(block.text)}
</td>
</tr>`;
      }

      if (block.type === "text") {
        return `
<tr>
<td
  style="
    padding:0 0 10px 0;
    font-family:Arial,Helvetica,sans-serif;
    font-size:${block.size}px;
    line-height:1.5;
    color:${block.color};
    text-align:${block.align};
  "
>
  ${renderText(block.text)}
</td>
</tr>`;
      }

      if (block.type === "table") {
        const headerCells = block.headers
          .map(
            (header) => `
<td
  style="
    padding:12px;
    background:transparent;
    color:${block.headerText};
    border:1px solid ${block.borderColor};
    font-family:Arial,Helvetica,sans-serif;
    font-size:13px;
    font-weight:700;
    text-align:left;
  "
>
  ${renderText(header)}
</td>`
          )
          .join("");

        const bodyRows = block.rows
          .map(
            (row) => `
<tr>
${row
  .map(
    (cell) => `
<td
  style="
    padding:12px;
    background:transparent;
    color:${block.cellText};
    border:1px solid ${block.borderColor};
    font-family:Arial,Helvetica,sans-serif;
    font-size:13px;
    line-height:1.5;
  "
>
  ${renderText(cell)}
</td>`
  )
  .join("")}
</tr>`
          )
          .join("");

        return `
<tr>
<td style="padding:0 0 12px 0;">
<table
  role="presentation"
  cellpadding="0"
  cellspacing="0"
  border="0"
  width="100%"
  style="
    border-collapse:collapse;
    width:100%;
  "
>
<thead>
<tr>
${headerCells}
</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
</table>
</td>
</tr>`;
      }

      if (block.type === "button") {
        const buttonText = renderText(
          block.text
        );

        const buttonUrl = usePreviewValues
          ? previewVariables(block.url)
          : block.url;

        return `
<tr>
<td
  style="
    padding:4px 0 24px 0;
    text-align:${block.align};
  "
>
<a
  href="${escapeHtml(buttonUrl)}"
  style="
    display:inline-block;
    padding:13px 22px;
    background:${block.bg};
    color:${block.textColor};
    text-decoration:none;
    border-radius:7px;
    font-family:Arial,Helvetica,sans-serif;
    font-size:14px;
    font-weight:700;
  "
>
${buttonText}
</a>
</td>
</tr>`;
      }

      if (block.type === "divider") {
        return `
<tr>
<td style="padding:4px 0 24px 0;">
<div
  style="
    height:1px;
    background:${block.color};
    line-height:1px;
    font-size:1px;
  "
>
&nbsp;
</div>
</td>
</tr>`;
      }

      return "";
    })
    .join("");

  const hasFooter =
    footerText.trim() ||
    footerLinks.some(
      (link) =>
        link.label.trim() &&
        link.url.trim()
    );

  const footer = hasFooter
    ? generateFooterHtml(
        footerText,
        footerLinks,
        usePreviewValues
      )
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta
  name="viewport"
  content="width=device-width,initial-scale=1.0"
/>
<title>Email</title>
</head>

<body
  style="
    margin:0;
    padding:0;
  "
>
<table
  role="presentation"
  cellpadding="0"
  cellspacing="0"
  border="0"
  width="100%"
  style="
    border-collapse:collapse;
    width:100%;
  "
>
<tr>
<td align="center">

<table
  role="presentation"
  cellpadding="0"
  cellspacing="0"
  border="0"
  width="600"
  style="
    width:100%;
    max-width:600px;
    border-collapse:collapse;
  "
>
<tr>
<td style="padding:0;">

<table
  role="presentation"
  cellpadding="0"
  cellspacing="0"
  border="0"
  width="100%"
  style="
    border-collapse:collapse;
    width:100%;
  "
>
${content}
${footer}
</table>

</td>
</tr>
</table>

</td>
</tr>
</table>
</body>
</html>`;
}

/* -------------------------------------------------------
   Select
------------------------------------------------------- */

function SelectBox<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: {
    value: T;
    label: string;
  }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected =
    options.find(
      (option) =>
        option.value === value
    )?.label ?? "";

  return (
    <div
      className={`relative ${className}`}
    >
      <button
        type="button"
        onClick={() =>
          setOpen((prev) => !prev)
        }
        className="flex h-11 w-full items-center justify-between rounded-lg border border-white/10 bg-[#101010] px-3 text-left text-sm text-white transition hover:border-white/20"
      >
        <span className="truncate">
          {selected}
        </span>

        <ChevronDown
          size={16}
          className={`shrink-0 text-white/40 transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() =>
              setOpen(false)
            }
            aria-label="Close dropdown"
          />

          <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full overflow-hidden rounded-xl border border-white/10 bg-[#111111] p-1 shadow-2xl shadow-black/60">
            {options.map(
              (option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(
                      option.value
                    );
                    setOpen(false);
                  }}
                  className={`w-full min-w-0 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    option.value === value
                      ? "bg-white/[0.08] text-white"
                      : "text-white/60 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Color picker
------------------------------------------------------- */

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="h-9 w-9 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5"
      />

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="h-9 w-[92px] rounded-lg border border-white/10 bg-[#101010] px-2 text-xs text-white outline-none"
      />
    </div>
  );
}

/* -------------------------------------------------------
   Variables
------------------------------------------------------- */

function Variables({
  onInsert,
}: {
  onInsert: (variable: string) => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
        Variables
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map(
          (variable) => (
            <button
              key={variable}
              type="button"
              onMouseDown={(e) =>
                e.preventDefault()
              }
              onClick={() =>
                onInsert(variable)
              }
              className="max-w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/55 transition hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-300"
            >
              {variable}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Trigger
------------------------------------------------------- */

function Trigger({
  triggerType,
  field,
  operator,
  value,
  onTriggerTypeChange,
  onFieldChange,
  onOperatorChange,
  onValueChange,
}: {
  triggerType: TriggerType;
  field: FieldKey;
  operator: OperatorKey;
  value: string;
  onTriggerTypeChange: (value: TriggerType) => void;
  onFieldChange: (value: FieldKey) => void;
  onOperatorChange: (value: OperatorKey) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <section className="max-w-full rounded-xl border border-white/10 bg-[#090909] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Settings2 size={15} className="text-red-400" />
        <h2 className="text-sm font-semibold text-white">
          Trigger Condition
        </h2>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => onTriggerTypeChange("specific")}
          className={`rounded-lg border px-3 py-3 text-left transition ${
            triggerType === "specific"
              ? "border-red-500/40 bg-red-500/[0.08]"
              : "border-white/10 bg-white/[0.02] hover:border-white/20"
          }`}
        >
          <div className="text-xs font-semibold text-white">
            Specific Condition
          </div>
          <div className="mt-1 text-[11px] text-white/40">
            Send when a payment matches a rule.
          </div>
        </button>

        <button
          type="button"
          onClick={() => onTriggerTypeChange("fallback")}
          className={`rounded-lg border px-3 py-3 text-left transition ${
            triggerType === "fallback"
              ? "border-red-500/40 bg-red-500/[0.08]"
              : "border-white/10 bg-white/[0.02] hover:border-white/20"
          }`}
        >
          <div className="text-xs font-semibold text-white">
            Default Payment Confirmation
          </div>
          <div className="mt-1 text-[11px] text-white/40">
            Send when no specific automation matches.
          </div>
        </button>
      </div>

      {triggerType === "fallback" ? (
        <div className="max-w-full min-w-0 rounded-lg border border-red-500/15 bg-red-500/[0.04] px-3 py-3 text-xs text-white/55">
          This automation will be used as the general payment
          confirmation when a successful payment does not match any
          active specific automation.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="flex h-11 shrink-0 items-center rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 text-[11px] font-bold tracking-[0.14em] text-red-300">
              WHEN
            </div>

            <div className="hidden text-white/20 xl:block">|</div>

            <SelectBox
              value={field}
              options={FIELD_OPTIONS}
              onChange={onFieldChange}
              className="xl:w-[180px]"
            />

            <div className="hidden text-white/20 xl:block">|</div>

            <SelectBox
              value={operator}
              options={OPERATOR_OPTIONS}
              onChange={onOperatorChange}
              className="xl:w-[165px]"
            />

            <div className="hidden text-white/20 xl:block">|</div>

            <input
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="299"
              className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500/40"
            />
          </div>

          <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] w-full px-3 py-2.5 text-xs sm:w-auto text-white/40">
            {getExample(field, operator, value)}
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------
   Table editor
------------------------------------------------------- */

function TableEditor({
  block,
  blockIndex,
  onChange,
  setActiveField,
}: {
  block: Extract<
    EmailBlock,
    { type: "table" }
  >;
  blockIndex: number;
  onChange: (
    block: Extract<
      EmailBlock,
      { type: "table" }
    >
  ) => void;
  setActiveField: (
    field: ActiveField
  ) => void;
}) {
  const updateHeader = (
    index: number,
    value: string
  ) => {
    const headers = [
      ...block.headers,
    ];

    headers[index] = value;

    onChange({
      ...block,
      headers,
    });
  };

  const updateCell = (
    rowIndex: number,
    colIndex: number,
    value: string
  ) => {
    const rows = block.rows.map(
      (row) => [...row]
    );

    rows[rowIndex][colIndex] =
      value;

    onChange({
      ...block,
      rows,
    });
  };

  const addColumn = () => {
    onChange({
      ...block,
      headers: [
        ...block.headers,
        `Column ${
          block.headers.length + 1
        }`,
      ],
      rows: block.rows.map(
        (row) => [...row, ""]
      ),
    });
  };

  const addRow = () => {
    onChange({
      ...block,
      rows: [
        ...block.rows,
        block.headers.map(
          () => ""
        ),
      ],
    });
  };

  const removeRow = (
    index: number
  ) => {
    onChange({
      ...block,
      rows: block.rows.filter(
        (_, rowIndex) =>
          rowIndex !== index
      ),
    });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-white/10">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              {block.headers.map(
                (
                  header,
                  colIndex
                ) => (
                  <th
                    key={colIndex}
                    className="border-b border-white/10 bg-white/[0.03] p-2"
                  >
                    <input
                      value={
                        header
                      }
                      onFocus={() =>
                        setActiveField(
                          {
                            type: "tableHeader",
                            blockIndex,
                            colIndex,
                          }
                        )
                      }
                      onClick={() =>
                        setActiveField(
                          {
                            type: "tableHeader",
                            blockIndex,
                            colIndex,
                          }
                        )
                      }
                      onChange={(
                        e
                      ) =>
                        updateHeader(
                          colIndex,
                          e.target
                            .value
                        )
                      }
                      className="h-9 w-full rounded-md border border-white/10 bg-[#0d0d0d] px-2 text-xs font-semibold text-white outline-none focus:border-red-500/30"
                    />
                  </th>
                )
              )}

              <th className="w-10 border-b border-white/10 bg-white/[0.03]" />
            </tr>
          </thead>

          <tbody>
            {block.rows.map(
              (
                row,
                rowIndex
              ) => (
                <tr
                  key={rowIndex}
                >
                  {row.map(
                    (
                      cell,
                      colIndex
                    ) => (
                      <td
                        key={
                          colIndex
                        }
                        className="border-b border-white/10 p-2"
                      >
                        <input
                          value={
                            cell
                          }
                          onFocus={() =>
                            setActiveField(
                              {
                                type: "tableCell",
                                blockIndex,
                                rowIndex,
                                colIndex,
                              }
                            )
                          }
                          onClick={() =>
                            setActiveField(
                              {
                                type: "tableCell",
                                blockIndex,
                                rowIndex,
                                colIndex,
                              }
                            )
                          }
                          onChange={(
                            e
                          ) =>
                            updateCell(
                              rowIndex,
                              colIndex,
                              e.target
                                .value
                            )
                          }
                          placeholder="Value"
                          className="h-9 w-full rounded-md border border-white/10 bg-[#0d0d0d] px-2 text-xs text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                        />
                      </td>
                    )
                  )}

                  <td className="border-b border-white/10 p-1">
                    <button
                      type="button"
                      onClick={() =>
                        removeRow(
                          rowIndex
                        )
                      }
                      className="max-w-full rounded-md p-2 text-white/25 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2
                        size={14}
                      />
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] w-full px-3 py-2.5 text-xs sm:w-auto font-medium text-white/60 transition hover:border-red-500/30 hover:text-white"
        >
          <Plus size={14} />
          Add Row
        </button>

        <button
          type="button"
          onClick={addColumn}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] w-full px-3 py-2.5 text-xs sm:w-auto font-medium text-white/60 transition hover:border-red-500/30 hover:text-white"
        >
          <Plus size={14} />
          Add Column
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:grid-cols-5">
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
            Header BG
          </label>

          <ColorPicker
            value={
              block.headerBg
            }
            onChange={(
              headerBg
            ) =>
              onChange({
                ...block,
                headerBg,
              })
            }
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
            Header Text
          </label>

          <ColorPicker
            value={
              block.headerText
            }
            onChange={(
              headerText
            ) =>
              onChange({
                ...block,
                headerText,
              })
            }
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
            Cell BG
          </label>

          <ColorPicker
            value={block.cellBg}
            onChange={(
              cellBg
            ) =>
              onChange({
                ...block,
                cellBg,
              })
            }
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
            Cell Text
          </label>

          <ColorPicker
            value={
              block.cellText
            }
            onChange={(
              cellText
            ) =>
              onChange({
                ...block,
                cellText,
              })
            }
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
            Border
          </label>

          <ColorPicker
            value={
              block.borderColor
            }
            onChange={(
              borderColor
            ) =>
              onChange({
                ...block,
                borderColor,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Email block editor
------------------------------------------------------- */

function EmailBlockEditor({
  block,
  blockIndex,
  onChange,
  onDelete,
  setActiveField,
  onInsertVariable,
}: {
  block: EmailBlock;
  blockIndex: number;
  onChange: (
    block: EmailBlock
  ) => void;
  onDelete: () => void;
  setActiveField: (
    field: ActiveField
  ) => void;
  onInsertVariable: (
    variable: string
  ) => void;
}) {
  return (
    <div className="max-w-full rounded-xl border border-white/10 bg-[#090909]">
      <div className="flex flex-wrap items-center justify-between border-b border-white/10 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <GripVertical
            size={15}
            className="text-white/20"
          />

          {block.type ===
            "heading" && (
            <Heading1
              size={15}
              className="text-red-400"
            />
          )}

          {block.type === "text" && (
            <Type
              size={15}
              className="text-red-400"
            />
          )}

          {block.type ===
            "table" && (
            <Table2
              size={15}
              className="text-red-400"
            />
          )}

          {block.type ===
            "button" && (
            <LinkIcon
              size={15}
              className="text-red-400"
            />
          )}

          {block.type ===
            "divider" && (
            <Minus
              size={15}
              className="text-red-400"
            />
          )}

          <span className="text-xs font-medium capitalize text-white/70">
            {block.type}
          </span>
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="max-w-full rounded-md p-1.5 text-white/20 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-3 sm:p-4">
        {block.type ===
          "heading" && (
          <>
            <textarea
              value={block.text}
              onFocus={() =>
                setActiveField({
                  type: "heading",
                  blockIndex,
                })
              }
              onClick={() =>
                setActiveField({
                  type: "heading",
                  blockIndex,
                })
              }
              onChange={(e) =>
                onChange({
                  ...block,
                  text: e.target.value,
                })
              }
              rows={2}
              className="w-full resize-none rounded-lg border border-white/10 bg-[#101010] p-3 text-base font-semibold text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
              placeholder="Enter heading..."
            />

            <Variables
              onInsert={onInsertVariable}
            />

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Size
                </label>

                <input
                  type="number"
                  min={14}
                  max={40}
                  value={block.size}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      size: Number(
                        e.target.value
                      ),
                    })
                  }
                  className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Color
                </label>

                <ColorPicker
                  value={block.color}
                  onChange={(
                    color
                  ) =>
                    onChange({
                      ...block,
                      color,
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        {block.type ===
          "text" && (
          <>
            <textarea
              value={block.text}
              onFocus={() =>
                setActiveField({
                  type: "text",
                  blockIndex,
                })
              }
              onClick={() =>
                setActiveField({
                  type: "text",
                  blockIndex,
                })
              }
              onChange={(e) =>
                onChange({
                  ...block,
                  text: e.target.value,
                })
              }
              rows={6}
              className="w-full min-w-0 resize-y rounded-lg border border-white/10 bg-[#101010] p-3 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
              placeholder="Write your email content..."
            />

            <Variables
              onInsert={onInsertVariable}
            />

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Size
                </label>

                <input
                  type="number"
                  min={11}
                  max={24}
                  value={block.size}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      size: Number(
                        e.target.value
                      ),
                    })
                  }
                  className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Color
                </label>

                <ColorPicker
                  value={block.color}
                  onChange={(
                    color
                  ) =>
                    onChange({
                      ...block,
                      color,
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        {block.type ===
          "table" && (
          <>
            <TableEditor
              block={block}
              blockIndex={
                blockIndex
              }
              onChange={onChange}
              setActiveField={
                setActiveField
              }
            />

            <Variables
              onInsert={
                onInsertVariable
              }
            />
          </>
        )}

        {block.type ===
          "button" && (
          <>
            <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Button Text
                </label>

                <input
                  value={block.text}
                  onFocus={() =>
                    setActiveField({
                      type: "buttonText",
                      blockIndex,
                    })
                  }
                  onClick={() =>
                    setActiveField({
                      type: "buttonText",
                      blockIndex,
                    })
                  }
                  onChange={(e) =>
                    onChange({
                      ...block,
                      text: e.target.value,
                    })
                  }
                  className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  URL
                </label>

                <input
                  value={block.url}
                  onFocus={() =>
                    setActiveField({
                      type: "buttonUrl",
                      blockIndex,
                    })
                  }
                  onClick={() =>
                    setActiveField({
                      type: "buttonUrl",
                      blockIndex,
                    })
                  }
                  onChange={(e) =>
                    onChange({
                      ...block,
                      url: e.target.value,
                    })
                  }
                  className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none"
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <Variables
              onInsert={
                onInsertVariable
              }
            />

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 md:grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Button BG
                </label>

                <ColorPicker
                  value={block.bg}
                  onChange={(bg) =>
                    onChange({
                      ...block,
                      bg,
                    })
                  }
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Text Color
                </label>

                <ColorPicker
                  value={
                    block.textColor
                  }
                  onChange={(
                    textColor
                  ) =>
                    onChange({
                      ...block,
                      textColor,
                    })
                  }
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-white/30">
                  Align
                </label>

                <select
                  value={block.align}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      align: e.target
                        .value as
                        | "left"
                        | "center"
                        | "right",
                    })
                  }
                  className="h-9 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-2 text-xs text-white outline-none"
                >
                  <option value="left">
                    Left
                  </option>
                  <option value="center">
                    Center
                  </option>
                  <option value="right">
                    Right
                  </option>
                </select>
              </div>
            </div>
          </>
        )}

        {block.type ===
          "divider" && (
          <div>
            <label className="mb-2 block text-[10px] uppercase tracking-wider text-white/30">
              Divider Color
            </label>

            <ColorPicker
              value={block.color}
              onChange={(color) =>
                onChange({
                  ...block,
                  color,
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Preview
------------------------------------------------------- */

function Preview({
  subject,
  toName,
  toEmail,
  blocks,
  footerText,
  footerLinks,
}: {
  subject: string;
  toName: string;
  toEmail: string;
  blocks: EmailBlock[];
  footerText: string;
  footerLinks: FooterLink[];
}) {
  const html = useMemo(
    () =>
      generateEmailHtml(
        blocks,
        footerText,
        footerLinks,
        true
      ),
    [
      blocks,
      footerText,
      footerLinks,
    ]
  );

  const [previewHeight, setPreviewHeight] =
    useState(760);

  const handlePreviewLoad = (
    event: SyntheticEvent<HTMLIFrameElement>
  ) => {
    const iframe = event.currentTarget;

    try {
      const document = iframe.contentDocument;

      if (!document) return;

      const bodyHeight =
        document.body?.scrollHeight ?? 0;

      const documentHeight =
        document.documentElement?.scrollHeight ?? 0;

      const height = Math.max(
        500,
        bodyHeight,
        documentHeight
      );

      setPreviewHeight(height + 10);
    } catch {
      // Keep the fallback height if the iframe
      // cannot be measured.
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#080808]">
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Mail
            size={15}
            className="text-red-400"
          />

          <span className="text-xs font-semibold text-white">
            Live Preview
          </span>
        </div>

        <div className="mt-2 space-y-0.5 text-[11px] text-white/35">
          <div>
            To:{" "}
            <span className="text-white/60">
              {previewVariables(
                toName ||
                  "Customer"
              )}{" "}
              {toEmail &&
                `<${previewVariables(
                  toEmail
                )}>`}
            </span>
          </div>

          <div>
            Subject:{" "}
            <span className="text-white/60">
              {previewVariables(
                subject ||
                  "Your email subject"
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="max-h-[calc(100vh-190px)] min-h-[500px] max-h-[70vh] lg:max-h-none overflow-y-auto bg-[#151515] p-3">
        <iframe
          title="Email Preview"
          srcDoc={html}
          onLoad={handlePreviewLoad}
          style={{ height: `${previewHeight}px` }}
          className="w-full min-w-0 rounded-lg border-0 bg-white transition-[height] duration-150"
          scrolling="no"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Default blocks
------------------------------------------------------- */

const DEFAULT_BLOCKS: EmailBlock[] = [
  {
    id: uid(),
    type: "heading",
    text: "Payment Received",
    align: "left",
    color: "#111111",
    size: 28,
  },
  {
    id: uid(),
    type: "text",
    text: "Hi {{name}},\n\nThank you for your payment of {{amount}}. Your transaction has been successfully received.",
    align: "left",
    color: "#444444",
    size: 15,
  },
  {
    id: uid(),
    type: "table",
    headers: [
      "Details",
      "Value",
    ],
    rows: [
      [
        "Payment ID",
        "{{paymentId}}",
      ],
      [
        "Amount",
        "{{amount}}",
      ],
      [
        "Method",
        "{{paymentMethod}}",
      ],
      [
        "Payment Date & Time",
        "{{paymentDateTime}}",
      ],
      [
        "Status",
        "{{status}}",
      ],
    ],
    headerBg: "#111111",
    headerText: "#ffffff",
    cellBg: "#ffffff",
    cellText: "#333333",
    borderColor: "#dddddd",
  },
  {
    id: uid(),
    type: "button",
    text: "View Payment",
    url: "https://example.com/payment/{{paymentId}}",
    bg: "#e11d48",
    textColor: "#ffffff",
    align: "left",
  },
];

/* -------------------------------------------------------
   Page
------------------------------------------------------- */

function EmailAutomationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("id");

  const [automationName, setAutomationName] =
    useState(
      "Payment Confirmation"
    );

  const [triggerType, setTriggerType] =
    useState<TriggerType>("specific");

  const [field, setField] =
    useState<FieldKey>("amount");

  const [operator, setOperator] =
    useState<OperatorKey>(
      "equals"
    );

  const [triggerValue, setTriggerValue] =
    useState("299");

  const [toName, setToName] =
    useState("Customer");

  const [toEmail, setToEmail] =
    useState("{{email}}");

  const [subject, setSubject] =
    useState(
      "Payment received — {{amount}}"
    );

  const [blocks, setBlocks] =
    useState<EmailBlock[]>(
      DEFAULT_BLOCKS
    );

  /* ---------------------------------------------
     Footer
  --------------------------------------------- */

  const [footerText, setFooterText] =
    useState(
      "By completing this payment, you agree to our policies."
    );

  const [footerLinks, setFooterLinks] =
    useState<FooterLink[]>([
      {
        id: uid(),
        label: "Terms & Conditions",
        url: "https://example.com/terms",
      },
      {
        id: uid(),
        label: "Refund Policy",
        url: "https://example.com/refund",
      },
    ]);

  /* ---------------------------------------------
     Timing
  --------------------------------------------- */

  const [delay, setDelay] =
    useState("0");

  const [gmailConnected, setGmailConnected] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [testEmail, setTestEmail] =
    useState("");

  const [sendingTest, setSendingTest] =
    useState(false);

  const [testMessage, setTestMessage] =
    useState("");

  const [showTestModal, setShowTestModal] =
    useState(false);

  const [loadingAutomation, setLoadingAutomation] =
    useState(Boolean(editingId));

  const [message, setMessage] =
    useState("");

  /* ---------------------------------------------
     Exact active input
  --------------------------------------------- */

  const [activeField, setActiveFieldState] =
    useState<ActiveField>(null);

  /*
   * Keep the active field in a ref as well as state.
   * This avoids React's async state update causing a
   * variable to be inserted into the previously active field.
   */
  const activeFieldRef = useRef<ActiveField>(null);

  const setActiveField = (field: ActiveField) => {
    activeFieldRef.current = field;
    setActiveFieldState(field);
  };

  /*
   * Stores selection/cursor position for
   * textareas and inputs.
   */
  const selectionRef = useRef<{
    start: number;
    end: number;
  } | null>(null);

  const rememberSelection = (
    element:
      | HTMLInputElement
      | HTMLTextAreaElement
  ) => {
    selectionRef.current = {
      start:
        element.selectionStart ??
        element.value.length,
      end:
        element.selectionEnd ??
        element.value.length,
    };
  };

  /* ---------------------------------------------
     Load existing automation for editing
  --------------------------------------------- */

  useEffect(() => {
    if (!editingId) {
      setLoadingAutomation(false);
      return;
    }

    let cancelled = false;

    const loadAutomation = async () => {
      setLoadingAutomation(true);
      setMessage("");

      try {
        const response = await fetch(
          `/api/automations/email?id=${encodeURIComponent(
            editingId
          )}`
        );

        const data = await response.json().catch(
          () => ({})
        );

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Unable to load automation."
          );
        }

        const automation = data.automation;

        if (cancelled || !automation) {
          return;
        }

        setAutomationName(
          automation.name ?? "Payment Confirmation"
        );

        setTriggerType(
          automation.trigger?.type === "fallback"
            ? "fallback"
            : "specific"
        );

        setField(
          automation.trigger?.field ?? "amount"
        );

        setOperator(
          automation.trigger?.operator ?? "equals"
        );

        setTriggerValue(
          automation.trigger?.value ?? "299"
        );

        setToName(
          automation.recipient?.name ?? "Customer"
        );

        setToEmail(
          automation.recipient?.email ?? "{{email}}"
        );

        setSubject(
          automation.subject ??
            "Payment received — {{amount}}"
        );

        setBlocks(
          Array.isArray(automation.blocks) &&
            automation.blocks.length > 0
            ? automation.blocks
            : DEFAULT_BLOCKS
        );

        setFooterText(
          automation.footer?.text ??
            "By completing this payment, you agree to our policies."
        );

        setFooterLinks(
          Array.isArray(automation.footer?.links)
            ? automation.footer.links
            : []
        );

        setDelay(
          String(
            automation.delay_minutes ??
              0
          )
        );

        setGmailConnected(
          Boolean(
            automation.gmail_connected
          )
        );
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load automation."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingAutomation(false);
        }
      }
    };

    loadAutomation();

    return () => {
      cancelled = true;
    };
  }, [editingId]);

  /* ---------------------------------------------
     Gmail status
  --------------------------------------------- */

  useEffect(() => {
    const loadGmailStatus =
      async () => {
        try {
          const response =
            await fetch(
              "/api/gmail/status"
            );

          if (!response.ok)
            return;

          const data =
            await response.json();

          setGmailConnected(
            Boolean(
              data.connected
            )
          );
        } catch {
          // Gmail endpoint may not exist yet.
        }
      };

    loadGmailStatus();
  }, []);

  /* ---------------------------------------------
     Insert variable into exact field
  --------------------------------------------- */

  const insertVariable = (
    variable: string
  ) => {
    const currentActiveField =
      activeFieldRef.current;

    if (!currentActiveField) {
      return;
    }

    const selection =
      selectionRef.current;

    const start =
      selection?.start ?? 0;

    const end =
      selection?.end ?? start;

    if (
      currentActiveField.type ===
      "subject"
    ) {
      setSubject(
        (current) =>
          current.slice(
            0,
            start
          ) +
          variable +
          current.slice(end)
      );

      const newPosition =
        start +
        variable.length;

      selectionRef.current = {
        start: newPosition,
        end: newPosition,
      };

      return;
    }

    if (
      currentActiveField.type ===
      "toName"
    ) {
      setToName(
        (current) =>
          current.slice(
            0,
            start
          ) +
          variable +
          current.slice(end)
      );

      return;
    }

    if (
      currentActiveField.type ===
      "toEmail"
    ) {
      setToEmail(
        (current) =>
          current.slice(
            0,
            start
          ) +
          variable +
          current.slice(end)
      );

      return;
    }

    if (
      currentActiveField.type ===
      "footerText"
    ) {
      setFooterText(
        (current) =>
          current.slice(
            0,
            start
          ) +
          variable +
          current.slice(end)
      );

      return;
    }

    if (
      currentActiveField.type ===
      "footerLinkLabel"
    ) {
      setFooterLinks(
        (current) =>
          current.map(
            (link, index) =>
              index ===
              currentActiveField.index
                ? {
                    ...link,
                    label:
                      link.label.slice(
                        0,
                        start
                      ) +
                      variable +
                      link.label.slice(
                        end
                      ),
                  }
                : link
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "footerLinkUrl"
    ) {
      setFooterLinks(
        (current) =>
          current.map(
            (link, index) =>
              index ===
              currentActiveField.index
                ? {
                    ...link,
                    url:
                      link.url.slice(
                        0,
                        start
                      ) +
                      variable +
                      link.url.slice(
                        end
                      ),
                  }
                : link
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "heading"
    ) {
      setBlocks(
        (current) =>
          current.map(
            (block, index) => {
              if (
                index !==
                  currentActiveField.blockIndex ||
                block.type !==
                  "heading"
              ) {
                return block;
              }

              return {
                ...block,
                text:
                  block.text.slice(
                    0,
                    start
                  ) +
                  variable +
                  block.text.slice(
                    end
                  ),
              };
            }
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "text"
    ) {
      setBlocks(
        (current) =>
          current.map(
            (block, index) => {
              if (
                index !==
                  currentActiveField.blockIndex ||
                block.type !==
                  "text"
              ) {
                return block;
              }

              return {
                ...block,
                text:
                  block.text.slice(
                    0,
                    start
                  ) +
                  variable +
                  block.text.slice(
                    end
                  ),
              };
            }
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "buttonText"
    ) {
      setBlocks(
        (current) =>
          current.map(
            (block, index) => {
              if (
                index !==
                  currentActiveField.blockIndex ||
                block.type !==
                  "button"
              ) {
                return block;
              }

              return {
                ...block,
                text:
                  block.text.slice(
                    0,
                    start
                  ) +
                  variable +
                  block.text.slice(
                    end
                  ),
              };
            }
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "buttonUrl"
    ) {
      setBlocks(
        (current) =>
          current.map(
            (block, index) => {
              if (
                index !==
                  currentActiveField.blockIndex ||
                block.type !==
                  "button"
              ) {
                return block;
              }

              return {
                ...block,
                url:
                  block.url.slice(
                    0,
                    start
                  ) +
                  variable +
                  block.url.slice(
                    end
                  ),
              };
            }
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "tableHeader"
    ) {
      setBlocks(
        (current) =>
          current.map(
            (block, index) => {
              if (
                index !==
                  currentActiveField.blockIndex ||
                block.type !==
                  "table"
              ) {
                return block;
              }

              const headers = [
                ...block.headers,
              ];

              headers[
                currentActiveField.colIndex
              ] =
                headers[
                  currentActiveField.colIndex
                ].slice(
                  0,
                  start
                ) +
                variable +
                headers[
                  currentActiveField.colIndex
                ].slice(end);

              return {
                ...block,
                headers,
              };
            }
          )
      );

      return;
    }

    if (
      currentActiveField.type ===
      "tableCell"
    ) {
      setBlocks(
        (current) =>
          current.map(
            (block, index) => {
              if (
                index !==
                  currentActiveField.blockIndex ||
                block.type !==
                  "table"
              ) {
                return block;
              }

              const rows =
                block.rows.map(
                  (row) => [
                    ...row,
                  ]
                );

              const currentCell =
                rows[
                  currentActiveField
                    .rowIndex
                ][
                  currentActiveField
                    .colIndex
                ];

              rows[
                currentActiveField
                  .rowIndex
              ][
                currentActiveField
                  .colIndex
              ] =
                currentCell.slice(
                  0,
                  start
                ) +
                variable +
                currentCell.slice(
                  end
                );

              return {
                ...block,
                rows,
              };
            }
          )
      );
    }
  };

  /* ---------------------------------------------
     Add block
  --------------------------------------------- */

  const addBlock = (
    type: EmailBlock["type"]
  ) => {
    let block: EmailBlock;

    if (
      type === "heading"
    ) {
      block = {
        id: uid(),
        type: "heading",
        text: "New Heading",
        align: "left",
        color: "#111111",
        size: 28,
      };
    } else if (
      type === "text"
    ) {
      block = {
        id: uid(),
        type: "text",
        text: "Write your message here...",
        align: "left",
        color: "#444444",
        size: 15,
      };
    } else if (
      type === "table"
    ) {
      block = {
        id: uid(),
        type: "table",
        headers: [
          "Column 1",
          "Column 2",
        ],
        rows: [
          ["Value", "Value"],
        ],
        headerBg: "#111111",
        headerText: "#ffffff",
        cellBg: "#ffffff",
        cellText: "#333333",
        borderColor: "#dddddd",
      };
    } else if (
      type === "button"
    ) {
      block = {
        id: uid(),
        type: "button",
        text: "Click Here",
        url: "https://example.com",
        bg: "#e11d48",
        textColor: "#ffffff",
        align: "left",
      };
    } else {
      block = {
        id: uid(),
        type: "divider",
        color: "#dddddd",
      };
    }

    setBlocks(
      (current) => [
        ...current,
        block,
      ]
    );
  };

  const updateBlock = (
    index: number,
    block: EmailBlock
  ) => {
    setBlocks(
      (current) =>
        current.map(
          (item, i) =>
            i === index
              ? block
              : item
        )
    );
  };

  const deleteBlock = (
    index: number
  ) => {
    setBlocks(
      (current) =>
        current.filter(
          (_, i) =>
            i !== index
        )
    );
  };

  /* ---------------------------------------------
     Footer links
  --------------------------------------------- */

  const addFooterLink =
    () => {
      setFooterLinks(
        (current) => [
          ...current,
          {
            id: uid(),
            label:
              "Privacy Policy",
            url: "https://example.com/privacy",
          },
        ]
      );
    };

  const updateFooterLink = (
    index: number,
    key: keyof FooterLink,
    value: string
  ) => {
    setFooterLinks(
      (current) =>
        current.map(
          (link, i) =>
            i === index
              ? {
                  ...link,
                  [key]: value,
                }
              : link
        )
    );
  };

  const removeFooterLink = (
    index: number
  ) => {
    setFooterLinks(
      (current) =>
        current.filter(
          (_, i) =>
            i !== index
        )
    );
  };

  /* ---------------------------------------------
     Gmail
  --------------------------------------------- */

  const connectGmail = () => {
    window.location.href = "/api/gmail/connect";
  };

  /* ---------------------------------------------
     Send Test Email
  --------------------------------------------- */

  const sendTestEmail = async () => {
    const email = testEmail.trim();

    if (!email) {
      setTestMessage("Enter a test email address.");
      return;
    }

    setSendingTest(true);
    setTestMessage("");

    try {
      const response = await fetch(
        "/api/automations/email/test",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: email,
            subject,
            html: generateEmailHtml(
              blocks,
              footerText,
              footerLinks,
              false
            ),
          }),
        }
      );

      const result = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Unable to send test email."
        );
      }

      setTestMessage(
        `Test email sent to ${email}.`
      );
    } catch (error) {
      setTestMessage(
        error instanceof Error
          ? error.message
          : "Unable to send test email."
      );
    } finally {
      setSendingTest(false);
    }
  };

  /* ---------------------------------------------
     Save / Update
  --------------------------------------------- */

  const saveAutomation =
    async () => {
      setSaving(true);
      setMessage("");

      try {
        const payload = {
          name: automationName,

          type: "email",

          trigger:
            triggerType === "fallback"
              ? { type: "fallback" }
              : {
                  field,
                  operator,
                  value: triggerValue,
                },

          recipient: {
            name: toName,
            email: toEmail,
          },

          subject,

          blocks,

          html: generateEmailHtml(
            blocks,
            footerText,
            footerLinks,
            false
          ),

          footer: {
            text: footerText,
            links: footerLinks,
          },

          delayMinutes:
            Number(delay) || 0,

          gmailConnected,
        };

        const isEditing = Boolean(editingId);

        const response =
          await fetch(
            isEditing
              ? `/api/automations/email?id=${encodeURIComponent(
                  editingId as string
                )}`
              : "/api/automations/email",
            {
              method: isEditing
                ? "PATCH"
                : "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                payload
              ),
            }
          );

        const result =
          await response
            .json()
            .catch(
              () => ({})
            );

        if (!response.ok) {
          throw new Error(
            result?.error ||
              "Failed to save automation"
          );
        }

        router.push(
          "/dashboard/automations/email"
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to save automation."
        );
      } finally {
        setSaving(false);
      }
    };

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#050505] text-white">
      {showTestModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0b] p-5 shadow-2xl shadow-black/70">
            <div className="mb-5">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-red-400">
                Email Testing
              </div>

              <h2 className="text-lg font-semibold text-white">
                Send Test Email
              </h2>

              <p className="mt-1 text-xs leading-5 text-white/40">
                Send the current email design to a real inbox.
                This does not trigger the automation or create an
                automation job.
              </p>
            </div>

            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
              Test Recipient
            </label>

            <input
              type="email"
              value={testEmail}
              onChange={(e) => {
                setTestEmail(e.target.value);
                setTestMessage("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !sendingTest) {
                  e.preventDefault();
                  sendTestEmail();
                }
              }}
              placeholder="you@example.com"
              autoFocus
              className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500/40"
            />

            {testMessage && (
              <div
                className={`mt-3 rounded-lg border w-full px-3 py-2.5 text-xs sm:w-auto ${
                  testMessage.startsWith("Test email sent")
                    ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400"
                    : "border-red-500/20 bg-red-500/[0.05] text-red-400"
                }`}
              >
                {testMessage}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!sendingTest) {
                    setShowTestModal(false);
                    setTestMessage("");
                  }
                }}
                disabled={sendingTest}
                className="h-10 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-xs font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={sendTestEmail}
                disabled={sendingTest || !testEmail.trim()}
                className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={14} />
                {sendingTest
                  ? "Sending..."
                  : "Send Test Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-20 h-[420px] max-h-[70vh] lg:max-h-none w-[420px] rounded-full bg-red-600/[0.035] blur-[120px]" />

        <div className="absolute right-0 top-[30%] h-[360px] max-h-[70vh] lg:max-h-none w-[360px] rounded-full bg-red-600/[0.025] blur-[110px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#050505]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-h-[70vh] lg:max-h-none max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/dashboard/automations"
                )
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/50 transition hover:border-white/20 hover:text-white"
            >
              <ArrowLeft
                size={16}
              />
            </button>

            <div>
              <div className="text-[10px] font-bold tracking-[0.25em] text-red-400">
                DEVILX
              </div>

              <div className="text-sm font-semibold text-white">
                {editingId
                  ? "Edit Email Automation"
                  : "Email Automation"}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {message && (
              <span
                className={`hidden text-xs sm:block ${
                  message.includes(
                    "success"
                  )
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {message}
              </span>
            )}

            {!gmailConnected ? (
              <button
                type="button"
                onClick={
                  connectGmail
                }
                className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-white/70 transition hover:border-red-500/30 hover:text-white"
              >
                <Mail
                  size={14}
                />
                Connect Gmail
              </button>
            ) : (
              <div className="flex h-9 items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Gmail Connected
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setTestMessage("");
                setShowTestModal(true);
              }}
              disabled={
                saving ||
                loadingAutomation ||
                sendingTest
              }
              className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-white/70 transition hover:border-red-500/30 hover:bg-red-500/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} />
              Send Test
            </button>

            <button
              type="button"
              onClick={
                saveAutomation
              }
              disabled={
                saving ||
                loadingAutomation
              }
              className="flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white shadow-lg shadow-red-600/10 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save
                size={14}
              />

              {saving
                ? editingId
                  ? "Updating..."
                  : "Saving..."
                : editingId
                  ? "Update Automation"
                  : "Save Automation"}
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        {loadingAutomation && (
          <div className="mb-5 rounded-xl border border-red-500/10 bg-red-500/[0.03] px-4 py-3 text-xs text-red-300">
            Loading automation...
          </div>
        )}
        {/* Title */}
        <div className="mb-6">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/25">
            Automation Builder
          </div>

          <h1 className="text-lg sm:text-base sm:text-lg lg:text-xl lg:text-2xl font-bold tracking-tight text-white lg:text-3xl">
            {editingId
              ? "Edit Email Automation"
              : "Create Email Automation"}
          </h1>

          <p className="mt-1 text-sm text-white/35">
            Automatically send personalized emails when a payment matches your rule.
          </p>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          {/* LEFT */}
          <div className="space-y-5">
            {/* Automation name */}
            <section className="max-w-full rounded-xl border border-white/10 bg-[#090909] p-4">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                Automation Name
              </label>

              <input
                value={
                  automationName
                }
                onChange={(e) =>
                  setAutomationName(
                    e.target.value
                  )
                }
                className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                placeholder="Payment Confirmation"
              />
            </section>

            {/* Trigger */}
            <Trigger
              triggerType={triggerType}
              field={field}
              operator={operator}
              value={triggerValue}
              onTriggerTypeChange={setTriggerType}
              onFieldChange={setField}
              onOperatorChange={setOperator}
              onValueChange={setTriggerValue}
            />

            {/* Email details */}
            <section className="max-w-full rounded-xl border border-white/10 bg-[#090909] p-4">
              <div className="mb-4 flex items-center gap-2">
                <Mail
                  size={15}
                  className="text-red-400"
                />

                <h2 className="text-sm font-semibold text-white">
                  Email Details
                </h2>
              </div>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    Recipient Name
                  </label>

                  <input
                    value={
                      toName
                    }
                    onFocus={() => {
                      setActiveField(
                        {
                          type: "toName",
                        }
                      );
                    }}
                    onClick={(e) => {
                      setActiveField(
                        {
                          type: "toName",
                        }
                      );

                      rememberSelection(
                        e.currentTarget
                      );
                    }}
                    onSelect={(e) =>
                      rememberSelection(
                        e.currentTarget
                      )
                    }
                    onChange={(e) =>
                      setToName(
                        e.target
                          .value
                      )
                    }
                    className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                    placeholder="Customer"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    Recipient Email
                  </label>

                  <input
                    value={
                      toEmail
                    }
                    onFocus={() => {
                      setActiveField(
                        {
                          type: "toEmail",
                        }
                      );
                    }}
                    onClick={(e) => {
                      setActiveField(
                        {
                          type: "toEmail",
                        }
                      );

                      rememberSelection(
                        e.currentTarget
                      );
                    }}
                    onSelect={(e) =>
                      rememberSelection(
                        e.currentTarget
                      )
                    }
                    onChange={(e) =>
                      setToEmail(
                        e.target
                          .value
                      )
                    }
                    className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                    placeholder="{{email}}"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Subject
                </label>

                <input
                  value={
                    subject
                  }
                  onFocus={() => {
                    setActiveField(
                      {
                        type: "subject",
                      }
                    );
                  }}
                  onClick={(e) => {
                    setActiveField(
                      {
                        type: "subject",
                      }
                    );

                    rememberSelection(
                      e.currentTarget
                    );
                  }}
                  onSelect={(e) =>
                    rememberSelection(
                      e.currentTarget
                    )
                  }
                  onChange={(e) =>
                    setSubject(
                      e.target
                        .value
                    )
                  }
                  className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                  placeholder="Your payment has been received"
                />

                <Variables
                  onInsert={
                    insertVariable
                  }
                />
              </div>
            </section>

            {/* Email content */}
            <section>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-white">
                  Email Content
                </h2>

                <p className="mt-0.5 text-xs text-white/30">
                  Build the email using reusable blocks.
                </p>
              </div>

              <div className="space-y-3">
                {blocks.map(
                  (
                    block,
                    index
                  ) => (
                    <EmailBlockEditor
                      key={
                        block.id
                      }
                      block={
                        block
                      }
                      blockIndex={
                        index
                      }
                      onChange={(
                        updated
                      ) =>
                        updateBlock(
                          index,
                          updated
                        )
                      }
                      onDelete={() =>
                        deleteBlock(
                          index
                        )
                      }
                      setActiveField={
                        setActiveField
                      }
                      onInsertVariable={
                        insertVariable
                      }
                    />
                  )
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    [
                      "heading",
                      "Heading",
                      Heading1,
                    ],
                    [
                      "text",
                      "Text",
                      Type,
                    ],
                    [
                      "table",
                      "Table",
                      Table2,
                    ],
                    [
                      "button",
                      "Button",
                      LinkIcon,
                    ],
                    [
                      "divider",
                      "Divider",
                      Minus,
                    ],
                  ] as const
                ).map(
                  ([
                    type,
                    label,
                    Icon,
                  ]) => (
                    <button
                      key={
                        type
                      }
                      type="button"
                      onClick={() =>
                        addBlock(
                          type
                        )
                      }
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] w-full px-3 py-2.5 text-xs sm:w-auto text-white/45 transition hover:border-red-500/30 hover:bg-red-500/[0.03] hover:text-white"
                    >
                      <Plus
                        size={
                          13
                        }
                      />
                      <Icon
                        size={
                          13
                        }
                      />
                      {label}
                    </button>
                  )
                )}
              </div>
            </section>

            {/* Email Footer */}
            <section className="max-w-full rounded-xl border border-white/10 bg-[#090909] p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Email Footer
                </h2>

                <p className="mt-0.5 text-xs text-white/30">
                  Add a short disclaimer, terms message, or policy links.
                </p>
              </div>

              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Footer Text
              </label>

              <textarea
                value={
                  footerText
                }
                onFocus={() => {
                  setActiveField(
                    {
                      type: "footerText",
                    }
                  );
                }}
                onClick={(e) => {
                  setActiveField(
                    {
                      type: "footerText",
                    }
                  );

                  rememberSelection(
                    e.currentTarget
                  );
                }}
                onSelect={(e) =>
                  rememberSelection(
                    e.currentTarget
                  )
                }
                onChange={(e) =>
                  setFooterText(
                    e.target
                      .value
                  )
                }
                rows={3}
                className="w-full min-w-0 resize-y rounded-lg border border-white/10 bg-[#101010] p-3 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                placeholder="By completing this payment, you agree to our policies."
              />

              <Variables
                onInsert={
                  insertVariable
                }
              />

              <div className="mt-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Policy Links
                    </div>

                    <div className="mt-0.5 text-[11px] text-white/30">
                      These appear as clickable links at the bottom of the email.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      addFooterLink
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] w-full px-2.5 py-2 text-[11px] sm:w-auto text-white/55 transition hover:border-red-500/30 hover:text-white"
                  >
                    <Plus
                      size={13}
                    />
                    Add Link
                  </button>
                </div>

                <div className="space-y-2">
                  {footerLinks.map(
                    (
                      link,
                      index
                    ) => (
                      <div
                        key={
                          link.id
                        }
                        className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_auto]"
                      >
                        <input
                          value={
                            link.label
                          }
                          onFocus={() => {
                            setActiveField(
                              {
                                type: "footerLinkLabel",
                                index,
                              }
                            );
                          }}
                          onClick={(e) => {
                            setActiveField(
                              {
                                type: "footerLinkLabel",
                                index,
                              }
                            );

                            rememberSelection(
                              e.currentTarget
                            );
                          }}
                          onSelect={(e) =>
                            rememberSelection(
                              e.currentTarget
                            )
                          }
                          onChange={(
                            e
                          ) =>
                            updateFooterLink(
                              index,
                              "label",
                              e.target
                                .value
                            )
                          }
                          placeholder="Terms & Conditions"
                          className="h-9 min-w-0 rounded-md border border-white/10 bg-[#101010] px-2.5 text-xs text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                        />

                        <input
                          value={
                            link.url
                          }
                          onFocus={() => {
                            setActiveField(
                              {
                                type: "footerLinkUrl",
                                index,
                              }
                            );
                          }}
                          onClick={(e) => {
                            setActiveField(
                              {
                                type: "footerLinkUrl",
                                index,
                              }
                            );

                            rememberSelection(
                              e.currentTarget
                            );
                          }}
                          onSelect={(e) =>
                            rememberSelection(
                              e.currentTarget
                            )
                          }
                          onChange={(
                            e
                          ) =>
                            updateFooterLink(
                              index,
                              "url",
                              e.target
                                .value
                            )
                          }
                          placeholder="https://example.com/terms"
                          className="h-9 min-w-0 rounded-md border border-white/10 bg-[#101010] px-2.5 text-xs text-white outline-none placeholder:text-white/20 focus:border-red-500/30"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            removeFooterLink(
                              index
                            )
                          }
                          className="flex h-9 items-center justify-center rounded-md border border-white/10 px-3 text-white/25 transition hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-400"
                        >
                          <Trash2
                            size={
                              14
                            }
                          />
                        </button>
                      </div>
                    )
                  )}
                </div>

                {footerLinks.length >
                  0 && (
                  <div className="mt-3">
                    <Variables
                      onInsert={
                        insertVariable
                      }
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Delivery timing */}
            <section className="max-w-full rounded-xl border border-white/10 bg-[#090909] p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Delivery Timing
                </h2>

                <p className="mt-0.5 text-xs text-white/30">
                  Choose how long to wait after the trigger matches.
                </p>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={
                    delay
                  }
                  onChange={(e) =>
                    setDelay(
                      e.target
                        .value
                    )
                  }
                  className="h-10 w-full sm:w-auto rounded-lg border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none"
                />

                <span className="text-xs text-white/35">
                  minutes after trigger
                </span>
              </div>
            </section>
          </div>

          {/* RIGHT */}
          <div className="w-full min-w-0 lg:sticky lg:top-[84px] lg:self-start">
            <Preview
              subject={
                subject
              }
              toName={
                toName
              }
              toEmail={
                toEmail
              }
              blocks={
                blocks
              }
              footerText={
                footerText
              }
              footerLinks={
                footerLinks
              }
            />

            <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.015] px-3 py-2.5 text-[10px] leading-5 text-white/25">
              Preview uses sample values for variables. Payment Date & Time is shown as 15 Sept 2026, 12:10 pm.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function EmailAutomationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <EmailAutomationContent />
    </Suspense>
  );
}
