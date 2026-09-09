export class OfficialSourceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "OfficialSourceError";
    Object.assign(this, details);
  }
}

const request = async (url, options = {}) => {
  const { timeoutMs = 30000, retries = 3, ...fetchOptions } = options;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: "follow", ...fetchOptions, signal: controller.signal,
        headers: { "user-agent": "who-cite-your-works/1.0 (official membership cache)",
          accept: "text/html,application/json,application/pdf,*/*;q=0.8", ...(fetchOptions.headers || {}) },
      });
      if (response.ok) return response;
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === retries) throw new OfficialSourceError(`${response.status} while fetching ${url}`, {
        url, status: response.status, blocked: [401, 403, 429].includes(response.status),
      });
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    } catch (error) {
      if (error instanceof OfficialSourceError) throw error;
      if (attempt === retries) throw new OfficialSourceError(`Failed to fetch ${url}: ${error.message}`, { url });
    } finally { clearTimeout(timer); }
  }
  throw new OfficialSourceError(`Failed to fetch ${url}`, { url });
};

export const fetchOfficialText = async (url, options = {}) => (await request(url, options)).text();
export const fetchOfficialBuffer = async (url, options = {}) => Buffer.from(await (await request(url, options)).arrayBuffer());
export const decodeHtml = (value = "") => String(value)
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
  .replace(/<[^>]+>/g, " ").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
