"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  Save,
  Upload,
  X,
  XCircle,
} from "lucide-react";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import * as XLSX from "xlsx";

import { createClient } from "@/lib/supabase/client";

type ImportRow = {
  rowNumber: number;
  paymentId: string;
  name: string;
  age: number | null;
  city: string;
  phone: string;
  email: string;
  course: string;
  batch: string;
  amount: number;
  status: string;
  method: string;
  time: string | null;
  failedReason: string;
  customFields: Record<string, unknown>;
  rawData: Record<string, unknown>;
};

type ImportResult = {
  total: number;
  imported: number;
  customersCreated: number;
  customersUpdated: number;
  paymentsCreated: number;
  failed: number;
  errors: string[];
};

type ProgressStage =
  | "idle"
  | "reading"
  | "validating"
  | "matching"
  | "importing"
  | "complete";

const supabase = createClient();

const PREVIEW_LIMIT = 100;

/* -------------------------------------------------------------------------- */
/* IMPORT SCHEMA                                                               */
/* -------------------------------------------------------------------------- */

const REQUIRED_FIELDS = [
  "paymentId",
  "name",
  "age",
  "city",
  "phone",
  "email",
  "course",
  "batch",
  "amount",
  "status",
  "method",
  "time",
] as const;

const CUSTOMER_FIELDS = [
  "name",
  "age",
  "city",
  "phone",
  "email",
  "course",
  "batch",
] as const;

const PAYMENT_FIELDS = [
  "paymentId",
  "amount",
  "status",
  "method",
  "time",
  "failedReason",
] as const;

const FIELD_LABELS: Record<string, string> = {
  paymentId: "Payment ID",
  name: "Name",
  age: "Age",
  city: "City",
  phone: "Phone",
  email: "Email",
  course: "Course",
  batch: "Batch",
  amount: "Amount",
  status: "Status",
  method: "Method",
  time: "Time",
  failedReason: "Failed Reason",
};

/* -------------------------------------------------------------------------- */
/* HEADER NORMALIZATION                                                       */
/* -------------------------------------------------------------------------- */

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/* -------------------------------------------------------------------------- */
/* HEADER ALIASES                                                             */
/* -------------------------------------------------------------------------- */

const HEADER_ALIASES = {
  paymentId: [
    "paymentid",
    "payment_id",
    "payment",
    "transactionid",
    "transaction_id",
    "transaction",
    "id",
  ],

  name: [
    "name",
    "customername",
    "customer_name",
    "fullname",
    "full_name",
    "customer",
    "clientname",
  ],

  age: [
    "age",
  ],

  city: [
    "city",
    "location",
    "town",
  ],

  phone: [
    "phone",
    "phonenumber",
    "phone_number",
    "mobile",
    "mobilenumber",
    "mobile_number",
    "contact",
    "contactnumber",
    "contact_number",
  ],

  email: [
    "email",
    "emailaddress",
    "email_address",
    "mail",
  ],

  batch: [
    "batch",
    "batchname",
    "batch_name",
    "batchid",
    "batch_id",
    "cohort",
    "cohortname",
    "cohort_name",
  ],

  course: [
    "course",
    "coursename",
    "course_name",
    "program",
    "programname",
    "product",
    "productname",
    "service",
  ],

  amount: [
    "amount",
    "paymentamount",
    "payment_amount",
    "paidamount",
    "paid_amount",
    "totalamount",
    "total_amount",
    "price",
    "value",
  ],

  status: [
    "status",
    "paymentstatus",
    "payment_status",
    "transactionstatus",
    "transaction_status",
  ],

  method: [
    "method",
    "paymentmethod",
    "payment_method",
    "mode",
    "paymentmode",
    "payment_mode",
  ],

  time: [
    "time",
    "date",
    "datetime",
    "dateandtime",
    "date_time",
    "paymenttime",
    "payment_time",
    "paymentdate",
    "payment_date",
    "transactiondate",
    "transaction_date",
  ],

  failedReason: [
    "failedreason",
    "failed_reason",
    "failurereason",
    "failure_reason",
    "reason",
    "error",
    "errormessage",
  ],
};

/* -------------------------------------------------------------------------- */
/* FIND FIELD                                                                 */
/* -------------------------------------------------------------------------- */

