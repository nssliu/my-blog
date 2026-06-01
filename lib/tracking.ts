const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ?? "http://localhost:8787";

function post(path: string, body: Record<string, unknown>): void {
  // Fire-and-forget; swallow errors so tracking never breaks UX.
  fetch(`${WORKER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    /* ignore */
  });
}

function beacon(path: string, body: Record<string, unknown>): void {
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  navigator.sendBeacon(`${WORKER_URL}${path}`, blob);
}

// ---- Public API ---------------------------------------------------

export function trackView(slug: string, referrer?: string): void {
  post("/api/track/view", { slug, referrer: referrer ?? document.referrer });
}

export function trackLike(slug: string): Promise<boolean> {
  return fetch(`${WORKER_URL}/api/track/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  })
    .then((r) => r.status !== 429)
    .catch(() => false);
}

export function trackRead(slug: string, durationSeconds: number): void {
  beacon("/api/track/read", { slug, duration: durationSeconds });
}

export function trackScroll(slug: string, depth: number): void {
  post("/api/track/scroll", { slug, depth });
}

export function trackCopy(slug: string): void {
  post("/api/track/copy", { slug });
}

export function trackLink(slug: string, url: string): void {
  post("/api/track/link", { slug, url });
}

export function postComment(
  slug: string,
  nickname: string,
  content: string,
): Promise<{ ok: boolean }> {
  return fetch(`${WORKER_URL}/api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, nickname, content }),
  })
    .then((r) => r.json() as Promise<{ ok: boolean }>)
    .catch(() => ({ ok: false }));
}

export function getComments(
  slug: string,
): Promise<
  Array<{ id: number; nickname: string; content: string; created_at: string }>
> {
  return fetch(`${WORKER_URL}/api/comments/${encodeURIComponent(slug)}`)
    .then((r) => r.json())
    .catch(() => []);
}

export function getStats(
  slug: string,
): Promise<{
  stats: Record<string, number>;
  avgDuration: number;
  scrollDistribution: Record<string, number>;
}> {
  return fetch(`${WORKER_URL}/api/stats/${encodeURIComponent(slug)}`)
    .then((r) => r.json())
    .catch(() => ({ stats: {}, avgDuration: 0, scrollDistribution: {} }));
}

export function getAdminStats(
  password: string,
): Promise<Record<string, unknown>> {
  return fetch(`${WORKER_URL}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${password}` },
  })
    .then((r) => r.json())
    .catch(() => ({}));
}
