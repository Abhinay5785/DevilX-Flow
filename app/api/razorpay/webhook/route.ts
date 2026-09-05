import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/*
 * Razorpay Webhook
 *
 * Configure Razorpay to POST to:
 *   https://YOUR-DOMAIN.com/api/razorpay/webhook
 *
 * IMPORTANT:
 * - Keep the webhook secret in an environment variable.
 * - We verify the signature against the RAW request body.
 * - We use x-razorpay-event-id for idempotency.
 */

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

function clean(value: unknown) {
  return String(value ?? "").trim();
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

/*
 * Course and Batch should ideally be supplied through Razorpay Payment Link
 * notes/reference_id. This function supports common note names.
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
        if (source[key] !== undefined && source[key] !== null) {
          return clean(source[key]);
        }
      }
    }

    return "";
  };

  return {
    course: getNote(
      "course",
      "Course",
      "course_name",
      "courseName",
    ),
    batch: getNote(
      "batch",
      "Batch",
      "batch_name",
      "batchName",
      "cohort",
    ),
    paymentType: getNote(
      "payment_type",
      "paymentType",
      "type",
    ),
  };
}

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
      linkCustomer?.contact,
    ),
    email: clean(
      paymentEmail ||
      linkCustomer?.email,
    ).toLowerCase(),
  };
}

export async function POST(request: NextRequest) {
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

  /*
   * Razorpay requires signature validation against
   * the exact raw request body.
   */
  const rawBody = await request.text();

  const signature =
    request.headers.get("x-razorpay-signature");

  if (
    !verifySignature(
      rawBody,
      signature,
      secret,
    )
  ) {
    return NextResponse.json(
      {
        error: "Invalid webhook signature.",
      },
      { status: 401 },
    );
  }

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

  const eventId =
    request.headers.get("x-razorpay-event-id") ||
    clean(body?.id);

  const event = clean(body?.event);

  /*
   * Ignore events that this endpoint does not need.
   * Razorpay can be configured with only the relevant events,
   * but keeping this guard makes the endpoint safer.
   */
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

  const supabase = createClient();

  /*
   * Idempotency:
   * Razorpay can retry a webhook. Store the event ID so the same
   * payment is not inserted twice.
   *
   * This requires the migration file supplied with this implementation.
   */
  if (eventId) {
    const { data: existingEvent } = await supabase
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

  const payment =
    body?.payload?.payment?.entity || null;

  const order =
    body?.payload?.order?.entity || null;

  const paymentLink =
    body?.payload?.payment_link?.entity || null;

  /*
   * For payment_link.paid / partially_paid, the payload can contain
   * order + payment + payment_link. For payment events, payment is
   * the primary entity.
   */
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

  const status =
    event === "payment.failed"
      ? "failed"
      : event === "payment_link.partially_paid"
        ? "captured"
        : normalizeStatus(
            effectivePayment.status ||
            paymentLink?.status,
          );

  const amount =
    Number(effectivePayment.amount || 0) / 100;

  const method =
    clean(effectivePayment.method);

  const failedReason =
    event === "payment.failed"
      ? clean(
          effectivePayment.error_description ||
          effectivePayment.error_reason ||
          effectivePayment.error_code,
        )
      : "";

  const paymentTime = unixToIso(
    effectivePayment.created_at ||
    body?.created_at,
  );

  const customerDetails =
    getCustomerDetails(
      effectivePayment,
      paymentLink,
    );

  const metadata = getMetadata(
    paymentLink,
    effectivePayment,
    order,
  );

  /*
   * Find customer using the same priority used by the import flow:
   * phone -> email -> name.
   */
  let customer: any = null;

  if (customerDetails.phone) {
    const { data } = await supabase
      .from("customers")
      .select(
        "id, name, age, city, phone, email, course, batch, custom_fields",
      )
      .eq("phone", customerDetails.phone)
      .limit(1)
      .maybeSingle();

    customer = data;
  }

  if (!customer && customerDetails.email) {
    const { data } = await supabase
      .from("customers")
      .select(
        "id, name, age, city, phone, email, course, batch, custom_fields",
      )
      .eq("email", customerDetails.email)
      .limit(1)
      .maybeSingle();

    customer = data;
  }

  if (!customer && customerDetails.name) {
    const { data } = await supabase
      .from("customers")
      .select(
        "id, name, age, city, phone, email, course, batch, custom_fields",
      )
      .ilike("name", customerDetails.name)
      .limit(1)
      .maybeSingle();

    customer = data;
  }

  const customFields = {
    ...(customer?.custom_fields || {}),
    ...(paymentLink
      ? {
          razorpay_payment_link_id:
            clean(paymentLink.id),
        }
      : {}),
    ...(metadata.paymentType
      ? {
          payment_type:
            metadata.paymentType,
        }
      : {}),
  };

  /*
   * Create or update customer.
   */
  if (!customer) {
    const { data: createdCustomer, error } =
      await supabase
        .from("customers")
        .insert({
          name:
            customerDetails.name ||
            "Razorpay Customer",
          phone:
            customerDetails.phone || null,
          email:
            customerDetails.email || null,
          course:
            metadata.course || null,
          batch:
            metadata.batch || null,
          custom_fields: customFields,
        })
        .select("id")
        .single();

    if (error) {
      console.error(
        "Failed to create Razorpay customer:",
        error,
      );

      return NextResponse.json(
        {
          error: "Failed to create customer.",
        },
        { status: 500 },
      );
    }

    customer = createdCustomer;
  } else {
    const updatePayload: Record<string, any> = {
      custom_fields: customFields,
    };

    if (!customer.name && customerDetails.name) {
      updatePayload.name = customerDetails.name;
    }

    if (!customer.phone && customerDetails.phone) {
      updatePayload.phone = customerDetails.phone;
    }

    if (!customer.email && customerDetails.email) {
      updatePayload.email = customerDetails.email;
    }

    if (!customer.course && metadata.course) {
      updatePayload.course = metadata.course;
    }

    if (!customer.batch && metadata.batch) {
      updatePayload.batch = metadata.batch;
    }

    const { error } = await supabase
      .from("customers")
      .update(updatePayload)
      .eq("id", customer.id);

    if (error) {
      console.error(
        "Failed to update Razorpay customer:",
        error,
      );

      return NextResponse.json(
        {
          error: "Failed to update customer.",
        },
        { status: 500 },
      );
    }
  }

  /*
   * Upsert the payment using payment_id.
   * This makes webhook retries safe even if the event ID
   * was not available.
   */
  const paymentPayload = {
    customer_id: customer.id,
    payment_id: paymentId,
    amount,
    status,
    method: method || null,
    payment_time: paymentTime,
    failed_reason: failedReason || null,
  };

  const { error: paymentError } =
    await supabase
      .from("payments")
      .upsert(
        paymentPayload,
        {
          onConflict: "payment_id",
        },
      );

  if (paymentError) {
    console.error(
      "Failed to save Razorpay payment:",
      paymentError,
    );

    return NextResponse.json(
      {
        error: "Failed to save payment.",
      },
      { status: 500 },
    );
  }

  /*
   * Record the webhook only after the business data
   * has been successfully saved.
   */
  if (eventId) {
    const { error: eventError } =
      await supabase
        .from("razorpay_webhook_events")
        .insert({
          event_id: eventId,
          event,
          payment_id: paymentId,
          payload: body,
        });

    if (eventError) {
      console.error(
        "Webhook event log insert failed:",
        eventError,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    event,
    payment_id: paymentId,
    customer_id: customer.id,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "DevilX Flow Razorpay webhook",
  });
}