function findMatchingField(header: string) {
  const normalized = normalizeHeader(header);

  for (const [field, aliases] of Object.entries(
    HEADER_ALIASES,
  )) {
    if (
      aliases.some(
        (alias) =>
          normalizeHeader(alias) === normalized,
      )
    ) {
      return field;
    }
  }

  if (
    normalized.includes("payment") &&
    normalized.includes("amount")
  ) {
    return "amount";
  }

  if (
    normalized.includes("customer") &&
    normalized.includes("name")
  ) {
    return "name";
  }

  if (normalized.includes("mobile")) {
    return "phone";
  }

  if (normalized.includes("phone")) {
    return "phone";
  }

  if (normalized.includes("email")) {
    return "email";
  }

  if (normalized.includes("batch")) {
    return "batch";
  }

  if (normalized.includes("course")) {
    return "course";
  }

  if (normalized.includes("status")) {
    return "status";
  }

  if (normalized.includes("reason")) {
    return "failedReason";
  }

  if (
    normalized.includes("payment") &&
    normalized.includes("date")
  ) {
    return "time";
  }

  if (
    normalized.includes("payment") &&
    normalized.includes("time")
  ) {
    return "time";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* FIND HEADER ROW                                                            */
/* -------------------------------------------------------------------------- */

function findHeaderRow(matrix: unknown[][]) {
  let bestRow = 0;
  let bestScore = 0;

  const maxRows = Math.min(
    matrix.length,
    20,
  );

  for (
    let rowIndex = 0;
    rowIndex < maxRows;
    rowIndex++
  ) {
    const row = matrix[rowIndex] || [];

    let score = 0;

    for (const cell of row) {
      if (
        findMatchingField(
          String(cell ?? ""),
        )
      ) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = rowIndex;
    }
  }

  if (bestScore < 2) {
    return -1;
  }

  return bestRow;
}

/* -------------------------------------------------------------------------- */
/* PHONE NORMALIZATION                                                        */
/* -------------------------------------------------------------------------- */

function normalizePhone(value: unknown) {
  const original =
    String(value ?? "").trim();

  if (!original) {
    return "";
  }

  const digits =
    original.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  /*
   * Indian 10 digit number
   */
  if (
    digits.length === 10 &&
    /^[6-9]/.test(digits)
  ) {
    return `+91${digits}`;
  }

  /*
   * Indian number already containing 91
   */
  if (
    digits.length === 12 &&
    digits.startsWith("91")
  ) {
    return `+${digits}`;
  }

  /*
   * International number.
   *
   * Do NOT add +91.
   */
  if (
    original.startsWith("+")
  ) {
    return `+${digits}`;
  }

  return original;
}

/* -------------------------------------------------------------------------- */
/* GENERAL NORMALIZATION                                                     */
/* -------------------------------------------------------------------------- */

function normalizeValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* AMOUNT                                                                     */
/* -------------------------------------------------------------------------- */

function parseAmount(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const cleaned =
    String(value)
      .replace(/[₹,\s]/g, "")
      .replace(/INR/gi, "")
      .trim();

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : 0;
}

/* -------------------------------------------------------------------------- */
/* AGE                                                                        */
/* -------------------------------------------------------------------------- */

function parseAge(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/* -------------------------------------------------------------------------- */
/* DATE PARSER                                                                */
/* -------------------------------------------------------------------------- */

/*
 * YOUR EXCEL FORMAT:
 *
 * M/D/YYYY H:MM:SS
 *
 * Example:
 *
 * 6/2/2026 8:06:15
 *
 * = June 2, 2026 8:06:15 AM
 *
 * NOT February 6.
 */

function parseExcelDate(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  /*
   * IMPORTANT:
   *
   * The Excel "Time" column is a WALL-CLOCK TIME in IST.
   *
   * Example Excel value:
   *   8/30/2026 20:31:05
   *
   * We keep that exact IST wall-clock value in the import row so the
   * preview never changes it because of browser/server timezone settings.
   *
   * Only when writing to Supabase do we convert IST -> UTC.
   */

  /* ---------------------------------------------------------------------- */
  /* EXCEL SERIAL DATE                                                       */
  /* ---------------------------------------------------------------------- */

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    const year = parsed.y;
    const month = parsed.m;
    const day = parsed.d;
    const hours = parsed.H || 0;
    const minutes = parsed.M || 0;
    const seconds = Math.floor(parsed.S || 0);

    return buildISTWallClock(
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* DATE OBJECT                                                             */
  /* ---------------------------------------------------------------------- */

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    /*
     * This branch is only a fallback. The workbook is read with
     * cellDates:false, so normal Excel date cells arrive as serial numbers.
     * If a Date object does arrive, use its displayed wall-clock components.
     */
    return buildISTWallClock(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    );
  }

  const text = String(value).trim();

  /* ---------------------------------------------------------------------- */
  /* FORMAT 1: M/D/YYYY H:MM:SS                                             */
  /* ---------------------------------------------------------------------- */

  let match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const hours = Number(match[4] || 0);
    const minutes = Number(match[5] || 0);
    const seconds = Number(match[6] || 0);

    return buildISTWallClock(
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* FORMAT 2: YYYY-MM-DD H:MM:SS                                           */
  /* ---------------------------------------------------------------------- */

  match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hours = Number(match[4] || 0);
    const minutes = Number(match[5] || 0);
    const seconds = Number(match[6] || 0);

    return buildISTWallClock(
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
    );
  }

  /*
   * Do NOT let JavaScript guess unknown date formats.
   */
  return null;
}

/* -------------------------------------------------------------------------- */
/* IST WALL-CLOCK HELPERS                                                     */
/* -------------------------------------------------------------------------- */

function buildISTWallClock(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
) {
  if (
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  /* Validate the calendar date without using local timezone. */
  const check = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds,
      0,
    ),
  );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hours ||
    check.getUTCMinutes() !== minutes ||
    check.getUTCSeconds() !== seconds
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-") +
    ` ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/*
 * Convert the normalized IST wall-clock value to a UTC ISO timestamp.
 *
 * Example:
 *   2026-08-30 20:31:05 IST
 *       -> 2026-08-30T15:01:05.000Z
 */
function istWallClockToUTC(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6] || 0);

  const utcMillis = Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes - 330,
    seconds,
    0,
  );

  const date = new Date(utcMillis);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

/* -------------------------------------------------------------------------- */
/* FORMAT CURRENCY                                                             */
/* -------------------------------------------------------------------------- */

function formatCurrency(
  amount: number,
) {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    },
  ).format(amount || 0);
}

/* -------------------------------------------------------------------------- */
/* FORMAT DATE                                                                 */
/* -------------------------------------------------------------------------- */

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  /*
   * `value` is deliberately kept as the original IST wall-clock value
   * (YYYY-MM-DD HH:mm:ss) during the import preview.
   * Do not pass it through `new Date()` because that would make a timezone
   * decision based on the browser.
   */
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (!match) {
    return "—";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      hours,
      minutes,
      0,
      0,
    ),
  );

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  ).format(date);
}

/* -------------------------------------------------------------------------- */
/* STATUS                                                                      */
/* -------------------------------------------------------------------------- */

function isCaptured(
  status: string,
) {
  const value =
    normalizeValue(status);

  return [
    "captured",
    "success",
    "successful",
    "paid",
  ].includes(value);
}

function isFailed(
  status: string,
) {
  const value =
    normalizeValue(status);

  return [
    "failed",
    "failure",
  ].includes(value);
}

function displayStatus(
  status: string,
) {
  if (
    isCaptured(status)
  ) {
    return "Captured";
  }

  if (
    isFailed(status)
  ) {
    return "Failed";
  }

  return status || "Pending";
}

/* -------------------------------------------------------------------------- */
/* IMPORT ERROR DIAGNOSTICS                                                    */
/* -------------------------------------------------------------------------- */

function formatImportError(error: unknown) {
  const value = error as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  } | null;

  const message = String(value?.message ?? error ?? "Import failed").trim();
  const code = String(value?.code ?? "").trim();
  const details = String(value?.details ?? "").trim();
  const hint = String(value?.hint ?? "").trim();

  const parts = [message];
  if (code) parts.push(`Code: ${code}`);
  if (details && details !== message) parts.push(`Details: ${details}`);
  if (hint) parts.push(`Hint: ${hint}`);

  return parts.join(" • ");
}

function getImportStepError(step: string, error: unknown) {
  return `${step} failed — ${formatImportError(error)}`;
}

/* -------------------------------------------------------------------------- */
/* CONVERT ROW                                                                 */
/* -------------------------------------------------------------------------- */

function convertRow(
  rawRow: Record<string, unknown>,
  fieldMap: Record<string, string>,
  customHeaders: string[],
  rowNumber: number,
): ImportRow {
  const get = (field: string) =>
    rawRow[fieldMap[field]];

  const customFields: Record<string, unknown> = {};

  customHeaders.forEach((header) => {
    const value = rawRow[header];

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      customFields[header] = value;
    }
  });

  return {
    rowNumber,
    paymentId: String(get("paymentId") ?? "").trim(),
    name: String(get("name") ?? "").trim(),
    age: parseAge(get("age")),
    city: String(get("city") ?? "").trim(),
    phone: normalizePhone(get("phone")),
    email: String(get("email") ?? "").trim(),
    course: String(get("course") ?? "").trim(),
    batch: String(get("batch") ?? "").trim(),
    amount: parseAmount(get("amount")),
    status: String(get("status") ?? "").trim().toLowerCase(),
    method: String(get("method") ?? "").trim(),
    time: parseExcelDate(get("time")),
    failedReason: String(get("failedReason") ?? "").trim(),
    customFields,
    rawData: { ...rawRow },
  };
}

/* -------------------------------------------------------------------------- */
/* PROGRESS STAGES                                                             */
/* -------------------------------------------------------------------------- */

const stages = [
  {
    id: "reading",
    label: "Reading file",
  },
  {
    id: "validating",
    label: "Validating data",
  },
  {
    id: "matching",
    label: "Matching customers",
  },
  {
    id: "importing",
    label: "Importing payments",
  },
  {
    id: "complete",
    label: "Completed",
  },
];

function stageIndex(
  stage: ProgressStage,
) {
  return stages.findIndex(
    (item) =>
      item.id === stage,
  );
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                        */
/* -------------------------------------------------------------------------- */

function getRowMissingFields(row: ImportRow) {
  const missing: string[] = [];

  if (!row.paymentId.trim()) missing.push("Payment ID");
  if (!row.name.trim()) missing.push("Name");
  if (row.age === null) missing.push("Age");
  if (!row.city.trim()) missing.push("City");
  if (!row.phone.trim()) missing.push("Phone");
  if (!row.email.trim()) missing.push("Email");
  if (!row.course.trim()) missing.push("Course");
  if (!row.batch.trim()) missing.push("Batch");
  if (!Number.isFinite(row.amount) || row.amount <= 0) missing.push("Amount");
  if (!row.status.trim()) missing.push("Status");
  if (!row.method.trim()) missing.push("Method");
  if (!row.time) missing.push("Time");

  if (isFailed(row.status) && !row.failedReason.trim()) {
    missing.push("Failed Reason");
  }

  return missing;
}

export default function ImportCustomersPage() {
  const router = useRouter();

  const fileInput =
    useRef<HTMLInputElement | null>(
      null,
    );

  const [fileName, setFileName] =
    useState("");

  const [rows, setRows] =
    useState<ImportRow[]>([]);

  const [loadingFile, setLoadingFile] =
    useState(false);

  const [dragging, setDragging] =
    useState(false);

  const [importing, setImporting] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [stage, setStage] =
    useState<ProgressStage>(
      "idle",
    );

  const [progress, setProgress] =
    useState(0);

  const [
    processedRows,
    setProcessedRows,
  ] = useState(0);

  const [currentImportRow, setCurrentImportRow] = useState<number | null>(null);
  const [currentImportStep, setCurrentImportStep] = useState("Waiting");
  const [fatalImportError, setFatalImportError] = useState("");

  const [result, setResult] =
    useState<ImportResult | null>(
      null,
    );

  /*
   * MANUAL PAYMENT
   *
   * Manual payments use the same customers/payments tables as Excel imports.
   * If a customer already exists, we match by phone, then email, then
   * name + city. If the payment ID is empty, a unique manual ID is generated.
   */
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [savingManualPayment, setSavingManualPayment] = useState(false);
  const [manualPaymentError, setManualPaymentError] = useState("");
  const [manualPaymentSuccess, setManualPaymentSuccess] = useState("");
  const [manualPayment, setManualPayment] = useState({
    paymentId: "",
    name: "",
    age: "",
    city: "",
    phone: "",
    email: "",
    course: "",
    batch: "",
    amount: "",
    status: "captured",
    method: "Manual",
    time: "",
    failedReason: "",
  });

  const [showFailurePopup, setShowFailurePopup] =
    useState(false);

  const [
    detectedColumns,
    setDetectedColumns,
  ] = useState<string[]>([]);

  const [missingRequiredFields, setMissingRequiredFields] = useState<string[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewFilter, setPreviewFilter] = useState<"all" | "incomplete" | "ready">("all");

  /*
   * Edits are kept in draftRows until the user clicks "Save changes".
   * Therefore editing an incomplete record never changes its filter status
   * while the user is typing.
   */
  const [editingIncomplete, setEditingIncomplete] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<number, ImportRow>>({});

  const filteredPreviewRows = rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ row }) => {
      const incomplete = getRowMissingFields(row).length > 0;

      if (previewFilter === "incomplete") return incomplete;
      if (previewFilter === "ready") return !incomplete;
      return true;
    });

  /* ---------------------------------------------------------------------- */
  /* PROCESS FILE                                                            */
  /* ---------------------------------------------------------------------- */

  async function processFile(
    file: File,
  ) {
    setError("");
    setSuccess("");
    setResult(null);
    setShowFailurePopup(false);
    setRows([]);
    setDraftRows({});
    setEditingIncomplete(false);
    setDetectedColumns([]);
    setProgress(0);
    setProcessedRows(0);
    setCurrentImportRow(null);
    setCurrentImportStep("Reading file");
    setFatalImportError("");

    setLoadingFile(true);
    setStage("reading");

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase();

    if (
      ![
        "xlsx",
        "xls",
        "csv",
      ].includes(
        extension || "",
      )
    ) {
      setError(
        "Please upload an XLSX, XLS or CSV file.",
      );

      setLoadingFile(false);
      setStage("idle");

      return;
    }

    try {
      const buffer =
        await file.arrayBuffer();

      setProgress(10);

      const workbook =
        XLSX.read(buffer, {
          type: "array",

          /*
           * Keep raw values.
           *
           * We manually parse M/D/YYYY.
           */
          cellDates: false,
          raw: true,
        });

      const sheetName =
        workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error(
          "No worksheet was found in this file.",
        );
      }

      const sheet =
        workbook.Sheets[
          sheetName
        ];

      if (!sheet) {
        throw new Error(
          "Unable to read the worksheet.",
        );
      }

      const matrix =
        XLSX.utils.sheet_to_json<
          unknown[]
        >(sheet, {
          header: 1,
          defval: "",
          raw: true,
        });

      if (
        matrix.length === 0
      ) {
        throw new Error(
          "The Excel file is empty.",
        );
      }

      setProgress(20);

      /* FIND HEADER */

      setStage("validating");

      const headerIndex =
        findHeaderRow(matrix);

      if (
        headerIndex === -1
      ) {
        throw new Error(
          "Could not identify the Excel header row. Make sure the file contains columns such as Name, Phone, Email, Amount or Status.",
        );
      }

      const headerRow =
        matrix[headerIndex] || [];

      const fieldMap: Record<string, string> = {};
      const foundFields = new Set<string>();
      const allHeaders: string[] = [];

      for (let index = 0; index < headerRow.length; index++) {
        const header = String(headerRow[index] ?? "").trim();
        if (!header) continue;

        allHeaders.push(header);

        const field = findMatchingField(header);
        if (field && !foundFields.has(field)) {
          fieldMap[field] = header;
          foundFields.add(field);
        }
      }

      const missing = REQUIRED_FIELDS
        .filter((field) => !foundFields.has(field))
        .map((field) => FIELD_LABELS[field]);

      const editablePreviewHeaders = [...allHeaders];

      for (const field of REQUIRED_FIELDS) {
        if (!foundFields.has(field)) {
          editablePreviewHeaders.push(FIELD_LABELS[field]);
        }
      }

      setPreviewHeaders(editablePreviewHeaders);
      setDetectedColumns(allHeaders);
      setMissingRequiredFields(missing);

      /*
       * Missing columns do not stop preview generation.
       */
      const customHeaders = allHeaders.filter((header) => {
        const field = findMatchingField(header);
        return !field || (!CUSTOMER_FIELDS.includes(field as typeof CUSTOMER_FIELDS[number]) && !PAYMENT_FIELDS.includes(field as typeof PAYMENT_FIELDS[number]));
      });

      /*
       * Convert Excel rows into objects.
       */

      const objects =
        XLSX.utils.sheet_to_json<
          Record<
            string,
            unknown
          >
        >(sheet, {
          range: headerIndex,
          defval: "",
          raw: true,
        });

      setProgress(30);

      const converted =
        objects
          .map(
            (
              row,
              index,
            ) =>
              convertRow(
                row,
                fieldMap,
                customHeaders,
                headerIndex +
                  index +
                  2,
              ),
          )
          .filter(
            (row) =>
              row.name ||
              row.phone ||
              row.email ||
              row.amount,
          );

      /*
       * Failed Reason is NOT a required Excel column.
       * Add it to the preview only when a failed row needs a reason.
       */
      const failedRowsNeedReason = converted.some(
        (row) => isFailed(row.status) && !row.failedReason.trim(),
      );

      if (
        failedRowsNeedReason &&
        !editablePreviewHeaders.some(
          (header) => findMatchingField(header) === "failedReason",
        )
      ) {
        editablePreviewHeaders.push(FIELD_LABELS.failedReason);
      }

      if (
        converted.length === 0
      ) {
        throw new Error(
          "No usable payment records were found.",
        );
      }

      /*
       * Keep every non-empty Excel row for preview. Required-column
       * validation is handled separately and keeps the Import button
       * disabled until all required columns exist.
       */
      const previewRows = converted.filter((row) =>
        Object.values(row.rawData).some(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        ),
      );

      if (previewRows.length === 0) {
        throw new Error("No usable payment records were found.");
      }

      const repairedPreviewRows = previewRows.map((row) => {
        const rawData = { ...row.rawData };

        for (const header of editablePreviewHeaders) {
          if (!(header in rawData)) rawData[header] = "";
        }

        return { ...row, rawData };
      });

      setProgress(40);
      setRows(repairedPreviewRows);

      setFileName(
        file.name,
      );

      setStage("idle");
    } catch (fileError) {
      console.error(
        "Excel processing error:",
        fileError,
      );

      setError(
        fileError instanceof Error
          ? fileError.message
          : "Unable to process the Excel file.",
      );

      setRows([]);
      setFileName("");
      setStage("idle");
    } finally {
      setLoadingFile(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* FILE INPUT                                                               */
  /* ---------------------------------------------------------------------- */

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    if (file) {
      processFile(file);
    }
  }

  function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(false);

    const file =
      event.dataTransfer.files?.[0];

    if (file) {
      processFile(file);
    }
  }

  function clearFile() {
    if (importing) {
      return;
    }

    setRows([]);
    setDraftRows({});
    setEditingIncomplete(false);
    setFileName("");
    setError("");
    setSuccess("");
    setResult(null);
    setShowFailurePopup(false);
    setProgress(0);
    setProcessedRows(0);
    setCurrentImportRow(null);
    setCurrentImportStep("Waiting");
    setFatalImportError("");
    setStage("idle");
    setDetectedColumns([]);
    setMissingRequiredFields([]);
    setPreviewHeaders([]);

    if (fileInput.current) {
      fileInput.current.value =
        "";
    }
  }

  /* ---------------------------------------------------------------------- */
  /* MANUAL PAYMENT                                                          */
  /* ---------------------------------------------------------------------- */

  function resetManualPayment() {
    setManualPayment({
      paymentId: "",
      name: "",
      age: "",
      city: "",
      phone: "",
      email: "",
      course: "",
      batch: "",
      amount: "",
      status: "captured",
      method: "Manual",
      time: "",
      failedReason: "",
    });
    setManualPaymentError("");
    setManualPaymentSuccess("");
  }

  function openManualPayment() {
    setManualPaymentError("");
    setManualPaymentSuccess("");
    setShowManualPayment(true);

    setManualPayment((current) => ({
      ...current,
      time:
        current.time ||
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(new Date())
          .replace(", ", "T"),
    }));
  }

  function closeManualPayment() {
    if (savingManualPayment) return;
    setShowManualPayment(false);
    setManualPaymentError("");
    setManualPaymentSuccess("");
  }

  async function saveManualPayment() {
    setManualPaymentError("");
    setManualPaymentSuccess("");

    const name = manualPayment.name.trim();
    const phone = normalizePhone(manualPayment.phone);
    const email = manualPayment.email.trim();
    const course = manualPayment.course.trim();
    const batch = manualPayment.batch.trim();
    const city = manualPayment.city.trim();
    const amount = parseAmount(manualPayment.amount);
    const age =
      manualPayment.age.trim() === ""
        ? null
        : parseAge(manualPayment.age);
    const status = manualPayment.status.trim().toLowerCase() || "captured";
    const method = manualPayment.method.trim() || "Manual";
    const paymentId =
      manualPayment.paymentId.trim() ||
      `MANUAL-${Date.now()}`;
    const paymentTime =
      manualPayment.time.trim()
        ? istWallClockToUTC(
            manualPayment.time.trim().replace("T", " ") +
              (manualPayment.time.trim().length === 16 ? ":00" : ""),
          )
        : null;

    const missing: string[] = [];
    if (!name) missing.push("Name");
    if (!phone && !email) missing.push("Phone or Email");
    if (!course) missing.push("Course");
    if (!batch) missing.push("Batch");
    if (!Number.isFinite(amount) || amount <= 0) missing.push("Amount");
    if (!paymentTime) missing.push("Payment date & time");

    if (isFailed(status) && !manualPayment.failedReason.trim()) {
      missing.push("Failed Reason");
    }

    if (missing.length > 0) {
      setManualPaymentError(
        `Please complete: ${missing.join(", ")}.`,
      );
      return;
    }

    setSavingManualPayment(true);

    try {
      const { data: existingCustomers, error: customerLoadError } =
        await supabase
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
            custom_fields
          `);

      if (customerLoadError) throw customerLoadError;

      const customerCache = (existingCustomers || []) as Array<{
        id: string;
        name: string;
        age: number | null;
        city: string | null;
        phone: string | null;
        email: string | null;
        course: string | null;
        batch: string | null;
        custom_fields: Record<string, unknown> | null;
      }>;

      let customer = phone
        ? customerCache.find(
            (item) => normalizePhone(item.phone) === phone,
          )
        : undefined;

      if (!customer && email) {
        customer = customerCache.find(
          (item) =>
            normalizeValue(item.email) === normalizeValue(email),
        );
      }

      if (!customer) {
        customer = customerCache.find((item) => {
          const sameName =
            normalizeValue(item.name) === normalizeValue(name);
          const sameCity =
            !city ||
            !item.city ||
            normalizeValue(item.city) === normalizeValue(city);
          return sameName && sameCity;
        });
      }

      if (!customer) {
        const { data: newCustomer, error: createCustomerError } =
          await supabase
            .from("customers")
            .insert({
              name,
              age,
              city: city || null,
              phone: phone || null,
              email: email || null,
              course: course || null,
              batch: batch || null,
              custom_fields: {},
            })
            .select(`
              id,
              name,
              age,
              city,
              phone,
              email,
              course,
              batch,
              custom_fields
            `)
            .single();

        if (createCustomerError) throw createCustomerError;
        customer = newCustomer;
      } else {
        const updateData: Record<string, unknown> = {};

        if (age !== null && customer.age === null) updateData.age = age;
        if (city && !customer.city) updateData.city = city;
        if (phone && !customer.phone) updateData.phone = phone;
        if (email && !customer.email) updateData.email = email;
        if (course && !customer.course) updateData.course = course;
        if (batch && !customer.batch) updateData.batch = batch;

        if (Object.keys(updateData).length > 0) {
          const { error: updateCustomerError } = await supabase
            .from("customers")
            .update(updateData)
            .eq("id", customer.id);

          if (updateCustomerError) throw updateCustomerError;
        }
      }

      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          customer_id: customer.id,
          payment_id: paymentId,
          amount,
          status,
          method,
          payment_time: paymentTime,
          failed_reason:
            manualPayment.failedReason.trim() || null,
          course: course || null,
          batch: batch || null,
        });

      if (paymentError) throw paymentError;

      setManualPaymentSuccess(
        `Payment ${paymentId} added successfully.`,
      );

      setTimeout(() => {
        setShowManualPayment(false);
        resetManualPayment();
      }, 900);
    } catch (manualError) {
      console.error("Manual payment error:", manualError);
      setManualPaymentError(
        formatImportError(manualError),
      );
    } finally {
      setSavingManualPayment(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* IMPORT DATA                                                              */
  /* ---------------------------------------------------------------------- */

  function startIncompleteEditing() {
    const drafts: Record<number, ImportRow> = {};

    rows.forEach((row, index) => {
      if (getRowMissingFields(row).length > 0) {
        drafts[index] = {
          ...row,
          rawData: { ...row.rawData },
          customFields: { ...row.customFields },
        };
      }
    });

    setDraftRows(drafts);
    setEditingIncomplete(true);
    setError("");
  }

  function updatePreviewCell(
    rowIndex: number,
    header: string,
    value: string,
  ) {
    setDraftRows((currentDrafts) => {
      const current = currentDrafts[rowIndex];

      if (!current) return currentDrafts;

      const field = findMatchingField(header);
      const updated: ImportRow = {
        ...current,
        rawData: {
          ...current.rawData,
          [header]: value,
        },
      };

      switch (field) {
        case "paymentId":
          updated.paymentId = value.trim();
          break;
        case "name":
          updated.name = value.trim();
          break;
        case "age":
          updated.age =
            value.trim() === "" ? null : parseAge(value);
          break;
        case "city":
          updated.city = value.trim();
          break;
        case "phone":
          updated.phone = normalizePhone(value);
          break;
        case "email":
          updated.email = value.trim();
          break;
        case "course":
          updated.course = value.trim();
          break;
        case "batch":
          updated.batch = value.trim();
          break;
        case "amount":
          updated.amount = parseAmount(value);
          break;
        case "status":
          updated.status = value.trim().toLowerCase();
          break;
        case "method":
          updated.method = value.trim();
          break;
        case "time":
          updated.time = parseExcelDate(value);
          break;
        case "failedReason":
          updated.failedReason = value.trim();
          break;
        default:
          updated.customFields = {
            ...updated.customFields,
            [header]: value,
          };
          break;
      }

      return {
        ...currentDrafts,
        [rowIndex]: updated,
      };
    });
  }

  function saveIncompleteEdits() {
    const stillIncomplete: Array<{
      index: number;
      row: ImportRow;
      missing: string[];
    }> = [];

    Object.entries(draftRows as Record<string, ImportRow>).forEach(
      ([indexText, row]) => {
        const index = Number(indexText);
        const missing = getRowMissingFields(row);

        if (missing.length > 0) {
          stillIncomplete.push({
            index,
            row,
            missing,
          });
        }
      },
    );

    if (stillIncomplete.length > 0) {
      const first = stillIncomplete[0];

      setError(
        `${stillIncomplete.length} record(s) are still incomplete. ` +
        `Excel row ${first.row.rowNumber} is missing: ${first.missing.join(", ")}. ` +
        `Complete all fields before saving.`,
      );
      return;
    }

    setRows((currentRows) =>
      currentRows.map(
        (row, index) => draftRows[index] ?? row,
      ),
    );

    setDraftRows({});
    setEditingIncomplete(false);
    setError("");

    /*
     * Only after Save succeeds do repaired records leave Incomplete
     * and become visible in All.
     */
    setPreviewFilter("all");
  }

  function cancelIncompleteEdits() {
    setDraftRows({});
    setEditingIncomplete(false);
    setError("");
  }

  async function importData() {
    if (rows.length === 0) {
      setError("Please upload a valid file first.");
      return;
    }

    // Missing fields are allowed during import.
    // Each row is imported with whatever data is available; optional/missing
    // values are stored as null/empty values where the database allows them.

    setImporting(true);
    setError("");
    setSuccess("");
    setResult(null);
    setProcessedRows(0);
    setProgress(45);

    const importResult: ImportResult = {
      total: rows.length,
      imported: 0,
      customersCreated: 0,
      customersUpdated: 0,
      paymentsCreated: 0,
      failed: 0,
      errors: [],
    };

    try {
      setStage("matching");
      setProgress(48);

      const { data: existingCustomers, error: customerLoadError } =
        await supabase
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
            custom_fields
          `);

      if (customerLoadError) throw customerLoadError;

      const customerCache = (existingCustomers || []) as Array<{
        id: string;
        name: string;
        age: number | null;
        city: string | null;
        phone: string | null;
        email: string | null;
        course: string | null;
        batch: string | null;
        custom_fields: Record<string, unknown> | null;
      }>;

      setProgress(50);
      setStage("importing");

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        setCurrentImportRow(row.rowNumber);
        setCurrentImportStep(`Matching customer for Excel row ${row.rowNumber}`);

        try {
          let customer = row.phone
            ? customerCache.find(
                (item) => normalizePhone(item.phone) === row.phone,
              )
            : undefined;

          if (!customer && row.email) {
            customer = customerCache.find(
              (item) =>
                normalizeValue(item.email) === normalizeValue(row.email),
            );
          }

          if (!customer) {
            customer = customerCache.find((item) => {
              const sameName =
                normalizeValue(item.name) === normalizeValue(row.name);
              const sameCity =
                !row.city ||
                !item.city ||
                normalizeValue(item.city) === normalizeValue(row.city);
              return sameName && sameCity;
            });
          }

          if (!customer) {
            setCurrentImportStep(`Creating customer for Excel row ${row.rowNumber}`);
            const { data: newCustomer, error: createCustomerError } =
              await supabase
                .from("customers")
                .insert({
                  name: row.name,
                  age: row.age,
                  city: row.city || null,
                  phone: row.phone || null,
                  email: row.email || null,
                  course: row.course || null,
                  batch: row.batch || null,
                  custom_fields: row.customFields,
                })
                .select(`
                  id, name, age, city, phone, email, course, batch, custom_fields
                `)
                .single();

            if (createCustomerError) {
              throw new Error(getImportStepError("Customer creation", createCustomerError));
            }
            customer = newCustomer;
            customerCache.push(customer);
            importResult.customersCreated++;
          } else {
            const updateData: Record<string, unknown> = {};

            if (row.age !== null && customer.age === null) updateData.age = row.age;
            if (row.city && !customer.city) updateData.city = row.city;
            if (row.phone && !customer.phone) updateData.phone = row.phone;
            if (row.email && !customer.email) updateData.email = row.email;
            if (row.course && !customer.course) updateData.course = row.course;
            if (row.batch && !customer.batch) updateData.batch = row.batch;

            const mergedCustomFields = {
              ...(customer.custom_fields || {}),
              ...row.customFields,
            };

            if (Object.keys(row.customFields).length > 0) {
              updateData.custom_fields = mergedCustomFields;
            }

            if (Object.keys(updateData).length > 0) {
              setCurrentImportStep(`Updating customer for Excel row ${row.rowNumber}`);
              const { error: updateCustomerError } = await supabase
                .from("customers")
                .update(updateData)
                .eq("id", customer.id);

              if (updateCustomerError) {
                throw new Error(getImportStepError("Customer update", updateCustomerError));
              }

              Object.assign(customer, updateData);
              importResult.customersUpdated++;
            }
          }

          setCurrentImportStep(`Creating payment for Excel row ${row.rowNumber}`);
          const { error: paymentError } = await supabase
            .from("payments")
            .insert({
              customer_id: customer.id,
              payment_id: row.paymentId,
              amount: row.amount,
              status: row.status || "captured",
              method: row.method || null,
              payment_time: istWallClockToUTC(row.time),
              failed_reason: row.failedReason || null,

              // IMPORTANT:
              // Course and batch belong to THIS payment, not only to the customer.
              // This prevents a multi-course customer's payments from all
              // displaying the same course/batch.
              course: row.course || null,
              batch: row.batch || null,
            });

          if (paymentError) {
            throw new Error(getImportStepError("Payment creation", paymentError));
          }

          importResult.paymentsCreated++;
          importResult.imported++;
        } catch (rowError) {
          importResult.failed++;
          const reason = formatImportError(rowError);
          importResult.errors.push(
            `Excel row ${row.rowNumber} (${row.name || "Unknown"}): ${reason}`,
          );
        }

        const rowProgress =
          50 + Math.round(((index + 1) / rows.length) * 48);
        setProgress(Math.min(98, rowProgress));
        setProcessedRows(index + 1);

        if (index % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      setProcessedRows(rows.length);
      setCurrentImportRow(null);
      setCurrentImportStep("Import finished — reviewing results");
      setProgress(100);
      setStage("complete");
      setResult(importResult);

      if (importResult.failed > 0) {
        setShowFailurePopup(true);
      } else {
        setSuccess(
          `Import complete — ${importResult.imported.toLocaleString()} records imported successfully.`,
        );

        // Redirect to Customers after a fully successful import.
        // The short delay lets the success state render before navigation.
        setTimeout(() => {
          router.push("/dashboard/customers");
        }, 1000);
      }

      if (importResult.failed > 0) {
        setError(
          `${importResult.failed.toLocaleString()} record(s) failed during import.`,
        );
      }
    } catch (importError) {
      console.error("Import error:", importError);
      const reason = formatImportError(importError);
      const stopMessage = `Import stopped before all records were processed. ${reason}`;
      setFatalImportError(stopMessage);
      setCurrentImportStep("Import stopped");
      setError(stopMessage);
    } finally {
      setImporting(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* PREVIEW STATS                                                           */
  /* ---------------------------------------------------------------------- */

  const capturedCount =
    rows.filter(
      (row) =>
        isCaptured(
          row.status,
        ),
    ).length;

  const failedCount =
    rows.filter(
      (row) =>
        isFailed(
          row.status,
        ),
    ).length;

  const totalAmount =
    rows.reduce(
      (sum, row) =>
        sum + row.amount,
      0,
    );

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <main className="import-page">

      {/* ---------------------------------------------------------------- */}
      {/* TOP BAR                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="top-bar">

        <button
          className="back-button"
          onClick={() =>
            router.push(
              "/dashboard/customers",
            )
          }
        >
          <ArrowLeft size={16} />

          <span>
            Customers
          </span>
        </button>


        <div className="top-actions">
          <button
            className="top-manual-button"
            onClick={openManualPayment}
            disabled={loadingFile || importing || savingManualPayment}
          >
            <Plus size={16} />
            Add Payment
          </button>

          <button
            className="top-import-button"
            onClick={() =>
              fileInput.current?.click()
            }
            disabled={
              loadingFile ||
              importing
            }
          >
            {loadingFile ? (
              <Loader2
                size={16}
                className="spin"
              />
            ) : (
              <Upload size={16} />
            )}

            Import Data
          </button>
        </div>

      </div>


      {/* ---------------------------------------------------------------- */}
      {/* HEADER                                                            */}
      {/* ---------------------------------------------------------------- */}

      <header className="header">

        <span className="eyebrow">
          DEVILX FLOW
        </span>

        <h1>
          Import payment data
        </h1>

        <p>
          Upload your historical
          payment records and
          DevilX Flow will
          automatically organize
          them into your customer
          database.
        </p>

      </header>


      {/* ---------------------------------------------------------------- */}
      {/* UPLOAD                                                            */}
      {/* ---------------------------------------------------------------- */}

      <section className="upload-section">

        <div className="section-heading">

          <div>

            <h2>
              Upload Excel file
            </h2>

            <p>
              Columns can be in any
              order. DevilX Flow
              automatically identifies
              the required fields.
            </p>

          </div>

        </div>


        {!fileName ? (
          <div
            className={
              dragging
                ? "drop-zone dragging"
                : "drop-zone"
            }
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() =>
              setDragging(false)
            }
            onDrop={handleDrop}
            onClick={() =>
              fileInput.current?.click()
            }
          >

            <div className="upload-icon">

              {loadingFile ? (
                <Loader2
                  size={25}
                  className="spin"
                />
              ) : (
                <FileSpreadsheet
                  size={25}
                />
              )}

            </div>


            <h3>
              {loadingFile
                ? "Reading your file..."
                : "Drop your Excel file here"}
            </h3>


            <p>
              {loadingFile
                ? "Please wait while DevilX Flow organizes your data."
                : "or click anywhere here to browse"}
            </p>


            {!loadingFile && (
              <span>
                XLSX · XLS · CSV
              </span>
            )}


            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={
                handleFileChange
              }
              hidden
            />

          </div>
        ) : (
          <div className="file-selected">

            <div className="file-icon">
              <FileSpreadsheet
                size={22}
              />
            </div>


            <div className="file-info">

              <strong>
                {fileName}
              </strong>

              <span>
                {rows.length.toLocaleString()}{" "}
                records detected
              </span>

            </div>


            <button
              className="remove-file"
              onClick={
                clearFile
              }
              disabled={
                importing
              }
            >
              <X size={17} />
            </button>

          </div>
        )}

      </section>


      {/* ---------------------------------------------------------------- */}
      {/* DETECTED COLUMNS                                                 */}
      {/* ---------------------------------------------------------------- */}

      {detectedColumns.length > 0 && (
        <section className="detected-section">
          <div>
            <strong>Columns detected</strong>
            <p>Required fields must exist. Extra columns are stored dynamically.</p>
          </div>

          <div className="column-list">
            {detectedColumns.map((column) => {
              const field = findMatchingField(column);
              const isRequired = field ? REQUIRED_FIELDS.includes(field as typeof REQUIRED_FIELDS[number]) : false;
              const isCustom = !field;

              return (
                <span key={column} className={
                  isRequired ? "required-column" : isCustom ? "custom-column" : ""
                }>
                  <Check size={12} />
                  {column}
                  {isRequired ? " · Required" : isCustom ? " · Custom" : ""}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {missingRequiredFields.length > 0 && (
        <section className="required-error-section">
          <strong>Import blocked</strong>
          <p>The following required columns are missing:</p>
          <div>
            {missingRequiredFields.map((field) => (
              <span key={field}>{field}</span>
            ))}
          </div>
          <small>No records will be imported until all required columns are present.</small>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* PROGRESS                                                          */}
      {/* ---------------------------------------------------------------- */}

      {(importing ||
        stage === "complete") && (
        <section className="progress-section">

          <div className="progress-top">

            <div>

              <span className="progress-label">
                {stage ===
                "complete"
                  ? "IMPORT COMPLETE"
                  : "IMPORTING DATA"}
              </span>

              <h2>
                {progress}%
              </h2>

            </div>


            <div className="progress-count">

              {processedRows.toLocaleString()}
              {" / "}
              {rows.length.toLocaleString()}
              {" records"}

            </div>

          </div>


          <div className="progress-track">

            <div
              className="progress-fill"
              style={{
                width: `${progress}%`,
              }}
            />

          </div>


          <div className="timeline">

            {stages.map(
              (
                item,
                index,
              ) => {

                const currentIndex =
                  stageIndex(
                    stage,
                  );

                const completed =
                  currentIndex >=
                  index;

                const active =
                  item.id ===
                  stage;

                return (
                  <div
                    key={
                      item.id
                    }
                    className={
                      completed
                        ? "timeline-item completed"
                        : active
                          ? "timeline-item active"
                          : "timeline-item"
                    }
                  >

                    <div className="timeline-dot">

                      {completed ? (
                        <Check
                          size={11}
                        />
                      ) : active ? (
                        <Loader2
                          size={11}
                          className="spin"
                        />
                      ) : (
                        <span />
                      )}

                    </div>

                    <span>
                      {item.label}
                    </span>

                  </div>
                );
              },
            )}

          </div>

        </section>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* ERROR                                                             */}
      {/* ---------------------------------------------------------------- */}

      {error && (
        <div className="message error">

          <XCircle size={17} />

          <span>
            {error}
          </span>

        </div>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* SUCCESS                                                           */}
      {/* ---------------------------------------------------------------- */}

      {success && (
        <div className="message success">

          <CheckCircle2
            size={17}
          />

          <span>
            {success}
          </span>

        </div>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* PREVIEW                                                          */}
      {/* ---------------------------------------------------------------- */}

      {rows.length > 0 && (
        <section className="preview-section">

          <div className="preview-header">

            <div>

              <h2>
                Import preview
              </h2>

              <p>
                Review your data before
                importing it.
              </p>

            </div>


            <div className="preview-stats">

              <div>

                <span>
                  RECORDS
                </span>

                <strong>
                  {rows.length.toLocaleString()}
                </strong>

              </div>


              <div>

                <span>
                  CAPTURED
                </span>

                <strong className="green">
                  {capturedCount.toLocaleString()}
                </strong>

              </div>


              <div>

                <span>
                  FAILED
                </span>

                <strong className="red">
                  {failedCount.toLocaleString()}
                </strong>

              </div>


              <div>

                <span>
                  TOTAL
                </span>

                <strong>
                  {formatCurrency(
                    totalAmount,
                  )}
                </strong>

              </div>

            </div>

          </div>

          <div className="preview-filter-bar">
            <div className="filter-label">
              <span>SHOW</span>
              <strong>
                {previewFilter === "all"
                  ? "All records"
                  : previewFilter === "incomplete"
                    ? "Incomplete only"
                    : "Ready only"}
              </strong>
            </div>

            <div className="preview-filters">
              <button
                type="button"
                className={previewFilter === "all" ? "active" : ""}
                onClick={() =>
                  !editingIncomplete && setPreviewFilter("all")
                }
                disabled={editingIncomplete}
              >
                All <span>{rows.length}</span>
              </button>

              <button
                type="button"
                className={
                  previewFilter === "incomplete"
                    ? "active incomplete-filter"
                    : ""
                }
                onClick={() =>
                  !editingIncomplete &&
                  setPreviewFilter("incomplete")
                }
                disabled={editingIncomplete}
              >
                Incomplete{" "}
                <span>
                  {
                    rows.filter(
                      (row) =>
                        getRowMissingFields(row).length > 0,
                    ).length
                  }
                </span>
              </button>

              <button
                type="button"
                className={
                  previewFilter === "ready"
                    ? "active ready-filter"
                    : ""
                }
                onClick={() =>
                  !editingIncomplete && setPreviewFilter("ready")
                }
                disabled={editingIncomplete}
              >
                Ready{" "}
                <span>
                  {
                    rows.filter(
                      (row) =>
                        getRowMissingFields(row).length === 0,
                    ).length
                  }
                </span>
              </button>

              {previewFilter === "incomplete" &&
                !editingIncomplete && (
                  <button
                    type="button"
                    className="edit-incomplete-button"
                    onClick={startIncompleteEditing}
                  >
                    Edit incomplete data
                  </button>
                )}

              {previewFilter === "incomplete" &&
                editingIncomplete && (
                  <>
                    <button
                      type="button"
                      className="save-incomplete-button"
                      onClick={saveIncompleteEdits}
                    >
                      Save changes
                    </button>

                    <button
                      type="button"
                      className="cancel-incomplete-button"
                      onClick={cancelIncompleteEdits}
                    >
                      Cancel
                    </button>
                  </>
                )}
            </div>
          </div>

          <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {previewHeaders.map((header) => (
                    <th key={header}>{header.toUpperCase()}</th>
                  ))}
                                  <th>IMPORT STATUS</th>
</tr>
              </thead>

              <tbody>
                {filteredPreviewRows.slice(0, PREVIEW_LIMIT).map(({ row, originalIndex }) => {
                  const displayRow =
                    editingIncomplete && draftRows[originalIndex]
                      ? draftRows[originalIndex]
                      : row;

                  const missingFields =
                    getRowMissingFields(displayRow);

                  const committedIncomplete =
                    getRowMissingFields(row).length > 0;

                  const isEditing =
                    editingIncomplete && committedIncomplete;

                  return (
                    <tr
                      key={`${row.rowNumber}-${originalIndex}`}
                      className={committedIncomplete ? "incomplete-row" : ""}
                    >
                      {previewHeaders.map((header) => {
                        const field = findMatchingField(header);
                        let value = displayRow.rawData[header];

                        if (field === "paymentId") value = displayRow.paymentId;
                        if (field === "name") value = displayRow.name;
                        if (field === "age") value = displayRow.age ?? "";
                        if (field === "city") value = displayRow.city;
                        if (field === "phone") value = displayRow.phone;
                        if (field === "email") value = displayRow.email;
                        if (field === "course") value = displayRow.course;
                        if (field === "batch") value = displayRow.batch;
                        if (field === "amount") value = displayRow.amount || "";
                        if (field === "status") value = displayRow.status;
                        if (field === "method") value = displayRow.method;
                        if (field === "time") value = displayRow.time || "";
                        if (field === "failedReason") value = displayRow.failedReason;

                        const isMissing =
                          (field === "paymentId" && !displayRow.paymentId.trim()) ||
                          (field === "name" && !displayRow.name.trim()) ||
                          (field === "age" && displayRow.age === null) ||
                          (field === "city" && !displayRow.city.trim()) ||
                          (field === "phone" && !displayRow.phone.trim()) ||
                          (field === "email" && !displayRow.email.trim()) ||
                          (field === "course" && !displayRow.course.trim()) ||
                          (field === "batch" && !displayRow.batch.trim()) ||
                          (field === "amount" && (!Number.isFinite(displayRow.amount) || displayRow.amount <= 0)) ||
                          (field === "status" && !displayRow.status.trim()) ||
                          (field === "method" && !displayRow.method.trim()) ||
                          (field === "time" && !displayRow.time) ||
                          (field === "failedReason" && isFailed(displayRow.status) && !displayRow.failedReason.trim());

                        return (
                          <td key={header} className={isMissing ? "editable-cell missing-cell" : "editable-cell"}>
                            {isEditing ? (
                              <input
                                className={isMissing ? "preview-input missing-input" : "preview-input"}
                                value={value === null || value === undefined ? "" : String(value)}
                                onChange={(event) =>
                                  updatePreviewCell(originalIndex, header, event.target.value)
                                }
                                placeholder={isMissing ? "Enter value" : ""}
                              />
                            ) : (
                              <div className={isMissing ? "preview-value missing-value" : "preview-value"}>
                                {value === null || value === undefined || String(value).trim() === ""
                                  ? "Enter value"
                                  : String(value)}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      <td
                        className={
                          committedIncomplete
                            ? "row-status-cell incomplete"
                            : "row-status-cell complete"
                        }
                      >
                        <div className="row-status-top">
                          <span>
                            {missingFields.length > 0
                              ? isEditing
                                ? "Editing"
                                : "Incomplete"
                              : isEditing
                                ? "Ready to save"
                                : "Ready"}
                          </span>
                        </div>

                        {missingFields.length > 0 && (
                          <small>
                            {missingFields.join(", ")}
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredPreviewRows.length >
            PREVIEW_LIMIT && (
            <div className="preview-limit">

              Showing first{" "}
              {PREVIEW_LIMIT.toLocaleString()}{" "}
              records.

              <strong>
                {" "}
                All{" "}
                {rows.length.toLocaleString()}{" "}
                records remain available for import.
              </strong>

            </div>
          )}
          </>



        </section>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* IMPORT ACTION                                                     */}
      {/* ---------------------------------------------------------------- */}

      {rows.length > 0 &&
        !result && (
        <section className="import-action">

          <div>

            <h3>
              Ready to import
            </h3>

            <p>
              Existing customers are
              matched using phone,
              email, then name and
              city.
            </p>

          </div>


          <button
            className="import-button"
            onClick={
              importData
            }
            disabled={importing || rows.length === 0}
          >

            {importing ? (
              <>
                <Loader2
                  size={17}
                  className="spin"
                />

                Importing{" "}
                {progress}%
              </>
            ) : (
              <>
                <Upload size={17} />

                Import{" "}
                {rows.length.toLocaleString()}{" "}
                Records
              </>
            )}

          </button>

        </section>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* FINAL RESULT                                                      */}
      {/* ---------------------------------------------------------------- */}

      {result && (
        <section className="result-section">

          <div className="result-heading">

            <div className="result-check">
              <Check size={20} />
            </div>


            <div>

              <h2>
                Import completed
              </h2>

              <p>
                {result.failed > 0
                  ? `DevilX Flow finished processing all ${result.total.toLocaleString()} records. ${result.failed.toLocaleString()} record(s) could not be saved. See the exact reason below.`
                  : "DevilX Flow has finished processing your payment data successfully."}
              </p>

            </div>

          </div>


          <div className="result-grid">

            <div>

              <span>
                TOTAL RECORDS
              </span>

              <strong>
                {result.total.toLocaleString()}
              </strong>

            </div>


            <div>

              <span>
                IMPORTED
              </span>

              <strong>
                {result.imported.toLocaleString()}
              </strong>

            </div>


            <div>

              <span>
                PAYMENTS CREATED
              </span>

              <strong>
                {result.paymentsCreated.toLocaleString()}
              </strong>

            </div>


            <div>

              <span>
                NEW CUSTOMERS
              </span>

              <strong>
                {result.customersCreated.toLocaleString()}
              </strong>

            </div>


            <div>

              <span>
                UPDATED CUSTOMERS
              </span>

              <strong>
                {result.customersUpdated.toLocaleString()}
              </strong>

            </div>


            <div>

              <span>
                FAILED
              </span>

              <strong className="red">
                {result.failed.toLocaleString()}
              </strong>

            </div>

          </div>


          {result.errors.length >
            0 && (
            <div className="errors-list">

              <h3>
                Failed records
              </h3>

              {result.errors
                .slice(
                  0,
                  20,
                )
                .map(
                  (
                    item,
                    index,
                  ) => (
                    <div
                      key={
                        index
                      }
                    >

                      <XCircle
                        size={14}
                      />

                      {item}

                    </div>
                  ),
                )}

              {result.errors.length >
                20 && (
                <p>
                  +
                  {(
                    result.errors
                      .length -
                    20
                  ).toLocaleString()}{" "}
                  more errors
                </p>
              )}

            </div>
          )}


          {showFailurePopup && result.failed > 0 && (
            <div className="failure-modal-backdrop">
              <div
                className="failure-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="failure-modal-title"
              >
                <button
                  type="button"
                  className="failure-modal-close"
                  onClick={() => setShowFailurePopup(false)}
                  aria-label="Close failed import details"
                >
                  <X size={18} />
                </button>

                <div className="failure-modal-icon">
                  <XCircle size={22} />
                </div>

                <div className="failure-modal-heading">
                  <h3 id="failure-modal-title">Import completed with failures</h3>
                  <p>
                    {result.failed.toLocaleString()} record(s) could not be imported.
                  </p>
                </div>

                <div className="failure-modal-summary">
                  <span>Successful: <strong>{result.imported.toLocaleString()}</strong></span>
                  <span>Failed: <strong className="red">{result.failed.toLocaleString()}</strong></span>
                </div>

                <div className="failure-modal-list">
                  {result.errors.map((item, index) => (
                    <div className="failure-modal-item" key={`${index}-${item}`}>
                      <XCircle size={15} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="failure-modal-button"
                  onClick={() => setShowFailurePopup(false)}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* FINAL NAVIGATION */}

          <div className="result-actions">

            <button
              className="secondary-action"
              onClick={() =>
                router.push(
                  "/dashboard/customers",
                )
              }
            >
              <ArrowLeft
                size={15}
              />

              Back to Customers
            </button>


            <button
              className="primary-action"
              onClick={
                clearFile
              }
            >
              <Upload
                size={15}
              />

              Import Another File
            </button>

          </div>

        </section>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* MANUAL PAYMENT MODAL                                               */}
      {/* ---------------------------------------------------------------- */}

      {showManualPayment && (
        <div
          className="manual-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeManualPayment();
            }
          }}
        >
          <section
            className="manual-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-payment-title"
          >
            <div className="manual-modal-header">
              <div>
                <span className="manual-modal-eyebrow">
                  DEVILX FLOW
                </span>
                <h2 id="manual-payment-title">
                  Add manual payment
                </h2>
                <p>
                  Create a customer and payment record without importing an Excel file.
                </p>
              </div>

              <button
                className="manual-close"
                onClick={closeManualPayment}
                disabled={savingManualPayment}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {manualPaymentError && (
              <div className="manual-message manual-error">
                <XCircle size={16} />
                <span>{manualPaymentError}</span>
              </div>
            )}

            {manualPaymentSuccess && (
              <div className="manual-message manual-success">
                <CheckCircle2 size={16} />
                <span>{manualPaymentSuccess}</span>
              </div>
            )}

            <div className="manual-form">
              <div className="manual-section-label">
                CUSTOMER DETAILS
              </div>

              <div className="manual-grid">
                <label className="manual-field manual-field-wide">
                  <span>Name <b>*</b></span>
                  <input
                    value={manualPayment.name}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Customer name"
                  />
                </label>

                <label className="manual-field">
                  <span>Phone</span>
                  <input
                    value={manualPayment.phone}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="+91 98765 43210"
                  />
                </label>

                <label className="manual-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={manualPayment.email}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        email: e.target.value,
                      }))
                    }
                    placeholder="customer@email.com"
                  />
                </label>

                <label className="manual-field">
                  <span>Age</span>
                  <input
                    type="number"
                    min="0"
                    value={manualPayment.age}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        age: e.target.value,
                      }))
                    }
                    placeholder="Age"
                  />
                </label>

                <label className="manual-field">
                  <span>City</span>
                  <input
                    value={manualPayment.city}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        city: e.target.value,
                      }))
                    }
                    placeholder="City"
                  />
                </label>

                <label className="manual-field">
                  <span>Course <b>*</b></span>
                  <input
                    value={manualPayment.course}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        course: e.target.value,
                      }))
                    }
                    placeholder="e.g. Bootcamp"
                  />
                </label>

                <label className="manual-field">
                  <span>Batch <b>*</b></span>
                  <input
                    value={manualPayment.batch}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        batch: e.target.value,
                      }))
                    }
                    placeholder="e.g. 05"
                  />
                </label>
              </div>

              <div className="manual-section-label manual-payment-label">
                PAYMENT DETAILS
              </div>

              <div className="manual-grid">
                <label className="manual-field">
                  <span>Amount (INR) <b>*</b></span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={manualPayment.amount}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        amount: e.target.value,
                      }))
                    }
                    placeholder="5000"
                  />
                </label>

                <label className="manual-field">
                  <span>Payment ID</span>
                  <input
                    value={manualPayment.paymentId}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        paymentId: e.target.value,
                      }))
                    }
                    placeholder="Auto-generated if blank"
                  />
                </label>

                <label className="manual-field">
                  <span>Method <b>*</b></span>
                  <select
                    value={manualPayment.method}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        method: e.target.value,
                      }))
                    }
                  >
                    <option value="Manual">Manual</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <label className="manual-field">
                  <span>Status <b>*</b></span>
                  <select
                    value={manualPayment.status}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        status: e.target.value,
                      }))
                    }
                  >
                    <option value="captured">Captured</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>

                <label className="manual-field manual-field-wide">
                  <span>Payment date & time (IST) <b>*</b></span>
                  <input
                    type="datetime-local"
                    value={manualPayment.time}
                    onChange={(e) =>
                      setManualPayment((v) => ({
                        ...v,
                        time: e.target.value,
                      }))
                    }
                  />
                </label>

                {isFailed(manualPayment.status) && (
                  <label className="manual-field manual-field-wide">
                    <span>Failed reason <b>*</b></span>
                    <input
                      value={manualPayment.failedReason}
                      onChange={(e) =>
                        setManualPayment((v) => ({
                          ...v,
                          failedReason: e.target.value,
                        }))
                      }
                      placeholder="Reason for payment failure"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="manual-modal-footer">
              <button
                className="manual-cancel"
                onClick={closeManualPayment}
                disabled={savingManualPayment}
              >
                Cancel
              </button>

              <button
                className="manual-save"
                onClick={saveManualPayment}
                disabled={savingManualPayment}
              >
                {savingManualPayment ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Add Payment
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STYLES                                                            */}
      {/* ---------------------------------------------------------------- */}

      <style jsx>{`

        .import-page {
          min-height: 100vh;
          padding: 28px 44px 70px;
          background: #050505;
          color: #f5f5f5;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        button,
        input {
          font-family: inherit;
        }

        button {
          cursor: pointer;
        }

        .top-bar {
          max-width: 1450px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .back-button {
          height: 36px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #8b8b93;
          font-size: 12px;
          font-weight: 500;
        }

        .back-button:hover {
          color: #ffffff;
          background: #111112;
        }

        .top-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .top-manual-button,
        .top-import-button {
          height: 38px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 700;
          transition:
            transform .16s ease,
            border-color .16s ease,
            background .16s ease,
            opacity .16s ease;
        }

        .top-manual-button {
          border: 1px solid #2b2b30;
          background: #111113;
          color: #f1f1f3;
        }

        .top-manual-button:hover:not(:disabled) {
          border-color: #48484f;
          background: #18181b;
          transform: translateY(-1px);
        }

        .top-import-button {
          height: 38px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #ff1744;
          border-radius: 7px;
          background: #ff1744;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
        }

        .top-import-button:hover:not(:disabled) {
          background: #e9143d;
        }

        .top-import-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .header,
        .upload-section,
        .detected-section,
        .progress-section,
        .preview-section,
        .import-action,
        .result-section {
          max-width: 1450px;
          margin-left: auto;
          margin-right: auto;
        }

        .header {
          margin-top: 35px;
          margin-bottom: 25px;
        }

        .eyebrow {
          color: #ff1744;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .header h1 {
          margin: 8px 0 0;
          color: #ffffff;
          font-size: 32px;
          line-height: 1.15;
          font-weight: 650;
          letter-spacing: -.6px;
        }

        .header p {
          max-width: 650px;
          margin: 8px 0 0;
          color: #8b8b93;
          font-size: 14px;
          line-height: 1.55;
        }

        .upload-section,
        .detected-section,
        .progress-section,
        .preview-section,
        .import-action,
        .result-section {
          border: 1px solid #202023;
          border-radius: 11px;
          background: #0c0c0d;
        }

        .upload-section {
          padding: 21px;
        }

        .section-heading h2,
        .preview-header h2 {
          margin: 0;
          color: #ffffff;
          font-size: 16px;
          font-weight: 600;
        }

        .section-heading p,
        .preview-header p {
          margin: 5px 0 0;
          color: #71717a;
          font-size: 12px;
        }

        .drop-zone {
          min-height: 265px;
          margin-top: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          border: 1px dashed #35353a;
          border-radius: 10px;
          background: #09090a;
          transition:
            border-color .15s,
            background .15s;
        }

        .drop-zone:hover,
        .drop-zone.dragging {
          border-color: #ff1744;
          background: rgba(255,23,68,.025);
        }

        .upload-icon {
          width: 54px;
          height: 54px;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: rgba(255,23,68,.08);
          color: #ff3159;
        }

        .drop-zone h3 {
          margin: 0;
          color: #e4e4e7;
          font-size: 15px;
          font-weight: 600;
        }

        .drop-zone p {
          margin: 6px 0 10px;
          color: #71717a;
          font-size: 12px;
        }

        .drop-zone > span {
          padding: 5px 8px;
          border: 1px solid #29292d;
          border-radius: 5px;
          color: #71717a;
          font-size: 10px;
        }

        .file-selected {
          min-height: 95px;
          margin-top: 18px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 13px;
          border: 1px solid #29292d;
          border-radius: 9px;
          background: #101011;
        }

        .file-icon {
          width: 43px;
          height: 43px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(57,217,138,.08);
          color: #39d98a;
        }

        .file-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .file-info strong {
          color: #e4e4e7;
          font-size: 13px;
          font-weight: 600;
        }

        .file-info span {
          color: #71717a;
          font-size: 11px;
        }

        .remove-file {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #29292d;
          border-radius: 7px;
          background: #0c0c0d;
          color: #71717a;
        }

        .remove-file:hover {
          color: #ff637b;
        }

        .detected-section {
          margin-top: 12px;
          padding: 15px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .detected-section strong {
          display: block;
          color: #e4e4e7;
          font-size: 12px;
          font-weight: 600;
        }

        .detected-section p {
          margin: 4px 0 0;
          color: #71717a;
          font-size: 10px;
        }

        .column-list {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 5px;
        }

        .column-list span {
          padding: 5px 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 1px solid #29292d;
          border-radius: 5px;
          background: #111112;
          color: #a1a1aa;
          font-size: 9px;
        }

        .column-list svg {
          color: #39d98a;
        }

        .progress-section {
          margin-top: 12px;
          padding: 19px 21px;
        }

        .progress-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .progress-label {
          color: #ff3159;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .8px;
        }

        .progress-top h2 {
          margin: 5px 0 0;
          color: #ffffff;
          font-size: 26px;
          line-height: 1;
          font-weight: 650;
        }

        .progress-count {
          color: #8b8b93;
          font-size: 11px;
        }

        .progress-track {
          height: 6px;
          margin-top: 17px;
          overflow: hidden;
          border-radius: 999px;
          background: #202023;
        }

        .progress-fill {
          height: 100%;
          border-radius: inherit;
          background: #ff1744;
          transition: width .2s ease;
        }

        .timeline {
          margin-top: 19px;
          display: grid;
          grid-template-columns:
            repeat(5, 1fr);
          gap: 8px;
        }

        .timeline-item {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #52525b;
          font-size: 10px;
        }

        .timeline-item.completed {
          color: #a1a1aa;
        }

        .timeline-item.active {
          color: #ffffff;
        }

        .timeline-dot {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #29292d;
          border-radius: 50%;
          background: #111112;
        }

        .timeline-item.completed
          .timeline-dot {
          border-color: rgba(57,217,138,.3);
          background: rgba(57,217,138,.08);
          color: #39d98a;
        }

        .timeline-item.active
          .timeline-dot {
          border-color: rgba(255,23,68,.4);
          color: #ff3159;
        }

        .timeline-dot span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #45454c;
        }

        .message {
          max-width: 1450px;
          margin: 12px auto;
          min-height: 44px;
          padding: 10px 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          border-radius: 8px;
          font-size: 12px;
        }

        .message.error {
          border: 1px solid rgba(255,23,68,.25);
          background: rgba(255,23,68,.06);
          color: #ff8d9e;
        }

        .message.success {
          border: 1px solid rgba(57,217,138,.2);
          background: rgba(57,217,138,.05);
          color: #39d98a;
        }

        .preview-section {
          margin-top: 16px;
          overflow: hidden;
        }

        .preview-header {
          padding: 20px 21px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #202023;
        }

        .preview-stats {
          display: flex;
          gap: 25px;
        }

        .preview-stats div {
          display: flex;
          flex-direction: column;
          gap: 5px;
          text-align: right;
        }

        .preview-stats span,
        .result-grid span {
          color: #71717a;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .5px;
        }

        .preview-stats strong {
          color: #e4e4e7;
          font-size: 14px;
          font-weight: 600;
        }

        .green {
          color: #39d98a !important;
        }

        .red {
          color: #ff637b !important;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1050px;
          border-collapse: collapse;
        }

        th {
          height: 48px;
          padding: 0 16px;
          background: #101011;
          color: #71717a;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .35px;
          text-align: left;
          white-space: nowrap;
        }

        td {
          height: 67px;
          padding: 0 16px;
          border-top: 1px solid #1e1e21;
          color: #cfcfd3;
          font-size: 12px;
          white-space: nowrap;
        }

        .customer-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .avatar {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(255,23,68,.08);
          color: #ff3159;
          font-size: 12px;
          font-weight: 650;
        }

        .customer-cell > div:last-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .customer-cell strong {
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
        }

        .customer-cell span {
          color: #71717a;
          font-size: 10px;
        }

        .amount {
          color: #ffffff;
          font-weight: 600;
        }

        .date {
          color: #8b8b93;
          font-size: 11px;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
        }

        .status.captured {
          color: #39d98a;
          background: rgba(57,217,138,.08);
        }

        .status.failed {
          color: #ff637b;
          background: rgba(255,99,123,.08);
        }

        .status.pending {
          color: #e6b84e;
          background: rgba(230,184,78,.08);
        }

        .preview-limit {
          padding: 12px 20px;
          border-top: 1px solid #202023;
          color: #71717a;
          font-size: 11px;
        }

        .preview-limit strong {
          color: #a1a1aa;
        }

        .import-action {
          margin-top: 16px;
          padding: 18px 21px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .import-action h3 {
          margin: 0;
          color: #e4e4e7;
          font-size: 14px;
          font-weight: 600;
        }

        .import-action p {
          max-width: 650px;
          margin: 5px 0 0;
          color: #71717a;
          font-size: 11px;
          line-height: 1.5;
        }

        .import-button,
        .primary-action,
        .secondary-action {
          height: 42px;
          padding: 0 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .import-button,
        .primary-action {
          border: 1px solid #ff1744;
          background: #ff1744;
          color: #ffffff;
        }

        .import-button:hover:not(:disabled),
        .primary-action:hover {
          background: #e9143d;
        }

        .import-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .result-section {
          margin-top: 16px;
          padding: 21px;
        }

        .result-heading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 19px;
          border-bottom: 1px solid #202023;
        }

        .result-check {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(57,217,138,.08);
          color: #39d98a;
        }

        .result-heading h2 {
          margin: 0;
          color: #ffffff;
          font-size: 16px;
          font-weight: 600;
        }

        .result-heading p {
          margin: 4px 0 0;
          color: #71717a;
          font-size: 11px;
        }

        .result-grid {
          display: grid;
          grid-template-columns:
            repeat(6, 1fr);
          gap: 1px;
          margin-top: 18px;
          overflow: hidden;
          border: 1px solid #202023;
          border-radius: 8px;
          background: #202023;
        }

        .result-grid > div {
          min-height: 83px;
          padding: 15px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 7px;
          background: #101011;
        }

        .result-grid strong {
          color: #ffffff;
          font-size: 20px;
          font-weight: 650;
        }

        .errors-list {
          margin-top: 18px;
          padding: 15px;
          border: 1px solid rgba(255,99,123,.15);
          border-radius: 8px;
          background: rgba(255,99,123,.03);
        }

        .errors-list h3 {
          margin: 0 0 10px;
          color: #ff637b;
          font-size: 12px;
        }

        .errors-list div {
          padding: 6px 0;
          display: flex;
          align-items: flex-start;
          gap: 7px;
          color: #a1a1aa;
          font-size: 11px;
        }

        .errors-list p {
          margin: 8px 0 0;
          color: #71717a;
          font-size: 10px;
        }

        .result-actions {
          margin-top: 18px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .secondary-action {
          border: 1px solid #29292d;
          background: #111112;
          color: #a1a1aa;
        }

        .secondary-action:hover {
          color: #ffffff;
          border-color: #44444a;
        }

        @media (max-width: 1100px) {

          .result-grid {
            grid-template-columns:
              repeat(3, 1fr);
          }

        }

        @media (max-width: 900px) {

          .import-page {
            padding: 25px 20px 50px;
          }

          .preview-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .preview-stats {
            width: 100%;
            justify-content: space-between;
          }

          .preview-stats div {
            text-align: left;
          }

          .detected-section {
            align-items: flex-start;
            flex-direction: column;
          }

          .column-list {
            justify-content: flex-start;
          }

          .timeline {
            grid-template-columns: 1fr;
            gap: 9px;
          }

        }

        @media (max-width: 650px) {

          .import-page {
            padding: 20px 15px 40px;
          }

          .top-bar {
            align-items: stretch;
          }

          .header {
            margin-top: 28px;
          }

          .header h1 {
            font-size: 27px;
          }

          .preview-stats {
            display: grid;
            grid-template-columns:
              repeat(2, 1fr);
            gap: 15px;
          }

          .import-action {
            align-items: stretch;
            flex-direction: column;
          }

          .import-button {
            width: 100%;
          }

          .result-grid {
            grid-template-columns: 1fr;
          }

          .result-actions {
            flex-direction: column;
          }

          .result-actions button {
            width: 100%;
          }

        }

        .required-error-section {
          max-width: 1450px;
          margin: 12px auto 0;
          padding: 16px 18px;
          border: 1px solid rgba(255,99,123,.28);
          border-radius: 11px;
          background: rgba(255,99,123,.055);
        }

        .required-error-section strong {
          color: #ff637b;
          font-size: 13px;
        }

        .required-error-section p {
          margin: 5px 0 9px;
          color: #a1a1aa;
          font-size: 12px;
        }

        .required-error-section > div {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .required-error-section span {
          padding: 5px 8px;
          border-radius: 5px;
          background: rgba(255,99,123,.09);
          color: #ff9bad;
          font-size: 10px;
        }

        .required-error-section small {
          display: block;
          margin-top: 9px;
          color: #71717a;
          font-size: 10px;
        }

        .column-list .required-column {
          border-color: rgba(57,217,138,.25);
          color: #39d98a;
        }

        .column-list .custom-column {
          border-color: rgba(255,23,68,.22);
          color: #ff7891;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .table-wrapper table {
          min-width: 1100px;
        }

        .incomplete-row {
          background: rgba(255, 99, 123, .025);
        }

        .preview-filter-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin: 0 0 12px;
          padding: 10px 12px;
          border: 1px solid #1e1e22;
          border-radius: 8px;
          background: #09090a;
        }

        .filter-label {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .filter-label span {
          color: #71717a;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .8px;
        }

        .filter-label strong {
          color: #d4d4d8;
          font-size: 11px;
        }

        .preview-filters {
          display: flex;
          gap: 6px;
        }

        .preview-filters button {
          height: 30px;
          padding: 0 10px;
          border: 1px solid #252529;
          border-radius: 6px;
          background: #0d0d0f;
          color: #a1a1aa;
          font-size: 10px;
          font-weight: 600;
        }

        .preview-filters button:hover {
          border-color: #3a3a40;
          color: #f4f4f5;
        }

        .preview-filters button.active {
          border-color: #ff1744;
          background: rgba(255, 23, 68, .09);
          color: #ff5a7a;
        }

        .preview-filters button.incomplete-filter.active {
          border-color: rgba(255, 99, 123, .55);
          background: rgba(255, 99, 123, .09);
          color: #ff8094;
        }

        .preview-filters button.ready-filter.active {
          border-color: rgba(57, 217, 138, .45);
          background: rgba(57, 217, 138, .08);
          color: #39d98a;
        }

        .preview-filters button:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .edit-incomplete-button,
        .save-incomplete-button,
        .cancel-incomplete-button {
          height: 30px;
          padding: 0 11px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
        }

        .edit-incomplete-button {
          border: 1px solid rgba(255, 23, 68, .55);
          background: rgba(255, 23, 68, .09);
          color: #ff5a7a;
        }

        .save-incomplete-button {
          border: 1px solid rgba(57, 217, 138, .5);
          background: rgba(57, 217, 138, .08);
          color: #39d98a;
        }

        .cancel-incomplete-button {
          border: 1px solid #303036;
          background: #111113;
          color: #a1a1aa;
        }

        .preview-value {
          min-height: 34px;
          display: flex;
          align-items: center;
          padding: 0 9px;
          border: 1px solid transparent;
          border-radius: 6px;
          color: #d4d4d8;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .missing-value {
          border-color: rgba(255, 99, 123, .25);
          background: rgba(255, 99, 123, .055);
          color: #ff7f93;
          font-style: italic;
        }

        .row-status-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .row-edit-button {
          height: 25px;
          padding: 0 8px;
          border: 1px solid #303036;
          border-radius: 5px;
          background: #111113;
          color: #d4d4d8;
          font-size: 9px;
          font-weight: 700;
        }

        .row-edit-button:hover {
          border-color: #ff1744;
          color: #ffffff;
        }

        .row-edit-button.save {
          border-color: rgba(57, 217, 138, .45);
          color: #39d98a;
        }

        .row-cancel-button {
          margin-top: 6px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #71717a;
          font-size: 9px;
        }

        .row-cancel-button:hover {
          color: #ff637b;
        }


        .editable-cell {
          min-width: 150px;
          padding: 6px !important;
        }

        .preview-input {
          width: 100%;
          min-width: 130px;
          height: 34px;
          padding: 0 9px;
          border: 1px solid #242428;
          border-radius: 6px;
          outline: none;
          background: #0b0b0c;
          color: #e4e4e7;
          font-size: 11px;
        }

        .preview-input:focus {
          border-color: #ff1744;
          box-shadow: 0 0 0 2px rgba(255, 23, 68, .08);
        }

        .missing-input {
          border-color: rgba(255, 99, 123, .45);
          background: rgba(255, 99, 123, .055);
        }

        .missing-input::placeholder {
          color: #ff7f93;
        }

        .row-status-cell {
          min-width: 150px;
          padding: 10px 12px !important;
          vertical-align: top;
        }

        .row-status-cell > span {
          display: inline-flex;
          padding: 4px 7px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 700;
        }

        .row-status-cell.complete > span {
          background: rgba(57, 217, 138, .08);
          color: #39d98a;
        }

        .row-status-cell.incomplete > span {
          background: rgba(255, 99, 123, .09);
          color: #ff637b;
        }

        .row-status-cell small {
          display: block;
          max-width: 180px;
          margin-top: 6px;
          color: #a1a1aa;
          font-size: 9px;
          line-height: 1.4;
        }

        .failure-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, .72);
          backdrop-filter: blur(4px);
        }

        .failure-modal {
          position: relative;
          width: min(680px, 100%);
          max-height: min(760px, 90vh);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 26px;
          border: 1px solid #2d2d33;
          border-radius: 14px;
          background: #111113;
          box-shadow: 0 24px 80px rgba(0, 0, 0, .55);
        }

        .failure-modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #a1a1aa;
          cursor: pointer;
        }

        .failure-modal-close:hover {
          background: #1d1d20;
          color: #fff;
        }

        .failure-modal-icon {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          margin-bottom: 14px;
          border-radius: 10px;
          background: rgba(255, 99, 123, .1);
          color: #ff637b;
        }

        .failure-modal-heading h3 {
          margin: 0;
          font-size: 19px;
          line-height: 1.3;
          color: #f4f4f5;
        }

        .failure-modal-heading p {
          margin: 6px 0 0;
          color: #a1a1aa;
          font-size: 14px;
        }

        .failure-modal-summary {
          display: flex;
          gap: 22px;
          margin: 18px 0;
          padding: 12px 14px;
          border: 1px solid #27272a;
          border-radius: 8px;
          background: #151517;
          color: #a1a1aa;
          font-size: 13px;
        }

        .failure-modal-summary strong {
          color: #f4f4f5;
        }

        .failure-modal-list {
          overflow-y: auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 4px;
        }

        .failure-modal-item {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 11px 12px;
          border: 1px solid #29292d;
          border-radius: 8px;
          background: #0d0d0f;
          color: #d4d4d8;
          font-size: 13px;
          line-height: 1.5;
        }

        .failure-modal-item svg {
          flex: 0 0 auto;
          margin-top: 2px;
          color: #ff637b;
        }

        .failure-modal-button {
          align-self: flex-end;
          margin-top: 18px;
          padding: 9px 18px;
          border: 0;
          border-radius: 7px;
          background: #f4f4f5;
          color: #111113;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .manual-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(0, 0, 0, .76);
          backdrop-filter: blur(8px);
        }

        .manual-modal {
          width: min(760px, 100%);
          max-height: min(88vh, 820px);
          overflow: auto;
          border: 1px solid #29292d;
          border-radius: 14px;
          background: #0d0d0f;
          box-shadow:
            0 30px 90px rgba(0, 0, 0, .55),
            0 0 0 1px rgba(255, 23, 68, .035);
        }

        .manual-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 22px 22px 18px;
          border-bottom: 1px solid #222226;
        }

        .manual-modal-eyebrow {
          display: block;
          margin-bottom: 6px;
          color: #ff1744;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .16em;
        }

        .manual-modal-header h2 {
          margin: 0;
          color: #f5f5f7;
          font-size: 20px;
          line-height: 1.2;
          font-weight: 750;
        }

        .manual-modal-header p {
          margin: 7px 0 0;
          color: #85858d;
          font-size: 11px;
          line-height: 1.5;
        }

        .manual-close {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          display: grid;
          place-items: center;
          border: 1px solid #2a2a2e;
          border-radius: 7px;
          background: #111113;
          color: #8f8f96;
        }

        .manual-close:hover:not(:disabled) {
          color: #fff;
          border-color: #44444b;
          background: #18181a;
        }

        .manual-form {
          padding: 20px 22px 22px;
        }

        .manual-section-label {
          margin-bottom: 10px;
          color: #696970;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .13em;
        }

        .manual-payment-label {
          margin-top: 24px;
        }

        .manual-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 13px;
        }

        .manual-field {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .manual-field-wide {
          grid-column: 1 / -1;
        }

        .manual-field span {
          color: #aaaab1;
          font-size: 10px;
          font-weight: 650;
        }

        .manual-field span b {
          color: #ff1744;
          font-weight: 800;
        }

        .manual-field input,
        .manual-field select {
          width: 100%;
          height: 40px;
          padding: 0 11px;
          border: 1px solid #29292e;
          border-radius: 7px;
          outline: none;
          background: #111113;
          color: #eeeeF0;
          font-size: 12px;
          transition:
            border-color .16s ease,
            box-shadow .16s ease,
            background .16s ease;
        }

        .manual-field input::placeholder {
          color: #55555c;
        }

        .manual-field input:focus,
        .manual-field select:focus {
          border-color: rgba(255, 23, 68, .65);
          background: #141416;
          box-shadow: 0 0 0 3px rgba(255, 23, 68, .08);
        }

        .manual-field select option {
          background: #111113;
          color: #f5f5f5;
        }

        .manual-message {
          margin: 16px 22px 0;
          padding: 10px 12px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.45;
        }

        .manual-error {
          border: 1px solid rgba(255, 23, 68, .25);
          background: rgba(255, 23, 68, .06);
          color: #ff849e;
        }

        .manual-success {
          border: 1px solid rgba(32, 211, 112, .22);
          background: rgba(32, 211, 112, .055);
          color: #67df9b;
        }

        .manual-modal-footer {
          padding: 15px 22px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid #222226;
          background: #0a0a0c;
        }

        .manual-cancel,
        .manual-save {
          height: 38px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 750;
        }

        .manual-cancel {
          border: 1px solid #2a2a2e;
          background: #111113;
          color: #aaaab1;
        }

        .manual-cancel:hover:not(:disabled) {
          color: #fff;
          background: #18181a;
          border-color: #424249;
        }

        .manual-save {
          border: 1px solid #ff1744;
          background: #ff1744;
          color: #fff;
          box-shadow: 0 7px 22px rgba(255, 23, 68, .13);
        }

        .manual-save:hover:not(:disabled) {
          background: #ff3159;
          border-color: #ff3159;
          transform: translateY(-1px);
        }

        .manual-cancel:disabled,
        .manual-save:disabled,
        .top-manual-button:disabled,
        .top-import-button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        @media (max-width: 700px) {
          .top-actions {
            gap: 6px;
          }

          .top-manual-button,
          .top-import-button {
            padding: 0 10px;
          }

          .manual-modal-backdrop {
            padding: 10px;
          }

          .manual-grid {
            grid-template-columns: 1fr;
          }

          .manual-field-wide {
            grid-column: auto;
          }
        }

        .import-diagnostics {
          max-width: 1450px;
          margin: 12px auto 0;
          padding: 14px 16px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          border: 1px solid rgba(255, 174, 0, .22);
          border-radius: 10px;
          background: rgba(255, 174, 0, .055);
        }

        .diagnostic-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          background: rgba(255, 174, 0, .09);
          color: #ffbd45;
        }

        .diagnostic-copy {
          min-width: 0;
          flex: 1;
        }

        .diagnostic-copy strong {
          display: block;
          color: #f1f1f3;
          font-size: 12px;
          font-weight: 700;
        }

        .diagnostic-copy p {
          margin: 4px 0 0;
          color: #a3a3aa;
          font-size: 11px;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }

        .diagnostic-row {
          flex: 0 0 auto;
          padding: 6px 9px;
          border: 1px solid #35353a;
          border-radius: 6px;
          color: #c7c7cc;
          background: #111112;
          font-size: 10px;
          font-weight: 700;
        }

        .errors-intro {
          margin: 5px 0 10px;
          color: #77777f;
          font-size: 10px;
          line-height: 1.5;
        }

      `}</style>

    </main>
  );
}