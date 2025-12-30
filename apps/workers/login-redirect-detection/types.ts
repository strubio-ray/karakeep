import type { CheerioAPI } from "cheerio";

/**
 * Context passed to detection rules containing all available
 * information about the crawled page.
 */
export interface LoginRedirectContext {
  /** The original URL the user requested to bookmark */
  originalUrl: string;
  /** The final URL after all redirects (from page.url()) */
  browserUrl: string;
  /** Extracted metadata from metascraper */
  metadata: {
    title?: string;
    description?: string;
    image?: string;
    url?: string; // og:url - key for detection
    author?: string;
    publisher?: string;
    logo?: string;
  };
  /** The raw HTML content (for DOM inspection if needed) */
  htmlContent: string;
  /** Parsed DOM for efficient querying */
  $: CheerioAPI;
}

/**
 * Result of a login redirect detection check.
 */
export interface LoginRedirectDetectionResult {
  /** Whether a login redirect was detected */
  isLoginRedirect: boolean;
  /** Human-readable reason for the detection (for error messages and logging) */
  reason?: string;
  /** The site name (e.g., "Instagram", "Twitter") for logging */
  siteName?: string;
}

/**
 * A single detection signal that contributes to the overall detection.
 * Multiple signals can be combined with AND/OR logic.
 */
export interface DetectionSignal {
  /** Unique identifier for this signal (for debugging) */
  id: string;
  /** Human-readable description of what this signal checks */
  description: string;
  /** The check function - returns true if this signal indicates a login redirect */
  check: (context: LoginRedirectContext) => boolean;
  /** Weight of this signal (higher = more important). Default: 1 */
  weight?: number;
}

/**
 * A site-specific rule for detecting login redirects.
 */
export interface SiteLoginRedirectRule {
  /** Unique identifier for this rule (e.g., "instagram", "twitter") */
  id: string;
  /** Human-readable site name */
  siteName: string;
  /**
   * Test function to determine if this rule applies to the URL.
   * Similar to metascraper plugin pattern.
   */
  test: (url: string) => boolean;
  /**
   * Detection signals for this site.
   * Signals are combined based on the detectionMode.
   */
  signals: DetectionSignal[];
  /**
   * How to combine signals:
   * - "any": Login redirect if ANY signal matches (OR logic)
   * - "all": Login redirect if ALL signals match (AND logic)
   * - "threshold": Login redirect if total weight >= threshold
   */
  detectionMode: "any" | "all" | "threshold";
  /**
   * For "threshold" mode: minimum weight sum required to trigger detection.
   * Default: 2
   */
  thresholdWeight?: number;
}
