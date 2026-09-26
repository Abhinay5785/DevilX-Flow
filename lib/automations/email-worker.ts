import { createAdminClient as createClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/google/gmail";

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

type ProcessResult = {
  status:
    | "sent"
    | "retrying"
    | "failed"
    | "claim_failed"
    | "already_claimed"
    | "sent_update_failed";
  retried: boolean;
  terminal: boolean;
};

function getRetryDelayMinutes(attempts: number) {
  // 1st failure -> retry after 1 minute
  // 2nd failure -> retry after 5 minutes
  // 3rd failure -> terminal failure

  if (attempts <= 1) return 1;

  if (attempts === 2) return 5;

  return 0;
}

async function incrementSentCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  automationId: string,
) {
  const { data: automation, error: readError } =
    await supabase
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

  const { error: updateError } =
    await supabase
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  job: EmailJob,
  errorMessage: string,
): Promise<ProcessResult> {
  const attempts = Number(job.attempts ?? 0);

  const retryDelay =
    getRetryDelayMinutes(attempts);

  /*
   * Retry while attempts are below the maximum.
   */
  if (
    attempts < MAX_ATTEMPTS &&
    retryDelay > 0
  ) {
    const nextSendAt = new Date(
      Date.now() +
        retryDelay * 60 * 1000,
    ).toISOString();

    const { error: retryError } =
      await supabase
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

  /*
   * Maximum attempts reached.
   */
  const now =
    new Date().toISOString();

  const { error: jobError } =
    await supabase
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

  const { error: logError } =
    await supabase
      .from("automation_logs")
      .update({
        status: "failed",
        error_message: errorMessage,
        updated_at: now,
      })
      .eq(
        "automation_id",
        job.automation_id,
      )
      .eq(
        "payment_id",
        job.payment_id,
      )
      .in("status", [
        "triggered",
        "pending",
      ]);

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

/*
 * Actually processes one email job.
 *
 * The job is atomically changed:
 *
 * pending → processing
 *
 * This prevents two workers from sending
 * the same email simultaneously.
 */
export async function processEmailJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  job: EmailJob,
): Promise<ProcessResult> {
  const attempts =
    Number(job.attempts ?? 0) + 1;

  const {
    data: claimedJob,
    error: claimError,
  } = await supabase
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

  /*
   * Another worker already claimed it.
   */
  if (!claimedJob) {
    return {
      status: "already_claimed",
      retried: false,
      terminal: false,
    };
  }

  const claimed =
    claimedJob as EmailJob;

  try {
    if (
      !claimed.recipient_email?.trim()
    ) {
      throw new Error(
        "Recipient email is empty.",
      );
    }

    if (
      !claimed.rendered_subject?.trim()
    ) {
      throw new Error(
        "Rendered email subject is empty.",
      );
    }

    if (
      !claimed.rendered_html?.trim()
    ) {
      throw new Error(
        "Rendered email HTML is empty.",
      );
    }

    /*
     * ACTUAL GMAIL SEND
     */
    await sendGmailEmail({
      to: claimed.recipient_email.trim(),
      subject: claimed.rendered_subject,
      html: claimed.rendered_html,
    });

    const now =
      new Date().toISOString();

    /*
     * Gmail accepted the email.
     */
    const {
      error: sentError,
    } = await supabase
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
      /*
       * IMPORTANT:
       *
       * Gmail already accepted the email.
       * Do NOT retry here because that could
       * create a duplicate email.
       */
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

    /*
     * Update automation log.
     */
    const {
      error: logError,
    } = await supabase
      .from("automation_logs")
      .update({
        status: "sent",
        sent_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq(
        "automation_id",
        claimed.automation_id,
      )
      .eq(
        "payment_id",
        claimed.payment_id,
      )
      .in("status", [
        "triggered",
        "pending",
      ]);

    if (logError) {
      console.error(
        `Failed to update sent automation log for job ${claimed.id}:`,
        logError,
      );
    }

    /*
     * Update sent counter.
     */
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

/*
 * Process one specific job by ID.
 *
 * Used by email-engine.ts for
 * immediate emails.
 */
export async function processEmailJobById(
  jobId: string,
) {
  const supabase =
    await createClient();

  const {
    data: job,
    error,
  } = await supabase
    .from("automation_jobs")
    .select(
      "id,automation_id,payment_id,recipient_name,recipient_email,send_at,status,attempts,sent_at,error_message,variables,rendered_subject,rendered_html",
    )
    .eq("id", jobId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load email job: ${error.message}`,
    );
  }

  /*
   * Job may already have been processed
   * by another worker.
   */
  if (!job) {
    return {
      status: "already_processed",
      retried: false,
      terminal: false,
    };
  }

  return processEmailJob(
    supabase,
    job as EmailJob,
  );
}

/*
 * Process all email jobs whose send_at
 * time has arrived.
 *
 * Used by:
 *
 * /api/automations/email/process
 */
export async function processPendingEmailJobs() {
  const supabase =
    await createClient();

  /*
   * Global email automation switch.
   */
  const {
    data: settings,
    error: settingsError,
  } = await supabase
    .from("automation_settings")
    .select("email_enabled")
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(
      `Failed to load automation settings: ${settingsError.message}`,
    );
  }

  if (
    settings?.email_enabled === false
  ) {
    return {
      found: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      disabled: true,
    };
  }

  const now =
    new Date().toISOString();

  const {
    data: jobs,
    error,
  } = await supabase
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

  for (
    const job of (jobs ?? []) as EmailJob[]
  ) {
    const result =
      await processEmailJob(
        supabase,
        job,
      );

    if (result.status === "sent") {
      results.sent += 1;
    } else if (
      result.status ===
        "claim_failed" ||
      result.status ===
        "already_claimed"
    ) {
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