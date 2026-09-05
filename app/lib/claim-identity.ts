const COOKIE_NAME = "festival_device";
const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSecret() {
  const secret = process.env.CLAIM_DEVICE_SECRET;
  if (!secret || secret.length < 32) throw new Error("CLAIM_DEVICE_SECRET must contain at least 32 characters");
  return secret;
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Buffer.from(bytes).toString("base64url");
}

function readCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const entry = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
  return entry ? decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) : "";
}

function firstForwardedValue(value: string | null) {
  const first = value?.split(",", 1)[0]?.trim();
  return first || undefined;
}

function trustsProxyHeaders() {
  return process.env.TRUST_PROXY_HEADERS === "true";
}

function isSecureRequest(request: Request) {
  if (new URL(request.url).protocol === "https:") return true;
  return trustsProxyHeaders() && firstForwardedValue(request.headers.get("x-forwarded-proto")) === "https";
}

export async function getClaimIdentity(request: Request) {
  const current = readCookie(request);
  const separator = current.lastIndexOf(".");
  const id = separator > 0 ? current.slice(0, separator) : "";
  const signature = separator > 0 ? current.slice(separator + 1) : "";
  let deviceId = id;
  let setCookie: string | undefined;

  if (!DEVICE_PATTERN.test(id) || signature !== await hmac(id)) {
    deviceId = crypto.randomUUID();
    const value = `${deviceId}.${await hmac(deviceId)}`;
    const secure = isSecureRequest(request) ? "; Secure" : "";
    setCookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
  }

  // A direct LAN deployment has no trusted component that can attest to the
  // client address. Ignoring client-supplied forwarding headers avoids both
  // spoofing and every attendee sharing the same "unknown" rate-limit bucket.
  const address = trustsProxyHeaders()
    ? firstForwardedValue(request.headers.get("x-forwarded-for")) ?? (request.headers.get("x-real-ip")?.trim() || undefined)
    : undefined;
  return {
    deviceId,
    deviceRateKey: await hmac(`device:${deviceId}`),
    addressRateKey: address ? await hmac(`ip:${address}`) : undefined,
    setCookie,
  };
}
