import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type ConsultationPayment = {
  id: string;
  payment_id: string | null;
  amount: number | null;
  status: string | null;
  payment_time: string | null;
  course: string | null;
  payment_type: string | null;
  customer_id: string | null;
};

type PendingRecordingConsultation = {
  id: string;
  student_name: string;
  email: string | null;
  booking_date: string;
  booking_time: string;
  meet_link: string | null;
  source_event_id: string | null;
  meet_code: string | null;
  recording_link: string | null;
};

type RematchConsultation = {
  id: string;
  email: string | null;
  phone: string | null;
  customer_id: string | null;
  payment_record_id: string | null;
  payment_id: string | null;
  payment_status: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

/*
 * Removes HTML added by Google Sheets / form data.
 *
 * Examples:
 *
 * 8374434228<br><br><br>
 * +91 801 990 7740
 * 1 (609) 454-1304
 * +1.902.989.5872
 */
function cleanPhoneText(value: unknown): string {
  return clean(value)
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * Returns digits only.
 *
 * IMPORTANT:
 * This is used for MATCHING.
 * We do not use this blindly as the displayed/stored phone.
 */
function normalizePhoneDigits(value: unknown): string {
  const raw = cleanPhoneText(value);

  if (!raw || raw === "-") {
    return "";
  }

  return raw.replace(/\D/g, "");
}

/*
 * Creates matching variants for phone numbers.
 *
 * India examples:
 *
 * 8019907740
 * +91 801 990 7740
 * 918019907740
 * 00918019907740
 *
 * all become matchable.
 *
 * International numbers preserve their complete country-code
 * digits instead of guessing a country code.
 */
function phoneVariants(value: unknown): string[] {
  const digits = normalizePhoneDigits(value);

  if (!digits) {
    return [];
  }

  const variants = new Set<string>();

  variants.add(digits);

  /*
   * Remove international dialing prefix 00.
   *
   * Example:
   * 00918019907740
   * -> 918019907740
   */
  if (digits.startsWith("00")) {
    variants.add(digits.slice(2));
  }

  /*
   * India:
   *
   * 918019907740
   * -> 8019907740
   */
  if (digits.startsWith("91") && digits.length === 12) {
    variants.add(digits.slice(2));
  }

  /*
   * India:
   *
   * 00918019907740
   * -> 8019907740
   */
  if (digits.startsWith("0091") && digits.length === 14) {
    variants.add(digits.slice(4));
  }

  /*
   * Indian national format:
   *
   * 08019907740
   * -> 8019907740
   *
   * We only treat it as Indian when the remaining number
   * looks like a normal Indian mobile number.
   */
  if (digits.length === 11 && digits.startsWith("0")) {
    const local = digits.slice(1);

    if (/^[6-9]\d{9}$/.test(local)) {
      variants.add(local);
      variants.add(`91${local}`);
    }
  }

  /*
   * Indian local 10-digit mobile number.
   *
   * 8019907740
   * -> 918019907740
   */
  if (/^[6-9]\d{9}$/.test(digits)) {
    variants.add(`91${digits}`);
  }

  return [...variants].filter(Boolean);
}

/*
 * Normalized value used when writing the phone into consultations.
 *
 * Example:
 * +91 801 990 7740
 * becomes:
 * +918019907740
 */
function normalizePhone(value: unknown): string {
  const digits = normalizePhoneDigits(value);

  return digits ? `+${digits}` : "";
}

function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

function parseDate(value: unknown): string {
  const text = clean(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseTime(value: unknown): string {
  const text = clean(value);

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text)) {
    return text.toUpperCase();
  }

  const date = new Date(text);

  if (!Number.isFinite(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/* =========================================================
   SUPABASE
========================================================= */

function getSupabase() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase server environment variables are missing."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/* =========================================================
   AUTHENTICATION
========================================================= */

function isAuthorized(
  request: NextRequest
): boolean {
  const expectedSecret =
    process.env.CONSULTATION_SYNC_SECRET;

  const receivedSecret =
    request.headers.get(
      "x-consultation-sync-secret"
    );

  return (
    !!expectedSecret &&
    receivedSecret === expectedSecret
  );
}

/* =========================================================
   CUSTOMER MATCHING
========================================================= */

async function findCustomerByEmail(
  supabase: ReturnType<typeof getSupabase>,
  email: string
): Promise<Customer | null> {
  if (!email) {
    return null;
  }

  const normalizedEmail =
    normalizeEmail(email);

  /*
   * Exact match first.
   */
  const {
    data,
    error,
  } = await supabase
    .from("customers")
    .select("id,name,email,phone")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return data as Customer;
  }

  /*
   * Case-insensitive fallback.
   */
  const {
    data: ilikeData,
    error: ilikeError,
  } = await supabase
    .from("customers")
    .select("id,name,email,phone")
    .ilike("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (ilikeError) {
    console.error(
      "Consultation customer email lookup failed:",
      ilikeError
    );

    return null;
  }

  return ilikeData
    ? (ilikeData as Customer)
    : null;
}

/*
 * Because existing customers may have phones stored in different
 * formats, we normalize BOTH sides in JavaScript.
 */
async function findCustomersByPhone(
  supabase: ReturnType<typeof getSupabase>,
  phone: string
): Promise<Customer[]> {
  const variants =
    phoneVariants(phone);

  if (!variants.length) {
    return [];
  }

  const {
    data,
    error,
  } = await supabase
    .from("customers")
    .select("id,name,email,phone")
    .not("phone", "is", null)
    .limit(5000);

  if (error) {
    console.error(
      "Consultation customer phone lookup failed:",
      error
    );

    return [];
  }

  const customers =
    (data ?? []) as Customer[];

  return customers.filter(
    (customer) => {
      const customerVariants =
        phoneVariants(customer.phone);

      return customerVariants.some(
        (candidate) =>
          variants.includes(candidate)
      );
    }
  );
}

/*
 * Match using BOTH email and phone.
 *
 * Rules:
 *
 * 1. Same email + same phone
 *    -> exact customer
 *
 * 2. Same email + different phone
 *    -> email customer
 *
 * 3. Different email + same phone
 *    -> phone customer
 *
 * 4. Neither matches
 *    -> no customer
 *
 * If email and phone point to different customer records,
 * we do NOT silently attach the phone customer.
 */
async function findCustomerByEmailOrPhone(
  supabase: ReturnType<typeof getSupabase>,
  email: string,
  phone: string
): Promise<{
  customer: Customer | null;
  conflict: boolean;
  matchedBy:
    | "email"
    | "phone"
    | "both"
    | null;
}> {
  const normalizedEmail =
    normalizeEmail(email);

  const emailCustomer =
    await findCustomerByEmail(
      supabase,
      normalizedEmail
    );

  const phoneCustomers =
    await findCustomersByPhone(
      supabase,
      phone
    );

  /*
   * Both email and phone found something.
   */
  if (
    emailCustomer &&
    phoneCustomers.length > 0
  ) {
    const sameCustomer =
      phoneCustomers.some(
        (customer) =>
          String(customer.id) ===
          String(emailCustomer.id)
      );

    if (sameCustomer) {
      return {
        customer: emailCustomer,
        conflict: false,
        matchedBy: "both",
      };
    }

    /*
     * Email and phone point to different records.
     *
     * Email is used as the primary identity.
     */
    console.warn(
      "Consultation customer identity conflict.",
      {
        email: normalizedEmail,
        phone,
        emailCustomerId:
          emailCustomer.id,
        phoneCustomerIds:
          phoneCustomers.map(
            (customer) =>
              customer.id
          ),
      }
    );

    return {
      customer: emailCustomer,
      conflict: true,
      matchedBy: "email",
    };
  }

  /*
   * Email only.
   */
  if (emailCustomer) {
    return {
      customer: emailCustomer,
      conflict: false,
      matchedBy: "email",
    };
  }

  /*
   * Phone only.
   *
   * If multiple customer records share the same phone,
   * do not randomly choose one.
   */
  if (phoneCustomers.length === 1) {
    return {
      customer: phoneCustomers[0],
      conflict: false,
      matchedBy: "phone",
    };
  }

  if (phoneCustomers.length > 1) {
    console.warn(
      "Multiple customers matched the same consultation phone.",
      {
        phone,
        customerIds:
          phoneCustomers.map(
            (customer) =>
              customer.id
          ),
      }
    );

    return {
      customer: null,
      conflict: true,
      matchedBy: null,
    };
  }

  /*
   * No match.
   */
  return {
    customer: null,
    conflict: false,
    matchedBy: null,
  };
}

/* =========================================================
   FIND CONSULTATION PAYMENT
========================================================= */

async function findConsultationPayment(
  supabase: ReturnType<typeof getSupabase>,
  customerId: string
): Promise<ConsultationPayment | null> {
  if (!customerId) {
    return null;
  }

  const {
    data,
    error,
  } = await supabase
    .from("payments")
    .select(
      "id,payment_id,amount,status,payment_time,course,payment_type,customer_id"
    )
    .eq(
      "customer_id",
      customerId
    )
    .order(
      "payment_time",
      {
        ascending: false,
      }
    )
    .limit(50);

  if (error) {
    console.error(
      "Consultation payment lookup failed:",
      error
    );

    return null;
  }

  const payments =
    (data ?? []) as ConsultationPayment[];

  return (
    payments.find(
      (
        payment: ConsultationPayment
      ) => {
        const course =
          clean(
            payment.course
          ).toLowerCase();

        const paymentType =
          clean(
            payment.payment_type
          ).toLowerCase();

        return (
          course === "consultation" ||
          paymentType === "consultation"
        );
      }
    ) ?? null
  );
}

/* =========================================================
   PAYMENT STATUS
========================================================= */

function hashManualPaymentId(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash =
      (hash * 31 + value.charCodeAt(index)) |
      0;
  }

  /*
   * Keep the generated source row positive and safely inside
   * PostgreSQL integer range.
   */
  return (
    Math.abs(hash || 1) %
      2_000_000_000
  ) || 1;
}

async function getManualSourceIdentity(
  supabase: ReturnType<typeof getSupabase>,
  paymentRecordId: string
): Promise<{
  sourceSheetId: number;
  sourceRow: number;
}> {
  /*
   * The consultations table requires source_sheet_id and source_row.
   * Manual consultations do not originate from Google Sheets, so
   * source_sheet_id = -1 is reserved for internal/manual records.
   *
   * The source row is deterministic from the exact payment record ID,
   * with collision handling against the existing unique constraint.
   */
  const sourceSheetId = -1;
  let sourceRow = hashManualPaymentId(
    paymentRecordId
  );

  for (
    let attempt = 0;
    attempt < 100;
    attempt += 1
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("consultations")
      .select("id")
      .eq(
        "source_sheet_id",
        sourceSheetId
      )
      .eq(
        "source_row",
        sourceRow
      )
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to reserve manual consultation source identity: ${error.message}`
      );
    }

    if (!data) {
      return {
        sourceSheetId,
        sourceRow,
      };
    }

    sourceRow += 1;

    if (
      sourceRow >=
      2_000_000_000
    ) {
      sourceRow = 1;
    }
  }

  throw new Error(
    "Could not allocate a unique manual consultation source identity."
  );
}

function normalizePaymentStatus(
  value: unknown
): "Paid" | "Pending" | "Failed" {
  const status =
    clean(value).toLowerCase();

  if (
    status === "captured" ||
    status === "paid"
  ) {
    return "Paid";
  }

  if (status === "failed") {
    return "Failed";
  }

  return "Pending";
}

/* =========================================================
   STATUS PROTECTION
========================================================= */

function isProtectedStatus(
  value: unknown
): boolean {
  return [
    "Completed",
    "Cancelled",
    "No Show",
  ].includes(clean(value));
}

function isKnownStatus(
  value: unknown
): boolean {
  return [
    "Pending",
    "Scheduled",
    "In Progress",
    "Completed",
    "Cancelled",
    "No Show",
  ].includes(clean(value));
}

/* =========================================================
   FIND EXISTING CONSULTATION
========================================================= */

async function findExistingConsultation(
  supabase: ReturnType<typeof getSupabase>,
  sourceSheetId: number,
  sourceRow: number,
  sourceEventId: string | null
) {
  /*
   * Primary identity:
   * Google Sheet + row.
   */
  const {
    data: bySheet,
  } = await supabase
    .from("consultations")
    .select("*")
    .eq(
      "source_sheet_id",
      sourceSheetId
    )
    .eq(
      "source_row",
      sourceRow
    )
    .maybeSingle();

  if (bySheet) {
    return bySheet;
  }

  /*
   * Fallback:
   * Google Calendar event.
   */
  if (sourceEventId) {
    const {
      data: byEvent,
    } = await supabase
      .from("consultations")
      .select("*")
      .eq(
        "source_event_id",
        sourceEventId
      )
      .maybeSingle();

    if (byEvent) {
      return byEvent;
    }
  }

  return null;
}

/* =========================================================
   GET
========================================================= */

export async function GET(
  request: NextRequest
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  let supabase;

  try {
    supabase =
      getSupabase();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration error.",
      },
      {
        status: 500,
      }
    );
  }

  const action =
    clean(
      request.nextUrl.searchParams.get(
        "action"
      )
    );

  /* =======================================================
     PENDING RECORDINGS
  ======================================================= */

  if (
    action ===
    "pending-recordings"
  ) {
    const now =
      new Date();

    const yesterday =
      new Date(
        now.getTime() -
          48 *
            60 *
            60 *
            1000
      );

    const tomorrow =
      new Date(
        now.getTime() +
          24 *
            60 *
            60 *
            1000
      );

    const {
      data,
      error,
    } = await supabase
      .from("consultations")
      .select(
        [
          "id",
          "student_name",
          "email",
          "booking_date",
          "booking_time",
          "meet_link",
          "source_event_id",
          "meet_code",
          "recording_link",
        ].join(",")
      )
      .is(
        "recording_link",
        null
      )
      .gte(
        "booking_date",
        yesterday
          .toISOString()
          .slice(0, 10)
      )
      .lte(
        "booking_date",
        tomorrow
          .toISOString()
          .slice(0, 10)
      )
      .order(
        "booking_date",
        {
          ascending: true,
        }
      );

    if (error) {
      console.error(
        "Pending recording lookup failed:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      consultations:
        ((data ?? []) as unknown) as PendingRecordingConsultation[],
    });
  }

  /* =======================================================
     REMATCH PAYMENTS
  ======================================================= */

  if (
    action ===
    "rematch-payments"
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("consultations")
      .select(
        [
          "id",
          "email",
          "phone",
          "customer_id",
          "payment_record_id",
          "payment_id",
          "payment_status",
        ].join(",")
      )
      .or(
        "payment_record_id.is.null,payment_status.eq.Pending"
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      )
      .limit(200);

    if (error) {
      console.error(
        "Consultation rematch lookup failed:",
        error
      );

      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    const consultationRows =
      ((data ?? []) as unknown) as RematchConsultation[];

    let checked = 0;
    let matchedCustomers = 0;
    let matchedPayments = 0;
    let phoneMatches = 0;
    let emailMatches = 0;

    for (
      const consultation
      of consultationRows
    ) {
      checked++;

      const email =
        normalizeEmail(
          consultation.email
        );

      const phone =
        clean(
          consultation.phone
        );

      const match =
        await findCustomerByEmailOrPhone(
          supabase,
          email,
          phone
        );

      if (!match.customer) {
        continue;
      }

      matchedCustomers++;

      if (
        match.matchedBy ===
        "phone"
      ) {
        phoneMatches++;
      }

      if (
        match.matchedBy ===
          "email" ||
        match.matchedBy ===
          "both"
      ) {
        emailMatches++;
      }

      const payment =
        await findConsultationPayment(
          supabase,
          match.customer.id
        );

      const update: Record<
        string,
        unknown
      > = {
        customer_id:
          match.customer.id,

        /*
         * Preserve the consultation phone if
         * it already exists. Otherwise use the
         * matched customer's normalized phone.
         */
        phone:
          phone ||
          (
            match.customer.phone
              ? normalizePhone(
                  match.customer.phone
                )
              : null
          ),

        updated_at:
          new Date().toISOString(),
      };

      if (payment) {
        update.payment_record_id =
          payment.id;

        update.payment_id =
          payment.payment_id ??
          null;

        update.payment_amount =
          Number(
            payment.amount ??
              0
          );

        update.payment_status =
          normalizePaymentStatus(
            payment.status
          );

        update.payment_time =
          payment.payment_time ??
          null;
      }

      const {
        error:
          updateError,
      } = await supabase
        .from("consultations")
        .update(update)
        .eq(
          "id",
          consultation.id
        );

      if (updateError) {
        console.error(
          "Consultation rematch update failed:",
          updateError
        );
      } else if (payment) {
        matchedPayments++;
      }
    }

    return NextResponse.json({
      ok: true,
      checked,
      matchedCustomers,
      matchedPayments,
      phoneMatches,
      emailMatches,
    });
  }

  return NextResponse.json(
    {
      error:
        "Unsupported action. Use pending-recordings or rematch-payments.",
    },
    {
      status: 400,
    }
  );
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest
) {
  const action =
    clean(
      request.nextUrl.searchParams.get(
        "action"
      )
    );

  /*
   * Every POST request to this sync route is server-to-server.
   *
   * Manual completion is called through /api/consultations/manual-complete,
   * which keeps CONSULTATION_SYNC_SECRET on the server. The browser never
   * receives or sends the secret and does not need a Supabase Auth session.
   */
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  // The POST handler uses the server-side service-role client throughout
  // the sync and manual-completion flows. Keep this client server-only.
  let supabase: ReturnType<typeof getSupabase>;

  try {
    supabase = getSupabase();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Supabase configuration error.",
      },
      {
        status: 500,
      }
    );
  }

  let body: any;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON body.",
      },
      {
        status: 400,
      }
    );
  }

  /* =======================================================
     MANUAL CONSULTATION COMPLETE
  ======================================================= */

  if (action === "manual-complete") {
    const paymentRecordId = clean(
      body.paymentRecordId
    );

    const requestedPaymentId = clean(
      body.paymentId
    );

    const actionType = clean(body.actionType).toLowerCase() || "save";
    const cancellationNote = clean(body.cancellationNote);
    const requestedConsultationId = clean(body.consultationId);

    const bookingDate = parseDate(
      body.bookingDate
    );

    const bookingTime = parseTime(
      body.bookingTime
    );

    // Backward compatible default: existing callers that do not send
    // markCompleted continue to create/update the consultation as Completed.
    // The manual slot UI sends false when the user only wants to book/save
    // the slot and complete it later.
    const markCompleted = body.markCompleted !== false;

    if (!paymentRecordId) {
      return NextResponse.json(
        {
          error:
            "paymentRecordId is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (actionType !== "cancel" && (!bookingDate || !bookingTime)) {
      return NextResponse.json(
        {
          error:
            "A valid consultation date and time are required.",
        },
        {
          status: 400,
        }
      );
    }

    if (actionType === "cancel") {
      if (!requestedConsultationId) {
        return NextResponse.json(
          {
            error: "consultationId is required to cancel a consultation.",
          },
          {
            status: 400,
          }
        );
      }

      if (!cancellationNote) {
        return NextResponse.json(
          {
            error: "A cancellation note/reason is required.",
          },
          {
            status: 400,
          }
        );
      }
    }

    /*
     * 1. Find the EXACT payment by payments.id.
     *
     * This is deliberately not a customer lookup. The payment
     * selected in the dashboard is the identity of this
     * consultation.
     */
    const {
      data: payment,
      error: paymentError,
    } = await supabase
      .from("payments")
      .select(
        "id,payment_id,customer_id,amount,status,payment_time,payment_type,course,method,batch"
      )
      .eq("id", paymentRecordId)
      .maybeSingle();

    if (paymentError) {
      console.error(
        "Manual consultation payment lookup failed:",
        paymentError
      );

      return NextResponse.json(
        {
          error:
            paymentError.message,
          details:
            paymentError.details ?? null,
          hint:
            paymentError.hint ?? null,
        },
        {
          status: 500,
        }
      );
    }

    if (!payment) {
      return NextResponse.json(
        {
          error:
            "The selected payment could not be found.",
        },
        {
          status: 404,
        }
      );
    }

    const actualPaymentId = clean(
      payment.payment_id
    );

    /*
     * If the dashboard sent a payment_id, make sure it belongs
     * to the exact payment row that was selected.
     */
    if (
      requestedPaymentId &&
      actualPaymentId &&
      requestedPaymentId !== actualPaymentId
    ) {
      return NextResponse.json(
        {
          error:
            "The selected payment ID does not match the payment record.",
        },
        {
          status: 409,
        }
      );
    }

    if (!actualPaymentId) {
      return NextResponse.json(
        {
          error:
            "This payment does not have a payment_id, so it cannot be linked to a separate consultation.",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * This endpoint is for consultation payments only.
     */
    const course = clean(payment.course).toLowerCase();
    const paymentType = clean(payment.payment_type).toLowerCase();

    if (
      course !== "consultation" &&
      paymentType !== "consultation"
    ) {
      return NextResponse.json(
        {
          error:
            "The selected payment is not a Consultation payment.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * 2. Find the corresponding customer from the EXACT payment.
     */
    const customerId = clean(
      payment.customer_id
    );

    if (!customerId) {
      return NextResponse.json(
        {
          error:
            "The selected payment is not linked to a customer.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: customer,
      error: customerError,
    } = await supabase
      .from("customers")
      .select("id,name,email,phone")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) {
      console.error(
        "Manual consultation customer lookup failed:",
        customerError
      );

      return NextResponse.json(
        {
          error:
            customerError.message,
          details:
            customerError.details ?? null,
          hint:
            customerError.hint ?? null,
        },
        {
          status: 500,
        }
      );
    }

    if (!customer) {
      return NextResponse.json(
        {
          error:
            "The customer linked to this payment could not be found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * 3. Find consultation by payment_id ONLY.
     *
     * NEVER fall back to customer_id. One customer can have
     * multiple consultation payments and therefore multiple
     * consultation records.
     */
    const {
      data: existingConsultation,
      error: consultationLookupError,
    } = await supabase
      .from("consultations")
      .select("*")
      .eq("payment_id", actualPaymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (consultationLookupError) {
      console.error(
        "Manual consultation lookup failed:",
        consultationLookupError
      );

      return NextResponse.json(
        {
          error:
            consultationLookupError.message,
          details:
            consultationLookupError.details ?? null,
          hint:
            consultationLookupError.hint ?? null,
        },
        {
          status: 500,
        }
      );
    }

    if (actionType === "cancel") {
      if (!existingConsultation?.id) {
        return NextResponse.json(
          {
            error: "No consultation slot exists for this payment, so there is nothing to cancel.",
          },
          {
            status: 404,
          }
        );
      }

      if (String(existingConsultation.id) !== requestedConsultationId) {
        return NextResponse.json(
          {
            error: "The selected consultation does not match the selected payment.",
          },
          {
            status: 409,
          }
        );
      }

      const existingStatus = clean(existingConsultation.status);

      if (existingStatus === "Completed") {
        return NextResponse.json(
          {
            error: "A completed consultation cannot be cancelled.",
          },
          {
            status: 409,
          }
        );
      }

      if (existingStatus === "Cancelled") {
        return NextResponse.json(
          {
            error: "This consultation is already cancelled.",
          },
          {
            status: 409,
          }
        );
      }

      const completedAt = new Date().toISOString();
      const previousNotes = clean(existingConsultation.notes);
      const cancellationEntry = `Cancellation note: ${cancellationNote}`;
      const combinedNotes = previousNotes
        ? `${previousNotes}\n\n${cancellationEntry}`
        : cancellationEntry;

      const {
        data: cancelled,
        error: cancellationError,
      } = await supabase
        .from("consultations")
        .update({
          status: "Cancelled",
          completed_at: null,
          notes: combinedNotes,
          updated_at: completedAt,
        })
        .eq("id", existingConsultation.id)
        .eq("payment_id", actualPaymentId)
        .select("*")
        .single();

      if (cancellationError) {
        console.error(
          "Consultation cancellation update failed:",
          cancellationError
        );

        return NextResponse.json(
          {
            error: cancellationError.message,
            details: cancellationError.details ?? null,
            hint: cancellationError.hint ?? null,
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        ok: true,
        created: false,
        updated: true,
        cancelled: true,
        paymentRecordId: payment.id,
        paymentId: actualPaymentId,
        customerId: customer.id,
        consultation: cancelled,
      });
    }

    const completedAt =
      new Date().toISOString();

    const existingStatus = clean(
      existingConsultation?.status
    );

    const desiredStatus = markCompleted
      ? "Completed"
      : isProtectedStatus(existingStatus)
        ? existingStatus
        : "Scheduled";

    const desiredCompletedAt = markCompleted
      ? completedAt
      : existingStatus === "Completed"
        ? existingConsultation?.completed_at ?? null
        : null;

    if (existingConsultation?.id) {
      /*
       * 4. Existing consultation: update THAT consultation.
       *
       * Do not clear an existing recording. Manual completion
       * does not require one, but an already-synced recording
       * must not be destroyed.
       */
      const {
        data: updated,
        error: updateError,
      } = await supabase
        .from("consultations")
        .update({
          customer_id: customer.id,
          payment_record_id: payment.id,
          payment_id: actualPaymentId,
          student_name:
            clean(customer.name) ||
            existingConsultation.student_name ||
            "Unknown student",
          email:
            clean(customer.email) ||
            existingConsultation.email ||
            null,
          phone:
            customer.phone
              ? normalizePhone(customer.phone)
              : existingConsultation.phone || null,
          payment_amount: Number(payment.amount ?? 0),
          payment_status:
            normalizePaymentStatus(payment.status),
          payment_time:
            payment.payment_time ??
            existingConsultation.payment_time ??
            null,
          booking_date: bookingDate,
          booking_time: bookingTime,
          status: desiredStatus,
          completed_at: desiredCompletedAt,
          updated_at: completedAt,
        })
        .eq("id", existingConsultation.id)
        .eq("payment_id", actualPaymentId)
        .select("*")
        .single();

      if (updateError) {
        console.error(
          "Manual consultation update failed:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              updateError.message,
            details:
              updateError.details ?? null,
            hint:
              updateError.hint ?? null,
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        ok: true,
        created: false,
        updated: true,
        paymentRecordId: payment.id,
        paymentId: actualPaymentId,
        customerId: customer.id,
        consultation: updated,
      });
    }

    /*
     * 5. No consultation exists for this payment.
     *
     * The current consultations table requires source_sheet_id and
     * source_row. A manual consultation is not a Google Sheet row, so
     * reserve a deterministic internal source identity instead of
     * weakening the database schema.
     *
     * recording_link is intentionally NULL.
     */
    const {
      sourceSheetId,
      sourceRow,
    } = await getManualSourceIdentity(
      supabase,
      payment.id
    );

    const {
      data: created,
      error: createError,
    } = await supabase
      .from("consultations")
      .insert({
        source_sheet_id: sourceSheetId,
        source_row: sourceRow,
        customer_id: customer.id,
        payment_record_id: payment.id,
        payment_id: actualPaymentId,
        student_name:
          clean(customer.name) ||
          "Unknown student",
        email:
          clean(customer.email) || null,
        phone:
          customer.phone
            ? normalizePhone(customer.phone)
            : null,
        consultation_type: "Consultation",
        payment_amount: Number(payment.amount ?? 0),
        payment_status:
          normalizePaymentStatus(payment.status),
        payment_time:
          payment.payment_time ?? null,
        booking_date: bookingDate,
        booking_time: bookingTime,
        meet_link: null,
        recording_link: null,
        status: desiredStatus,
        completed_at: desiredCompletedAt,
        notes: "",
        follow_up_required: false,
        follow_up_date: null,
        updated_at: completedAt,
      })
      .select("*")
      .single();

    if (createError) {
      console.error(
        "Manual consultation create failed:",
        createError
      );

      return NextResponse.json(
        {
          error:
            createError.message,
          details:
            createError.details ?? null,
          hint:
            createError.hint ?? null,
          code:
            createError.code ?? null,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      created: true,
      updated: false,
      paymentRecordId: payment.id,
      paymentId: actualPaymentId,
      customerId: customer.id,
      consultation: created,
    });
  }

  /* =======================================================
     RECORDING UPDATE
  ======================================================= */

  if (
    action ===
    "recording"
  ) {
    const consultationId =
      clean(
        body.consultationId
      );

    const recordingLink =
      clean(
        body.recordingLink
      );

    if (
      !consultationId ||
      !recordingLink
    ) {
      return NextResponse.json(
        {
          error:
            "consultationId and recordingLink are required.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data:
        existingConsultation,
      error:
        existingConsultationError,
    } = await supabase
      .from("consultations")
      .select(
        "id,recording_link,status,completed_at"
      )
      .eq(
        "id",
        consultationId
      )
      .maybeSingle();

    if (
      existingConsultationError
    ) {
      return NextResponse.json(
        {
          error:
            existingConsultationError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (
      !existingConsultation
    ) {
      return NextResponse.json(
        {
          error:
            "Consultation not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Never replace an existing recording.
     */
    if (
      clean(
        existingConsultation.recording_link
      )
    ) {
      return NextResponse.json({
        ok: true,
        alreadyExists: true,
        consultation:
          existingConsultation,
      });
    }

    const update: Record<
      string,
      unknown
    > = {
      recording_link:
        recordingLink,

      updated_at:
        new Date().toISOString(),
    };

    /*
     * Recording means the consultation happened.
     *
     * But never downgrade:
     * Completed
     * Cancelled
     * No Show
     */
    if (
      !isProtectedStatus(
        existingConsultation.status
      )
    ) {
      update.status =
        "Completed";

      update.completed_at =
        existingConsultation.completed_at ||
        new Date().toISOString();
    }

    const {
      data,
      error,
    } = await supabase
      .from("consultations")
      .update(update)
      .eq(
        "id",
        consultationId
      )
      .is(
        "recording_link",
        null
      )
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Another sync may have written the
     * recording between our first lookup
     * and update.
     */
    if (!data) {
      const {
        data:
          latestConsultation,
        error:
          latestError,
      } = await supabase
        .from("consultations")
        .select("*")
        .eq(
          "id",
          consultationId
        )
        .maybeSingle();

      if (latestError) {
        return NextResponse.json(
          {
            error:
              latestError.message,
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        ok: true,
        alreadyExists:
          !!latestConsultation?.recording_link,
        consultation:
          latestConsultation,
      });
    }

    return NextResponse.json({
      ok: true,
      alreadyExists: false,
      consultation: data,
    });
  }

  /* =======================================================
     NORMAL CONSULTATION CREATION
  ======================================================= */

  const sourceSheetId =
    Number(
      body.sourceSheetId
    );

  const sourceRow =
    Number(
      body.sourceRow
    );

  const email =
    normalizeEmail(
      body.email
    );

  const formPhone =
    clean(
      body.phone
    );

  const studentName =
    clean(
      body.name
    ) ||
    "Unknown student";

  const bookingDate =
    parseDate(
      body.bookingDate
    );

  const bookingTime =
    parseTime(
      body.bookingTime
    );

  const consultationType =
    clean(
      body.consultationType
    ) || null;

  const meetLink =
    clean(
      body.meetLink
    ) || null;

  const sourceEventId =
    clean(
      body.sourceEventId
    ) || null;

  const meetCode =
    clean(
      body.meetCode
    ) || null;

  if (
    !Number.isFinite(
      sourceSheetId
    ) ||
    !Number.isFinite(
      sourceRow
    )
  ) {
    return NextResponse.json(
      {
        error:
          "sourceSheetId and sourceRow are required.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !bookingDate ||
    !bookingTime
  ) {
    return NextResponse.json(
      {
        error:
          "A valid consultation date and time are required.",
      },
      {
        status: 400,
      }
    );
  }

  /* =======================================================
     FIND CUSTOMER BY EMAIL OR PHONE
  ======================================================= */

  const match =
    await findCustomerByEmailOrPhone(
      supabase,
      email,
      formPhone
    );

  const customer =
    match.customer;

  /*
   * Customer not found is NOT an error.
   *
   * Consultation will still be created.
   */
  const payment =
    customer?.id
      ? await findConsultationPayment(
          supabase,
          customer.id
        )
      : null;

  /*
   * Find the existing consultation BEFORE
   * constructing the payload.
   *
   * This is critical for status persistence.
   */
  const existing =
    await findExistingConsultation(
      supabase,
      sourceSheetId,
      sourceRow,
      sourceEventId
    );

  const payload: Record<
    string,
    unknown
  > = {
    source_sheet_id:
      sourceSheetId,

    source_row:
      sourceRow,

    customer_id:
      customer?.id ??
      existing?.customer_id ??
      null,

    payment_record_id:
      payment?.id ??
      existing?.payment_record_id ??
      null,

    payment_id:
      payment?.payment_id ??
      existing?.payment_id ??
      null,

    /*
     * Always preserve Google Form name.
     */
    student_name:
      studentName,

    email:
      email ||
      existing?.email ||
      null,

    /*
     * Store normalized phone.
     */
    phone:
      formPhone
        ? normalizePhone(
            formPhone
          )
        : customer?.phone
          ? normalizePhone(
              customer.phone
            )
          : existing?.phone ??
            null,

    consultation_type:
      consultationType,

    payment_amount:
      Number(
        payment?.amount ??
          existing?.payment_amount ??
          0
      ),

    payment_status:
      payment
        ? normalizePaymentStatus(
            payment.status
          )
        : existing?.payment_status ??
          "Pending",

    payment_time:
      payment?.payment_time ??
      existing?.payment_time ??
      null,

    booking_date:
      bookingDate,

    booking_time:
      bookingTime,

    meet_link:
      meetLink,

    source_event_id:
      sourceEventId,

    meet_code:
      meetCode,

    updated_at:
      new Date().toISOString(),
  };

  /* =======================================================
     STATUS PERSISTENCE
  ======================================================= */

  /*
   * NEW:
   * Scheduled.
   */
  if (!existing) {
    payload.status =
      "Scheduled";
  } else {
    /*
     * Existing status is protected.
     *
     * This prevents:
     *
     * Completed -> Scheduled
     * Cancelled -> Scheduled
     * No Show -> Scheduled
     */
    if (
      isProtectedStatus(
        existing.status
      )
    ) {
      payload.status =
        existing.status;

      /*
       * Preserve completed_at.
       */
      if (
        existing.completed_at
      ) {
        payload.completed_at =
          existing.completed_at;
      }
    } else if (
      isKnownStatus(
        existing.status
      )
    ) {
      /*
       * Preserve:
       *
       * Pending
       * Scheduled
       * In Progress
       */
      payload.status =
        existing.status;
    } else {
      payload.status =
        "Scheduled";
    }
  }

  /* =======================================================
     UPSERT
  ======================================================= */

  const {
    data,
    error,
  } = await supabase
    .from("consultations")
    .upsert(
      payload,
      {
        onConflict:
          "source_sheet_id,source_row",
      }
    )
    .select("*")
    .single();

  if (error) {
    console.error(
      "Consultation sync failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message,

        details:
          error.details ??
          null,

        hint:
          error.hint ??
          null,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    ok: true,

    customerFound:
      !!customer,

    matchedBy:
      match.matchedBy,

    customerConflict:
      match.conflict,

    paymentFound:
      !!payment,

    paymentStatus:
      payment
        ? normalizePaymentStatus(
            payment.status
          )
        : existing?.payment_status ??
          "Pending",

    consultation:
      data,
  });
}