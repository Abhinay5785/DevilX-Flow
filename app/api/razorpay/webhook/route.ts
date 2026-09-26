import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { createClient } from "@/lib/supabase/server";

import { queueEmailAutomationsForPayment } from "@/lib/automations/email-engine";

export const runtime = "nodejs";

/*
 * ===========================================================
 * DEVILX FLOW - RAZORPAY WEBHOOK
 * ===========================================================
 *
 * Razorpay webhook:
 *
 *   https://YOUR-DOMAIN.com/api/razorpay/webhook
 *
 * Main flow:
 *
 * Razorpay payload
 *       ↓
 * Extract customer details
 *       ↓
 * Extract course + batch from notes
 *       ↓
 * Resolve course in DevilX
 *       ↓
 * Resolve exact batch
 *       ↓
 * Find or create customer
 *       ↓
 * payments.customer_id = customers.id
 *       ↓
 * Save payment-specific course/batch
 *
 * IMPORTANT:
 * - Signature is verified against RAW request body.
 * - x-razorpay-event-id is used for idempotency.
 * - Each payment stores its own course and batch.
 * - Customer's current course is NOT used to route a payment.
 */

/* ===========================================================
 * SIGNATURE
 * =========================================================== */

function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
) {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

/* ===========================================================
 * HELPERS
 * =========================================================== */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCourse(value: unknown) {
  const course = clean(value).replace(/\s+/g, " ");
  if (course.toLowerCase() === "consultation") {
    return "Consultation";
  }
  return course;
}

function isConsultationCourse(value: unknown) {
  return normalizeCourse(value).toLowerCase() === "consultation";
}

function normalizePhone(value: unknown) {
  const digits = clean(value).replace(/\D/g, "");
  return digits ? digits.slice(-15) : "";
}

function normalizeStatus(value: unknown) {
  const status = clean(value).toLowerCase();

  if (status === "captured" || status === "paid") {
    return "captured";
  }

  if (
    status === "failed" ||
    status === "failure" ||
    status === "cancelled"
  ) {
    return "failed";
  }

  return status || "pending";
}

function unixToIso(value: unknown) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return new Date().toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

/* ===========================================================
 * METADATA EXTRACTION
 * ===========================================================
 *
 * Razorpay can put notes in:
 *
 * payment_link.notes
 * payment.notes
 * order.notes
 *
 * The live payload you provided contains:
 *
 * payment.notes.course = "Consultation"
 */

function getMetadata(
  paymentLink: any,
  payment: any,
  order: any,
) {
  const sources = [
    paymentLink?.notes,
    payment?.notes,
    order?.notes,
  ].filter(Boolean);

  const getNote = (...keys: string[]) => {
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;

      for (const key of keys) {
        if (
          source[key] !== undefined &&
          source[key] !== null &&
          clean(source[key]) !== ""
        ) {
          return clean(source[key]);
        }
      }
    }

    return "";
  };

  return {
    course: normalizeCourse(
      getNote(
        "course",
        "Course",
        "course_name",
        "courseName",
        "program",
        "program_name",
      ),
    ),

    batch: getNote(
      "batch",
      "Batch",
      "batch_name",
      "batchName",
      "cohort",
    ),

    age: getNote(
      "age",
      "Age",
    ),

    city: getNote(
      "city",
      "City",
    ),

    paymentType: getNote(
      "payment_type",
      "paymentType",
      "type",
    ),

    date: getNote(
      "date",
      "Date",
      "start_date",
      "startDate",
    ),
  };
}

/* ===========================================================
 * CUSTOMER DETAILS
 * =========================================================== */

function getCustomerDetails(
  payment: any,
  paymentLink: any,
) {
  const paymentContact = payment?.contact;
  const paymentEmail = payment?.email;

  const linkCustomer = paymentLink?.customer || {};

  return {
    name: clean(
      payment?.notes?.name ||
      payment?.notes?.customer_name ||
      paymentLink?.notes?.name ||
      linkCustomer?.name,
    ),

    phone: normalizePhone(
      paymentContact ||
      payment?.contact ||
      payment?.notes?.phone ||
      paymentLink?.notes?.phone ||
      linkCustomer?.contact,
    ),

    email: clean(
      paymentEmail ||
      payment?.notes?.email ||
      paymentLink?.notes?.email ||
      linkCustomer?.email,
    ).toLowerCase(),
  };
}

