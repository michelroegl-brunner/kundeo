/**
 * A minimal, dependency-free Markdown → HTML renderer for email template bodies.
 * Supports only the safe subset the editor offers: bold, italic, links, ordered
 * and unordered lists, paragraphs and line breaks. Everything is HTML-escaped
 * first, so no raw markup from the template can reach the output; links are
 * limited to http(s) and mailto schemes.
 *
 * This is not a general Markdown engine — it is intentionally small and total,
 * shared by the live preview and the rendered mail.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only allow safe link schemes; anything else renders as plain text. */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return escapeHtml(trimmed);
  return null;
}

/** Inline formatting on already-escaped text: links, then bold, then italic. */
function inline(escaped: string): string {
  let out = escaped;
  // [text](url) — escaped text is kept, url validated.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const href = safeHref(url);
    return href ? `<a href="${href}">${text}</a>` : m;
  });
  // **bold** (before *italic* so the double markers win).
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *italic*
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return out;
}

const UL_ITEM = /^\s*[-*]\s+(.*)$/;
const OL_ITEM = /^\s*\d+\.\s+(.*)$/;

/** Render a block of list lines to a <ul>/<ol>. */
function renderList(lines: string[], ordered: boolean): string {
  const re = ordered ? OL_ITEM : UL_ITEM;
  const items = lines
    .map((l) => {
      const m = l.match(re);
      return m ? `<li>${inline(escapeHtml(m[1]!))}</li>` : "";
    })
    .join("");
  return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
}

/** Render Markdown (safe subset) to an HTML string. */
export function renderMarkdown(md: string): string {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const html: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    if (lines.every((l) => UL_ITEM.test(l))) {
      html.push(renderList(lines, false));
    } else if (lines.every((l) => OL_ITEM.test(l))) {
      html.push(renderList(lines, true));
    } else {
      const paragraph = lines.map((l) => inline(escapeHtml(l))).join("<br>");
      html.push(`<p>${paragraph}</p>`);
    }
  }
  return html.join("\n");
}
