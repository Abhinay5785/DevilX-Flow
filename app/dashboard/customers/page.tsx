"use client";

import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: string;
  name: string;
  age: number | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  course: string | null;
  batch: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type Payment = {
  id: string;
  customer_id: string;
  amount: number;
  status: string;
  payment_time: string;
  failed_reason: string | null;
  created_at: string;
  course: string | null;
  batch: string | null;
};

type CustomerWithPayments = Customer & {
  payments: Payment[];
};

type ManualPaymentForm = {
  name: string;
  age: string;
  city: string;
  phone: string;
  email: string;
  course: string;
  batch: string;
  amount: string;
  status: string;
  payment_time: string;
  failed_reason: string;
  payment_id: string;
  method: string;
};

type CustomerForm = {
  name: string;
  age: string;
  city: string;
  phone: string;
  email: string;
  course: string;
  batch: string;
  custom_fields: Record<string, string>;
  amount: string;
  status: string;
  payment_time: string;
  failed_reason: string;
};

const ITEMS_PER_PAGE = 25;

const supabase = createClient();

function normalizeName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCourse(value: string | null | undefined) {
  const course = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (course.toLowerCase() === "consultation") {
    return "Consultation";
  }

  return course;
}

function getDisplayBatch(
  course: string | null | undefined,
  batch: string | null | undefined,
) {
  return normalizeCourse(course).toLowerCase() === "consultation"
    ? "No Batch"
    : String(batch ?? "").trim() || "Not recorded";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

const INDIA_TIME_ZONE = "Asia/Kolkata";

/**
 * Display a UTC/ISO timestamp in Indian Standard Time.
 *
 * Supabase timestamptz values should be treated as an absolute
 * point in time. The UI explicitly converts that instant to IST
 * instead of relying on the browser/server timezone.
 */
function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-IN", {
    timeZone: INDIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Convert a datetime-local value entered by the user as IST
 * into an ISO UTC timestamp suitable for a Supabase timestamptz.
 *
 * Example:
 *   2026-08-31T22:49
 * becomes:
 *   2026-08-31T17:19:00.000Z
 *
 * We intentionally do NOT use new Date(value).toISOString()
 * here because datetime-local has no timezone information and
 * JavaScript would interpret it using the browser's local timezone.
 */
function istDateTimeLocalToUtc(value: string): string | null {
  if (!value) return null;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6] || 0);

  if (
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

  // IST is UTC+05:30, so subtract 330 minutes to get UTC.
  const utcMillis = Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes - 330,
    seconds,
  );

  const date = new Date(utcMillis);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

/**
 * Convert a stored UTC/ISO timestamp into the value required by
 * <input type="datetime-local"> while displaying it as IST.
 */
function utcToIstDateTimeLocal(
  value: string | null | undefined,
): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values: Record<string, string> = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function isCaptured(status: string) {
  const value = status.toLowerCase();

  return (
    value === "captured" ||
    value === "success" ||
    value === "successful" ||
    value === "paid"
  );
}

function isFailed(status: string) {
  const value = status.toLowerCase();

  return (
    value === "failed" ||
    value === "failure"
  );
}

function getDisplayStatus(status: string) {
  if (isCaptured(status)) {
    return "Captured";
  }

  if (isFailed(status)) {
    return "Failed";
  }

  return status || "Pending";
}

function getStatusClass(status: string) {
  if (isCaptured(status)) {
    return "status-success";
  }

  if (isFailed(status)) {
    return "status-failed";
  }

  return "status-pending";
}

function getLatestPayment(
  customer: CustomerWithPayments,
) {
  return [...(customer.payments || [])].sort(
    (a, b) =>
      new Date(b.payment_time).getTime() -
      new Date(a.payment_time).getTime(),
  )[0];
}

function getCurrentIstDateTimeLocal() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function emptyManualPaymentForm(): ManualPaymentForm {
  return {
    name: "",
    age: "",
    city: "",
    phone: "",
    email: "",
    course: "",
    batch: "",
    amount: "",
    status: "captured",
    payment_time: getCurrentIstDateTimeLocal(),
    failed_reason: "",
    payment_id: "",
    method: "",
  };
}

function emptyForm(): CustomerForm {
  return {
    name: "",
    age: "",
    city: "",
    phone: "",
    email: "",
    course: "",
    batch: "",
    custom_fields: {},
    amount: "",
    status: "captured",
    payment_time: "",
    failed_reason: "",
  };
}

