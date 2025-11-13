/**
 * Form Handler Service
 * 
 * Handles all form operations: reading values, resetting forms, validation.
 * Encapsulates DOM element access for form interactions.
 */

export class FormHandler {
    constructor() {
        this.formIds = {
            create: {
                name: 'agentName',
                context: 'agentContext',
                temperature: 'agentTemperature',
                tempValue: 'tempValue'
            },
            edit: {
                id: 'editAgentId',
                name: 'editAgentName',
                context: 'editAgentContext',
                temperature: 'editAgentTemperature'
            }
        };
    }
    
    /**
     * Get create agent form data
     */
    getCreateAgentData() {
        const name = document.getElementById(this.formIds.create.name).value.trim();
        const context = document.getElementById(this.formIds.create.context).value.trim();
        const temperature = parseFloat(document.getElementById(this.formIds.create.temperature).value);
        
        return {
            name: name || null,
            context,
            temperature
        };
    }
    
    /**
     * Get edit agent form data
     */
    getEditAgentData() {
        const agentId = document.getElementById(this.formIds.edit.id).value;
        const name = document.getElementById(this.formIds.edit.name).value.trim();
        const context = document.getElementById(this.formIds.edit.context).value.trim();
        const temperature = parseFloat(document.getElementById(this.formIds.edit.temperature).value);
        
        return {
            agentId,
            name: name || null,
            context,
            temperature
        };
    }
    
    /**
     * Reset create agent form to defaults
     */
    resetCreateAgentForm() {
        document.getElementById(this.formIds.create.name).value = '';
        document.getElementById(this.formIds.create.context).value = '';
        document.getElementById(this.formIds.create.temperature).value = 0.3;
        document.getElementById(this.formIds.create.tempValue).textContent = '0.3';
    }
    
    /**
     * Populate edit form with agent data
     */
    populateEditForm(agent) {
        document.getElementById(this.formIds.edit.id).value = agent.id;
        document.getElementById(this.formIds.edit.name).value = agent.name || '';
        document.getElementById(this.formIds.edit.context).value = agent.context || '';
        document.getElementById(this.formIds.edit.temperature).value = agent.temperature || 0.3;
    }
    
    /**
     * Setup form event listeners
     */
    setupEventListeners(handlers) {
        // Add agent button
        document.getElementById('addAgentBtn')?.addEventListener('click', handlers.onAddAgent);
        
        // Clear completed button
        document.getElementById('clearCompletedBtn')?.addEventListener('click', handlers.onClearCompleted);
        
        // Create agent submit
        document.getElementById('createAgentSubmit')?.addEventListener('click', handlers.onCreateAgent);
        
        // Edit agent submit
        document.getElementById('editAgentSubmit')?.addEventListener('click', handlers.onEditAgent);
    }
}
