import { createAdminClient as createClient } from "@/lib/supabase/admin";
import { processEmailJobById } from "@/lib/automations/email-worker";

type PaymentData = {
  id: string;
  payment_id: string | null;
  customer_id: string;
  amount: number;
  status: string;
  method: string | null;
  payment_time: string;
  course: string | null;
  batch: string | null;
  payment_type: string | null;
};

type Trigger = {
  type?: "specific" | "fallback";
  field?: string;
  operator?: string;
  value?: string;
};

type CustomerData = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type Recipient = {
  name?: string;
  email?: string;
};

type Automation = {
  id: string;
  name: string;
  active: boolean;
  trigger: Trigger | null;
  recipient: Recipient | null;
  subject: string;
  html: string;
  delay_minutes: number;
};

function replaceVariables(
  value: string,
  variables: Record<string, string>,
) {
  let result = value;

  for (const [key, replacement] of Object.entries(variables)) {
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, "g"),
      replacement ?? "",
    );
  }

  return result;
}

function formatPaymentDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(",", "");
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isFallbackTrigger(trigger: Trigger | null) {
  return trigger?.type === "fallback";
}

function matchesTrigger(
  payment: PaymentData,
  customer: CustomerData,
  trigger: Trigger | null,
) {
  if (!trigger?.field || isFallbackTrigger(trigger)) {
    return false;
  }

  const operator = trigger.operator || "equals";
  const expected = String(trigger.value ?? "").trim();

  let actual: string | number = "";

  switch (trigger.field) {
    case "amount":
      actual = payment.amount;
      break;

    case "status":
      actual = payment.status;
      break;

    case "paymentMethod":
      actual = payment.method ?? "";
      break;

    case "course":
      actual = payment.course ?? "";
      break;

    case "batch":
      actual = payment.batch ?? "";
      break;

    case "paymentType":
      actual = payment.payment_type ?? "";
      break;

    // Builder/customer fields
    case "customerName":
    case "name":
      actual = customer.name ?? "";
      break;

    case "customerEmail":
    case "email":
      actual = customer.email ?? "";
      break;

    case "customerPhone":
    case "phone":
      actual = customer.phone ?? "";
      break;

    case "paymentId":
    case "payment_id":
      actual = payment.payment_id ?? "";
      break;

    default:
      return false;
  }

  const actualNumber = numberValue(actual);
  const expectedNumber = numberValue(expected);

  switch (operator) {
    case "equals":
      if (actualNumber !== null && expectedNumber !== null) {
        return actualNumber === expectedNumber;
      }

      return normalize(actual) === normalize(expected);

    case "not_equals":
      if (actualNumber !== null && expectedNumber !== null) {
        return actualNumber !== expectedNumber;
      }

      return normalize(actual) !== normalize(expected);

    case "contains":
      return normalize(actual).includes(normalize(expected));

    case "greater_than":
      return (
        actualNumber !== null &&
        expectedNumber !== null &&
        actualNumber > expectedNumber
      );

    case "less_than":
      return (
        actualNumber !== null &&
        expectedNumber !== null &&
        actualNumber < expectedNumber
      );

    case "greater_than_or_equal":
      return (
        actualNumber !== null &&
        expectedNumber !== null &&
        actualNumber >= expectedNumber
      );

    case "less_than_or_equal":
      return (
        actualNumber !== null &&
        expectedNumber !== null &&
        actualNumber <= expectedNumber
      );

    default:
      return false;
  }
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export async function queueEmailAutomationsForPayment(
  paymentId: string,
) {
  const supabase = await createClient();

  // Global Email Automation switch.
  // When disabled, no new email automation jobs are created.
  const { data: settings, error: settingsError } = await supabase
    .from("automation_settings")
    .select("email_enabled")
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(
      `Failed to load automation settings: ${settingsError.message}`,
    );
  }

  if (settings?.email_enabled === false) {
    console.log(
      "Email automations are globally disabled. Skipping payment:",
      paymentId,
    );

    return {
      matched: 0,
      queued: 0,
      skipped: 0,
      success: true,
      disabled: true,
      reason: "email_automations_disabled",
    };
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id,payment_id,customer_id,amount,status,method,payment_time,course,batch,payment_type",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError) {
    throw new Error(
      `Failed to load payment: ${paymentError.message}`,
    );
  }

  if (!payment) {
    throw new Error("Payment not found.");
  }

  const typedPayment = payment as PaymentData;

  // Email automations are currently triggered only by successful payments.
  if (typedPayment.status !== "captured") {
    return {
      matched: 0,
      queued: 0,
      skipped: 0,
    };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,name,email,phone")
    .eq("id", typedPayment.customer_id)
    .maybeSingle();

  if (customerError) {
    throw new Error(
      `Failed to load customer: ${customerError.message}`,
    );
  }

  if (!customer) {
    throw new Error("Customer not found for payment.");
  }

  const { data: automations, error: automationsError } =
    await supabase
      .from("email_automations")
      .select(
        "id,name,active,trigger,recipient,subject,html,delay_minutes",
      )
      .eq("active", true);

  if (automationsError) {
    throw new Error(
      `Failed to load email automations: ${automationsError.message}`,
    );
  }

  const variables: Record<string, string> = {
    name: String(customer.name ?? ""),
    email: String(customer.email ?? ""),
    phone: String(customer.phone ?? ""),
    amount: String(typedPayment.amount ?? ""),
    paymentId: String(typedPayment.payment_id ?? ""),
    paymentMethod: String(typedPayment.method ?? ""),
    paymentDateTime: formatPaymentDateTime(
      typedPayment.payment_time,
    ),
    status: String(typedPayment.status ?? ""),
    course: String(typedPayment.course ?? ""),
    batch: String(typedPayment.batch ?? ""),
    paymentType: String(typedPayment.payment_type ?? ""),
  };

  let matched = 0;
  let queued = 0;
  let skipped = 0;

  const activeAutomations = (automations ?? []) as Automation[];

  // Specific automations always have priority over the fallback.
  // Only the first matching specific automation is used so one payment
  // cannot accidentally send multiple confirmation emails.
  const typedCustomer = customer as CustomerData;

  const specificMatch = activeAutomations.find(
    (automation) =>
      !isFallbackTrigger(automation.trigger) &&
      matchesTrigger(
        typedPayment,
        typedCustomer,
        automation.trigger,
      ),
  );

  const fallbackAutomations = activeAutomations.filter(
    (automation) => isFallbackTrigger(automation.trigger),
  );

  let selectedAutomation: Automation | undefined =
    specificMatch;

  if (!selectedAutomation && fallbackAutomations.length > 0) {
    // There should normally be only one active fallback.
    // If more than one exists, use the first one returned by the query.
    if (fallbackAutomations.length > 1) {
      console.warn(
        `Multiple active fallback email automations found. Using the first one: ${fallbackAutomations[0].id}`,
      );
    }

    selectedAutomation = fallbackAutomations[0];
  }

  if (!selectedAutomation) {
    return {
      matched: 0,
      queued: 0,
      skipped: activeAutomations.length,
    };
  }

  matched = 1;

  const automation = selectedAutomation;

  const recipientEmail = replaceVariables(
    automation.recipient?.email ?? "{{email}}",
    variables,
  ).trim();

  const recipientName = replaceVariables(
    automation.recipient?.name ?? "{{name}}",
    variables,
  ).trim();

  const renderedSubject = replaceVariables(
    automation.subject ?? "",
    variables,
  );

  const renderedHtml = replaceVariables(
    automation.html ?? "",
    variables,
  );

  if (!recipientEmail) {
    skipped += 1;

    await supabase.from("automation_logs").insert({
      automation_id: automation.id,
      payment_id: typedPayment.id,
      recipient_name: recipientName || null,
      recipient_email: null,
      status: "failed",
      triggered_at: new Date().toISOString(),
      error_message: "Recipient email is empty.",
      variables,
    });

    return {
      matched,
      queued,
      skipped,
    };
  }

  const delayMinutes = Math.max(
    0,
    Number(automation.delay_minutes ?? 0),
  );

  const sendAt = addMinutes(
    new Date(),
    delayMinutes,
  ).toISOString();

  const { data: insertedJob, error: jobError } =
    await supabase
      .from("automation_jobs")
      .upsert(
        {
          automation_id: automation.id,
          payment_id: typedPayment.id,
          recipient_name: recipientName || null,
          recipient_email: recipientEmail,
          send_at: sendAt,
          status: "pending",
          attempts: 0,
          variables,
          rendered_subject: renderedSubject,
          rendered_html: renderedHtml,
        },
        {
          onConflict: "automation_id,payment_id",
          ignoreDuplicates: true,
        },
      )
      .select("id")
      .maybeSingle();

  if (jobError) {
    console.error(
      "Failed to queue email automation job:",
      jobError,
    );

    await supabase.from("automation_logs").insert({
      automation_id: automation.id,
      payment_id: typedPayment.id,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      status: "failed",
      triggered_at: new Date().toISOString(),
      error_message: jobError.message,
      variables,
    });

    skipped += 1;

    return {
      matched,
      queued,
      skipped,
    };
  }

  // Duplicate webhook/event: the unique constraint prevented another job.
  if (!insertedJob) {
    skipped += 1;

    return {
      matched,
      queued,
      skipped,
    };
  }

  queued += 1;

  const logStatus =
    delayMinutes > 0 ? "pending" : "triggered";

  await supabase.from("automation_logs").insert({
    automation_id: automation.id,
    payment_id: typedPayment.id,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    status: logStatus,
    triggered_at: new Date().toISOString(),
    scheduled_at: sendAt,
    variables,
  });

  // Keep the trigger counter in sync through the existing Supabase RPC.
  // IMPORTANT: The PostgreSQL function expects the parameter
  // "automation_id_input", not "automation_id".
  try {
    const { error: counterError } = await supabase.rpc(
      "increment_email_automation_triggered",
      {
        automation_id_input: automation.id,
      },
    );

    if (counterError) {
      console.error(
        "Failed to increment email automation triggered count:",
        counterError,
      );
    }
  } catch (counterError) {
    console.error(
      "Email automation trigger counter error:",
      counterError,
    );
  }

  /*
   * IMMEDIATE EMAIL
   *
   * When delay_minutes is 0, process the job immediately.
   *
   * This means immediate payment emails do not depend
   * on Vercel Cron or an external cron service.
   *
   * Delayed emails remain in automation_jobs and are
   * processed later by:
   *
   * /api/automations/email/process
   */
  if (delayMinutes === 0) {
    try {
      const result = await processEmailJobById(
        insertedJob.id,
      );

      console.log(
        `Immediate email processing completed for job ${insertedJob.id}:`,
        result,
      );
    } catch (error) {
      /*
       * If the immediate worker cannot start,
       * leave the job in the queue.
       *
       * The scheduled processor can pick it up later.
       */
      console.error(
        `Immediate email processing failed for job ${insertedJob.id}:`,
        error,
      );
    }
  }

  return {
    matched,
    queued,
    skipped,
  };
}