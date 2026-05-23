export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          My Blog
        </h1>
        <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Next.js 静态博客，部署在 Cloudflare Pages。
        </p>
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-500">
          编辑 <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">app/page.tsx</code> 开始写作。
        </p>
      </main>
    </div>
  );
}
