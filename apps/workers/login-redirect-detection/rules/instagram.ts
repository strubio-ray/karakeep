import type { DetectionSignal, SiteLoginRedirectRule } from "../types";

/**
 * Tests if a URL is an Instagram URL.
 * Matches: instagram.com, www.instagram.com, *.instagram.com
 */
const isInstagramUrl = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "instagram.com" || hostname.endsWith(".instagram.com");
  } catch {
    return false;
  }
};

/**
 * Generic login-related title patterns that indicate a login page.
 * Includes common translations.
 */
const LOGIN_TITLE_PATTERNS = [
  /^Instagram$/i, // Exactly "Instagram" (generic)
  /^Log\s*in/i, // "Log in", "Login"
  /^Sign\s*in/i, // "Sign in"
  /^Iniciar\s*sesi[oó]n/i, // Spanish
  /^Connexion/i, // French
  /^Anmelden/i, // German
];

/**
 * Signals for detecting Instagram login redirects.
 */
const instagramSignals: DetectionSignal[] = [
  {
    id: "generic-title",
    description: "Page title is generic 'Instagram' instead of post-specific",
    weight: 2,
    check: (ctx) => {
      const title = ctx.metadata.title?.trim();
      if (!title) return false;
      return LOGIN_TITLE_PATTERNS.some((pattern) => pattern.test(title));
    },
  },
  {
    id: "og-url-mismatch",
    description: "og:url points to homepage instead of requested URL",
    weight: 2,
    check: (ctx) => {
      const ogUrl = ctx.metadata.url;
      if (!ogUrl) return false;

      try {
        const ogUrlObj = new URL(ogUrl);
        const originalUrlObj = new URL(ctx.originalUrl);

        // Check if og:url is the homepage while we requested a specific page
        const ogPath = ogUrlObj.pathname.replace(/\/+$/, "") || "/";
        const originalPath = originalUrlObj.pathname.replace(/\/+$/, "") || "/";

        // If original URL has a meaningful path but og:url is just root
        if (originalPath !== "/" && ogPath === "/") {
          return true;
        }

        // If original URL was a post/reel/story but og:url doesn't contain that path
        if (
          originalPath.includes("/p/") ||
          originalPath.includes("/reel/") ||
          originalPath.includes("/stories/")
        ) {
          return (
            !ogPath.includes("/p/") &&
            !ogPath.includes("/reel/") &&
            !ogPath.includes("/stories/")
          );
        }

        return false;
      } catch {
        return false;
      }
    },
  },
  {
    id: "password-form-present",
    description: "Page contains password input field (login form)",
    weight: 1,
    check: (ctx) => {
      // Check for password input in HTML
      const hasPasswordInput = ctx.$('input[type="password"]').length > 0;
      // Also check for common login form patterns
      const hasLoginForm =
        ctx.$('form[action*="login"]').length > 0 ||
        ctx.$('form[action*="accounts"]').length > 0;
      return hasPasswordInput || hasLoginForm;
    },
  },
  {
    id: "login-button-present",
    description: "Page contains prominent login/signup buttons",
    weight: 1,
    check: (ctx) => {
      const $ = ctx.$;

      // Extract visible text only (exclude script/style/noscript content)
      // This prevents false positives from matching text in JS code
      const visibleText = $("body")
        .clone()
        .find("script, style, noscript")
        .remove()
        .end()
        .text()
        .toLowerCase();

      // Instagram login pages have all three: log in, sign up, forgot password
      return (
        visibleText.includes("log in") &&
        visibleText.includes("sign up") &&
        visibleText.includes("forgot password")
      );
    },
  },
  {
    id: "no-post-content",
    description: "Page lacks expected post content structure",
    weight: 1,
    check: (ctx) => {
      // Instagram posts should have article or specific content containers
      // Login pages typically lack these
      const hasArticle = ctx.$("article").length > 0;
      const hasPostMeta = ctx.$("time[datetime]").length > 0;

      // If we expected a post (URL has /p/, /reel/, or /stories/) but no article content
      const expectsPost =
        ctx.originalUrl.includes("/p/") ||
        ctx.originalUrl.includes("/reel/") ||
        ctx.originalUrl.includes("/stories/");

      return expectsPost && !hasArticle && !hasPostMeta;
    },
  },
];

/**
 * Instagram login redirect detection rule.
 * Uses threshold mode to reduce false positives.
 */
export const instagramRule: SiteLoginRedirectRule = {
  id: "instagram",
  siteName: "Instagram",
  test: isInstagramUrl,
  signals: instagramSignals,
  detectionMode: "threshold",
  thresholdWeight: 3, // Need significant evidence before flagging
};