export default function CustomersPage() {
  const router = useRouter();

  const [customers, setCustomers] =
    useState<CustomerWithPayments[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [courseFilter, setCourseFilter] =
    useState("All");

  const [sortBy, setSortBy] =
    useState("latest");

  const [showFilters, setShowFilters] =
    useState(false);

  const [currentPage, setCurrentPage] =
    useState(1);

  const [
    showCustomerModal,
    setShowCustomerModal,
  ] = useState(false);

  const [
    editingCustomer,
    setEditingCustomer,
  ] =
    useState<CustomerWithPayments | null>(
      null,
    );

  const [
    selectedCustomer,
    setSelectedCustomer,
  ] =
    useState<CustomerWithPayments | null>(
      null,
    );

  const [form, setForm] =
    useState<CustomerForm>(emptyForm());

  const [showManualPaymentModal, setShowManualPaymentModal] =
    useState(false);

  const [manualPaymentForm, setManualPaymentForm] =
    useState<ManualPaymentForm>(emptyManualPaymentForm());

  const [manualPaymentSaving, setManualPaymentSaving] =
    useState(false);

  const [manualPaymentError, setManualPaymentError] =
    useState("");

  /*
   * LOAD CUSTOMERS
   */

  async function loadCustomers() {
    setLoading(true);
    setError("");

    const {
      data,
      error: fetchError,
    } = await supabase
      .from("customers")
      .select(
        `
          id,
          name,
          age,
          city,
          phone,
          email,
          course,
          batch,
          custom_fields,
          created_at,
          updated_at,
          payments (
            id,
            customer_id,
            amount,
            status,
            payment_time,
            failed_reason,
            created_at,
            course,
            batch
          )
        `,
      )
      .order("created_at", {
        ascending: false,
      });

    if (fetchError) {
      console.error(
        "Customer loading error:",
        fetchError,
      );

      setError(
        `Could not load customers: ${fetchError.message}`,
      );

      setCustomers([]);
    } else {
      setCustomers(
        (data || []) as CustomerWithPayments[],
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    const refreshCustomers = async () => {
      if (!mounted) return;

      await loadCustomers();
    };

    // Initial load
    refreshCustomers();

    // Listen for customer table changes
    const customersChannel = supabase
      .channel("customers-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
        },
        () => {
          refreshCustomers();
        },
      )
      .subscribe();

    // Listen for payment table changes
    const paymentsChannel = supabase
      .channel("payments-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        () => {
          refreshCustomers();
        },
      )
      .subscribe();

    return () => {
      mounted = false;

      supabase.removeChannel(customersChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, []);

  /*
   * PAYMENTS
   */

  const allPayments = useMemo(() => {
    return customers.flatMap(
      (customer) =>
        customer.payments || [],
    );
  }, [customers]);

  const capturedPayments =
    useMemo(() => {
      return allPayments.filter(
        (payment) =>
          isCaptured(payment.status),
      ).length;
    }, [allPayments]);

  const failedPayments = useMemo(() => {
    return allPayments.filter(
      (payment) =>
        isFailed(payment.status),
    ).length;
  }, [allPayments]);

  /*
   * PAYMENT RANKING
   *
   * Customer payment count and total paid use only successful/captured
   * payments. Failed and pending records are not treated as money paid.
   */
  const paymentRanking = useMemo(() => {
    return customers
      .map((customer) => {
        const captured = (customer.payments || []).filter((payment) =>
          isCaptured(payment.status),
        );

        return {
          customer,
          paymentCount: captured.length,
          totalPaid: captured.reduce(
            (total, payment) => total + Number(payment.amount || 0),
            0,
          ),
        };
      })
      .sort((a, b) =>
        b.totalPaid - a.totalPaid ||
        b.paymentCount - a.paymentCount ||
        a.customer.name.localeCompare(b.customer.name),
      );
  }, [customers]);

  /*
   * COURSES
   */

  const courses = useMemo(() => {
    const values = new Set<string>();

    customers.forEach((customer) => {
      const payments = customer.payments || [];

      payments.forEach((payment) => {
        if (payment.course?.trim()) {
          values.add(normalizeCourse(payment.course));
        }
      });

      // Legacy fallback: if payment-level course data has not been
      // recorded yet, keep the customer-level course available.
      if (payments.every((payment) => !payment.course?.trim()) && customer.course?.trim()) {
        values.add(normalizeCourse(customer.course));
      }
    });

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  /*
   * FILTER
   */

  const filteredCustomers =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      const filtered =
        customers.filter(
          (customer) => {
            const payments =
              customer.payments || [];

            const paymentCourses = payments
              .map((payment) => normalizeCourse(payment.course))
              .filter(Boolean);

            const paymentBatches = payments
              .map((payment) => payment.batch)
              .filter(Boolean);

            const searchable = [
              customer.name,
              customer.phone,
              customer.email,
              customer.city,
              customer.course,
              customer.batch,
              ...paymentCourses,
              ...paymentBatches,
              ...Object.values(customer.custom_fields || {}),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            const matchesSearch =
              !query ||
              searchable.includes(
                query,
              );

            const matchesCourse =
              courseFilter === "All" ||
              payments.some((payment) => normalizeCourse(payment.course) === courseFilter) ||
              (payments.every((payment) => !payment.course?.trim()) &&
                normalizeCourse(customer.course) === courseFilter);

            const matchesStatus =
              statusFilter === "All" ||
              payments.some(
                (payment) => {
                  if (
                    statusFilter ===
                    "Captured"
                  ) {
                    return isCaptured(
                      payment.status,
                    );
                  }

                  if (
                    statusFilter ===
                    "Failed"
                  ) {
                    return isFailed(
                      payment.status,
                    );
                  }

                  if (
                    statusFilter ===
                    "Pending"
                  ) {
                    return (
                      !isCaptured(
                        payment.status,
                      ) &&
                      !isFailed(
                        payment.status,
                      )
                    );
                  }

                  return true;
                },
              );

            return (
              matchesSearch &&
              matchesCourse &&
              matchesStatus
            );
          },
        );

      /*
       * SORTING
       */

      return [...filtered].sort(
        (a, b) => {
          if (
            sortBy === "latest"
          ) {
            const aDate =
              getLatestPayment(a)
                ?.payment_time ||
              a.created_at;

            const bDate =
              getLatestPayment(b)
                ?.payment_time ||
              b.created_at;

            return (
              new Date(
                bDate,
              ).getTime() -
              new Date(
                aDate,
              ).getTime()
            );
          }

          if (
            sortBy === "oldest"
          ) {
            const aDate =
              getLatestPayment(a)
                ?.payment_time ||
              a.created_at;

            const bDate =
              getLatestPayment(b)
                ?.payment_time ||
              b.created_at;

            return (
              new Date(
                aDate,
              ).getTime() -
              new Date(
                bDate,
              ).getTime()
            );
          }

          if (
            sortBy === "az"
          ) {
            return a.name.localeCompare(
              b.name,
            );
          }

          if (
            sortBy === "za"
          ) {
            return b.name.localeCompare(
              a.name,
            );
          }

          if (sortBy === "most_payments") {
            const aCount = (a.payments || []).filter((payment) =>
              isCaptured(payment.status),
            ).length;
            const bCount = (b.payments || []).filter((payment) =>
              isCaptured(payment.status),
            ).length;

            return bCount - aCount || a.name.localeCompare(b.name);
          }

          if (sortBy === "fewest_payments") {
            const aCount = (a.payments || []).filter((payment) =>
              isCaptured(payment.status),
            ).length;
            const bCount = (b.payments || []).filter((payment) =>
              isCaptured(payment.status),
            ).length;

            return aCount - bCount || a.name.localeCompare(b.name);
          }

          if (sortBy === "highest_total_paid") {
            const aTotal = (a.payments || []).reduce(
              (total, payment) =>
                isCaptured(payment.status)
                  ? total + Number(payment.amount || 0)
                  : total,
              0,
            );
            const bTotal = (b.payments || []).reduce(
              (total, payment) =>
                isCaptured(payment.status)
                  ? total + Number(payment.amount || 0)
                  : total,
              0,
            );

            return bTotal - aTotal || a.name.localeCompare(b.name);
          }

          if (sortBy === "lowest_total_paid") {
            const aTotal = (a.payments || []).reduce(
              (total, payment) =>
                isCaptured(payment.status)
                  ? total + Number(payment.amount || 0)
                  : total,
              0,
            );
            const bTotal = (b.payments || []).reduce(
              (total, payment) =>
                isCaptured(payment.status)
                  ? total + Number(payment.amount || 0)
                  : total,
              0,
            );

            return aTotal - bTotal || a.name.localeCompare(b.name);
          }

          return 0;
        },
      );
    }, [
      customers,
      search,
      statusFilter,
      courseFilter,
      sortBy,
    ]);

  /*
   * PAGINATION
   */

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredCustomers.length /
        ITEMS_PER_PAGE,
    ),
  );

  const paginatedCustomers =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        ITEMS_PER_PAGE;

      return filteredCustomers.slice(
        start,
        start + ITEMS_PER_PAGE,
      );
    }, [
      filteredCustomers,
      currentPage,
    ]);

  useEffect(() => {
    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(totalPages);
    }
  }, [
    currentPage,
    totalPages,
  ]);

  /*
   * ADD CUSTOMER
   */

  function openAddCustomer() {
    setEditingCustomer(null);
    setForm(emptyForm());
    setError("");
    setShowCustomerModal(true);
  }

  /*
   * EDIT CUSTOMER
   */

  function openEditCustomer(
    customer: CustomerWithPayments,
  ) {
    const latest =
      getLatestPayment(customer);

    setEditingCustomer(customer);

    setForm({
      name: customer.name || "",
      age:
        customer.age === null
          ? ""
          : String(customer.age),
      city: customer.city || "",
      phone: customer.phone || "",
      email: customer.email || "",
      // IMPORTANT: course/batch here are CUSTOMER profile fields.
      // Never take them from the latest payment because a customer can
      // have historical payments belonging to different courses/batches.
      course: customer.course || "",
      batch: customer.batch || "",
      custom_fields: Object.fromEntries(
        Object.entries(customer.custom_fields || {}).map(([key, value]) => [key, String(value ?? "")]),
      ),
      amount:
        latest?.amount !== undefined
          ? String(latest.amount)
          : "",
      status:
        latest?.status || "captured",
      payment_time:
        utcToIstDateTimeLocal(
          latest?.payment_time,
        ),
      failed_reason:
        latest?.failed_reason || "",
    });

    setError("");
    setShowCustomerModal(true);
  }

  function updateForm(
    key: keyof CustomerForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  /*
   * SAVE CUSTOMER
   */

  async function saveCustomer() {
    if (!form.name.trim()) {
      setError(
        "Customer name is required.",
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const normalizedFormCourse = normalizeCourse(form.course);
      const normalizedFormBatch =
        normalizedFormCourse.toLowerCase() === "consultation"
          ? ""
          : form.batch.trim();

      const customerPayload = {
        name: form.name.trim(),
        age: form.age
          ? Number(form.age)
          : null,
        city:
          form.city.trim() || null,
        phone:
          form.phone.trim() || null,
        email:
          form.email.trim() || null,
        course:
          normalizedFormCourse || null,
        batch:
          normalizedFormBatch || null,
        custom_fields:
          Object.fromEntries(
            (Object.entries(form.custom_fields) as Array<[string, string]>)
              .map(([key, value]) => [key.trim(), value.trim()])
              .filter(([key, value]) => Boolean(key && value)),
          ),
        updated_at:
          new Date().toISOString(),
      };

      /*
       * EDIT
       */

      if (editingCustomer) {
        const {
          error: customerError,
        } = await supabase
          .from("customers")
          .update(customerPayload)
          .eq(
            "id",
            editingCustomer.id,
          );

        if (customerError) {
          throw customerError;
        }

        const latest =
          getLatestPayment(
            editingCustomer,
          );

        if (latest) {
          const {
            error: paymentError,
          } = await supabase
            .from("payments")
            .update({
              amount:
                Number(form.amount) ||
                0,
              status:
                form.status ||
                "captured",
              payment_time:
                form.payment_time
                  ? istDateTimeLocalToUtc(
                      form.payment_time,
                    ) || latest.payment_time
                  : latest.payment_time,
              failed_reason:
                form.failed_reason.trim() ||
                null,
              // DO NOT update payment.course or payment.batch here.
              // Payment course/batch are historical transaction data and
              // must remain exactly as recorded for that payment.
            })
            .eq(
              "id",
              latest.id,
            );

          if (paymentError) {
            throw paymentError;
          }
        }
      }

      /*
       * ADD
       */

      else {
        const {
          data: newCustomer,
          error: customerError,
        } = await supabase
          .from("customers")
          .insert(
            customerPayload,
          )
          .select()
          .single();

        if (customerError) {
          throw customerError;
        }

        const {
          error: paymentError,
        } = await supabase
          .from("payments")
          .insert({
            customer_id:
              newCustomer.id,
            amount:
              Number(form.amount) ||
              0,
            status:
              form.status ||
              "captured",
            payment_time:
              form.payment_time
                ? istDateTimeLocalToUtc(
                    form.payment_time,
                  ) || new Date().toISOString()
                : new Date().toISOString(),
            failed_reason:
              form.failed_reason.trim() ||
              null,
            course: normalizedFormCourse || null,
            batch: normalizedFormBatch || null,
          });

        if (paymentError) {
          throw paymentError;
        }
      }

      setShowCustomerModal(false);
      setEditingCustomer(null);
      setForm(emptyForm());

      await loadCustomers();
    } catch (saveError) {
      console.error(
        "Save customer error:",
        saveError,
      );

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save customer.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * MANUAL CUSTOMER + PAYMENT
   *
   * This flow intentionally collects the customer information manually.
   * It creates a new customer first and then creates the payment linked to
   * that customer. The normal Add Customer flow remains unchanged.
   */

  function openManualPayment() {
    setManualPaymentForm(emptyManualPaymentForm());
    setManualPaymentError("");
    setShowManualPaymentModal(true);
  }

  function updateManualPaymentForm(
    key: keyof ManualPaymentForm,
    value: string,
  ) {
    setManualPaymentForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function saveManualPayment() {
    if (!manualPaymentForm.name.trim()) {
      setManualPaymentError("Customer name is required.");
      return;
    }

    const amount = Number(manualPaymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualPaymentError("Enter a valid payment amount greater than 0.");
      return;
    }

    const normalizedCourse = normalizeCourse(manualPaymentForm.course);
    if (!normalizedCourse) {
      setManualPaymentError("Course is required.");
      return;
    }

    const paymentTime = manualPaymentForm.payment_time
      ? istDateTimeLocalToUtc(manualPaymentForm.payment_time)
      : new Date().toISOString();

    if (!paymentTime) {
      setManualPaymentError("Please enter a valid payment date and time.");
      return;
    }

    if (manualPaymentForm.status === "failed" && !manualPaymentForm.failed_reason.trim()) {
      setManualPaymentError("Please enter the failed reason for a failed payment.");
      return;
    }

    const normalizedBatch =
      normalizedCourse.toLowerCase() === "consultation"
        ? ""
        : manualPaymentForm.batch.trim();

    setManualPaymentSaving(true);
    setManualPaymentError("");

    try {
      const customerPayload = {
        name: manualPaymentForm.name.trim(),
        age: manualPaymentForm.age ? Number(manualPaymentForm.age) : null,
        city: manualPaymentForm.city.trim() || null,
        phone: manualPaymentForm.phone.trim() || null,
        email: manualPaymentForm.email.trim() || null,
        course: normalizedCourse || null,
        batch: normalizedBatch || null,
        custom_fields: {},
        updated_at: new Date().toISOString(),
      };

      const { data: newCustomer, error: customerError } = await supabase
        .from("customers")
        .insert(customerPayload)
        .select("id")
        .single();

      if (customerError) {
        throw customerError;
      }

      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          customer_id: newCustomer.id,
          payment_id: manualPaymentForm.payment_id.trim() || null,
          amount,
          status: manualPaymentForm.status || "captured",
          method: manualPaymentForm.method.trim() || null,
          payment_time: paymentTime,
          failed_reason: manualPaymentForm.failed_reason.trim() || null,
          course: normalizedCourse,
          batch: normalizedBatch || null,
        });

      if (paymentError) {
        throw paymentError;
      }

      setShowManualPaymentModal(false);
      setManualPaymentForm(emptyManualPaymentForm());
      await loadCustomers();
    } catch (saveError) {
      console.error("Manual customer/payment error:", saveError);
      setManualPaymentError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to add customer and payment.",
      );
    } finally {
      setManualPaymentSaving(false);
    }
  }

  /*
   * DELETE
   */

  async function deleteCustomer(
    customer: CustomerWithPayments,
  ) {
    const confirmed =
      window.confirm(
        `Delete ${customer.name} and all payment records?`,
      );

    if (!confirmed) return;

    setError("");

    const {
      error: deleteError,
    } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id);

    if (deleteError) {
      setError(
        `Could not delete customer: ${deleteError.message}`,
      );
      return;
    }

    if (
      selectedCustomer?.id ===
      customer.id
    ) {
      setSelectedCustomer(null);
    }

    await loadCustomers();
  }

  /*
   * PAGE NUMBERS
   */

  function getPageNumbers() {
    const pages: number[] = [];

    let start = Math.max(
      1,
      currentPage - 2,
    );

    const end = Math.min(
      totalPages,
      start + 4,
    );

    if (end - start < 4) {
      start = Math.max(
        1,
        end - 4,
      );
    }

    for (
      let page = start;
      page <= end;
      page++
    ) {
      pages.push(page);
    }

    return pages;
  }

  return (
    <main className="customers-page">

      {/* HEADER */}

      <header className="page-header">

        <div className="header-title-row">
          <button
            type="button"
            className="back-button"
            onClick={() => router.push("/dashboard")}
            aria-label="Back to dashboard"
            title="Back to Dashboard"
          >
            <ChevronLeft size={16} />
            <span>Dashboard</span>
          </button>

          <div className="header-copy">
          <span className="eyebrow">
            DEVILX FLOW
          </span>

          <h1>
            Customers
          </h1>

          <p>
            Manage your customers and
            payment records.
          </p>
          </div>
        </div>


        <div className="header-actions">

          {/* SEPARATE IMPORT PAGE */}

          <button
            className="secondary-button"
            onClick={() =>
              router.push(
                "/dashboard/customers/import",
              )
            }
          >
            <UploadIcon />

            Import Excel
          </button>


          <button
            className="secondary-button manual-payment-button"
            onClick={openManualPayment}
          >
            <Plus size={18} />
            Add Payment
          </button>

          <button
            className="primary-button"
            onClick={
              openAddCustomer
            }
          >
            <Plus size={18} />

            Add Customer
          </button>

        </div>

      </header>


      {/* ERROR */}

      {error && (
        <div className="page-error">

          <XCircle size={17} />

          <span>
            {error}
          </span>

          <button
            onClick={() =>
              setError("")
            }
          >
            <X size={16} />
          </button>

        </div>
      )}


      {/* STATS */}

      <section className="stats-grid">

        <div className="stat-card">

          <div className="stat-top">

            <span>
              CUSTOMERS
            </span>

            <div className="stat-icon">
              <Users size={18} />
            </div>

          </div>

          <strong>
            {customers.length.toLocaleString()}
          </strong>

          <p>
            Total customers
          </p>

        </div>


        <div className="stat-card">

          <div className="stat-top">

            <span>
              PAYMENTS
            </span>

            <div className="stat-icon">
              <FileSpreadsheet
                size={18}
              />
            </div>

          </div>

          <strong>
            {allPayments.length.toLocaleString()}
          </strong>

          <p>
            Total payment records
          </p>

        </div>


        <div className="stat-card">

          <div className="stat-top">

            <span>
              CAPTURED
            </span>

            <div className="stat-icon success">
              <CheckCircle2
                size={18}
              />
            </div>

          </div>

          <strong>
            {capturedPayments.toLocaleString()}
          </strong>

          <p>
            Successful payments
          </p>

        </div>


        <div className="stat-card">

          <div className="stat-top">

            <span>
              FAILED
            </span>

            <div className="stat-icon failed">
              <XCircle size={18} />
            </div>

          </div>

          <strong>
            {failedPayments.toLocaleString()}
          </strong>

          <p>
            Failed payments
          </p>

        </div>

      </section>


      {/* CUSTOMER TABLE */}

      <section className="customers-section">

        <div className="table-toolbar">

          <div className="table-heading">

            <h2>
              All Customers
            </h2>

            <p>
              {filteredCustomers.length.toLocaleString()}{" "}
              customers · successful payments only for payment ranking
            </p>

            {paymentRanking.length > 0 && (
              <div className="payment-ranking-summary">
                <span>Top payer</span>
                <strong>{paymentRanking[0].customer.name}</strong>
                <span>{formatCurrency(paymentRanking[0].totalPaid)}</span>
                <span>·</span>
                <span>{paymentRanking[0].paymentCount} payments</span>
              </div>
            )}

          </div>


          <div className="toolbar-actions">

            <div className="search-box">

              <Search size={17} />

              <input
                value={search}
                onChange={(event) => {
                  setSearch(
                    event.target.value,
                  );
                  setCurrentPage(1);
                }}
                placeholder="Search customers..."
              />

              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setCurrentPage(1);
                  }}
                >
                  <X size={15} />
                </button>
              )}

            </div>


            <button
              className={
                showFilters
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() =>
                setShowFilters(
                  (value) => !value,
                )
              }
            >
              <Filter size={16} />

              Filters

              <ChevronDown
                size={14}
              />
            </button>

          </div>

        </div>


        {/* FILTER + SORT */}

        {showFilters && (
          <div className="filters">

            <div className="filter-field">

              <label>
                Payment status
              </label>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(
                    event.target.value,
                  );
                  setCurrentPage(1);
                }}
              >

                <option value="All">
                  All payments
                </option>

                <option value="Captured">
                  Captured
                </option>

                <option value="Failed">
                  Failed
                </option>

                <option value="Pending">
                  Pending
                </option>

              </select>

            </div>


            <div className="filter-field">

              <label>
                Course
              </label>

              <select
                value={courseFilter}
                onChange={(event) => {
                  setCourseFilter(
                    event.target.value,
                  );
                  setCurrentPage(1);
                }}
              >

                <option value="All">
                  All courses
                </option>

                {courses.map(
                  (course) => (
                    <option
                      key={course}
                      value={course}
                    >
                      {course}
                    </option>
                  ),
                )}

              </select>

            </div>


            <div className="filter-field">

              <label>
                Sort customers
              </label>

              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(
                    event.target.value,
                  );
                  setCurrentPage(1);
                }}
              >

                <option value="latest">
                  Latest → Oldest
                </option>

                <option value="oldest">
                  Oldest → Latest
                </option>

                <option value="az">
                  A → Z
                </option>

                <option value="za">
                  Z → A
                </option>

                <option value="most_payments">
                  Most payments
                </option>

                <option value="fewest_payments">
                  Fewest payments
                </option>

                <option value="highest_total_paid">
                  Highest total paid
                </option>

                <option value="lowest_total_paid">
                  Lowest total paid
                </option>

              </select>

            </div>


            <button
              className="reset-button"
              onClick={() => {
                setStatusFilter("All");
                setCourseFilter("All");
                setSortBy("latest");
                setCurrentPage(1);
              }}
            >
              Reset
            </button>

          </div>
        )}


        {/* TABLE */}

        <div className="table-scroll">

          <table>

            <thead>

              <tr>

                <th>
                  CUSTOMER
                </th>

                <th>
                  AGE
                </th>

                <th>
                  CITY
                </th>

                <th>
                  PHONE
                </th>

                <th>
                  EMAIL
                </th>

                <th>
                  COURSE
                </th>

                <th>
                  BATCH
                </th>

                <th>
                  PAYMENTS
                </th>

                <th>
                  TOTAL PAID
                </th>

                <th>
                  STATUS
                </th>

                <th>
                  LAST PAYMENT
                </th>

                <th>
                  ACTIONS
                </th>

              </tr>

            </thead>


            <tbody>

              {loading ? (
                <tr>

                  <td
                    colSpan={12}
                    className="loading"
                  >
                    Loading customers...
                  </td>

                </tr>
              ) : paginatedCustomers.length ===
                0 ? (
                <tr>

                  <td
                    colSpan={12}
                    className="empty"
                  >

                    <div className="empty-icon">
                      <Users size={26} />
                    </div>

                    <strong>
                      No customers found
                    </strong>

                    <span>
                      Add a customer or
                      import payment
                      records.
                    </span>

                  </td>

                </tr>
              ) : (
                paginatedCustomers.map(
                  (customer) => {
                    const payments =
                      customer.payments ||
                      [];

                    // Payment count and total paid represent only successful/captured payments.
                    // Failed and pending records are intentionally excluded.
                    const capturedCustomerPayments = payments.filter((payment) =>
                      isCaptured(payment.status),
                    );

                    const paymentCount = capturedCustomerPayments.length;

                    const totalPaid = capturedCustomerPayments.reduce(
                      (total, payment) =>
                        total + Number(payment.amount || 0),
                      0,
                    );

                    const latest =
                      getLatestPayment(
                        customer,
                      );

                    return (
                      <tr
                        key={customer.id}
                        onClick={() =>
                          setSelectedCustomer(
                            customer,
                          )
                        }
                      >

                        <td>

                          <div className="customer">

                            <div className="avatar">
                              {customer.name
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div>

                              <strong>
                                {
                                  customer.name
                                }
                              </strong>

                              <span>
                                Customer
                              </span>

                            </div>

                          </div>

                        </td>


                        <td>
                          {customer.age ??
                            "—"}
                        </td>


                        <td>
                          {customer.city ||
                            "—"}
                        </td>


                        <td>
                          {customer.phone ||
                            "—"}
                        </td>


                        <td>
                          {customer.email ||
                            "—"}
                        </td>


                        <td>
                          {Array.from(
                            new Set(
                              payments
                                .map((payment) => normalizeCourse(payment.course))
                                .filter(Boolean),
                            ),
                          ).length > 0
                            ? Array.from(
                                new Set(
                                  payments
                                    .map((payment) => normalizeCourse(payment.course))
                                    .filter(Boolean),
                                ),
                              ).join(", ")
                            : normalizeCourse(customer.course) || "—"}
                        </td>

                        <td>
                          {Array.from(
                            new Set(
                              payments
                                .map((payment) => getDisplayBatch(payment.course, payment.batch))
                                .filter(Boolean),
                            ),
                          ).length > 0
                            ? Array.from(
                                new Set(
                                  payments
                                    .map((payment) => getDisplayBatch(payment.course, payment.batch))
                                    .filter(Boolean),
                                ),
                              ).join(", ")
                            : customer.batch || "—"}
                        </td>


                        <td>

                          <span className="payment-number">
                            {
                              paymentCount
                            }
                          </span>

                        </td>


                        <td>

                          <strong className="amount">
                            {formatCurrency(
                              totalPaid,
                            )}
                          </strong>

                        </td>


                        <td>

                          {latest ? (
                            <span
                              className={`status ${getStatusClass(
                                latest.status,
                              )}`}
                            >

                              {isCaptured(
                                latest.status,
                              ) ? (
                                <Check
                                  size={13}
                                />
                              ) : isFailed(
                                  latest.status,
                                ) ? (
                                <XCircle
                                  size={13}
                                />
                              ) : (
                                <Clock3
                                  size={13}
                                />
                              )}

                              {
                                getDisplayStatus(
                                  latest.status,
                                )
                              }

                            </span>
                          ) : (
                            <span className="muted">
                              —
                            </span>
                          )}

                        </td>


                        <td className="date">
                          {formatDate(
                            latest?.payment_time,
                          )}
                        </td>


                        <td
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                        >

                          <div className="actions">

                            <button
                              title="Edit"
                              onClick={() =>
                                openEditCustomer(
                                  customer,
                                )
                              }
                            >
                              <Pencil
                                size={15}
                              />
                            </button>


                            <button
                              title="Delete"
                              className="delete"
                              onClick={() =>
                                deleteCustomer(
                                  customer,
                                )
                              }
                            >
                              <Trash2
                                size={15}
                              />
                            </button>

                          </div>

                        </td>

                      </tr>
                    );
                  },
                )
              )}

            </tbody>

          </table>

        </div>


        {/* PAGINATION */}

        {!loading &&
          filteredCustomers.length >
            0 && (
            <div className="pagination">

              <span>
                Showing{" "}
                <strong>
                  {(currentPage - 1) *
                      ITEMS_PER_PAGE +
                    1}
                </strong>
                {" – "}
                <strong>
                  {Math.min(
                    currentPage *
                      ITEMS_PER_PAGE,
                    filteredCustomers.length,
                  )}
                </strong>
                {" of "}
                <strong>
                  {
                    filteredCustomers.length
                  }
                </strong>
              </span>


              <div className="pagination-buttons">

                <button
                  disabled={
                    currentPage === 1
                  }
                  onClick={() =>
                    setCurrentPage(
                      (page) =>
                        Math.max(
                          1,
                          page - 1,
                        ),
                    )
                  }
                >
                  <ChevronLeft
                    size={15}
                  />

                  Previous
                </button>


                {getPageNumbers().map(
                  (page) => (
                    <button
                      key={page}
                      className={
                        page ===
                        currentPage
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setCurrentPage(
                          page,
                        )
                      }
                    >
                      {page}
                    </button>
                  ),
                )}


                <button
                  disabled={
                    currentPage ===
                    totalPages
                  }
                  onClick={() =>
                    setCurrentPage(
                      (page) =>
                        Math.min(
                          totalPages,
                          page + 1,
                        ),
                    )
                  }
                >
                  Next

                  <ChevronRight
                    size={15}
                  />
                </button>

              </div>

            </div>
          )}

      </section>


      {/* MANUAL CUSTOMER + PAYMENT MODAL */}

      {showManualPaymentModal && (
        <div className="modal-background">
          <div className="manual-payment-modal">
            <div className="modal-header">
              <div>
                <span>MANUAL ENTRY</span>
                <h2>Add customer & payment</h2>
                <p>
                  Enter the customer details and payment details manually. A new customer and payment record will be created together.
                </p>
              </div>

              <button
                className="close"
                onClick={() => setShowManualPaymentModal(false)}
                aria-label="Close manual entry"
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-grid">
              <div className="form-section full">
                Customer details
              </div>

              <div className="form-field full">
                <label>Full name *</label>
                <input
                  value={manualPaymentForm.name}
                  onChange={(event) => updateManualPaymentForm("name", event.target.value)}
                  placeholder="Rahul Sharma"
                  autoFocus
                />
              </div>

              <div className="form-field">
                <label>Age</label>
                <input
                  type="number"
                  min="0"
                  value={manualPaymentForm.age}
                  onChange={(event) => updateManualPaymentForm("age", event.target.value)}
                  placeholder="28"
                />
              </div>

              <div className="form-field">
                <label>City</label>
                <input
                  value={manualPaymentForm.city}
                  onChange={(event) => updateManualPaymentForm("city", event.target.value)}
                  placeholder="Hyderabad"
                />
              </div>

              <div className="form-field">
                <label>Phone</label>
                <input
                  value={manualPaymentForm.phone}
                  onChange={(event) => updateManualPaymentForm("phone", event.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  value={manualPaymentForm.email}
                  onChange={(event) => updateManualPaymentForm("email", event.target.value)}
                  placeholder="rahul@email.com"
                />
              </div>

              <div className="form-section full">
                Course details
              </div>

              <div className="form-field">
                <label>Course *</label>
                <input
                  value={manualPaymentForm.course}
                  onChange={(event) => updateManualPaymentForm("course", event.target.value)}
                  placeholder="Bootcamp"
                />
              </div>

              <div className="form-field">
                <label>Batch</label>
                <input
                  value={manualPaymentForm.batch}
                  onChange={(event) => updateManualPaymentForm("batch", event.target.value)}
                  disabled={normalizeCourse(manualPaymentForm.course).toLowerCase() === "consultation"}
                  placeholder="05"
                />
              </div>

              <div className="form-section full">
                Payment details
              </div>

              <div className="form-field">
                <label>Amount (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={manualPaymentForm.amount}
                  onChange={(event) => updateManualPaymentForm("amount", event.target.value)}
                  placeholder="5000"
                />
              </div>

              <div className="form-field">
                <label>Status</label>
                <select
                  value={manualPaymentForm.status}
                  onChange={(event) => updateManualPaymentForm("status", event.target.value)}
                >
                  <option value="captured">Captured</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div className="form-field">
                <label>Payment method</label>
                <input
                  value={manualPaymentForm.method}
                  onChange={(event) => updateManualPaymentForm("method", event.target.value)}
                  placeholder="UPI / Cash / Card / Bank Transfer"
                />
              </div>

              <div className="form-field">
                <label>Payment ID</label>
                <input
                  value={manualPaymentForm.payment_id}
                  onChange={(event) => updateManualPaymentForm("payment_id", event.target.value)}
                  placeholder="Optional transaction ID"
                />
              </div>

              <div className="form-field">
                <label>Payment date & time (IST)</label>
                <input
                  type="datetime-local"
                  value={manualPaymentForm.payment_time}
                  onChange={(event) => updateManualPaymentForm("payment_time", event.target.value)}
                />
              </div>

              <div className="form-field">
                <label>Failed reason</label>
                <input
                  value={manualPaymentForm.failed_reason}
                  onChange={(event) => updateManualPaymentForm("failed_reason", event.target.value)}
                  placeholder={manualPaymentForm.status === "failed" ? "Required for failed payment" : "Optional"}
                />
              </div>
            </div>

            {manualPaymentError && (
              <div className="form-error">
                <XCircle size={16} />
                {manualPaymentError}
              </div>
            )}

            <div className="modal-actions">
              <button
                className="cancel"
                onClick={() => setShowManualPaymentModal(false)}
                disabled={manualPaymentSaving}
              >
                Cancel
              </button>

              <button
                className="primary-button"
                disabled={manualPaymentSaving}
                onClick={saveManualPayment}
              >
                <Plus size={16} />
                {manualPaymentSaving ? "Saving..." : "Add customer & payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MODAL */}

      {showCustomerModal && (
        <div className="modal-background">

          <div className="customer-modal">

            <div className="modal-header">

              <div>

                <span>
                  {editingCustomer
                    ? "EDIT CUSTOMER"
                    : "NEW CUSTOMER"}
                </span>

                <h2>
                  {editingCustomer
                    ? "Edit customer"
                    : "Add customer"}
                </h2>

                <p>
                  {editingCustomer
                    ? "Update customer and latest payment details."
                    : "Create a customer and their first payment record."}
                </p>

              </div>


              <button
                className="close"
                onClick={() =>
                  setShowCustomerModal(
                    false,
                  )
                }
              >
                <X size={18} />
              </button>

            </div>


            <div className="form-grid">

              <div className="form-field full">

                <label>
                  Full name *
                </label>

                <input
                  value={form.name}
                  onChange={(event) =>
                    updateForm(
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Rahul Sharma"
                />

              </div>


              <div className="form-field">

                <label>
                  Age
                </label>

                <input
                  type="number"
                  value={form.age}
                  onChange={(event) =>
                    updateForm(
                      "age",
                      event.target.value,
                    )
                  }
                  placeholder="28"
                />

              </div>


              <div className="form-field">

                <label>
                  City
                </label>

                <input
                  value={form.city}
                  onChange={(event) =>
                    updateForm(
                      "city",
                      event.target.value,
                    )
                  }
                  placeholder="Hyderabad"
                />

              </div>


              <div className="form-field">

                <label>
                  Phone
                </label>

                <input
                  value={form.phone}
                  onChange={(event) =>
                    updateForm(
                      "phone",
                      event.target.value,
                    )
                  }
                  placeholder="+91 98765 43210"
                />

              </div>


              <div className="form-field">

                <label>
                  Email
                </label>

                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    updateForm(
                      "email",
                      event.target.value,
                    )
                  }
                  placeholder="rahul@email.com"
                />

              </div>


              <div className="form-field full">

                <label>
                  Customer Course
                </label>

                <input
                  value={form.course}
                  onChange={(event) =>
                    updateForm(
                      "course",
                      event.target.value,
                    )
                  }
                  placeholder="Consultation"
                />

              </div>


              <div className="form-field full">
                <label>Customer Batch</label>
                <input
                  value={form.batch}
                  onChange={(event) => updateForm("batch", event.target.value)}
                  placeholder="Batch 2026 - September"
                />
              </div>

              <p style={{
                margin: "-6px 0 8px",
                color: "#8f8f8f",
                fontSize: "11px",
                lineHeight: 1.5,
              }}>
                Customer course/batch describe the current profile. Historical payment course/batch are never changed when you edit this customer.
              </p>

              <div className="form-section">
                Latest payment (editable transaction details)
              </div>


              <div className="form-field">

                <label>
                  Amount
                </label>

                <input
                  type="number"
                  value={form.amount}
                  onChange={(event) =>
                    updateForm(
                      "amount",
                      event.target.value,
                    )
                  }
                  placeholder="4999"
                />

              </div>


              <div className="form-field">

                <label>
                  Status
                </label>

                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm(
                      "status",
                      event.target.value,
                    )
                  }
                >

                  <option value="captured">
                    Captured
                  </option>

                  <option value="failed">
                    Failed
                  </option>

                  <option value="pending">
                    Pending
                  </option>

                </select>

              </div>


              <div className="form-field">

                <label>
                  Payment time
                </label>

                <input
                  type="datetime-local"
                  value={
                    form.payment_time
                  }
                  onChange={(event) =>
                    updateForm(
                      "payment_time",
                      event.target.value,
                    )
                  }
                />

              </div>


              <div className="form-field">

                <label>
                  Failed reason
                </label>

                <input
                  value={
                    form.failed_reason
                  }
                  onChange={(event) =>
                    updateForm(
                      "failed_reason",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                />

              </div>

            </div>


            {error && (
              <div className="form-error">

                <XCircle size={16} />

                {error}

              </div>
            )}


            <div className="modal-actions">

              <button
                className="cancel"
                onClick={() =>
                  setShowCustomerModal(
                    false,
                  )
                }
              >
                Cancel
              </button>


              <button
                className="primary-button"
                disabled={saving}
                onClick={
                  saveCustomer
                }
              >
                {saving
                  ? "Saving..."
                  : editingCustomer
                    ? "Save changes"
                    : "Add customer"}
              </button>

            </div>

          </div>

        </div>
      )}


      {/* CUSTOMER DETAILS */}

      {selectedCustomer && (
        <div className="modal-background">

          <div className="details-modal">

            <div className="modal-header">

              <div>

                <span>
                  CUSTOMER
                </span>

                <h2>
                  {
                    selectedCustomer.name
                  }
                </h2>

                <p>
                  {
                    selectedCustomer.email ||
                    selectedCustomer.phone ||
                    "Customer details"
                  }
                </p>

              </div>


              <button
                className="close"
                onClick={() =>
                  setSelectedCustomer(
                    null,
                  )
                }
              >
                <X size={18} />
              </button>

            </div>


            <div className="details-content">

              <div className="detail-grid">

                <div>
                  <span>
                    Age
                  </span>

                  <strong>
                    {
                      selectedCustomer.age ??
                      "—"
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    City
                  </span>

                  <strong>
                    {
                      selectedCustomer.city ||
                      "—"
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Phone
                  </span>

                  <strong>
                    {
                      selectedCustomer.phone ||
                      "—"
                    }
                  </strong>
                </div>


                <div>
                  <span>
                    Email
                  </span>

                  <strong>
                    {
                      selectedCustomer.email ||
                      "—"
                    }
                  </strong>
                </div>


                <div>
                  <span>Courses</span>
                  <strong>
                    {Array.from(
                      new Set(
                        selectedCustomer.payments
                          .map((payment) => normalizeCourse(payment.course))
                          .filter(Boolean),
                      ),
                    ).length > 0
                      ? Array.from(
                          new Set(
                            selectedCustomer.payments
                              .map((payment) => normalizeCourse(payment.course))
                              .filter(Boolean),
                          ),
                        ).join(", ")
                      : normalizeCourse(selectedCustomer.course) || "—"}
                  </strong>
                </div>

                <div>
                  <span>Batches</span>
                  <strong>
                    {Array.from(
                      new Set(
                        selectedCustomer.payments
                          .map((payment) => getDisplayBatch(payment.course, payment.batch))
                          .filter(Boolean),
                      ),
                    ).length > 0
                      ? Array.from(
                          new Set(
                            selectedCustomer.payments
                              .map((payment) => getDisplayBatch(payment.course, payment.batch))
                              .filter(Boolean),
                          ),
                        ).join(", ")
                      : (normalizeCourse(selectedCustomer.course).toLowerCase() === "consultation" ? "No Batch" : selectedCustomer.batch || "—")}
                  </strong>
                </div>

                <div>
                  <span>
                    Payments
                  </span>

                  <strong>
                    {
                      selectedCustomer
                        .payments.length
                    }
                  </strong>
                </div>

              </div>


              {Object.keys(selectedCustomer.custom_fields || {}).length > 0 && (
                <div className="dynamic-details">
                  <div className="dynamic-details-heading">
                    <h3>Additional information</h3>
                    <span>Dynamic fields</span>
                  </div>
                  <div className="dynamic-details-grid">
                    {Object.entries(selectedCustomer.custom_fields || {}).map(([key, value]) => (
                      <div key={key}>
                        <span>{key}</span>
                        <strong>{String(value ?? "—") || "—"}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PAYMENT HISTORY */}

              <div className="history">

                <div className="history-title">

                  <h3>
                    Payment history
                  </h3>

                  <span>
                    {
                      selectedCustomer
                        .payments.length
                    }{" "}
                    payments
                  </span>

                </div>


                {selectedCustomer.payments
                  .length === 0 ? (
                  <div className="no-history">
                    No payment records.
                  </div>
                ) : (
                  [...selectedCustomer.payments]
                    .sort(
                      (a, b) =>
                        new Date(
                          b.payment_time,
                        ).getTime() -
                        new Date(
                          a.payment_time,
                        ).getTime(),
                    )
                    .map(
                      (payment) => (
                        <div
                          className="history-row"
                          key={payment.id}
                        >

                          <div className="history-main">

                            <div className="history-payment">

                              <strong>
                                {formatCurrency(
                                  Number(
                                    payment.amount,
                                  ),
                                )}
                              </strong>

                              <span
                                className={`status ${getStatusClass(
                                  payment.status,
                                )}`}
                              >

                                {isCaptured(
                                  payment.status,
                                ) ? (
                                  <Check
                                    size={12}
                                  />
                                ) : isFailed(
                                    payment.status,
                                  ) ? (
                                  <XCircle
                                    size={12}
                                  />
                                ) : (
                                  <Clock3
                                    size={12}
                                  />
                                )}

                                {
                                  getDisplayStatus(
                                    payment.status,
                                  )
                                }

                              </span>

                            </div>


                            <div className="history-meta">

                              <span>
                                Course
                              </span>

                              <strong>
                                {normalizeCourse(payment.course) || "Not recorded"}
                              </strong>

                              <i />

                              <span>
                                Batch
                              </span>

                              <strong>
                                {getDisplayBatch(payment.course, payment.batch)}
                              </strong>

                              <i />

                              <span>
                                Paid
                              </span>

                              <strong>
                                {formatDate(
                                  payment.payment_time,
                                )}
                              </strong>

                            </div>

                          </div>

                        </div>
                      ),
                    )
                )}

              </div>

            </div>


            <div className="modal-actions">

              <button
                className="delete-button"
                onClick={async () => {
                  await deleteCustomer(
                    selectedCustomer,
                  );
                }}
              >
                <Trash2 size={15} />

                Delete customer
              </button>


              <button
                className="primary-button"
                onClick={() => {
                  setSelectedCustomer(
                    null,
                  );

                  openEditCustomer(
                    selectedCustomer,
                  );
                }}
              >
                <Pencil size={15} />

                Edit customer
              </button>

            </div>

          </div>

        </div>
      )}


      <style jsx>{`

        .customers-page {
          min-height: 100vh;
          padding: 36px 44px 70px;
          background:
            radial-gradient(circle at 12% 0%, rgba(255,23,68,.055), transparent 28%),
            radial-gradient(circle at 92% 8%, rgba(139,92,246,.035), transparent 24%),
            #050505;
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
        input,
        select {
          font-family: inherit;
        }

        button {
          cursor: pointer;
        }

        .header-title-row {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .header-copy {
          min-width: 0;
        }

        .back-button {
          width: 40px;
          height: 40px;
          padding: 0;
          flex: 0 0 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 10px;
          background: rgba(255,255,255,.035);
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 4px 18px rgba(0,0,0,.18);
          transition:
            transform .18s ease,
            border-color .18s ease,
            background .18s ease,
            color .18s ease;
        }

        .back-button span {
          display: none;
        }

        .back-button:hover {
          transform: translateX(-2px);
          border-color: rgba(255,23,68,.35);
          background: rgba(255,23,68,.07);
          color: #ffffff;
        }

        .back-button:focus-visible {
          outline: 2px solid rgba(255,23,68,.45);
          outline-offset: 3px;
        }

        .page-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 30px;
          margin-bottom: 28px;
        }

        .eyebrow {
          display: block;
          color: #ff1744;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.1px;
        }

        .page-header h1 {
          margin: 8px 0 0;
          color: #ffffff;
          font-size: 34px;
          line-height: 1.15;
          font-weight: 650;
          letter-spacing: -.7px;
        }

        .page-header p {
          margin: 8px 0 0;
          color: #a1a1aa;
          font-size: 14px;
        }

        .header-actions {
          display: flex;
          gap: 9px;
        }

        .primary-button,
        .secondary-button {
          height: 43px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
        }

        .primary-button {
          border: 1px solid #ff1744;
          background: #ff1744;
          color: #ffffff;
        }

        .primary-button:hover {
          background: #e9143d;
        }

        .primary-button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .secondary-button {
          border: 1px solid #29292d;
          background: #111112;
          color: #e4e4e7;
        }

        .secondary-button:hover {
          border-color: #414147;
        }

        .page-error {
          min-height: 44px;
          margin-bottom: 16px;
          padding: 10px 13px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid rgba(255,23,68,.25);
          border-radius: 8px;
          background: rgba(255,23,68,.06);
          color: #ff9bad;
          font-size: 13px;
        }

        .page-error span {
          flex: 1;
        }

        .page-error button {
          border: 0;
          background: transparent;
          color: inherit;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 13px;
          margin-bottom: 16px;
        }

        .stat-card {
          min-height: 145px;
          padding: 20px;
          border: 1px solid rgba(255,255,255,.07);
          border-radius: 14px;
          background: rgba(15,15,17,.82);
          box-shadow: 0 10px 30px rgba(0,0,0,.16);
          transition: transform .18s ease, border-color .18s ease, background .18s ease;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,.11);
          background: rgba(18,18,20,.92);
        }

        .stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .stat-top > span {
          color: #71717a;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .7px;
        }

        .stat-icon {
          width: 37px;
          height: 37px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(255,23,68,.08);
          color: #ff3159;
        }

        .stat-icon.success {
          background: rgba(57,217,138,.08);
          color: #39d98a;
        }

        .stat-icon.failed {
          background: rgba(255,99,123,.08);
          color: #ff637b;
        }

        .stat-card > strong {
          display: block;
          margin-top: 19px;
          color: #ffffff;
          font-size: 28px;
          line-height: 1;
          font-weight: 650;
        }

        .stat-card > p {
          margin: 8px 0 0;
          color: #8b8b93;
          font-size: 12px;
        }

        .customers-section {
          overflow: hidden;
          border: 1px solid #202023;
          border-radius: 11px;
          background: #0c0c0d;
        }

        .table-toolbar {
          min-height: 82px;
          padding: 18px 21px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #202023;
        }

        .table-heading h2 {
          margin: 0;
          color: #ffffff;
          font-size: 17px;
          font-weight: 600;
        }

        .table-heading p {
          margin: 5px 0 0;
          color: #8b8b93;
          font-size: 12px;
        }

        .payment-ranking-summary {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #71717a;
          font-size: 11px;
        }

        .payment-ranking-summary strong {
          color: #e4e4e7;
          font-weight: 600;
        }

        .payment-ranking-summary span:nth-last-child(3) {
          color: #39d98a;
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .search-box {
          width: 310px;
          height: 40px;
          padding: 0 11px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #29292d;
          border-radius: 8px;
          background: #111112;
          color: #71717a;
        }

        .search-box:focus-within {
          border-color: #505057;
        }

        .search-box input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #ffffff;
          font-size: 13px;
        }

        .search-box input::placeholder {
          color: #71717a;
        }

        .search-box button {
          border: 0;
          background: transparent;
          color: #71717a;
        }

        .filter-button {
          height: 40px;
          padding: 0 11px;
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #29292d;
          border-radius: 8px;
          background: #111112;
          color: #a1a1aa;
          font-size: 12px;
        }

        .filter-button:hover,
        .filter-button.active {
          color: #ffffff;
          border-color: #45454c;
        }

        .filters {
          padding: 15px 21px;
          display: flex;
          align-items: flex-end;
          gap: 12px;
          border-bottom: 1px solid #202023;
          background: #09090a;
        }

        .filter-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filter-field label {
          color: #8b8b93;
          font-size: 11px;
        }

        .filter-field select {
          min-width: 165px;
          height: 38px;
          padding: 0 10px;
          border: 1px solid #29292d;
          border-radius: 7px;
          outline: 0;
          background: #111112;
          color: #e4e4e7;
          font-size: 12px;
        }

        .filter-field option {
          background: #111111;
        }

        .reset-button {
          height: 38px;
          border: 0;
          background: transparent;
          color: #ff3159;
          font-size: 12px;
          font-weight: 600;
        }

        .table-scroll {
          width: 100%;
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1450px;
          border-collapse: collapse;
        }

        th {
          height: 50px;
          padding: 0 16px;
          background: #101011;
          color: #8b8b93;
          font-size: 10px;
          font-weight: 650;
          letter-spacing: .35px;
          text-align: left;
          white-space: nowrap;
        }

        td {
          height: 72px;
          padding: 0 16px;
          border-top: 1px solid #1e1e21;
          color: #d4d4d8;
          font-size: 13px;
          white-space: nowrap;
        }

        tbody tr {
          cursor: pointer;
        }

        tbody tr:hover {
          background: #101011;
        }

        .customer {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(255,23,68,.08);
          color: #ff3159;
          font-size: 13px;
          font-weight: 650;
        }

        .customer > div:last-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .customer strong {
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
        }

        .customer span {
          color: #71717a;
          font-size: 11px;
        }

        .payment-number {
          min-width: 27px;
          height: 27px;
          padding: 0 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          background: rgba(255,23,68,.08);
          color: #ff3159;
          font-size: 12px;
          font-weight: 600;
        }

        .amount {
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
        }

        .date {
          color: #a1a1aa;
          font-size: 12px;
        }

        .muted {
          color: #71717a;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 9px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .status-success {
          color: #39d98a;
          background: rgba(57,217,138,.08);
        }

        .status-failed {
          color: #ff637b;
          background: rgba(255,99,123,.08);
        }

        .status-pending {
          color: #e6b84e;
          background: rgba(230,184,78,.08);
        }

        .actions {
          display: flex;
          gap: 5px;
        }

        .actions button {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #29292d;
          border-radius: 7px;
          background: #111112;
          color: #a1a1aa;
        }

        .actions button:hover {
          color: #ffffff;
          border-color: #44444a;
        }

        .actions button.delete:hover {
          color: #ff637b;
          border-color: rgba(255,99,123,.3);
        }

        .loading {
          height: 270px;
          text-align: center;
          color: #a1a1aa;
          font-size: 13px;
        }

        .empty {
          height: 280px;
          text-align: center;
        }

        .empty-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #151517;
          color: #71717a;
        }

        .empty strong {
          display: block;
          color: #e4e4e7;
          font-size: 14px;
        }

        .empty span {
          display: block;
          margin-top: 5px;
          color: #71717a;
          font-size: 12px;
        }

        .pagination {
          min-height: 67px;
          padding: 12px 21px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border-top: 1px solid #202023;
        }

        .pagination > span {
          color: #71717a;
          font-size: 12px;
        }

        .pagination > span strong {
          color: #d4d4d8;
        }

        .pagination-buttons {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .pagination-buttons button {
          min-width: 34px;
          height: 34px;
          padding: 0 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 1px solid #29292d;
          border-radius: 7px;
          background: #111112;
          color: #a1a1aa;
          font-size: 11px;
        }

        .pagination-buttons button:hover:not(:disabled) {
          color: #ffffff;
          border-color: #45454c;
        }

        .pagination-buttons button.active {
          border-color: #ff1744;
          background: #ff1744;
          color: #ffffff;
        }

        .pagination-buttons button:disabled {
          opacity: .3;
          cursor: not-allowed;
        }

        /* MODALS */

        .modal-background {
          position: fixed;
          inset: 0;
          z-index: 1000;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,.78);
          backdrop-filter: blur(9px);
        }

        .customer-modal,
        .details-modal,
        .manual-payment-modal {
          width: min(720px,100%);
          max-height: calc(100vh - 40px);
          overflow: auto;
          border: 1px solid #29292d;
          border-radius: 13px;
          background: #0c0c0d;
          box-shadow:
            0 30px 90px
            rgba(0,0,0,.65);
        }

        .details-modal {
          width: min(720px,100%);
        }

        .manual-payment-modal {
          width: min(760px,100%);
        }

        .manual-payment-button {
          border-color: #343438;
        }

        .manual-payment-customer-card {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 12px;
          border: 1px solid rgba(255,23,68,.18);
          border-radius: 9px;
          background: rgba(255,23,68,.045);
        }

        .manual-payment-customer-avatar {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: rgba(255,23,68,.12);
          color: #ff5b78;
          font-size: 14px;
          font-weight: 700;
        }

        .manual-payment-customer-card strong,
        .manual-payment-customer-card span {
          display: block;
        }

        .manual-payment-customer-card strong {
          color: #ffffff;
          font-size: 13px;
          font-weight: 650;
        }

        .manual-payment-customer-card span {
          margin-top: 3px;
          color: #85858d;
          font-size: 11px;
        }

        .form-field input:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .modal-header {
          padding: 21px 22px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid #202023;
        }

        .modal-header > div > span {
          display: block;
          margin-bottom: 7px;
          color: #ff1744;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .modal-header h2 {
          margin: 0;
          color: #ffffff;
          font-size: 21px;
          font-weight: 650;
        }

        .modal-header p {
          margin: 6px 0 0;
          color: #8b8b93;
          font-size: 12px;
        }

        .close {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #29292d;
          border-radius: 7px;
          background: #111112;
          color: #a1a1aa;
        }

        .close:hover {
          color: #ffffff;
        }

        .form-grid {
          padding: 22px;
          display: grid;
          grid-template-columns: repeat(2,1fr);
          gap: 15px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .form-field.full {
          grid-column: 1 / -1;
        }

        .form-field label {
          color: #a1a1aa;
          font-size: 12px;
        }

        .form-field input,
        .form-field select {
          height: 42px;
          padding: 0 11px;
          border: 1px solid #29292d;
          border-radius: 8px;
          outline: 0;
          background: #111112;
          color: #ffffff;
          font-size: 13px;
        }

        .form-field input:focus,
        .form-field select:focus {
          border-color: #55555d;
        }

        .form-field input::placeholder {
          color: #52525b;
        }

        .form-field option {
          background: #111111;
        }

        .form-section {
          grid-column: 1 / -1;
          padding-top: 16px;
          border-top: 1px solid #202023;
          color: #e4e4e7;
          font-size: 13px;
          font-weight: 600;
        }

        .form-error {
          margin: 0 22px 16px;
          padding: 11px 13px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(255,23,68,.22);
          border-radius: 8px;
          background: rgba(255,23,68,.05);
          color: #ff8d9e;
          font-size: 12px;
        }

        .modal-actions {
          padding: 0 22px 22px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }

        .cancel {
          height: 42px;
          padding: 0 14px;
          border: 1px solid #29292d;
          border-radius: 8px;
          background: #111112;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 600;
        }

        .cancel:hover {
          color: #ffffff;
        }

        .delete-button {
          margin-right: auto;
          height: 42px;
          padding: 0 13px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid rgba(255,99,123,.22);
          border-radius: 8px;
          background: rgba(255,99,123,.05);
          color: #ff637b;
          font-size: 12px;
          font-weight: 600;
        }

        /* DETAILS */

        .details-content {
          padding: 22px;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2,1fr);
          gap: 1px;
          overflow: hidden;
          border: 1px solid #202023;
          border-radius: 9px;
          background: #202023;
        }

        .detail-grid > div {
          min-height: 75px;
          padding: 13px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 6px;
          background: #0c0c0d;
        }

        .detail-grid span {
          color: #71717a;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .4px;
        }

        .detail-grid strong {
          color: #e4e4e7;
          font-size: 13px;
          font-weight: 600;
          word-break: break-word;
        }

        .history {
          margin-top: 22px;
        }

        .history-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .history h3 {
          margin: 0;
          color: #e4e4e7;
          font-size: 13px;
          font-weight: 600;
        }

        .history-title span {
          color: #71717a;
          font-size: 11px;
        }

        .history-row {
          padding: 14px;
          border: 1px solid #202023;
          border-radius: 8px;
          background: #101011;
        }

        .history-row + .history-row {
          margin-top: 7px;
        }

        .history-main {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .history-payment {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .history-payment > strong {
          color: #ffffff;
          font-size: 15px;
          font-weight: 650;
        }

        .history-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
        }

        .history-meta span {
          color: #66666e;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .35px;
        }

        .history-meta strong {
          color: #a1a1aa;
          font-size: 11px;
          font-weight: 600;
        }

        .history-meta i {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #45454c;
          margin: 0 3px;
        }

        .no-history {
          padding: 28px;
          border: 1px solid #202023;
          border-radius: 8px;
          color: #71717a;
          text-align: center;
          font-size: 12px;
        }

        @media (max-width: 1150px) {
          .customers-page {
            padding: 32px 28px 60px;
          }

          .stats-grid {
            grid-template-columns: repeat(2,1fr);
          }
        }

        @media (max-width: 800px) {
          .page-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
          }

          .header-actions button {
            flex: 1;
          }

          .table-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .toolbar-actions {
            width: 100%;
          }

          .search-box {
            width: 100%;
            flex: 1;
          }

          .filters {
            align-items: stretch;
            flex-direction: column;
          }

          .filter-field select {
            width: 100%;
          }

          .pagination {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 600px) {
          .customers-page {
            padding: 25px 16px 45px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .header-actions {
            flex-direction: column;
          }

          .header-actions button {
            width: 100%;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .form-field.full,
          .form-section {
            grid-column: auto;
          }

          .detail-grid {
            grid-template-columns: 1fr;
          }
        }

        .dynamic-details { margin-top:22px; padding-top:20px; border-top:1px solid #202023; }
        .dynamic-details-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
        .dynamic-details-heading h3 { margin:0; color:#ffffff; font-size:14px; font-weight:600; }
        .dynamic-details-heading span { color:#71717a; font-size:10px; text-transform:uppercase; letter-spacing:.5px; }
        .dynamic-details-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
        .dynamic-details-grid > div { min-width:0; padding:12px; border:1px solid #202023; border-radius:8px; background:#0b0b0c; }
        .dynamic-details-grid span { display:block; margin-bottom:5px; color:#71717a; font-size:10px; }
        .dynamic-details-grid strong { display:block; overflow-wrap:anywhere; color:#e4e4e7; font-size:12px; font-weight:500; }
        @media (max-width:700px) { .dynamic-details-grid { grid-template-columns:1fr; } }
      `}</style>

    </main>
  );
}

/*
 * Small upload icon so the Customers page
 * doesn't need any Excel/import logic.
 */

function UploadIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}