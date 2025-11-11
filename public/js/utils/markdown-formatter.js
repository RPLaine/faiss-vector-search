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
    
    // Headers (h1-h6) - must be at start of line
    html = html.replace(/^######\s+(.+)$/gm, '<h6 class="md-h6">$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="md-h5">$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="md-h2">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="md-h1">$1</h1>');
    
    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong class="md-bold">$1</strong>');
    
    // Italic (*text* or _text_) - must not be part of bold
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
    html = html.replace(/(<\/li>)\n+(<li class="md-list-item">)/g, '$1$2');
    html = html.replace(/(<li class="md-list-item">[\s\S]+?<\/li>)(?!\s*<li)/g, '<ul class="md-list">$1</ul>');
    
    // Ordered lists (1. item, 2. item, etc.)
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="md-list-item-ordered">$1</li>');
    html = html.replace(/(<\/li>)\n+(<li class="md-list-item-ordered">)/g, '$1$2');
    html = html.replace(/(<li class="md-list-item-ordered">[\s\S]+?<\/li>)(?!\s*<li)/g, '<ol class="md-list-ordered">$1</ol>');
    
    // Links ([text](url))
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Blockquotes (> text)
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    
    // Horizontal rule (--- or ***)
    html = html.replace(/^(\-\-\-|\*\*\*)$/gm, '<hr class="md-hr">');
    
    // Remove newlines around block elements (headers, lists, blockquotes, hr, code blocks)
    html = html.replace(/\n+(<(?:h[1-6]|ul|ol|blockquote|hr|pre))/g, '$1');
    html = html.replace(/(<\/(?:h[1-6]|ul|ol|blockquote|hr|pre)>)\n+/g, '$1');
    
    // Wrap any text not in block elements with md-paragraph
    // Split by block elements and wrap loose text
    const blockElementPattern = /<(?:h[1-6]|ul|ol|blockquote|hr|pre)[\s>].*?<\/(?:h[1-6]|ul|ol|blockquote|hr|pre)>|<hr[^>]*>/gs;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    // Create a regex that can be used with exec
    const regex = new RegExp(blockElementPattern.source, blockElementPattern.flags);
    
    while ((match = regex.exec(html)) !== null) {
        // Get text before this block element
        const textBefore = html.substring(lastIndex, match.index).trim();
        if (textBefore) {
            parts.push(`<div class="md-paragraph">${textBefore}</div>`);
        }
        // Add the block element
        parts.push(match[0]);
        lastIndex = regex.lastIndex;
    }
    
    // Get any remaining text after last block element
    const textAfter = html.substring(lastIndex).trim();
    if (textAfter) {
        parts.push(`<div class="md-paragraph">${textAfter}</div>`);
    }
    
    html = parts.join('');
    
    // Convert remaining single newlines to <br> (only within inline content)
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
