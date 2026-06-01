-- article_stats: per-article aggregated counters
CREATE TABLE IF NOT EXISTS article_stats (
    slug TEXT PRIMARY KEY,
    view_count INTEGER DEFAULT 0,
    unique_view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    copy_count INTEGER DEFAULT 0,
    link_click_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- article_read_stats: reading behaviour per session
CREATE TABLE IF NOT EXISTS article_read_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    duration_seconds INTEGER,
    scroll_depth INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- comments
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- article_referrer: traffic source tracking
CREATE TABLE IF NOT EXISTS article_referrer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT,
    referrer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- rate_limit: IP-based rate limiting for likes
CREATE TABLE IF NOT EXISTS rate_limit (
    ip TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_read_stats_slug ON article_read_stats(slug);
CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments(slug);
CREATE INDEX IF NOT EXISTS idx_referrer_slug ON article_referrer(slug);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit(ip, created_at);
