import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/client/safe-markdown.js";

describe("release notes markdown", () => {
  it("renders the basics", () => {
    const html = renderMarkdown("# Release 2.1\n\n- **Login** fixed\n- see [PR](https://github.com/x/y/pull/1)");
    expect(html).toContain("<h1>Release 2.1</h1>");
    expect(html).toContain("<strong>Login</strong>");
    expect(html).toContain('<a href="https://github.com/x/y/pull/1" target="_blank" rel="noreferrer noopener">PR</a>');
  });

  it("shows raw HTML as text and drops script links and images", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1)) ![pic](https://example.com/a.png) <script>alert(1)</script>');
    expect(html).not.toMatch(/<img|<script|javascript:/i);
    expect(html).toContain("&lt;img");
    expect(html).toContain('<a href="https://example.com/a.png"');
  });
});
