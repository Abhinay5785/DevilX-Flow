import { NextRequest, NextResponse } from "next/server";

import { sendGmailEmail } from "@/lib/google/gmail";

export const runtime = "nodejs";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const to = String(body?.to ?? "").trim();
    const subject = String(body?.subject ?? "").trim();
    const html = String(body?.html ?? "").trim();

    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        {
          error: "A valid test recipient email is required.",
        },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        {
          error: "Email subject is required.",
        },
        { status: 400 }
      );
    }

    if (!html) {
      return NextResponse.json(
        {
          error: "Email content is required.",
        },
        { status: 400 }
      );
    }

    const result = await sendGmailEmail({
      to,
      subject: `[TEST] ${subject}`,
      html,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${to}.`,
      messageId: result?.id ?? null,
    });
  } catch (error) {
    console.error("Send test email error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send test email.",
      },
      { status: 500 }
    );
  }
}