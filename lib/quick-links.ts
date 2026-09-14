export type QuickLink = {
  id: string;
  title: string;
  url: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export function normalizeLinkInput(input: {
  title?: unknown;
  url?: unknown;
}) {
  return {
    title: String(input.title ?? "").trim(),
    url: String(input.url ?? "").trim(),
  };
}

export function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateLinkInput(title: string, url: string) {
  if (!title) {
    return "Title is required.";
  }

  if (!url) {
    return "URL is required.";
  }

  if (!isValidHttpUrl(url)) {
    return "Enter a valid http:// or https:// URL.";
  }

  return null;
}
