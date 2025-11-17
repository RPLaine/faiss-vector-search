/**
 * Modal Manager - Manages modal dialogs and their forms
 * 
 * Responsibilities:
 * - Open and close modals
 * - Populate modal forms with data
 * - Retrieve form data
 * - Form validation
 * 
 * Separation: Pure modal and form management, no business logic
 */

export class ModalManager {
    constructor() {
        this.modals = {
            createAgent: document.getElementById('createAgentModal'),
            editAgent: document.getElementById('editAgentModal'),
            settings: document.getElementById('settingsModal')
        };
        this.currentSettingsTab = 'llm';
    }
    
    // ========================================
    // Create Agent Modal
    // ========================================
    
    openCreateAgentModal() {
        this.modals.createAgent.classList.add('active');
        document.getElementById('agentName').focus();
    }
    
    closeCreateAgentModal() {
        this.modals.createAgent.classList.remove('active');
    }
    
    getCreateAgentData() {
        return {
            name: document.getElementById('agentName').value.trim(),
            context: document.getElementById('agentContext').value.trim(),
            temperature: parseFloat(document.getElementById('agentTemperature').value)
        };
    }
    
    resetCreateAgentForm() {
        document.getElementById('agentName').value = '';
        document.getElementById('agentContext').value = '';
        document.getElementById('agentTemperature').value = 0.3;
        document.getElementById('tempValue').textContent = '0.3';
    }
    
    // ========================================
    // Edit Agent Modal
    // ========================================
    
    openEditAgentModal() {
        this.modals.editAgent.classList.add('active');
        document.getElementById('editAgentName').focus();
    }
    
    closeEditAgentModal() {
        this.modals.editAgent.classList.remove('active');
    }
    
    populateEditAgentModal(agent) {
        document.getElementById('editAgentId').value = agent.id;
        document.getElementById('editAgentName').value = agent.name || '';
        document.getElementById('editAgentContext').value = agent.context || '';
        document.getElementById('editAgentTemperature').value = agent.temperature || 0.3;
        document.getElementById('editTempValue').textContent = agent.temperature || 0.3;
    }
    
    getEditAgentData() {
        return {
            agentId: document.getElementById('editAgentId').value,
            name: document.getElementById('editAgentName').value.trim(),
            context: document.getElementById('editAgentContext').value.trim(),
            temperature: parseFloat(document.getElementById('editAgentTemperature').value)
        };
    }
    
    /**
     * Convenience method: populate and show edit modal
     */
    showEditModal(agent) {
        this.populateEditAgentModal(agent);
        this.openEditAgentModal();
    }
    
    // ========================================
    // Settings Modal
    // ========================================
    
    openSettingsModal() {
        this.modals.settings.classList.add('active');
        this.switchSettingsTab(this.currentSettingsTab);
    }
    
    closeSettingsModal() {
        this.modals.settings.classList.remove('active');
    }
    
    switchSettingsTab(tabName) {
        this.currentSettingsTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });
    }
    
    populateSettingsModal(settings) {
        // Populate LLM config
        const llm = settings.llm || {};
        document.getElementById('llmUrl').value = llm.url || '';
        document.getElementById('llmModel').value = llm.model || '';
        document.getElementById('llmPayloadType').value = llm.payload_type || 'message';
        document.getElementById('llmTimeout').value = llm.timeout || 300;
        document.getElementById('llmMaxTokens').value = llm.max_tokens || 2000;
        document.getElementById('llmTemperature').value = llm.temperature || 0.3;
        document.getElementById('llmTempValue').textContent = llm.temperature || 0.3;
        document.getElementById('llmTopP').value = llm.top_p || 0.90;
        document.getElementById('llmTopPValue').textContent = llm.top_p || 0.90;
        document.getElementById('llmTopK').value = llm.top_k || 20;
        
        // Populate headers
        this.populateHeaders(llm.headers || {});
        
        // Populate prompts
        const prompts = settings.prompts || {};
        document.getElementById('promptHiddenContext').value = prompts.hidden_context || '';
        document.getElementById('promptPlanning').value = prompts.phase_0_planning || '';
        document.getElementById('promptTaskExecution').value = prompts.task_execution || '';
        document.getElementById('promptTaskValidation').value = prompts.task_validation || '';
    }
    
    populateHeaders(headers) {
        const container = document.getElementById('headersContainer');
        container.innerHTML = '';
        
        // Add existing headers
        Object.entries(headers).forEach(([key, value]) => {
            this.addHeaderRow(key, value);
        });
        
        // Add one empty row if no headers
        if (Object.keys(headers).length === 0) {
            this.addHeaderRow('', '');
        }
    }
    
    addHeaderRow(key = '', value = '') {
        const container = document.getElementById('headersContainer');
        const row = document.createElement('div');
        row.className = 'header-row';
        row.innerHTML = `
            <input type="text" class="form-input header-key" placeholder="Header name" value="${key}">
            <input type="text" class="form-input header-value" placeholder="Header value" value="${value}">
            <button type="button" class="btn btn-icon btn-small remove-header-btn">&times;</button>
        `;
        
        // Add remove handler
        row.querySelector('.remove-header-btn').addEventListener('click', () => {
            row.remove();
        });
        
        container.appendChild(row);
    }
    
    getSettingsData() {
        // Get LLM config
        const llmConfig = {
            url: document.getElementById('llmUrl').value.trim(),
            model: document.getElementById('llmModel').value.trim(),
            payload_type: document.getElementById('llmPayloadType').value,
            timeout: parseInt(document.getElementById('llmTimeout').value),
            max_tokens: parseInt(document.getElementById('llmMaxTokens').value),
            temperature: parseFloat(document.getElementById('llmTemperature').value),
            top_p: parseFloat(document.getElementById('llmTopP').value),
            top_k: parseInt(document.getElementById('llmTopK').value),
            headers: this.getHeaders()
        };
        
        // Get prompts
        const prompts = {
            hidden_context: document.getElementById('promptHiddenContext').value,
            phase_0_planning: document.getElementById('promptPlanning').value,
            task_execution: document.getElementById('promptTaskExecution').value,
            task_validation: document.getElementById('promptTaskValidation').value
        };
        
        return { llm: llmConfig, prompts };
    }
    
    getHeaders() {
        const headers = {};
        document.querySelectorAll('.header-row').forEach(row => {
            const key = row.querySelector('.header-key').value.trim();
            const value = row.querySelector('.header-value').value.trim();
            if (key) {
                headers[key] = value;
            }
        });
        return headers;
    }
    
    // ========================================
    // Global Modal Helpers (for onclick handlers)
    // ========================================
    
    setupGlobalClosers() {
        window.closeCreateAgentModal = () => this.closeCreateAgentModal();
        window.closeEditAgentModal = () => this.closeEditAgentModal();
    }
}
