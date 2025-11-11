/**
 * DOM Builder Module
 * Creates and injects foundational HTML structure
 */

class DOMBuilder {
    /**
     * Build the entire application structure
     */
    buildStructure() {
        const body = document.body;
        
        // Clear body
        body.innerHTML = '';
        
        // Build and append header
        body.appendChild(this.createHeader());
        
        // Create main container
        const mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        
        // Build and append content area to container
        mainContainer.appendChild(this.createContentArea());
        
        // Append container to body
        body.appendChild(mainContainer);
        
        // Build and append input area directly to body
        body.appendChild(this.createInputArea());
    }

    /**
     * Create terminal header
     */
    createHeader() {
        const header = document.createElement('div');
        header.className = 'terminal-header';
        
        const title = document.createElement('div');
        title.className = 'terminal-title';
        
        const statusDot = document.createElement('span');
        statusDot.className = 'status-indicator';
        statusDot.id = 'statusDot';
        
        const connectionStatus = document.createElement('span');
        connectionStatus.className = 'connection-status';
        connectionStatus.id = 'connectionStatus';
        connectionStatus.textContent = 'offline';
        
        title.appendChild(statusDot);
        title.appendChild(connectionStatus);
        
        const info = document.createElement('div');
        info.className = 'terminal-info';
        info.id = 'terminalInfo';
        info.textContent = 'Ready';
        
        header.appendChild(title);
        header.appendChild(info);
        
        return header;
    }

    /**
     * Create content area
     */
    createContentArea() {
        const content = document.createElement('div');
        content.className = 'content-area';
        content.id = 'contentArea';
        return content;
    }

    /**
     * Create input area
     */
    createInputArea() {
        const inputArea = document.createElement('div');
        inputArea.className = 'input-area';
        
        // Mode selector
        inputArea.appendChild(this.createModeSelector());
        
        // Query row
        inputArea.appendChild(this.createQueryRow());
        
        return inputArea;
    }

    /**
     * Create mode selector
     */
    createModeSelector() {
        const modeSelector = document.createElement('div');
        modeSelector.className = 'mode-selector';
        
        const label = document.createElement('span');
        label.className = 'mode-label';
        label.textContent = 'Mode:';
        modeSelector.appendChild(label);
        
        const modes = [
            { value: 'full', label: 'Full', checked: true },
            { value: 'faiss', label: 'FAISS', checked: false },
            { value: 'none', label: 'None', checked: false }
        ];
        
        modes.forEach(mode => {
            const wrapper = document.createElement('label');
            wrapper.className = 'radio-wrapper';
            
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'queryMode';
            input.value = mode.value;
            if (mode.checked) input.checked = true;
            
            const span = document.createElement('span');
            span.textContent = mode.label;
            
            wrapper.appendChild(input);
            wrapper.appendChild(span);
            modeSelector.appendChild(wrapper);
        });
        
        // Add menu button
        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'menu-btn';
        menuBtn.id = 'menuBtn';
        menuBtn.innerHTML = '⋮';
        menuBtn.title = 'Menu';
        modeSelector.appendChild(menuBtn);
        
        // Create menu modal
        const menuModal = document.createElement('div');
        menuModal.className = 'menu-modal';
        menuModal.id = 'menuModal';
        menuModal.innerHTML = `
            <button type="button" class="menu-item" id="vectorStoreBtn">
                <span class="menu-icon">📦</span>
                <span class="menu-label">Vector Store</span>
            </button>
            <button type="button" class="menu-item" id="clearBtn">
                <span class="menu-icon">🗑️</span>
                <span class="menu-label">Clear</span>
            </button>
        `;
        modeSelector.appendChild(menuModal);
        
        return modeSelector;
    }

    /**
     * Create query row
     */
    createQueryRow() {
        const queryRow = document.createElement('div');
        queryRow.className = 'query-row';
        
        // Input prefix
        const prefix = document.createElement('span');
        prefix.className = 'input-prefix';
        prefix.textContent = '❯';
        
        // Input wrapper
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'input-wrapper';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'query-input';
        input.placeholder = 'Enter your query...';
        input.autocomplete = 'off';
        
        // Stop button (hidden by default)
        const stopBtn = document.createElement('button');
        stopBtn.type = 'button';
        stopBtn.className = 'stop-btn hidden';
        stopBtn.id = 'stopBtn';
        stopBtn.innerHTML = '⏹';
        stopBtn.title = 'Stop processing';
        
        // Send button inside input
        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'send-btn';
        sendBtn.id = 'executeBtn';
        sendBtn.innerHTML = '➤';
        sendBtn.title = 'Send query';
        
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(stopBtn);
        inputWrapper.appendChild(sendBtn);
        
        queryRow.appendChild(prefix);
        queryRow.appendChild(inputWrapper);
        
        return queryRow;
    }
}

// Export singleton instance
export const domBuilder = new DOMBuilder();
export default domBuilder;
