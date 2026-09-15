import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sendGmailEmail } from "@/lib/google/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

type EmailJob = {
  id: string;
  automation_id: string;
  payment_id: string;
  recipient_name: string | null;
  recipient_email: string;
  send_at: string;
  status:
    | "pending"
    | "processing"
    | "sent"
    | "failed"
    | "cancelled";
  attempts: number;
  sent_at: string | null;
  error_message: string | null;
  variables: Record<string, string> | null;
  rendered_subject: string | null;
  rendered_html: string | null;
};

function getCronSecret() {
  return process.env.CRON_SECRET?.trim() || "";
}

function isAuthorized(request: NextRequest) {
  const secret = getCronSecret();

  // If CRON_SECRET is not configured, do not block local development.
  if (!secret) {
    return true;
  }

  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${secret}`;
}

function getRetryDelayMinutes(attempts: number) {
  // 1st failure -> 1 minute
  // 2nd failure -> 5 minutes
  // 3rd failure -> terminal failure
  if (attempts <= 1) return 1;
  if (attempts === 2) return 5;

  return 0;
}

async function incrementSentCount(
  supabase: ReturnType<typeof createClient>,
  automationId: string,
) {
  // MVP-safe counter update.
  // For very high-volume systems, replace this with an atomic
  // Supabase RPC such as increment_email_automation_sent.
  const { data: automation, error: readError } = await supabase
    .from("email_automations")
    .select("sent_count")
    .eq("id", automationId)
    .maybeSingle();

  if (readError) {
    console.error(
      "Failed to read sent_count:",
      readError,
    );

    return;
  }

  const currentCount = Number(
    automation?.sent_count ?? 0,
  );

  const { error: updateError } = await supabase
    .from("email_automations")
    .update({
      sent_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", automationId);

  if (updateError) {
    console.error(
      "Failed to increment sent_count:",
      updateError,
    );
  }
}

async function markJobFailed(
  supabase: ReturnType<typeof createClient>,
  job: EmailJob,
  errorMessage: string,
) {
  const attempts = Number(job.attempts ?? 0);
  const retryDelay = getRetryDelayMinutes(attempts);

  // Retry while attempts are below the maximum.
  if (attempts < MAX_ATTEMPTS && retryDelay > 0) {
    const nextSendAt = new Date(
      Date.now() + retryDelay * 60 * 1000,
    ).toISOString();

    const { error: retryError } = await supabase
      .from("automation_jobs")
      .update({
        status: "pending",
        send_at: nextSendAt,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");

    if (retryError) {
      console.error(
        "Failed to reschedule email job:",
        retryError,
      );
    }

    return {
      status: "retrying",
      retried: true,
      terminal: false,
    };
  }

  // Maximum attempts reached.
  const now = new Date().toISOString();

  const { error: jobError } = await supabase
    .from("automation_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      updated_at: now,
    })
    .eq("id", job.id)
    .eq("status", "processing");

  if (jobError) {
    console.error(
      "Failed to mark email job as failed:",
      jobError,
    );
  }

  const { error: logError } = await supabase
    .from("automation_logs")
    .update({
      status: "failed",
      error_message: errorMessage,
      updated_at: now,
    })
    .eq("automation_id", job.automation_id)
    .eq("payment_id", job.payment_id)
    .eq("status", "pending");

  if (logError) {
    console.error(
      "Failed to update automation log:",
      logError,
    );
  }

  return {
    status: "failed",
    retried: false,
    terminal: true,
  };
}

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: EmailJob,
) {
  const attempts = Number(job.attempts ?? 0) + 1;

  // Claim the job atomically enough for the current MVP:
  // only a pending job can transition to processing.
  const { data: claimedJob, error: claimError } =
    await supabase
      .from("automation_jobs")
      .update({
        status: "processing",
        attempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

  if (claimError) {
    console.error(
      `Failed to claim email job ${job.id}:`,
      claimError,
    );

    return {
      status: "claim_failed",
      retried: false,
      terminal: false,
    };
  }

  // Another worker already claimed it.
  if (!claimedJob) {
    return {
      status: "already_claimed",
      retried: false,
      terminal: false,
    };
  }

  const claimed = claimedJob as EmailJob;

  try {
    if (!claimed.recipient_email?.trim()) {
      throw new Error("Recipient email is empty.");
    }

    if (!claimed.rendered_subject?.trim()) {
      throw new Error(
        "Rendered email subject is empty.",
      );
    }

    if (!claimed.rendered_html?.trim()) {
      throw new Error(
        "Rendered email HTML is empty.",
      );
    }

    await sendGmailEmail({
      to: claimed.recipient_email.trim(),
      subject: claimed.rendered_subject,
      html: claimed.rendered_html,
    });

    const now = new Date().toISOString();

    const { error: sentError } = await supabase
      .from("automation_jobs")
      .update({
        status: "sent",
        sent_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq("id", claimed.id)
      .eq("status", "processing");

    if (sentError) {
      // The email was already accepted by Gmail. Do not send it again.
      console.error(
        `Email was sent but job ${claimed.id} could not be marked sent:`,
        sentError,
      );

      return {
        status: "sent_update_failed",
        retried: false,
        terminal: false,
      };
    }

    const { error: logError } = await supabase
      .from("automation_logs")
      .update({
        status: "sent",
        sent_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq("automation_id", claimed.automation_id)
      .eq("payment_id", claimed.payment_id)
      .in("status", ["triggered", "pending"]);

    if (logError) {
      console.error(
        `Failed to update sent automation log for job ${claimed.id}:`,
        logError,
      );
    }

    await incrementSentCount(
      supabase,
      claimed.automation_id,
    );

    return {
      status: "sent",
      retried: false,
      terminal: false,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown Gmail sending error.";

    console.error(
      `Email job ${claimed.id} failed:`,
      error,
    );

    return markJobFailed(
      supabase,
      claimed,
      errorMessage,
    );
  }
}

async function processPendingJobs() {
  const supabase = createClient();

  // Global Email Automation switch.
  // This is a second safety layer in addition to the
  // check in email-engine.ts. It prevents already-queued
  // pending jobs from being sent while automations are OFF.
  const { data: settings, error: settingsError } =
    await supabase
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
    return {
      found: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      disabled: true,
    };
  }

  const now = new Date().toISOString();

  const { data: jobs, error } = await supabase
    .from("automation_jobs")
    .select(
      "id,automation_id,payment_id,recipient_name,recipient_email,send_at,status,attempts,sent_at,error_message,variables,rendered_subject,rendered_html",
    )
    .eq("status", "pending")
    .lte("send_at", now)
    .order("send_at", {
      ascending: true,
    })
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error(
      `Failed to load pending email jobs: ${error.message}`,
    );
  }

  const results = {
    found: jobs?.length ?? 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  };

  for (const job of (jobs ?? []) as EmailJob[]) {
    const result = await processJob(
      supabase,
      job,
    );

    if (result.status === "sent") {
      results.sent += 1;
    } else if (result.status === "claim_failed") {
      results.skipped += 1;
    } else if (result.status === "already_claimed") {
      results.skipped += 1;
    } else if (result.retried) {
      results.retried += 1;
    } else if (result.terminal) {
      results.failed += 1;
    } else {
      results.skipped += 1;
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const results = await processPendingJobs();

    return NextResponse.json({
      success: true,
      ...results,
      processed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Email automation processor error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Email processor failed.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
