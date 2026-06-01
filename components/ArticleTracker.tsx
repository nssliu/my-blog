"use client";

import { useEffect, useRef } from "react";
import { trackView, trackRead, trackScroll } from "@/lib/tracking";

export function ArticleTracker({ slug }: { slug: string }) {
  const startTime = useRef(Date.now());
  const reportedDepths = useRef(new Set<number>());

  useEffect(() => {
    // Track page view
    trackView(slug);

    // Reset timer
    startTime.current = Date.now();
    reportedDepths.current = new Set();

    // Scroll depth tracking — report each threshold only once
    function onScroll() {
      const docHeight = document.body.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percent = Math.round((window.scrollY / docHeight) * 100);

      for (const threshold of [25, 50, 75, 100]) {
        if (percent >= threshold && !reportedDepths.current.has(threshold)) {
          reportedDepths.current.add(threshold);
          trackScroll(slug, threshold);
        }
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    // Cleanup: report read duration via beacon
    return () => {
      window.removeEventListener("scroll", onScroll);
      const duration = Math.floor((Date.now() - startTime.current) / 1000);
      if (duration >= 3) {
        trackRead(slug, duration);
      }
    };
  }, [slug]);

  return null;
}
