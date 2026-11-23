// Cortex calendar bridge (Supabase Edge Function "calendar")
//
//   GET /functions/v1/calendar?feed=<secret>   → the user's Cortex events as an .ics
//        calendar. Google Calendar ("From URL") and Apple Calendar ("Subscribe")
//        poll this address; the secret comes from public.calendar_feed_token().
//   GET /functions/v1/calendar?proxy=<ics url> → fetches a Google / iCloud / Outlook
//        calendar address for the app (browsers cannot read those directly).
//
// Deploy with "Verify JWT" OFF: calendar apps cannot send a sign-in token.
// Uses only the built-in SUPABASE_URL and server key secrets.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
// Server-side key: the legacy service_role JWT, or one of the newer sb_secret_ keys
const SERVICE_KEY = (() => {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const single = Deno.env.get("SUPABASE_SECRET_KEY");
  if (single) return single;
  try {
    const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return (Object.values(all)[0] as string) ?? "";
  } catch {
    return "";
  }
})();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
};

// Only well-known calendar services can be relayed (no open proxy)
const ALLOWED_HOSTS = [
  /(^|\.)calendar\.google\.com$/,
  /(^|\.)googleusercontent\.com$/,
  /(^|\.)icloud\.com$/,
  /(^|\.)outlook\.live\.com$/,
  /(^|\.)outlook\.office365\.com$/,
  /(^|\.)outlook\.office\.com$/,
  /(^|\.)calendar\.proton\.me$/,
  /(^|\.)fastmail\.com$/,
  /(^|\.)calendar\.yahoo\.com$/,
  /(^|\.)export\.calendar\.yandex\.com$/,
];
const MAX_BYTES = 5 * 1024 * 1024;

function text(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}

function allowed(u: URL) {
  return u.protocol === "https:" && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
}

async function relay(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    return text("Invalid calendar address", 400);
  }
  // Follow redirects by hand so every hop stays on an allowed host
  for (let hop = 0; hop < 4; hop++) {
    if (!allowed(url)) return text("This calendar service is not supported", 400);
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Cortex-Calendar/1.0", Accept: "text/calendar, */*" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) return text(`The calendar service answered ${res.status}`, 502);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return text("Calendar too large", 413);
    const body = new TextDecoder().decode(buf);
    if (!body.includes("BEGIN:VCALENDAR")) return text("That address is not a calendar", 422);
    return new Response(body, { headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return text("Too many redirects", 508);
}

async function db(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: SERVICE_KEY.startsWith("eyJ")
      ? { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      : { apikey: SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`database ${res.status} (${SERVICE_KEY ? SERVICE_KEY.slice(0, 3) : "no key"})`);
  return await res.json();
}

const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = " " + rest.slice(74);
  }
  out.push(rest);
  return out.join("\r\n");
}
const ymd = (d: string) => d.replace(/-/g, "");
const hm = (t: string) => {
  const [h, m] = String(t).split(":").map((x) => parseInt(x, 10) || 0);
  return { h: Math.min(h, 23), m: h >= 24 ? 59 : m };
};
const pad = (n: number) => String(n).padStart(2, "0");
function nextDay(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

type CortexEvent = { id?: string; date?: string; start?: string | null; end?: string | null; title?: string; extFeed?: string; extCalendarId?: string };

function buildIcs(events: CortexEvent[], tz: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cortex//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Cortex",
    `X-WR-TIMEZONE:${tz}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    if (!e || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !e.title) continue;
    if (e.extFeed || e.extCalendarId) continue; // never send imported events back
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${esc(e.id || e.date + e.title)}@cortex`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.start) {
      const s = hm(e.start);
      const en = e.end ? hm(e.end) : { h: Math.min(s.h + 1, 23), m: s.h >= 23 ? 59 : s.m };
      lines.push(`DTSTART;TZID=${tz}:${ymd(e.date)}T${pad(s.h)}${pad(s.m)}00`);
      lines.push(`DTEND;TZID=${tz}:${ymd(e.date)}T${pad(en.h)}${pad(en.m)}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(e.date)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

async function feed(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return text("Not found", 404);
  const rows = await db(`calendar_feeds?token=eq.${token}&select=user_id`);
  if (!rows.length) return text("Not found", 404);
  const state = await db(`cortex_state?user_id=eq.${rows[0].user_id}&select=data`);
  // The row holds the sync payload { version, updatedAt, data: { specificEvents, ... } }
  const row = (state[0] && state[0].data) || {};
  const data = row.data && typeof row.data === "object" ? row.data : row;
  const tz = typeof data.timeZone === "string" && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(data.timeZone) ? data.timeZone : "Europe/Rome";
  const ics = buildIcs(Array.isArray(data.specificEvents) ? data.specificEvents : [], tz);
  return new Response(ics, {
    headers: {
      ...CORS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cortex.ics"',
      "Cache-Control": "public, max-age=900",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return text("Method not allowed", 405);
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("feed")) return await feed(q.get("feed")!.replace(/\.ics$/i, ""));
    if (q.get("proxy")) return await relay(q.get("proxy")!);
    return text("Cortex calendar bridge", 200);
  } catch (err) {
    console.error(err);
    return text(`Something went wrong: ${String((err as Error)?.message ?? err).slice(0, 80)}`, 500);
  }
});
