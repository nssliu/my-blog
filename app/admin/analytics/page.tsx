"use client";

import { useState } from "react";
import { getAdminStats } from "@/lib/tracking";
import { SiteHeader } from "@/components/SiteHeader";

type ArticleStat = {
  slug: string;
  view_count: number;
  unique_view_count: number;
  like_count: number;
  comment_count: number;
  copy_count: number;
  link_click_count: number;
};

type ReferrerStat = {
  referrer: string;
  count: number;
};

type DashboardData = {
  topArticles: ArticleStat[];
  topReferrers: ReferrerStat[];
  topCopied: Array<{ slug: string; copy_count: number }>;
  completionRate: { completed: number; total: number } | null;
  recentComments: Array<{
    id: number;
    slug: string;
    nickname: string;
    content: string;
    created_at: string;
  }>;
};

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = (await getAdminStats(password)) as DashboardData;

    if (result?.topArticles) {
      setData(result);
    } else {
      setError("密码错误或无法连接 API");
    }
    setLoading(false);
  }

  // Calculate aggregate stats
  const totalViews =
    data?.topArticles.reduce((s, a) => s + a.view_count, 0) ?? 0;
  const totalLikes =
    data?.topArticles.reduce((s, a) => s + a.like_count, 0) ?? 0;
  const totalComments =
    data?.topArticles.reduce((s, a) => s + a.comment_count, 0) ?? 0;

  if (!data) {
    return (
      <div className="min-h-full bg-zinc-50 font-sans dark:bg-black">
        <SiteHeader />
        <main className="mx-auto max-w-md px-6 py-24">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Analytics Dashboard
          </h1>
          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <input
              type="password"
              placeholder="Admin Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Loading..." : "Login"}
            </button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-50 font-sans dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Analytics Dashboard
        </h1>

        {/* Summary cards */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Views" value={totalViews} />
          <StatCard label="Total Likes" value={totalLikes} />
          <StatCard label="Total Comments" value={totalComments} />
          <StatCard
            label="Read Completion"
            value={
              data.completionRate?.total
                ? `${Math.round(
                    (data.completionRate.completed /
                      data.completionRate.total) *
                      100,
                  )}%`
                : "N/A"
            }
          />
        </div>

        {/* Top articles table */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Top Articles
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="pb-2">Slug</th>
                  <th className="pb-2 text-right">Views</th>
                  <th className="pb-2 text-right">UV</th>
                  <th className="pb-2 text-right">Likes</th>
                  <th className="pb-2 text-right">Comments</th>
                  <th className="pb-2 text-right">Copies</th>
                  <th className="pb-2 text-right">Links</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700 dark:text-zinc-300">
                {data.topArticles.map((a) => (
                  <tr
                    key={a.slug}
                    className="border-b border-zinc-100 dark:border-zinc-900"
                  >
                    <td className="py-2 font-mono text-xs">{a.slug}</td>
                    <td className="py-2 text-right">{a.view_count}</td>
                    <td className="py-2 text-right">
                      {a.unique_view_count}
                    </td>
                    <td className="py-2 text-right">{a.like_count}</td>
                    <td className="py-2 text-right">{a.comment_count}</td>
                    <td className="py-2 text-right">{a.copy_count}</td>
                    <td className="py-2 text-right">{a.link_click_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Referrers */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Traffic Sources
          </h2>
          <ul className="mt-4 space-y-2">
            {data.topReferrers.map((r) => (
              <li
                key={r.referrer}
                className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span>{r.referrer}</span>
                <span className="text-zinc-500">{r.count}</span>
              </li>
            ))}
            {data.topReferrers.length === 0 && (
              <li className="text-sm text-zinc-500">No data yet</li>
            )}
          </ul>
        </section>

        {/* Code copy ranking */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Code Copy Ranking
          </h2>
          <ul className="mt-4 space-y-2">
            {data.topCopied.map((c) => (
              <li
                key={c.slug}
                className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="font-mono text-xs">{c.slug}</span>
                <span className="text-zinc-500">{c.copy_count}</span>
              </li>
            ))}
            {data.topCopied.length === 0 && (
              <li className="text-sm text-zinc-500">No data yet</li>
            )}
          </ul>
        </section>

        {/* Recent comments */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Recent Comments
          </h2>
          <ul className="mt-4 space-y-3">
            {data.recentComments.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {c.nickname}
                  </span>
                  <span>on</span>
                  <span className="font-mono">{c.slug}</span>
                  <span className="ml-auto">
                    {new Date(c.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {c.content}
                </p>
              </li>
            ))}
            {data.recentComments.length === 0 && (
              <li className="text-sm text-zinc-500">No comments yet</li>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
