import { createAdminClient as createClient } from "@/lib/supabase/admin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type GmailConnection = {
  id: string;
  google_email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  active: boolean;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function getGmailAccessToken() {
  const supabase = createClient();

  const { data: connection, error } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Gmail connection: ${error.message}`);
  }

  if (!connection) {
    throw new Error("No active Gmail connection found. Please connect Gmail first.");
  }

  const gmail = connection as GmailConnection;

  const expiresAt = gmail.token_expires_at
    ? new Date(gmail.token_expires_at).getTime()
    : 0;
  const refreshBuffer = 60 * 1000;

  if (expiresAt > Date.now() + refreshBuffer) {
    return {
      accessToken: gmail.access_token,
      email: gmail.google_email,
      connectionId: gmail.id,
    };
  }

  if (!gmail.refresh_token) {
    throw new Error(
      "Gmail access token expired and no refresh token is available. Reconnect Gmail.",
    );
  }

  return refreshGmailAccessToken(gmail);
}

async function refreshGmailAccessToken(connection: GmailConnection) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: connection.refresh_token!,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const tokenData = await response.json();

  if (!response.ok) {
    console.error("Google token refresh failed:", tokenData);

    if (tokenData?.error === "invalid_grant") {
      const supabase = createClient();

      await supabase
        .from("gmail_connections")
        .update({
          active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      throw new Error(
        "Gmail authorization has expired or was revoked. Please reconnect Gmail.",
      );
    }

    throw new Error(
      tokenData?.error_description ||
        tokenData?.error ||
        "Unable to refresh Gmail access token.",
    );
  }

  const newAccessToken = tokenData.access_token;

  if (!newAccessToken) {
    throw new Error("Google did not return a new access token.");
  }

  const expiresIn =
    typeof tokenData.expires_in === "number"
      ? tokenData.expires_in
      : Number(tokenData.expires_in || 3600);

  const newExpiresAt = new Date(
    Date.now() + expiresIn * 1000,
  ).toISOString();

  const supabase = createClient();

  const { error: updateError } = await supabase
    .from("gmail_connections")
    .update({
      access_token: newAccessToken,
      token_expires_at: newExpiresAt,
      active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (updateError) {
    throw new Error(
      `Failed to save refreshed Gmail token: ${updateError.message}`,
    );
  }

  return {
    accessToken: newAccessToken,
    email: connection.google_email,
    connectionId: connection.id,
  };
}

export async function sendGmailEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!to) {
    throw new Error("Recipient email is required.");
  }

  if (!subject) {
    throw new Error("Email subject is required.");
  }

  if (!html) {
    throw new Error("Email HTML content is required.");
  }

  const { accessToken, email: fromEmail } =
    await getGmailAccessToken();

  const mimeMessage = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
  ].join("\r\n");

  const raw = base64UrlEncode(mimeMessage);

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
    cache: "no-store",
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Gmail send failed:", result);

    if (
      response.status === 401 ||
      result?.error?.status === "UNAUTHENTICATED"
    ) {
      const supabase = createClient();

      const { data: connection, error: connectionError } = await supabase
        .from("gmail_connections")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (connectionError) {
        throw new Error(
          `Failed to load Gmail connection for retry: ${connectionError.message}`,
        );
      }

      if (!connection?.refresh_token) {
        throw new Error(
          "Gmail authorization is invalid. Please reconnect Gmail.",
        );
      }

      const refreshed = await refreshGmailAccessToken(
        connection as GmailConnection,
      );

      const retryResponse = await fetch(GMAIL_SEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshed.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        cache: "no-store",
      });

      const retryResult = await retryResponse.json();

      if (!retryResponse.ok) {
        throw new Error(
          retryResult?.error?.message ||
            "Gmail failed to send the email after token refresh.",
        );
      }

      return retryResult;
    }

    throw new Error(
      result?.error?.message || "Gmail failed to send the email.",
    );
  }

  return result;
}
