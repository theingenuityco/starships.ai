// A small, self-contained Markdown renderer for assistant turns — enough to make
// agent output read like Claude's chat (headings, lists, code fences, blockquotes,
// inline bold/italic/code/links). It produces React nodes (never raw HTML) and is
// deliberately defensive: anything it doesn't recognise falls back to plain text.
import type { ReactNode } from 'react';

/** Only follow safe link schemes; everything else renders as plain text. */
function safeHref(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

/** Split a string into inline nodes: `code`, **bold**, *italic*, [links], ~~strike~~. */
function parseInline(text: string, keyBase = ''): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Earliest-match wins; alternatives ordered so `**` beats `*`, `__` beats `_`.
  const re = /(`[^`]+`)|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(\*[^*\n]+?\*)|(_[^_\n]+?_)|(~~[\s\S]+?~~)|(\[[^\]]+\]\([^)\s]+\))/;
  let rest = text;
  let i = 0;
  while (rest.length) {
    const m = re.exec(rest);
    if (!m) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyBase}i${i++}`;
    if (tok.startsWith('`')) {
      nodes.push(
        <code key={key} className="md-code-inline">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(<strong key={key}>{parseInline(tok.slice(2, -2), key)}</strong>);
    } else if (tok.startsWith('~~')) {
      nodes.push(<del key={key}>{parseInline(tok.slice(2, -2), key)}</del>);
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      nodes.push(<em key={key}>{parseInline(tok.slice(1, -1), key)}</em>);
    } else {
      // [label](url)
      const split = tok.indexOf('](');
      const label = tok.slice(1, split);
      const url = tok.slice(split + 2, -1);
      const href = safeHref(url);
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {parseInline(label, key)}
          </a>
        ) : (
          tok
        )
      );
    }
    rest = rest.slice(m.index + tok.length);
  }
  return nodes;
}

/** Join a paragraph's soft line breaks with <br/> so authored line breaks survive. */
function paragraph(lines: string[], key: string): ReactNode {
  const out: ReactNode[] = [];
  lines.forEach((ln, idx) => {
    if (idx > 0) out.push(<br key={`${key}br${idx}`} />);
    out.push(...parseInline(ln, `${key}l${idx}`));
  });
  return (
    <p key={key} className="md-p">
      {out}
    </p>
  );
}

/** Parse a Markdown document into block-level React nodes. */
export function Markdown({ text }: { text: string }): ReactNode {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ``` (optionally with a language).
    const fence = /^```(.*)$/.exec(line);
    if (fence) {
      const lang = fence[1].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // skip closing fence
      blocks.push(
        <pre key={k()} className="md-pre">
          {lang ? <div className="md-pre-lang">{lang}</div> : null}
          <code>{body.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Blank line → paragraph separator.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${Math.min(level, 6)}` as 'h1';
      blocks.push(
        <Tag key={k()} className={`md-h md-h${level}`}>
          {parseInline(heading[2], k())}
        </Tag>
      );
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^(\s*([-*_])\s*){3,}$/.test(line)) {
      blocks.push(<hr key={k()} className="md-hr" />);
      i++;
      continue;
    }

    // Blockquote (consecutive `>` lines).
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(
        <blockquote key={k()} className="md-quote">
          {paragraph(quote, k())}
        </blockquote>
      );
      continue;
    }

    // Lists (unordered or ordered). Stay in the list across consecutive item lines.
    const isUl = /^\s*[-*+]\s+/.test(line);
    const isOl = /^\s*\d+\.\s+/.test(line);
    if (isUl || isOl) {
      const items: ReactNode[] = [];
      const itemRe = isUl ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      while (i < lines.length && (isUl ? /^\s*[-*+]\s+/ : /^\s*\d+\.\s+/).test(lines[i])) {
        const m = itemRe.exec(lines[i]);
        const content = m ? m[1] : lines[i];
        items.push(
          <li key={k()} className="md-li">
            {parseInline(content, k())}
          </li>
        );
        i++;
      }
      blocks.push(
        isUl ? (
          <ul key={k()} className="md-ul">
            {items}
          </ul>
        ) : (
          <ol key={k()} className="md-ol">
            {items}
          </ol>
        )
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines until a blank line or a block starter.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push(paragraph(para, k()));
  }

  return <>{blocks}</>;
}