/* ===========================================================
 * POST WEBHOOK
 * =========================================================== */

export async function POST(request: NextRequest) {
  /* =========================================================
   * ENV
   * ========================================================= */

  const secret =
    process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error(
      "RAZORPAY_WEBHOOK_SECRET is not configured.",
    );

    return NextResponse.json(
      {
        error: "Webhook is not configured.",
      },
      { status: 500 },
    );
  }

  /* =========================================================
   * RAW BODY
   * ========================================================= */

  const rawBody = await request.text();

  const signature =
    request.headers.get("x-razorpay-signature");

  /* =========================================================
   * VERIFY SIGNATURE
   * ========================================================= */

  if (
    !verifySignature(
      rawBody,
      signature,
      secret,
    )
  ) {
    console.error(
      "Invalid Razorpay webhook signature.",
    );

    return NextResponse.json(
      {
        error: "Invalid webhook signature.",
      },
      { status: 401 },
    );
  }

  /* =========================================================
   * PARSE JSON
   * ========================================================= */

  let body: any;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON payload.",
      },
      { status: 400 },
    );
  }

  /* =========================================================
   * EVENT
   * ========================================================= */

  const eventId =
    request.headers.get("x-razorpay-event-id") ||
    clean(body?.id);

  const event = clean(body?.event);

  /* =========================================================
   * SUPPORTED EVENTS
   * ========================================================= */

  const supportedEvents = new Set([
    "payment.captured",
    "payment.failed",
    "payment_link.paid",
    "payment_link.partially_paid",
  ]);

  if (!supportedEvents.has(event)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      event,
    });
  }

  /* =========================================================
   * SUPABASE
   * ========================================================= */

  const supabase = await createClient();

  /* =========================================================
   * IDEMPOTENCY
   * ========================================================= */

  if (eventId) {
    const { data: existingEvent } =
      await supabase
        .from("razorpay_webhook_events")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();

    if (existingEvent) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
      });
    }
  }

  /* =========================================================
   * RAZORPAY ENTITIES
   * ========================================================= */

  const payment =
    body?.payload?.payment?.entity || null;

  const order =
    body?.payload?.order?.entity || null;

  const paymentLink =
    body?.payload?.payment_link?.entity || null;

  const effectivePayment =
    payment ||
    body?.payload?.payment?.entity ||
    null;

  if (!effectivePayment) {
    return NextResponse.json(
      {
        error: "Payment entity not found.",
      },
      { status: 400 },
    );
  }

  /* =========================================================
   * PAYMENT ID
   * ========================================================= */

  const paymentId = clean(
    effectivePayment.id,
  );

  if (!paymentId) {
    return NextResponse.json(
      {
        error: "Payment ID not found.",
      },
      { status: 400 },
    );
  }

  /* =========================================================
   * PAYMENT STATUS
   * ========================================================= */

  const status =
    event === "payment.failed"
      ? "failed"
      : event === "payment_link.partially_paid"
        ? "captured"
        : normalizeStatus(
            effectivePayment.status ||
            paymentLink?.status,
          );

  /* =========================================================
   * PAYMENT AMOUNT
   * ========================================================= */

  const amount =
    Number(effectivePayment.amount || 0) / 100;

  /* =========================================================
   * PAYMENT METHOD
   * ========================================================= */

  const method =
    clean(effectivePayment.method);

  /* =========================================================
   * FAILED REASON
   * ========================================================= */

  const failedReason =
    event === "payment.failed"
      ? clean(
          effectivePayment.error_description ||
          effectivePayment.error_reason ||
          effectivePayment.error_code,
        )
      : "";

  /* =========================================================
   * PAYMENT TIME
   * ========================================================= */

  const paymentTime = unixToIso(
    effectivePayment.created_at ||
    body?.created_at,
  );

  /* =========================================================
   * CUSTOMER DETAILS
   * ========================================================= */

  const customerDetails =
    getCustomerDetails(
      effectivePayment,
      paymentLink,
    );

  /* =========================================================
   * COURSE / BATCH METADATA
   * ========================================================= */

  const metadata = getMetadata(
    paymentLink,
    effectivePayment,
    order,
  );

  console.log(
    "Razorpay metadata:",
    JSON.stringify(
      {
        paymentId,
        course: metadata.course,
        batch: metadata.batch,
        customer: customerDetails,
      },
      null,
      2,
    ),
  );

  console.log(
    "RAZORPAY NOTES SOURCE:",
    JSON.stringify(
      {
        paymentId,
        event,
        notes: effectivePayment?.notes || null,
      },
      null,
      2,
    ),
  );

  /* =========================================================
   * PAYMENT TYPE
   * ========================================================= */

  function calculatePaymentType(
    paymentAmount: number,
    batchRecord: any,
  ): string | null {
    const advanceAmount =
      Number(batchRecord?.advance_amount);

    const balanceAmount =
      Number(batchRecord?.balance_amount);

    const fullAmount =
      Number(batchRecord?.full_amount);

    if (
      Number.isFinite(advanceAmount) &&
      advanceAmount > 0 &&
      Math.abs(
        paymentAmount - advanceAmount,
      ) <= 0.01
    ) {
      return "advance";
    }

    if (
      Number.isFinite(balanceAmount) &&
      balanceAmount > 0 &&
      Math.abs(
        paymentAmount - balanceAmount,
      ) <= 0.01
    ) {
      return "balance";
    }

    if (
      Number.isFinite(fullAmount) &&
      fullAmount > 0 &&
      Math.abs(
        paymentAmount - fullAmount,
      ) <= 0.01
    ) {
      return "full";
    }

    return null;
  }

  /* =========================================================
   * AMOUNT ERROR
   * ========================================================= */

  function getBatchAmountError(
    paymentAmount: number,
    batchRecord: any,
    courseName: string,
  ) {
    const advanceAmount =
      Number(batchRecord?.advance_amount);

    const balanceAmount =
      Number(batchRecord?.balance_amount);

    const fullAmount =
      Number(batchRecord?.full_amount);

    return (
      `Amount ₹${paymentAmount.toFixed(2)} ` +
      `does not match Advance ₹${advanceAmount.toFixed(2)}, ` +
      `Balance ₹${balanceAmount.toFixed(2)}, or ` +
      `Full ₹${fullAmount.toFixed(2)} for ` +
      `${courseName} / ${batchRecord.name}. ` +
      `Payment saved without a guessed payment type.`
    );
  }

  /* =========================================================
   * ROUTING
   * ========================================================= */

  let resolvedCourse: string | null =
    metadata.course || null;

  let resolvedBatch: string | null =
    metadata.batch || null;

  let resolvedPaymentType: string | null =
    null;

  let routingStatus = "unmatched";

  let routingError = "";

  /* =========================================================
   * CAPTURED PAYMENT ROUTING
   * =========================================================
   *
   * IMPORTANT:
   * - Course and batch explicitly supplied by Razorpay notes are the
   *   source of truth for the payment.
   * - Course/batch resolution is independent of payment amount.
   * - Payment type (advance/balance/full) is calculated separately.
   * - If the amount does not match a configured amount, we KEEP the
   *   Razorpay course/batch instead of throwing the batch away.
   * - Customer course/batch is updated from this payment's explicit
   *   Razorpay metadata; it is never used to route the payment.
   */

  if (status === "captured") {
    if (!metadata.course) {
      resolvedCourse = null;
      resolvedBatch = null;
      resolvedPaymentType = null;
      routingStatus = "unmatched";
      routingError =
        "No Course was supplied in Razorpay notes. Payment course/batch could not be resolved.";
    } else {
      // Start with the explicit Razorpay values. They must not be
      // discarded merely because payment-type calculation fails.
      resolvedCourse = metadata.course;
      resolvedBatch = metadata.batch || null;

      const { data: courseRecord, error: courseLookupError } =
        await supabase
          .from("courses")
          .select("id,name,status")
          .ilike("name", metadata.course)
          .limit(1)
          .maybeSingle();

      if (courseLookupError) {
        console.error("Course lookup failed:", courseLookupError);
        routingStatus = "unmatched";
        routingError =
          `DevilX course lookup failed. Razorpay Course "${metadata.course}" and Batch "${metadata.batch || ""}" were preserved.`;
      } else if (!courseRecord) {
        routingStatus = "unmatched";
        routingError =
          `Course "${metadata.course}" does not exist in DevilX. Razorpay Course/Batch were preserved.`;
      } else {
        // Use the canonical DevilX course name after successful lookup.
        resolvedCourse = normalizeCourse(courseRecord.name);

        if (isConsultationCourse(resolvedCourse)) {
          resolvedCourse = "Consultation";
          resolvedBatch = null;
          resolvedPaymentType = null;
          routingStatus = "matched";
          routingError = "";
        } else if (!metadata.batch) {
          resolvedBatch = null;
          resolvedPaymentType = null;
          routingStatus = "unmatched";
          routingError =
            `No Batch was supplied for course "${resolvedCourse}". Payment course was saved, but no batch was assigned.`;
        } else {
          // Batch must belong to the matched course.
          const { data: batchRecord, error: batchLookupError } =
            await supabase
              .from("course_batches")
              .select(
                "id,name,course_id,status,advance_amount,balance_amount,full_amount",
              )
              .eq("course_id", courseRecord.id)
              .ilike("name", metadata.batch)
              .limit(1)
              .maybeSingle();

          if (batchLookupError) {
            console.error("Batch lookup failed:", batchLookupError);
            resolvedBatch = metadata.batch;
            resolvedPaymentType = null;
            routingStatus = "unmatched";
            routingError =
              `Batch lookup failed for course "${resolvedCourse}". Razorpay Batch "${metadata.batch}" was preserved.`;
          } else if (!batchRecord) {
            resolvedBatch = metadata.batch;
            resolvedPaymentType = null;
            routingStatus = "unmatched";
            routingError =
              `Batch "${metadata.batch}" does not exist under course "${resolvedCourse}". Razorpay Batch was preserved.`;
          } else if (batchRecord.status !== "active") {
            // Keep the explicit payload value even if the DevilX batch is inactive.
            resolvedBatch = batchRecord.name;
            resolvedPaymentType = null;
            routingStatus = "unmatched";
            routingError =
              `Batch "${batchRecord.name}" under course "${resolvedCourse}" is inactive. Razorpay Course/Batch were preserved.`;
          } else {
            resolvedBatch = batchRecord.name;

            // IMPORTANT: payment type is independent from course/batch.
            // An amount mismatch must NOT erase course or batch.
            const calculatedPaymentType = calculatePaymentType(
              amount,
              batchRecord,
            );

            if (calculatedPaymentType) {
              resolvedPaymentType = calculatedPaymentType;
              routingStatus = "matched";
              routingError = "";
            } else {
              resolvedPaymentType = null;
              routingStatus = "matched";
              routingError = getBatchAmountError(
                amount,
                batchRecord,
                resolvedCourse,
              );
            }
          }
        }
      }
    }
  }

  /* =========================================================
   * FAILED / NON-CAPTURED PAYMENT
   * ========================================================= */

  else {
    resolvedCourse = normalizeCourse(metadata.course) || null;
    resolvedBatch = metadata.batch || null;
    resolvedPaymentType = null;
    routingStatus = "not_applicable";
  }

  /* =========================================================
   * FIND CUSTOMER
   * =========================================================
   *
   * IDENTITY RULE:
   * 1. Phone is the primary identifier.
   * 2. If phone does not match, email is the fallback identifier.
   * 3. If email matches an existing customer, NEVER create a duplicate
   *    just because the phone number changed.
   * 4. If both phone and email match different customers, treat it as
   *    an identity conflict and do NOT silently merge them.
   * 5. Name is only used when neither phone nor email identifies a
   *    customer, preserving the existing fallback behavior.
   */

  let customer: any = null;
  let phoneCustomer: any = null;
  let emailCustomer: any = null;

  const customerSelect =
    "id,name,age,city,phone,email,course,batch,custom_fields";

  /* =========================================================
   * FIND BY PHONE
   * ========================================================= */

  if (customerDetails.phone) {
    const { data: phoneMatch, error: phoneLookupError } =
      await supabase
        .from("customers")
        .select(customerSelect)
        .eq("phone", customerDetails.phone)
        .limit(1)
        .maybeSingle();

    if (phoneLookupError) {
      console.error(
        "Customer phone lookup failed:",
        phoneLookupError,
      );
    } else {
      phoneCustomer = phoneMatch;
    }
  }

  /* =========================================================
   * FIND BY EMAIL
   * =========================================================
   *
   * We intentionally check email even when a phone match exists.
   * This lets us detect the dangerous case where the phone belongs
   * to one customer and the email belongs to another customer.
   */

  if (customerDetails.email) {
    const { data: emailMatch, error: emailLookupError } =
      await supabase
        .from("customers")
        .select(customerSelect)
        .eq("email", customerDetails.email)
        .limit(1)
        .maybeSingle();

    if (emailLookupError) {
      console.error(
        "Customer email lookup failed:",
        emailLookupError,
      );
    } else {
      emailCustomer = emailMatch;
    }
  }

  /* =========================================================
   * RESOLVE PHONE / EMAIL IDENTITY
   * ========================================================= */

  if (
    phoneCustomer &&
    emailCustomer &&
    phoneCustomer.id !== emailCustomer.id
  ) {
    /*
     * Phone and email point to different customers.
     * Never silently merge two customer records.
     */
    console.error(
      "CUSTOMER IDENTITY CONFLICT:",
      JSON.stringify(
        {
          phone: customerDetails.phone,
          email: customerDetails.email,
          phone_customer_id: phoneCustomer.id,
          email_customer_id: emailCustomer.id,
        },
        null,
        2,
      ),
    );

    return NextResponse.json(
      {
        error:
          "Customer identity conflict: phone and email belong to different customers.",
        phone_customer_id: phoneCustomer.id,
        email_customer_id: emailCustomer.id,
        phone: customerDetails.phone,
        email: customerDetails.email,
      },
      { status: 409 },
    );
  }

  /*
   * If phone matches, phone wins.
   * If phone does not match but email matches, email identifies
   * the existing customer. This is what prevents duplicates when
   * a customer changes their phone number.
   */
  customer =
    phoneCustomer ||
    emailCustomer ||
    null;

  /* =========================================================
   * FIND BY NAME
   * =========================================================
   *
   * Name remains the final fallback only when neither phone nor
   * email found a customer.
   */

  if (
    !customer &&
    customerDetails.name
  ) {
    const { data: nameMatch, error: nameLookupError } =
      await supabase
        .from("customers")
        .select(customerSelect)
        .ilike(
          "name",
          customerDetails.name,
        )
        .limit(1)
        .maybeSingle();

    if (nameLookupError) {
      console.error(
        "Customer name lookup failed:",
        nameLookupError,
      );
    } else {
      customer = nameMatch;
    }
  }

  /* =========================================================
   * CUSTOMER CUSTOM FIELDS
   * ========================================================= */

  const customFields = {
    ...(customer?.custom_fields || {}),

    ...(paymentLink
      ? {
          razorpay_payment_link_id:
            clean(paymentLink.id),
        }
      : {}),

    ...(resolvedPaymentType
      ? {
          payment_type:
            resolvedPaymentType,
        }
      : {}),

    routing_status:
      routingStatus,

    ...(routingError
      ? {
          routing_error:
            routingError,
        }
      : {}),
  };

  /* =========================================================
   * CREATE CUSTOMER
   * ========================================================= */

  if (!customer) {
    const {
      data: createdCustomer,
      error,
    } = await supabase
      .from("customers")
      .insert({
        name:
          customerDetails.name ||
          "Razorpay Customer",

        age:
          metadata.age
            ? Number(metadata.age)
            : null,

        city:
          metadata.city || null,

        phone:
          customerDetails.phone ||
          null,

        email:
          customerDetails.email ||
          null,

        /*
         * CUSTOMER CURRENT COURSE
         */
        course:
          resolvedCourse ||
          null,

        batch:
          isConsultationCourse(resolvedCourse)
            ? null
            : resolvedBatch || null,

        custom_fields:
          customFields,
      })
      .select(
        "id,name,course,batch",
      )
      .single();

    if (error) {
      console.error(
        "Failed to create Razorpay customer:",
        error,
      );

      return NextResponse.json(
        {
          error:
            "Failed to create customer.",
          details:
            error.message,
        },
        { status: 500 },
      );
    }

    customer =
      createdCustomer;

    console.log(
      "Created customer:",
      JSON.stringify(
        customer,
        null,
        2,
      ),
    );
  }

  /* =========================================================
   * UPDATE EXISTING CUSTOMER
   * =========================================================
   *
   * IMPORTANT:
   *
   * We update the customer's course/batch when the
   * webhook has an explicit course/batch.
   *
   * The PAYMENT itself still stores its own course/batch.
   */

  else {
    const updatePayload: Record<
      string,
      any
    > = {
      custom_fields:
        customFields,
    };

    if (
      !customer.name &&
      customerDetails.name
    ) {
      updatePayload.name =
        customerDetails.name;
    }

    /*
     * If the customer was found by EMAIL and the phone changed,
     * update the customer's phone to the latest normalized phone.
     *
     * If the customer was found by PHONE and the email changed,
     * keep the existing customer email. A changed Razorpay email
     * must never create another customer.
     */
    if (
      customerDetails.phone &&
      customer.phone !== customerDetails.phone
    ) {
      updatePayload.phone =
        customerDetails.phone;
    }

    /*
     * Only fill an empty email. Never replace an existing email
     * merely because Razorpay supplied a different email.
     */
    if (
      !customer.email &&
      customerDetails.email
    ) {
      updatePayload.email =
        customerDetails.email;
    }

    if (
      (customer.age === null ||
        customer.age === undefined ||
        customer.age === "") &&
      metadata.age
    ) {
      updatePayload.age =
        Number(metadata.age);
    }

    if (
      (!customer.city ||
        clean(customer.city) === "") &&
      metadata.city
    ) {
      updatePayload.city =
        metadata.city;
    }

    /*
     * If Razorpay explicitly gives a course,
     * update the customer's current course.
     */
    if (resolvedCourse || metadata.course) {
      updatePayload.course =
        normalizeCourse(resolvedCourse || metadata.course);
    }

    /*
     * Consultation is intentionally course-level.
     * Clear the customer's current batch.
     */
    if (isConsultationCourse(resolvedCourse || metadata.course)) {
      updatePayload.batch = null;
    } else if (resolvedBatch || metadata.batch) {
      updatePayload.batch = resolvedBatch || metadata.batch;
    }

    const { error } =
      await supabase
        .from("customers")
        .update(updatePayload)
        .eq(
          "id",
          customer.id,
        );

    if (error) {
      console.error(
        "Failed to update Razorpay customer:",
        error,
      );

      return NextResponse.json(
        {
          error:
            "Failed to update customer.",
          details:
            error.message,
        },
        { status: 500 },
      );
    }
  }

  /* =========================================================
   * FINAL PAYMENT COURSE / BATCH
   * =========================================================
   *
   * The payment row is the historical source of truth.
   * Never fall back to the customer's current course/batch.
   */

  // Preserve explicit Razorpay course/batch values even if DevilX
  // lookup/routing was unsuccessful. Never fall back to the customer's
  // old course or batch.
  const paymentCourse =
    normalizeCourse(resolvedCourse || metadata.course) || null;

  const paymentBatch =
    isConsultationCourse(paymentCourse)
      ? null
      : (resolvedBatch || metadata.batch || null);

  /* =========================================================
   * PAYMENT COURSE / BATCH SAFETY
   * =========================================================
   *
   * IMPORTANT:
   * - A payment is a historical transaction.
   * - Its course/batch MUST come from the Razorpay payment's own
   *   metadata, resolved against DevilX.
   * - Never copy course/batch from the existing customer.
   * - This applies even when the customer already exists.
   * - For non-Consultation payments, do not save an incomplete
   *   payment without a course or batch.
   */
  if (status === "captured" && !paymentCourse) {
    console.error(
      "PAYMENT REJECTED: course is missing from Razorpay metadata.",
      { paymentId, metadata },
    );

    return NextResponse.json(
      {
        error: "Payment course is missing. Add the course to Razorpay notes before processing this payment.",
        payment_id: paymentId,
      },
      { status: 422 },
    );
  }

  if (
    status === "captured" &&
    !isConsultationCourse(paymentCourse) &&
    !paymentBatch
  ) {
    console.error(
      "PAYMENT REJECTED: batch is missing from Razorpay metadata.",
      { paymentId, paymentCourse, metadata },
    );

    return NextResponse.json(
      {
        error: "Payment batch is missing. Add the batch to Razorpay notes before processing this payment.",
        payment_id: paymentId,
        course: paymentCourse,
      },
      { status: 422 },
    );
  }

  console.log(
    "FINAL PAYMENT DATA:",
    JSON.stringify(
      {
        paymentId,
        customerId:
          customer.id,
        amount,
        status,
        course:
          paymentCourse,
        batch:
          paymentBatch,
        paymentType:
          resolvedPaymentType,
      },
      null,
      2,
    ),
  );

  /* =========================================================
   * PAYMENT PAYLOAD
   * ========================================================= */

  const paymentPayload = {
    /*
     * THIS IS THE RELATION:
     *
     * payments.customer_id
     *        ↓
     * customers.id
     */
    customer_id:
      customer.id,

    payment_id:
      paymentId,

    amount,

    status,

    method:
      method || null,

    payment_time:
      paymentTime,

    failed_reason:
      failedReason || null,

    /*
     * PAYMENT-SPECIFIC COURSE
     */
    course:
      paymentCourse,

    /*
     * PAYMENT-SPECIFIC BATCH
     */
    batch:
      paymentBatch,

    /*
     * PAYMENT-SPECIFIC TYPE
     */
    payment_type:
      resolvedPaymentType || null,
  };

  /* =========================================================
   * SAVE / UPSERT PAYMENT
   * ========================================================= */

  const {
    data: savedPayment,
    error: paymentError,
  } = await supabase
    .from("payments")
    .upsert(
      paymentPayload,
      {
        onConflict:
          "payment_id",
      },
    )
    .select(
      "id,payment_id,customer_id,amount,status,course,batch,payment_type",
    )
    .single();

  /*
   * Explicitly verify that the payment row contains the course/batch
   * belonging to THIS payment. We never repair it from customers.
   * This is intentionally payment-specific even when the customer is old.
   */
  if (
    paymentError === null &&
    savedPayment &&
    (savedPayment.course !== paymentCourse ||
      savedPayment.batch !== paymentBatch)
  ) {
    console.error(
      "PAYMENT COURSE/BATCH MISMATCH AFTER UPSERT. Retrying explicit update.",
      {
        paymentId,
        expectedCourse: paymentCourse,
        savedCourse: savedPayment.course,
        expectedBatch: paymentBatch,
        savedBatch: savedPayment.batch,
      },
    );

    const { data: repairedPayment, error: repairError } =
      await supabase
        .from("payments")
        .update({
          course: paymentCourse,
          batch: paymentBatch,
        })
        .eq("payment_id", paymentId)
        .select(
          "id,payment_id,customer_id,amount,status,course,batch,payment_type",
        )
        .single();

    if (repairError) {
      console.error(
        "Failed to repair payment course/batch:",
        repairError,
      );

      return NextResponse.json(
        {
          error: "Payment was saved but course/batch could not be verified.",
          details: repairError.message,
          payment_id: paymentId,
        },
        { status: 500 },
      );
    }

    if (repairedPayment) {
      savedPayment.course = repairedPayment.course;
      savedPayment.batch = repairedPayment.batch;
    }
  }

  if (
    paymentError === null &&
    savedPayment &&
    (savedPayment.course !== paymentCourse ||
      savedPayment.batch !== paymentBatch)
  ) {
    return NextResponse.json(
      {
        error: "Payment course/batch verification failed.",
        payment_id: paymentId,
        expected_course: paymentCourse,
        expected_batch: paymentBatch,
        saved_course: savedPayment.course,
        saved_batch: savedPayment.batch,
      },
      { status: 500 },
    );
  }

  if (paymentError) {
    console.error(
      "Failed to save Razorpay payment:",
      paymentError,
    );

    return NextResponse.json(
      {
        error:
          "Failed to save payment.",
        details:
          paymentError.message,
      },
      { status: 500 },
    );
  }

  /* =========================================================
   * VERIFY PAYMENT DATA
   * =========================================================
   *
   * Read the saved row back for debugging. We do not repair an
   * unmatched payment using customer data.
   */

  const {
    data: verifiedPayment,
    error: verifyPaymentError,
  } = await supabase
    .from("payments")
    .select(
      "id,payment_id,customer_id,course,batch,payment_type",
    )
    .eq(
      "payment_id",
      paymentId,
    )
    .maybeSingle();

  if (verifyPaymentError) {
    console.error(
      "Payment verification failed:",
      verifyPaymentError,
    );
  }

  /* =========================================================
   * EMAIL AUTOMATIONS
   * =========================================================
   *
   * The payment has now been successfully saved and verified.
   * Queue matching email automations here. The automation engine
   * does NOT send the email directly; it creates an automation job
   * for the email worker/processor.
   */

  let emailAutomationResult: any = null;

  if (savedPayment && savedPayment.status === "captured") {
    try {
      emailAutomationResult =
        await queueEmailAutomationsForPayment(savedPayment.id);

      console.log(
        "EMAIL AUTOMATION RESULT:",
        JSON.stringify(
          {
            paymentId: savedPayment.id,
            ...emailAutomationResult,
          },
          null,
          2,
        ),
      );
    } catch (automationError) {
      console.error(
        "Email automation processing failed:",
        automationError,
      );
    }
  }

  /* =========================================================
   * WEBHOOK EVENT LOG
   * =========================================================
   *
   * Only record event after business data is saved.
   */

  if (eventId) {
    const {
      error: eventError,
    } = await supabase
      .from("razorpay_webhook_events")
      .insert({
        event_id:
          eventId,

        event,

        payment_id:
          paymentId,

        payload:
          body,
      });

    if (eventError) {
      console.error(
        "Webhook event log insert failed:",
        eventError,
      );
    }
  }

  /* =========================================================
   * RESPONSE
   * ========================================================= */

  return NextResponse.json({
    ok: true,

    event,

    payment_id:
      paymentId,

    customer_id:
      customer.id,

    course:
      paymentCourse,

    batch:
      paymentBatch,

    payment_type:
      resolvedPaymentType ||
      null,

    routing_status:
      routingStatus,

    ...(routingError
      ? {
          routing_error:
            routingError,
        }
      : {}),

    saved_payment:
      savedPayment || null,
  });
}

/* ===========================================================
 * GET
 * =========================================================== */

export async function GET() {
  return NextResponse.json({
    ok: true,
    service:
      "DevilX Flow Razorpay webhook",
  });
}