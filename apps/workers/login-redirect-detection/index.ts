import { load } from "cheerio";

import type {
  LoginRedirectContext,
  LoginRedirectDetectionResult,
  SiteLoginRedirectRule,
} from "./types";
import { findRuleForUrl } from "./rules";

export { loginRedirectRules, findRuleForUrl } from "./rules";
export type {
  LoginRedirectContext,
  LoginRedirectDetectionResult,
  SiteLoginRedirectRule,
  DetectionSignal,
} from "./types";

/**
 * Error thrown when a login redirect is detected.
 * This error is designed to be caught by the crawler's onError handler,
 * which will set crawlStatus to "failure" and allow for retry.
 */
export class LoginRedirectDetectedError extends Error {
  constructor(
    public readonly siteName: string,
    public readonly reason: string,
    public readonly originalUrl: string,
  ) {
    super(`${siteName} login redirect detected: ${reason}`);
    this.name = "LoginRedirectDetectedError";
  }
}

/**
 * Evaluate a single rule against the context.
 */
function evaluateRule(
  rule: SiteLoginRedirectRule,
  context: LoginRedirectContext,
): LoginRedirectDetectionResult {
  const signalResults: {
    id: string;
    matched: boolean;
    weight: number;
  }[] = [];

  // Evaluate all signals
  for (const signal of rule.signals) {
    const matched = signal.check(context);
    signalResults.push({
      id: signal.id,
      matched,
      weight: signal.weight ?? 1,
    });
  }

  const matchedSignals = signalResults.filter((r) => r.matched);
  const totalWeight = matchedSignals.reduce((sum, r) => sum + r.weight, 0);

  let isLoginRedirect = false;

  switch (rule.detectionMode) {
    case "any":
      isLoginRedirect = matchedSignals.length > 0;
      break;
    case "all":
      isLoginRedirect = matchedSignals.length === rule.signals.length;
      break;
    case "threshold":
      isLoginRedirect = totalWeight >= (rule.thresholdWeight ?? 2);
      break;
  }

  if (isLoginRedirect) {
    const reasons = matchedSignals.map((s) => {
      const signal = rule.signals.find((sig) => sig.id === s.id);
      return signal?.description ?? s.id;
    });

    return {
      isLoginRedirect: true,
      siteName: rule.siteName,
      reason: reasons.join("; "),
    };
  }

  return { isLoginRedirect: false };
}

/**
 * Check if a crawled page is a login redirect.
 *
 * @param originalUrl - The URL the user requested to bookmark
 * @param browserUrl - The final URL after redirects
 * @param metadata - Extracted metadata from metascraper
 * @param htmlContent - Raw HTML content of the page
 * @returns Detection result indicating if this is a login redirect
 */
export function detectLoginRedirect(
  originalUrl: string,
  browserUrl: string,
  metadata: LoginRedirectContext["metadata"],
  htmlContent: string,
): LoginRedirectDetectionResult {
  // Find applicable rule - check both original and final URLs
  const rule = findRuleForUrl(originalUrl) ?? findRuleForUrl(browserUrl);

  if (!rule) {
    // No rule for this site, assume not a login redirect
    return { isLoginRedirect: false };
  }

  // Build context with parsed HTML
  const $ = load(htmlContent);
  const context: LoginRedirectContext = {
    originalUrl,
    browserUrl,
    metadata,
    htmlContent,
    $,
  };

  return evaluateRule(rule, context);
}

/**
 * Convenience function that throws LoginRedirectDetectedError if redirect detected.
 * Designed to be called after metadata extraction in crawlAndParseUrl().
 *
 * @param originalUrl - The URL the user requested to bookmark
 * @param browserUrl - The final URL after redirects
 * @param metadata - Extracted metadata from metascraper
 * @param htmlContent - Raw HTML content of the page
 * @throws LoginRedirectDetectedError if a login redirect is detected
 */
export function assertNoLoginRedirect(
  originalUrl: string,
  browserUrl: string,
  metadata: LoginRedirectContext["metadata"],
  htmlContent: string,
): void {
  const result = detectLoginRedirect(
    originalUrl,
    browserUrl,
    metadata,
    htmlContent,
  );

  if (result.isLoginRedirect) {
    throw new LoginRedirectDetectedError(
      result.siteName ?? "Unknown",
      result.reason ?? "Login redirect detected",
      originalUrl,
    );
  }
}
