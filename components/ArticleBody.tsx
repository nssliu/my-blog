"use client";

import ReactMarkdown from "react-markdown";
import { useState } from "react";
import { trackCopy, trackLink } from "@/lib/tracking";

// ---- Code block with copy button ----------------------------------

function CodeBlock({
  className,
  children,
  slug,
  ...props
}: React.ComponentPropsWithoutRef<"code"> & { slug: string }) {
  const [copied, setCopied] = useState(false);
  const isBlock = className?.includes("language-");
  const code = String(children).replace(/\n$/, "");

  if (!isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      trackCopy(slug);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <span className="relative block">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 opacity-0 transition-opacity hover:bg-zinc-600 group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <code className={className} {...props}>
        {children}
      </code>
    </span>
  );
}

// ---- Tracked external link ----------------------------------------

function TrackedLink({
  href,
  children,
  slug,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & { slug: string }) {
  function handleClick() {
    if (href) trackLink(slug, href);
  }

  const isExternal = href?.startsWith("http");

  return (
    <a
      href={href}
      onClick={isExternal ? handleClick : undefined}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

// ---- Main component -----------------------------------------------

export function ArticleBody({
  content,
  slug,
}: {
  content: string;
  slug: string;
}) {
  return (
    <div className="article-body">
      <ReactMarkdown
        components={{
          pre: ({ children, ...props }) => (
            <pre className="group" {...props}>
              {children}
            </pre>
          ),
          code: (props) => <CodeBlock {...props} slug={slug} />,
          a: (props) => <TrackedLink {...props} slug={slug} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
