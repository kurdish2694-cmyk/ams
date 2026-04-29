export const config = { runtime: "edge" };

const BASE_URL = (process.env.TARGET_DOMAIN ?? "").replace(/\/+$/, "");

const IGNORED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "proxy-authenticate",
  "proxy-authorization",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

function getDestination(origin, url) {
  const slash = url.indexOf("/", 8);
  return slash < 0 ? origin + "/" : origin + url.substring(slash);
}

function sanitizeHeaders(incoming) {
  const clean = new Headers();
  let forwarded = null;

  for (const [name, value] of incoming.entries()) {
    const lower = name.toLowerCase();
    if (lower.startsWith("x-vercel-")) continue;
    if (IGNORED_HEADERS.has(lower)) continue;

    if (lower === "x-real-ip") {
      forwarded ??= value;
      continue;
    }

    if (lower === "x-forwarded-for") {
      forwarded ??= value;
      continue;
    }

    clean.set(name, value);
  }

  if (forwarded) clean.set("x-forwarded-for", forwarded);
  return clean;
}

export default async function handler(request) {
  if (!BASE_URL) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", {
      status: 500,
    });
  }

  try {
    const withPayload = request.method !== "GET" && request.method !== "HEAD";

    const upstream = await fetch(getDestination(BASE_URL, request.url), {
      method: request.method,
      headers: sanitizeHeaders(request.headers),
      body: withPayload ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    return upstream;

  } catch (ex) {
    console.error("proxy error:", ex?.message);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}