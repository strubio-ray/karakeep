import { describe, expect, it } from "vitest";

import {
  assertNoLoginRedirect,
  detectLoginRedirect,
  LoginRedirectDetectedError,
} from "./index";
import { instagramRule } from "./rules/instagram";

// Minimal HTML fixtures for testing
const loginPageHtml = `
  <html>
    <head><title>Instagram</title></head>
    <body>
      <input type="password" />
      <span>Log in</span><span>Sign up</span><span>Forgot password</span>
    </body>
  </html>
`;

const validPostHtml = `
  <html>
    <head><title>@user on Instagram: "Post caption"</title></head>
    <body>
      <article><time datetime="2024-01-01"></time></article>
    </body>
  </html>
`;

describe("Login Redirect Detection", () => {
  describe("detectLoginRedirect", () => {
    it("returns false for non-Instagram URLs", () => {
      const result = detectLoginRedirect(
        "https://example.com/page",
        "https://example.com/page",
        { title: "Example Page" },
        "<html><head><title>Example Page</title></head></html>",
      );

      expect(result.isLoginRedirect).toBe(false);
    });

    it("returns false for Instagram post with valid content", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/p/ABC123/",
        {
          title: '@user on Instagram: "Post caption"',
          url: "https://www.instagram.com/p/ABC123/",
        },
        validPostHtml,
      );

      expect(result.isLoginRedirect).toBe(false);
    });

    it("detects login redirect when multiple signals match (threshold met)", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/accounts/login/",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      expect(result.isLoginRedirect).toBe(true);
      expect(result.siteName).toBe("Instagram");
      expect(result.reason).toBeDefined();
    });

    it("detects login redirect for reel URLs", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/reel/ABC123/",
        "https://www.instagram.com/accounts/login/",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      expect(result.isLoginRedirect).toBe(true);
    });

    it("detects login redirect for stories URLs", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/stories/username/123456/",
        "https://www.instagram.com/accounts/login/",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      expect(result.isLoginRedirect).toBe(true);
    });

    it("does not trigger when threshold is not met", () => {
      // Only generic title matches (weight 2), but threshold is 3
      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/p/ABC123/",
        {
          title: "Instagram",
          url: "https://www.instagram.com/p/ABC123/",
        },
        // Has article and time, so no-post-content won't match
        // No password field, so password-form-present won't match
        // og:url matches, so og-url-mismatch won't match
        `<html><head><title>Instagram</title></head><body><article><time datetime="2024-01-01"></time></article></body></html>`,
      );

      expect(result.isLoginRedirect).toBe(false);
    });
  });

  describe("Instagram Rule", () => {
    it("matches instagram.com URLs", () => {
      expect(instagramRule.test("https://instagram.com/p/ABC123/")).toBe(true);
    });

    it("matches www.instagram.com URLs", () => {
      expect(instagramRule.test("https://www.instagram.com/p/ABC123/")).toBe(
        true,
      );
    });

    it("matches subdomains of instagram.com", () => {
      expect(instagramRule.test("https://help.instagram.com/")).toBe(true);
    });

    it("does not match non-Instagram URLs", () => {
      expect(instagramRule.test("https://example.com/")).toBe(false);
      expect(instagramRule.test("https://notinstagram.com/")).toBe(false);
      expect(instagramRule.test("https://instagram.fake.com/")).toBe(false);
    });

    it("handles invalid URLs gracefully", () => {
      expect(instagramRule.test("not-a-url")).toBe(false);
      expect(instagramRule.test("")).toBe(false);
    });
  });

  describe("assertNoLoginRedirect", () => {
    it("does not throw for valid content", () => {
      expect(() =>
        assertNoLoginRedirect(
          "https://www.instagram.com/p/ABC123/",
          "https://www.instagram.com/p/ABC123/",
          {
            title: '@user on Instagram: "Post caption"',
            url: "https://www.instagram.com/p/ABC123/",
          },
          validPostHtml,
        ),
      ).not.toThrow();
    });

    it("does not throw for non-Instagram URLs", () => {
      expect(() =>
        assertNoLoginRedirect(
          "https://example.com/page",
          "https://example.com/page",
          { title: "Example Page" },
          "<html></html>",
        ),
      ).not.toThrow();
    });

    it("throws LoginRedirectDetectedError for login redirect", () => {
      expect(() =>
        assertNoLoginRedirect(
          "https://www.instagram.com/p/ABC123/",
          "https://www.instagram.com/accounts/login/",
          {
            title: "Instagram",
            url: "https://www.instagram.com/",
          },
          loginPageHtml,
        ),
      ).toThrow(LoginRedirectDetectedError);
    });

    it("includes correct properties in thrown error", () => {
      try {
        assertNoLoginRedirect(
          "https://www.instagram.com/p/ABC123/",
          "https://www.instagram.com/accounts/login/",
          {
            title: "Instagram",
            url: "https://www.instagram.com/",
          },
          loginPageHtml,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LoginRedirectDetectedError);
        const loginError = error as LoginRedirectDetectedError;
        expect(loginError.siteName).toBe("Instagram");
        expect(loginError.originalUrl).toBe(
          "https://www.instagram.com/p/ABC123/",
        );
        expect(loginError.reason).toBeDefined();
      }
    });
  });

  describe("False Positive Prevention", () => {
    it("does not trigger login-button-present when text is only in script tags", () => {
      // Login text only appears in JavaScript code, not visible content
      const htmlWithScriptOnly = `
        <html>
          <head><title>@user on Instagram: "Post caption"</title></head>
          <body>
            <article><time datetime="2024-01-01"></time></article>
            <script>
              const labels = { login: "log in", signup: "sign up", forgot: "forgot password" };
            </script>
          </body>
        </html>
      `;

      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/p/ABC123/",
        {
          title: '@user on Instagram: "Post caption"',
          url: "https://www.instagram.com/p/ABC123/",
        },
        htmlWithScriptOnly,
      );

      expect(result.isLoginRedirect).toBe(false);
    });

    it("does not trigger login-button-present when text is only in style tags", () => {
      const htmlWithStyleOnly = `
        <html>
          <head><title>@user on Instagram: "Post caption"</title></head>
          <body>
            <article><time datetime="2024-01-01"></time></article>
            <style>
              /* log in sign up forgot password */
              .button { color: red; }
            </style>
          </body>
        </html>
      `;

      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/p/ABC123/",
        {
          title: '@user on Instagram: "Post caption"',
          url: "https://www.instagram.com/p/ABC123/",
        },
        htmlWithStyleOnly,
      );

      expect(result.isLoginRedirect).toBe(false);
    });

    it("does not trigger login-button-present when text is only in noscript tags", () => {
      const htmlWithNoscriptOnly = `
        <html>
          <head><title>@user on Instagram: "Post caption"</title></head>
          <body>
            <article><time datetime="2024-01-01"></time></article>
            <noscript>
              log in sign up forgot password
            </noscript>
          </body>
        </html>
      `;

      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "https://www.instagram.com/p/ABC123/",
        {
          title: '@user on Instagram: "Post caption"',
          url: "https://www.instagram.com/p/ABC123/",
        },
        htmlWithNoscriptOnly,
      );

      expect(result.isLoginRedirect).toBe(false);
    });
  });

  describe("Browser URL Validation", () => {
    it("handles empty browserUrl gracefully", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      // Should still detect based on originalUrl
      expect(result.isLoginRedirect).toBe(true);
    });

    it("handles about:blank browserUrl gracefully", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "about:blank",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      // Should still detect based on originalUrl
      expect(result.isLoginRedirect).toBe(true);
    });

    it("handles javascript: browserUrl gracefully", () => {
      const result = detectLoginRedirect(
        "https://www.instagram.com/p/ABC123/",
        "javascript:void(0)",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      // Should still detect based on originalUrl
      expect(result.isLoginRedirect).toBe(true);
    });

    it("uses browserUrl when originalUrl does not match but browserUrl does", () => {
      // originalUrl is not Instagram, but browserUrl is (redirect scenario)
      const result = detectLoginRedirect(
        "https://example.com/instagram-redirect",
        "https://www.instagram.com/accounts/login/",
        {
          title: "Instagram",
          url: "https://www.instagram.com/",
        },
        loginPageHtml,
      );

      expect(result.isLoginRedirect).toBe(true);
    });

    it("returns false when neither URL matches any rule", () => {
      const result = detectLoginRedirect(
        "https://example.com/page",
        "about:blank",
        { title: "Example Page" },
        "<html><head><title>Example Page</title></head></html>",
      );

      expect(result.isLoginRedirect).toBe(false);
    });
  });
});
