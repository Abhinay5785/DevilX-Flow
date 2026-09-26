import { NextRequest, NextResponse } from "next/server";

/*
 * Browser-facing bridge for manual consultation completion.
 *
 * IMPORTANT:
 * - CONSULTATION_SYNC_SECRET stays server-side.
 * - The browser does not need a Supabase Auth session.
 * - The request is restricted to same-origin requests to reduce CSRF risk.
 * - This is not user authentication. If the dashboard itself is public, anyone
 *   who can use the dashboard can invoke this operation. Add real dashboard
 *   authentication later if manual completion must be restricted to specific users.
 */

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Forbidden origin." },
      { status: 403 }
    );
  }

  const secret = process.env.CONSULTATION_SYNC_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CONSULTATION_SYNC_SECRET is not configured." },
      { status: 500 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;

  const actionType =
    typeof payload.actionType === "string"
      ? payload.actionType.trim().toLowerCase()
      : "save";

  const requiredFields =
    actionType === "cancel"
      ? ["paymentRecordId", "paymentId", "consultationId", "cancellationNote"]
      : ["paymentRecordId", "paymentId", "bookingDate", "bookingTime"];

  for (const field of requiredFields) {
    if (typeof payload[field] !== "string" || !payload[field].trim()) {
      return NextResponse.json(
        { error: `${field} is required.` },
        { status: 400 }
      );
    }
  }

  const upstreamUrl = new URL(request.url);
  upstreamUrl.pathname = "/api/consultations/sync";
  upstreamUrl.search = "?action=manual-complete";

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-consultation-sync-secret": secret,
      },
      body: JSON.stringify({
        actionType,
        consultationId:
          typeof payload.consultationId === "string"
            ? payload.consultationId.trim()
            : "",
        paymentRecordId: String(payload.paymentRecordId).trim(),
        paymentId: String(payload.paymentId).trim(),
        bookingDate:
          typeof payload.bookingDate === "string"
            ? payload.bookingDate.trim()
            : "",
        bookingTime:
          typeof payload.bookingTime === "string"
            ? payload.bookingTime.trim()
            : "",
        markCompleted: payload.markCompleted !== false,
        cancellationNote:
          typeof payload.cancellationNote === "string"
            ? payload.cancellationNote.trim()
            : "",
      }),
      cache: "no-store",
    });

    const raw = await upstreamResponse.text();
    let result: unknown = null;

    try {
      result = raw ? JSON.parse(raw) : null;
    } catch {
      result = null;
    }

    return NextResponse.json(
      result ?? { error: raw || "Manual completion failed." },
      { status: upstreamResponse.status }
    );
  } catch (error) {
    console.error("Manual completion bridge failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete the consultation.",
      },
      { status: 500 }
    );
  }
}
