export function validateLocalOrigin(host: string | null, origin?: string | null, requireOrigin = false) {
  try {
    if (!host || !/^[a-z0-9.:[\]-]+$/i.test(host)) throw new Error();
    const url = new URL(`http://${host}`);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error();
    if (requireOrigin && !origin) throw new Error();
    if (origin) { const source = new URL(origin); if (!["http:", "https:"].includes(source.protocol) || source.host !== url.host) throw new Error(); }
    return url.origin;
  } catch { throw new Error("This access pilot accepts same-origin localhost requests only. Public sharing is not enabled."); }
}
