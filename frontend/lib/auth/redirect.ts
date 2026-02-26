export function sanitizeRedirectPath(
  input: string | null | undefined,
  fallback: string = "/dashboard"
): string {
  if (!input) return fallback;

  const value = input.trim();

  // Only allow internal redirects (path-absolute).
  // This prevents open redirects like "https://evil.com" and protocol-relative
  // redirects like "//evil.com".
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  // Basic control char stripping / sanity.
  if (value.length > 2048) return fallback;
  // Disallow CRLF injection into Location header (defense-in-depth).
  if (value.includes("\r") || value.includes("\n")) return fallback;

  return value;
}

