export async function verifyWebhookSignature(
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const digest = `sha256=${Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  if (digest.length !== signature.length) {
    return false;
  }

  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < digest.length; i++) {
    mismatch |= digest.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
