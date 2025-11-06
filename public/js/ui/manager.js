/**
 * UI Manager Module
 * Manages DOM manipulation and UI updates
 */

import config from '../config.js';

class UIManager {
    constructor() {
        this.elements = {};
    }

    /**
     * Initialize UI elements
     */
    init() {
        this.elements = {
            contentArea: document.getElementById('contentArea'),
            queryInput: document.getElementById('query-input'),
            executeBtn: document.getElementById('executeBtn'),
            statusDot: document.getElementById('statusDot'),
            connectionStatus: document.getElementById('connectionStatus'),
            terminalInfo: document.getElementById('terminalInfo'),
            modeRadios: document.querySelectorAll('input[name="queryMode"]')
        };
    }

    /**
     * Update status display
     */
    updateStatus(text, connected) {
        this.elements.terminalInfo.textContent = text;
        
        if (connected) {
            this.elements.statusDot.classList.remove('disconnected');
            this.elements.connectionStatus.textContent = 'online';
            this.elements.connectionStatus.classList.remove('offline');
            this.elements.connectionStatus.classList.add('online');
        } else {
            this.elements.statusDot.classList.add('disconnected');
            this.elements.connectionStatus.textContent = 'offline';
            this.elements.connectionStatus.classList.remove('online');
            this.elements.connectionStatus.classList.add('offline');
        }
    }

    /**
     * Set loading state
     */
    setLoading(loading) {
        this.elements.executeBtn.disabled = loading;
        this.elements.queryInput.disabled = loading;
        
        if (loading) {
            this.elements.executeBtn.classList.add('loading');
            this.elements.executeBtn.innerHTML = '<span class="spinner">⟳</span>';
        } else {
            this.elements.executeBtn.classList.remove('loading');
            this.elements.executeBtn.innerHTML = '➤';
        }
    }

    /**
     * Append output line to content area
     */
    appendOutput(text, className = '') {
        const line = document.createElement('div');
        line.className = `output-line ${className}`;
        line.textContent = text;
        this.elements.contentArea.appendChild(line);
        this.scrollToBottom();
    }

    /**
     * Append metadata box
     */
    appendMetadata(items) {
        const box = document.createElement('div');
        box.className = 'metadata-box';
        
        items.forEach(item => {
            const span = document.createElement('span');
            span.className = 'metadata-item';
            span.innerHTML = item;
            box.appendChild(span);
        });
        
        this.elements.contentArea.appendChild(box);
    }

    /**
     * Append generic element
     */
    appendElement(element) {
        this.elements.contentArea.appendChild(element);
        this.scrollToBottom();
    }

    /**
     * Clear terminal content
     */
    clearContent() {
        this.elements.contentArea.innerHTML = `
            <div class="welcome-message">
                <h3>RAG System Terminal</h3>
                <ul>
                    <li>Terminal cleared</li>
                    <li>Ready for new queries</li>
                    <li>Type 'help' for available commands</li>
                </ul>
            </div>
        `;
    }

    /**
     * Show welcome message
     */
    showWelcome() {
        this.elements.contentArea.innerHTML = `
            <div class="welcome-message action-box">
                <div class="action-header">👋 Welcome to RAG System</div>
                <div class="action-details">
                    <ul class="welcome-list">
                        <li>Connected to RAG API server</li>
                        <li>Enter your query below and press Enter or click the send button</li>
                        <li>Select mode: full, faiss, or none</li>
                        <li>Use the menu (⋮) to clear the terminal</li>
                        <li>Type 'help' for available commands</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Scroll to bottom of content area
     */
    scrollToBottom() {
        this.elements.contentArea.scrollTop = this.elements.contentArea.scrollHeight;
    }

    /**
     * Get query input value
     */
    getQueryInput() {
        return this.elements.queryInput.value.trim();
    }

    /**
     * Clear query input
     */
    clearQueryInput() {
        this.elements.queryInput.value = '';
    }

    /**
     * Focus query input
     */
    focusQueryInput() {
        this.elements.queryInput.focus();
    }

    /**
     * Get selected mode
     */
    getSelectedMode() {
        const selected = Array.from(this.elements.modeRadios).find(radio => radio.checked);
        return selected ? selected.value : config.query.defaultMode;
    }

    /**
     * Set mode programmatically
     */
    setMode(mode) {
        const validModes = ['full', 'faiss', 'none'];
        if (!validModes.includes(mode)) {
            return false;
        }
        const radio = Array.from(this.elements.modeRadios).find(r => r.value === mode);
        if (radio) {
            radio.checked = true;
            return true;
        }
        return false;
    }

    /**
     * Create separator
     */
    createSeparator(char = '═') {
        return char.repeat(config.ui.separatorLength);
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export singleton instance
export const uiManager = new UIManager();
export default uiManager;
