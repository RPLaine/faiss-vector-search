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
            editAgent: document.getElementById('editAgentModal')
        };
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
    
    // ========================================
    // Global Modal Helpers (for onclick handlers)
    // ========================================
    
    setupGlobalClosers() {
        window.closeCreateAgentModal = () => this.closeCreateAgentModal();
        window.closeEditAgentModal = () => this.closeEditAgentModal();
    }
}
