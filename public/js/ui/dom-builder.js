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
        
        // Build and append content area
        body.appendChild(this.createContentArea());
        
        // Build and append input area
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
        
        const titleText = document.createElement('span');
        titleText.textContent = 'RAG Terminal';
        
        title.appendChild(statusDot);
        title.appendChild(titleText);
        
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
        
        const loadingIndicator = document.createElement('span');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.id = 'loadingIndicator';
        loadingIndicator.textContent = '▋';
        
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(loadingIndicator);
        
        // Button group
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';
        
        const executeBtn = document.createElement('button');
        executeBtn.className = 'btn btn-primary';
        executeBtn.id = 'executeBtn';
        executeBtn.textContent = 'Execute';
        
        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn';
        clearBtn.id = 'clearBtn';
        clearBtn.textContent = 'Clear';
        
        buttonGroup.appendChild(executeBtn);
        buttonGroup.appendChild(clearBtn);
        
        queryRow.appendChild(prefix);
        queryRow.appendChild(inputWrapper);
        queryRow.appendChild(buttonGroup);
        
        return queryRow;
    }
}

// Export singleton instance
export const domBuilder = new DOMBuilder();
export default domBuilder;
