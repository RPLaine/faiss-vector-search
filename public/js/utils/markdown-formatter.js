/**
 * Markdown Formatter
 * Converts Markdown syntax to styled HTML
 */

import { escapeHtml } from './html-utils.js';

/**
 * Format Markdown text to HTML with CSS styling
 * @param {string} text - Markdown text to format
 * @returns {string} HTML string with styled elements
 */
export function formatMarkdown(text) {
    if (!text) return '';
    
    let html = text;
    
    // Escape HTML special characters first (except for our markdown symbols)
    // We'll handle this carefully to not break markdown parsing
    
    // Headers (h1-h6)
    // Must be at start of line
    html = html.replace(/^######\s+(.+)$/gm, '<h6 class="md-h6">$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="md-h5">$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>');
    
    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong class="md-bold">$1</strong>');
    
    // Italic (*text* or _text_)
    // Must not be part of bold
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="md-italic">$1</em>');
    html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em class="md-italic">$1</em>');
    
    // Code blocks (```language\ncode\n```)
    html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, (match, lang, code) => {
        const language = lang ? ` data-language="${lang}"` : '';
        return `<pre class="md-code-block"${language}><code>${escapeHtml(code.trim())}</code></pre>`;
    });
    
    // Inline code (`code`)
    html = html.replace(/`(.+?)`/g, '<code class="md-code-inline">$1</code>');
    
    // Unordered lists (* item or - item)
    html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li class="md-list-item">$1</li>');
    
    // Wrap consecutive list items in ul
    html = html.replace(/(<li class="md-list-item">[\s\S]+?<\/li>)(?!\s*<li)/g, '<ul class="md-list">$1</ul>');
    
    // Ordered lists (1. item, 2. item, etc.)
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="md-list-item-ordered">$1</li>');
    
    // Wrap consecutive ordered list items in ol
    html = html.replace(/(<li class="md-list-item-ordered">[\s\S]+?<\/li>)(?!\s*<li)/g, '<ol class="md-list-ordered">$1</ol>');
    
    // Links ([text](url))
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Blockquotes (> text)
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    
    // Horizontal rule (--- or ***)
    html = html.replace(/^(\-\-\-|\*\*\*)$/gm, '<hr class="md-hr">');
    
    // Paragraphs - wrap text that's not already in tags
    // Split by double newlines and wrap non-tagged content
    html = html.split('\n\n').map(block => {
        // Skip if already wrapped in HTML tag
        if (block.trim().startsWith('<') && block.trim().endsWith('>')) {
            return block;
        }
        // Skip empty blocks
        if (!block.trim()) {
            return '';
        }
        // Wrap in paragraph
        return `<p class="md-paragraph">${block.trim()}</p>`;
    }).join('\n');
    
    // Line breaks - convert single newlines to <br> within paragraphs
    html = html.replace(/(?<!>)\n(?!<)/g, '<br>');
    
    return html;
}

/**
 * Strip all Markdown formatting (useful for plain text fallback)
 * @param {string} text - Markdown text
 * @returns {string} Plain text
 */
export function stripMarkdown(text) {
    if (!text) return '';
    
    let plain = text;
    
    // Remove headers
    plain = plain.replace(/^#{1,6}\s+/gm, '');
    
    // Remove bold/italic (keep the text)
    plain = plain.replace(/\*\*(.+?)\*\*/g, '$1');
    plain = plain.replace(/__(.+?)__/g, '$1');
    plain = plain.replace(/\*(.+?)\*/g, '$1');
    plain = plain.replace(/_(.+?)_/g, '$1');
    
    // Remove code blocks
    plain = plain.replace(/```[\s\S]+?```/g, '');
    
    // Remove inline code
    plain = plain.replace(/`(.+?)`/g, '$1');
    
    // Remove links (keep text)
    plain = plain.replace(/\[(.+?)\]\(.+?\)/g, '$1');
    
    // Remove list markers
    plain = plain.replace(/^[\*\-\+]\s+/gm, '');
    plain = plain.replace(/^\d+\.\s+/gm, '');
    
    // Remove blockquotes
    plain = plain.replace(/^>\s+/gm, '');
    
    // Remove horizontal rules
    plain = plain.replace(/^(\-\-\-|\*\*\*)$/gm, '');
    
    return plain;
}
