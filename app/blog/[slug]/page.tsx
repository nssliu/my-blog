import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/components/ArticleBody";
import { ArticleTracker } from "@/components/ArticleTracker";
import { ArticleFooter } from "@/components/ArticleFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPostBySlug, getPostSlugs } from "@/lib/posts";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return {
    title: `${post.title} | My Blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;

  let post;
  try {
    post = getPostBySlug(slug);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-full bg-zinc-50 font-sans dark:bg-black">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
        >
          ← 返回首页
        </Link>

        <ArticleTracker slug={slug} />

        <article className="mt-8">
          <time
            dateTime={post.date}
            className="text-sm text-zinc-500 dark:text-zinc-500"
          >
            {post.date}
          </time>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {post.title}
          </h1>
          <div className="mt-8">
            <ArticleBody content={post.content} slug={slug} />
          </div>
        </article>

        <ArticleFooter slug={slug} />
      </main>
    </div>
  );
}
