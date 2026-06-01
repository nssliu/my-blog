// ---------------------------------------------------------------
// Blog Observability Worker — Cloudflare Workers + D1
// ---------------------------------------------------------------

export interface Env {
  blog_db: D1Database;
  BLOG_ORIGIN: string;
  ADMIN_PASSWORD: string;
}

// ---- CORS helpers ------------------------------------------------

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function handleOptions(origin: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

// ---- Utility helpers ---------------------------------------------

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function json(data: unknown, status = 200, origin = "*"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function noContent(origin: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "unknown"
  );
}

// ---- Ensure article_stats row exists ------------------------------

async function ensureArticle(db: D1Database, slug: string): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO article_stats (slug) VALUES (?)`,
    )
    .bind(slug)
    .run();
}

// ---- Route handlers -----------------------------------------------

async function handleTrackView(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  if (!slug) return json({ error: "slug required" }, 400, origin);

  await ensureArticle(db, slug);

  // Increment view count
  await db
    .prepare(
      `UPDATE article_stats SET view_count = view_count + 1, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
    )
    .bind(slug)
    .run();

  // UV deduplication via fingerprint (User-Agent + IP hash)
  const ip = getClientIp(request);
  const ua = request.headers.get("User-Agent") ?? "";
  const fingerprint = `${ip}:${ua}`;

  // Simple daily UV: check if this fingerprint visited this slug today
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db
    .prepare(
      `SELECT id FROM article_read_stats
       WHERE slug = ? AND duration_seconds = -1 AND DATE(created_at) = ?
       AND scroll_depth = 0
       LIMIT 1`,
    )
    .bind(slug, today)
    .first<{ id: number }>();

  // Use a separate mechanism: store fingerprint hash in scroll_depth=-1 placeholder
  // Actually let's use a simpler approach: just increment unique_view_count
  // based on a hash check. For simplicity, use a basic dedup with rate_limit table pattern.
  // We'll use the article_referrer table with a special referrer value for UV tracking.
  const uvCheck = await db
    .prepare(
      `SELECT id FROM article_referrer WHERE slug = ? AND referrer = ? AND DATE(created_at) = ?`,
    )
    .bind(slug, `uv:${fingerprint.slice(0, 64)}`, today)
    .first<{ id: number }>();

  if (!uvCheck) {
    await db
      .prepare(
        `UPDATE article_stats SET unique_view_count = unique_view_count + 1 WHERE slug = ?`,
      )
      .bind(slug)
      .run();
    await db
      .prepare(`INSERT INTO article_referrer (slug, referrer) VALUES (?, ?)`)
      .bind(slug, `uv:${fingerprint.slice(0, 64)}`)
      .run();
  }

  // Record referrer
  const referrer = (body.referrer as string) || request.headers.get("Referer") || "direct";
  const cleanReferrer = referrer.replace(/^https?:\/\//, "").split("/")[0] || "direct";
  if (!referrer.startsWith("uv:")) {
    await db
      .prepare(`INSERT INTO article_referrer (slug, referrer) VALUES (?, ?)`)
      .bind(slug, cleanReferrer)
      .run();
  }

  return noContent(origin);
}

async function handleTrackLike(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  if (!slug) return json({ error: "slug required" }, 400, origin);

  // IP-based rate limiting: max 3 likes per minute per IP
  const ip = getClientIp(request);
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();

  const recent = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM rate_limit WHERE ip = ? AND slug = ? AND created_at > ?`,
    )
    .bind(ip, slug, oneMinAgo)
    .first<{ cnt: number }>();

  if ((recent?.cnt ?? 0) >= 3) {
    return json({ error: "rate limited" }, 429, origin);
  }

  await ensureArticle(db, slug);

  await db
    .prepare(
      `UPDATE article_stats SET like_count = like_count + 1, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
    )
    .bind(slug)
    .run();

  await db
    .prepare(`INSERT INTO rate_limit (ip, slug) VALUES (?, ?)`)
    .bind(ip, slug)
    .run();

  return noContent(origin);
}

async function handleTrackRead(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  const duration = body.duration as number | undefined;
  if (!slug || duration === undefined) {
    return json({ error: "slug and duration required" }, 400, origin);
  }

  await ensureArticle(db, slug);

  await db
    .prepare(
      `INSERT INTO article_read_stats (slug, duration_seconds) VALUES (?, ?)`,
    )
    .bind(slug, Math.min(duration, 3600)) // cap at 1 hour
    .run();

  return noContent(origin);
}

async function handleTrackScroll(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  const depth = body.depth as number | undefined;
  if (!slug || depth === undefined) {
    return json({ error: "slug and depth required" }, 400, origin);
  }

  await ensureArticle(db, slug);

  await db
    .prepare(
      `INSERT INTO article_read_stats (slug, scroll_depth) VALUES (?, ?)`,
    )
    .bind(slug, Math.min(depth, 100))
    .run();

  return noContent(origin);
}

async function handleTrackCopy(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  if (!slug) return json({ error: "slug required" }, 400, origin);

  await ensureArticle(db, slug);

  await db
    .prepare(
      `UPDATE article_stats SET copy_count = copy_count + 1, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
    )
    .bind(slug)
    .run();

  return noContent(origin);
}

async function handleTrackLink(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  if (!slug) return json({ error: "slug required" }, 400, origin);

  await ensureArticle(db, slug);

  await db
    .prepare(
      `UPDATE article_stats SET link_click_count = link_click_count + 1, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
    )
    .bind(slug)
    .run();

  return noContent(origin);
}

