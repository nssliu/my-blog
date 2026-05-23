import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getAllPosts } from "@/lib/posts";

export default function Home() {
  const posts = getAllPosts();

  return (
    <div className="min-h-full bg-zinc-50 font-sans dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-zinc-600 dark:text-zinc-400">
          Next.js 静态博客，部署在 Cloudflare Pages。
        </p>

        <ul className="mt-10 space-y-8">
          {posts.map((post) => (
            <li key={post.slug}>
              <article>
                <time
                  dateTime={post.date}
                  className="text-sm text-zinc-500 dark:text-zinc-500"
                >
                  {post.date}
                </time>
                <h2 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    {post.title}
                  </Link>
                </h2>
                {post.excerpt && (
                  <p className="mt-2 leading-7 text-zinc-600 dark:text-zinc-400">
                    {post.excerpt}
                  </p>
                )}
                <Link
                  href={`/blog/${post.slug}`}
                  className="mt-2 inline-block text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-50"
                >
                  阅读全文 →
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
