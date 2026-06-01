"use client";

import { useEffect, useState, useCallback } from "react";
import { trackLike, postComment, getComments } from "@/lib/tracking";

// ---- Like button --------------------------------------------------

const LIKED_KEY = "blog_liked_posts";

function getLikedPosts(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveLikedPost(slug: string) {
  const liked = getLikedPosts();
  liked.add(slug);
  localStorage.setItem(LIKED_KEY, JSON.stringify([...liked]));
}

function LikeButton({ slug }: { slug: string }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setLiked(getLikedPosts().has(slug));
  }, [slug]);

  async function handleLike() {
    if (liked) return;
    const ok = await trackLike(slug);
    if (ok) {
      setLiked(true);
      setCount((c) => c + 1);
      saveLikedPost(slug);
    }
  }

  return (
    <button
      onClick={handleLike}
      disabled={liked}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition
        ${
          liked
            ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
            : "border-zinc-300 text-zinc-600 hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-800 dark:hover:text-red-400"
        }`}
    >
      <span>{liked ? "❤️" : "🤍"}</span>
      <span>{liked ? "已点赞" : "点赞"}</span>
      {count > 0 && <span className="ml-1 text-xs">({count})</span>}
    </button>
  );
}

// ---- Comment section ----------------------------------------------

type Comment = {
  id: number;
  nickname: string;
  content: string;
  created_at: string;
};

function CommentSection({ slug }: { slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [nickname, setNickname] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getComments(slug).then(setComments);
  }, [slug]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nickname.trim() || !content.trim()) return;
      setSubmitting(true);
      const result = await postComment(slug, nickname.trim(), content.trim());
      setSubmitting(false);
      if (result.ok) {
        setContent("");
        setComments((prev) => [
          ...prev,
          {
            id: Date.now(),
            nickname: nickname.trim(),
            content: content.trim(),
            created_at: new Date().toISOString(),
          },
        ]);
      }
    },
    [slug, nickname, content],
  );

  return (
    <div className="mt-12">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        评论 ({comments.length})
      </h3>

      {/* Comment list */}
      {comments.length > 0 && (
        <ul className="mt-4 space-y-4">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {c.nickname}
                </span>
                <time className="text-xs text-zinc-500">
                  {new Date(c.created_at).toLocaleDateString("zh-CN")}
                </time>
              </div>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {c.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Comment form */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="text"
          placeholder="昵称"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={50}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <textarea
          placeholder="写下你的评论..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={submitting || !nickname.trim() || !content.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {submitting ? "提交中..." : "发表评论"}
        </button>
      </form>
    </div>
  );
}

// ---- Article Footer -----------------------------------------------

export function ArticleFooter({ slug }: { slug: string }) {
  return (
    <footer className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <LikeButton slug={slug} />
      <CommentSection slug={slug} />
    </footer>
  );
}
