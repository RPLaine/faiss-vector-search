/**
 * Card Builder Utility
 * Generic collapsible card creation
 */

/**
 * Create a collapsible card
 * @param {Object} config - Card configuration
 * @param {string} config.title - Card title/header
 * @param {string} config.className - Base CSS class name (e.g., 'retrieval', 'llm-request')
 * @param {string} config.content - HTML content for the card body
 * @param {boolean} config.collapsed - Whether to start collapsed (default: true)
 * @returns {HTMLElement} Card element
 */
export function createCollapsibleCard(config) {
    const {
        title,
        className,
        content,
        collapsed = true
    } = config;
    
    const box = document.createElement('div');
    box.className = `action-box ${className}-box`;
    
    const header = document.createElement('div');
    header.className = `action-header ${className}-collapsible`;
    header.textContent = title;
    
    const details = document.createElement('div');
    details.className = `action-details ${className}-content${collapsed ? ' collapsed' : ''}`;
    details.innerHTML = content;
    
    // Add click handler for collapse/expand
    header.onclick = () => {
        details.classList.toggle('collapsed');
    };
    
    box.appendChild(header);
    box.appendChild(details);
    
    return { element: box, header, details };
}

/**
 * Create a non-collapsible card (for backwards compatibility)
 * @param {Object} config - Card configuration
 * @param {string} config.title - Card title/header
 * @param {string} config.className - Base CSS class name
 * @param {string} config.content - HTML content for the card body
 * @returns {HTMLElement} Card element
 */
export function createSimpleCard(config) {
    const { title, className, content } = config;
    
    const box = document.createElement('div');
    box.className = `action-box ${className}-box`;
    
    box.innerHTML = `
        <div class="action-header">${title}</div>
        <div class="action-details">${content}</div>
    `;
    
    return box;
}
