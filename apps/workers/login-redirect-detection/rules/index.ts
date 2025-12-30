import type { SiteLoginRedirectRule } from "../types";
import { instagramRule } from "./instagram";

/**
 * Registry of all site-specific login redirect rules.
 * Add new rules here as they are implemented.
 */
export const loginRedirectRules: SiteLoginRedirectRule[] = [
  instagramRule,
  // Future rules:
  // twitterRule,
  // facebookRule,
  // linkedinRule,
];

/**
 * Find the applicable rule for a given URL.
 * @param url - The URL to check
 * @returns The matching rule, or undefined if no rule matches
 */
export function findRuleForUrl(url: string): SiteLoginRedirectRule | undefined {
  return loginRedirectRules.find((rule) => rule.test(url));
}