async function handlePostComment(
  request: Request,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const body = await readBody(request);
  const slug = body.slug as string | undefined;
  const nickname = body.nickname as string | undefined;
  const content = body.content as string | undefined;

  if (!slug || !nickname || !content) {
    return json({ error: "slug, nickname and content required" }, 400, origin);
  }

  // Basic sanitisation
  const cleanNickname = nickname.slice(0, 50);
  const cleanContent = content.slice(0, 2000);

  await ensureArticle(db, slug);

  await db
    .prepare(
      `INSERT INTO comments (slug, nickname, content) VALUES (?, ?, ?)`,
    )
    .bind(slug, cleanNickname, cleanContent)
    .run();

  await db
    .prepare(
      `UPDATE article_stats SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
    )
    .bind(slug)
    .run();

  return json({ ok: true }, 201, origin);
}

async function handleGetComments(
  slug: string,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT id, nickname, content, created_at FROM comments WHERE slug = ? ORDER BY created_at ASC`,
    )
    .bind(slug)
    .all();

  return json(result.results, 200, origin);
}

async function handleGetStats(
  slug: string,
  db: D1Database,
  origin: string,
): Promise<Response> {
  const stats = await db
    .prepare(`SELECT * FROM article_stats WHERE slug = ?`)
    .bind(slug)
    .first();

  if (!stats) return json({ error: "not found" }, 404, origin);

  // Avg read duration
  const avgRead = await db
    .prepare(
      `SELECT AVG(duration_seconds) as avg_duration FROM article_read_stats WHERE slug = ? AND duration_seconds > 0`,
    )
    .bind(slug)
    .first<{ avg_duration: number | null }>();

  // Max scroll depth distribution
  const scrollDist = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN scroll_depth >= 25 THEN 1 ELSE 0 END) as d25,
        SUM(CASE WHEN scroll_depth >= 50 THEN 1 ELSE 0 END) as d50,
        SUM(CASE WHEN scroll_depth >= 75 THEN 1 ELSE 0 END) as d75,
        SUM(CASE WHEN scroll_depth >= 100 THEN 1 ELSE 0 END) as d100,
        COUNT(*) as total
       FROM article_read_stats WHERE slug = ? AND scroll_depth > 0`,
    )
    .bind(slug)
    .first();

  return json({ stats, avgDuration: avgRead?.avg_duration ?? 0, scrollDistribution: scrollDist }, 200, origin);
}

async function handleAdminStats(
  request: Request,
  db: D1Database,
  env: Env,
  origin: string,
): Promise<Response> {
  // Password check via Authorization header
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.ADMIN_PASSWORD}`) {
    return json({ error: "unauthorized" }, 401, origin);
  }

  // Top articles by view count
  const topArticles = await db
    .prepare(
      `SELECT * FROM article_stats ORDER BY view_count DESC LIMIT 20`,
    )
    .all();

  // Top referrers
  const topReferrers = await db
    .prepare(
      `SELECT referrer, COUNT(*) as count FROM article_referrer
       WHERE referrer NOT LIKE 'uv:%'
       GROUP BY referrer ORDER BY count DESC LIMIT 20`,
    )
    .all();

  // Top copied code articles
  const topCopied = await db
    .prepare(
      `SELECT slug, copy_count FROM article_stats WHERE copy_count > 0 ORDER BY copy_count DESC LIMIT 10`,
    )
    .all();

  // Overall read completion rate
  const completionRate = await db
    .prepare(
      `SELECT
        COUNT(CASE WHEN scroll_depth >= 100 THEN 1 END) as completed,
        COUNT(*) as total
       FROM article_read_stats WHERE scroll_depth > 0`,
    )
    .first();

  // Recent comments
  const recentComments = await db
    .prepare(
      `SELECT c.*, s.like_count FROM comments c
       LEFT JOIN article_stats s ON c.slug = s.slug
       ORDER BY c.created_at DESC LIMIT 20`,
    )
    .all();

  return json(
    {
      topArticles: topArticles.results,
      topReferrers: topReferrers.results,
      topCopied: topCopied.results,
      completionRate,
      recentComments: recentComments.results,
    },
    200,
    origin,
  );
}

// ---- Main fetch handler -------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("Origin") ?? env.BLOG_ORIGIN ?? "*";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions(origin);
    }

    const db = env.blog_db;

    try {
      // ---- POST tracking endpoints ----
      if (request.method === "POST") {
        switch (path) {
          case "/api/track/view":
            return handleTrackView(request, db, origin);
          case "/api/track/like":
            return handleTrackLike(request, db, origin);
          case "/api/track/read":
            return handleTrackRead(request, db, origin);
          case "/api/track/scroll":
            return handleTrackScroll(request, db, origin);
          case "/api/track/copy":
            return handleTrackCopy(request, db, origin);
          case "/api/track/link":
            return handleTrackLink(request, db, origin);
          case "/api/comments":
            return handlePostComment(request, db, origin);
        }
      }

      // ---- GET endpoints ----
      if (request.method === "GET") {
        // /api/comments/:slug
        const commentsMatch = path.match(/^\/api\/comments\/([^/]+)$/);
        if (commentsMatch) {
          return handleGetComments(decodeURIComponent(commentsMatch[1]), db, origin);
        }

        // /api/stats/:slug
        const statsMatch = path.match(/^\/api\/stats\/([^/]+)$/);
        if (statsMatch) {
          return handleGetStats(decodeURIComponent(statsMatch[1]), db, origin);
        }

        // /api/admin/stats
        if (path === "/api/admin/stats") {
          return handleAdminStats(request, db, env, origin);
        }
      }

      // ---- 404 ----
      return json({ error: "not found" }, 404, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      return json({ error: message }, 500, origin);
    }
  },
};
