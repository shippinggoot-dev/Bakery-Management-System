/**
 * SSRF (Server-Side Request Forgery) guard for user-supplied URLs.
 *
 * When users can configure a URL the server will fetch (webhook target,
 * image fetch, OAuth callback override, etc.) we must reject anything
 * that resolves to an internal network address — otherwise an attacker
 * can probe the cloud provider's metadata service (169.254.169.254 on
 * AWS / GCP / Azure), reach internal services bound to localhost, or
 * map the private network.
 *
 * Residual risk: DNS-rebind attacks where the host resolves to a public
 * IP at validation time but a private IP at fetch time. Fully fixing
 * that needs a custom HTTP agent with a `lookup` callback that re-checks
 * the connect address. For our threat model (a malicious tenant, not a
 * sophisticated attacker controlling DNS) the check-then-fetch approach
 * blocks the realistic exploit paths.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Returns true if the given IPv4 address is in a private, loopback,
 * link-local, reserved, or multicast range that must not be fetched.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true;                              // 0.0.0.0/8
  if (a === 10) return true;                             // 10.0.0.0/8
  if (a === 127) return true;                            // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true;               // 169.254.0.0/16 (link-local, cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
  if (a === 192 && b === 0) return true;                 // 192.0.0.0/24 (reserved)
  if (a === 192 && b === 168) return true;               // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true;  // 198.18.0.0/15 (benchmarking)
  if (a >= 224) return true;                             // 224.0.0.0/4 multicast, 240.0.0.0/4 reserved
  return false;
}

/**
 * Returns true if the given IPv6 address is loopback, link-local,
 * unique-local, or an IPv4-mapped private address.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
  // Unique local addresses (fc00::/7) — fc.. and fd..
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — extract and re-check
  const v4Mapped = lower.match(/^::ffff:([\d.]+)$/);
  if (v4Mapped && v4Mapped[1]) return isPrivateIPv4(v4Mapped[1]);
  return false;
}

/**
 * Validates a user-supplied URL is safe to fetch from server code.
 * Throws with a user-facing message if the URL fails any check.
 *
 * Checks:
 *   - parses as a valid URL
 *   - protocol is https:
 *   - host resolves to at least one public IP address
 *   - no resolved address is private/loopback/link-local
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("URL must use https://");
  }
  if (!url.hostname) {
    throw new Error("URL must include a host.");
  }

  // Reject literal IP-as-hostname for private ranges before any DNS lookup.
  const hostFamily = isIP(url.hostname);
  let addresses: string[];

  if (hostFamily === 4 || hostFamily === 6) {
    addresses = [url.hostname];
  } else {
    try {
      const results = await lookup(url.hostname, { all: true });
      addresses = results.map((r) => r.address);
    } catch {
      throw new Error("Could not resolve host.");
    }
  }

  if (addresses.length === 0) {
    throw new Error("Could not resolve host.");
  }

  for (const addr of addresses) {
    const fam = isIP(addr);
    if (fam === 4 && isPrivateIPv4(addr)) {
      throw new Error("URL resolves to a private network address.");
    }
    if (fam === 6 && isPrivateIPv6(addr)) {
      throw new Error("URL resolves to a private network address.");
    }
  }

  return url;
}
