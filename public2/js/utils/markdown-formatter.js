/**
 * Markdown Formatter - Converts Markdown to HTML
 * 
 * Pure utility function with no side effects.
 */

export class MarkdownFormatter {
    /**
     * Format Markdown content to HTML with syntax styling
     */
    static formatMarkdown(content) {
        if (!content) return '';
        
        let html = this._escapeHtml(content);
        
        // Headers (##, ###, etc.)
        html = html.replace(/^### (.+)$/gm, '<h3 style="color: var(--color-text-primary); font-size: 14px; font-weight: 600; margin: 12px 0 8px 0;">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 style="color: var(--color-text-primary); font-size: 15px; font-weight: 700; margin: 14px 0 10px 0;">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 style="color: var(--color-text-primary); font-size: 16px; font-weight: 700; margin: 16px 0 12px 0;">$1</h1>');
        
        // Bold **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--color-text-primary); font-weight: 600;">$1</strong>');
        
        // Italic *text*
        html = html.replace(/\*(.+?)\*/g, '<em style="color: var(--color-text-secondary); font-style: italic;">$1</em>');
        
        // Code blocks ```code```
        html = html.replace(/```([^`]+)```/g, '<pre style="background: var(--color-bg-tertiary); padding: 8px; border-radius: 4px; margin: 8px 0; overflow-x: auto;"><code>$1</code></pre>');
        
        // Inline code `code`
        html = html.replace(/`([^`]+)`/g, '<code style="background: var(--color-bg-tertiary); padding: 2px 4px; border-radius: 3px; font-family: var(--font-mono); font-size: 11px;">$1</code>');
        
        // Lists (- item or * item)
        html = html.replace(/^[*-] (.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>');
        
        // Links [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: var(--color-accent-primary); text-decoration: underline;" target="_blank">$1</a>');
        
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }
    
    /**
     * Format JSON content with syntax highlighting
     */
    static formatJSON(content) {
        try {
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            const formatted = JSON.stringify(parsed, null, 2);
            
            // Apply syntax highlighting
            return formatted
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"([^"]+)":/g, '<span style="color: #569cd6;">"$1"</span>:')
                .replace(/: "([^"]+)"/g, ': <span style="color: #ce9178;">"$1"</span>')
                .replace(/: (\d+)/g, ': <span style="color: #b5cea8;">$1</span>')
                .replace(/: (true|false)/g, ': <span style="color: #569cd6;">$1</span>')
                .replace(/\n/g, '<br>')
                .replace(/ /g, '&nbsp;');
        } catch (e) {
            return this._escapeHtml(String(content));
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    static _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Public escape method for external use
     */
    static escapeHtml(text) {
        return this._escapeHtml(text);
    }
}
