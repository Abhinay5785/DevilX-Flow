import { NextRequest, NextResponse } from "next/server";

import {
  processPendingEmailJobs,
} from "@/lib/automations/email-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const results = await processPendingEmailJobs();

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