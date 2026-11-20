// Minimal markdown -> HTML for our own consent document (headings, lists, bold, code, paragraphs).
// Input is our bundled file, but we still escape everything first.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/_(.+?)_/g, '<em>$1</em>');

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list = false;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const li = line.match(/^[-*] (.*)$/);
    if (!li && list) { out.push('</ul>'); list = false; }
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    const h = line.match(/^(#{1,4}) (.*)$/);
    if (h) { const n = Math.min(4, h[1].length + 1); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    if (line) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

/** Split the consent doc into its "In short" section and the rest. */
export function splitConsent(md: string): { short: string; full: string } {
  const a = md.indexOf('## In short');
  const b = md.indexOf('## Full details');
  return { short: md.slice(a + '## In short'.length, b).trim(), full: md.slice(b + '## Full details'.length).trim() };
}
