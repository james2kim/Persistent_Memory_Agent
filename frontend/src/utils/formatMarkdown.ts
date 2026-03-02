/**
 * Converts markdown text to HTML for rendering in chat messages.
 * Handles code blocks, inline code, headers, lists, and other common markdown.
 */
export function formatMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let processed = text;

  // Extract fenced code blocks (```code```)
  processed = processed.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `%%%CODEBLOCK${codeBlocks.length}%%%`;
    codeBlocks.push(`<pre><code>${escaped.trim()}</code></pre>`);
    return placeholder;
  });

  // Extract inline code (`code`)
  const inlineCodes: string[] = [];
  processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const placeholder = `%%%INLINECODE${inlineCodes.length}%%%`;
    inlineCodes.push(`<code>${escaped}</code>`);
    return placeholder;
  });

  // Escape remaining HTML
  processed = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers (must be at start of line)
  processed = processed.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  processed = processed.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  processed = processed.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  processed = processed.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  processed = processed.replace(/^(?:---|\*\*\*|___)$/gm, '<hr>');

  // Blockquotes
  processed = processed.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold and italic (order matters - bold first)
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>');
  processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>');
  processed = processed.replace(/_(.+?)_/g, '<em>$1</em>');

  // Links [text](url)
  processed = processed.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );

  // Unordered lists (- or *)
  processed = processed.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> items in <ul>
  processed = processed.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists (1. 2. etc)
  processed = processed.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Line breaks (but not after block elements)
  processed = processed.replace(/\n/g, '<br>');
  // Clean up extra <br> after block elements
  processed = processed.replace(/(<\/h[1-4]>)<br>/g, '$1');
  processed = processed.replace(/(<\/li>)<br>/g, '$1');
  processed = processed.replace(/(<\/ul>)<br>/g, '$1');
  processed = processed.replace(/(<\/blockquote>)<br>/g, '$1');
  processed = processed.replace(/(<\/pre>)<br>/g, '$1');
  processed = processed.replace(/(<hr>)<br>/g, '$1');

  // Restore code blocks and inline code
  for (let i = 0; i < codeBlocks.length; i++) {
    processed = processed.split(`%%%CODEBLOCK${i}%%%`).join(codeBlocks[i]);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    processed = processed.split(`%%%INLINECODE${i}%%%`).join(inlineCodes[i]);
  }

  return processed;
}
