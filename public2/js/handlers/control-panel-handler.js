/**
 * Control Panel Handler - Handles events from the centralized agent control panel
 * 
 * Responsibilities:
 * - Handle control panel button clicks (Start/Stop/Continue/Edit/Delete)
 * - Handle control panel checkbox changes (Auto/Halt/Expand)
 * - Delegate to appropriate controllers for business logic
 * - Coordinate UI updates with ControlPanelManager
 * 
 * Delegation:
 * - Agent operations: AgentController
 * - Modal interactions: ModalManager
 * - Panel UI updates: ControlPanelManager
 * - Canvas operations: CanvasManager (via injected reference)
 * 
 * Layer: Handler (Event handling → Controller delegation)
 */

import { POSITIONING_DELAYS } from '../constants.js';

export class ControlPanelHandler {
    constructor(agentController, modalManager, controlPanelManager, agentManager, canvasManager) {
        this.agentController = agentController;
        this.modalManager = modalManager;
        this.controlPanelManager = controlPanelManager;
        this.agentManager = agentManager; // For querying agent state
        this.canvasManager = canvasManager; // For expand/collapse repositioning
        
        this._attachHandlers();
    }
    
    /**
     * Attach handlers to control panel manager
     */
    _attachHandlers() {
        this.controlPanelManager.setHandlers({
            onAction: (agentId) => this.handleActionButton(agentId),
            onContinue: (agentId) => this.handleContinueAgent(agentId),
            onEdit: (agentId) => this.handleEditAgent(agentId),
            onDelete: (agentId) => this.handleDeleteAgent(agentId),
            onAutoToggle: (agentId, enabled) => this.handleAutoToggle(agentId, enabled),
            onHaltToggle: (agentId, enabled) => this.handleHaltToggle(agentId, enabled),
            onExpandToggle: (agentId, enabled) => this.handleExpandToggle(agentId, enabled)
        });
    }
    
    /**
     * Handle action button click (Start/Stop/Restart)
     */
    async handleActionButton(agentId) {
        const agent = this.agentManager.agents.get(agentId);
        if (!agent) return;
        
        const action = this.controlPanelManager.actionBtn?.dataset.action;
        
        if (action === 'start') {
            await this.agentController.startAgent(agentId);
        } else if (action === 'stop') {
            await this.agentController.cancelAgent(agentId);
        } else if (action === 'redo') {
            await this.agentController.redoAgent(agentId);
        }
    }
    
    /**
     * Handle continue button click
     */
    async handleContinueAgent(agentId) {
        await this.agentController.continueAgent(agentId);
    }
    
    /**
     * Handle edit button click
     */
    handleEditAgent(agentId) {
        const agent = this.agentManager.agents.get(agentId);
        if (!agent) return;
        
        // Open edit modal via ModalManager
        this.modalManager.showEditModal(agent);
    }
    
    /**
     * Handle delete button click
     */
    async handleDeleteAgent(agentId) {
        const agent = this.agentManager.agents.get(agentId);
        if (!agent) return;
        
        // Confirm deletion
        if (!confirm(`Are you sure you want to delete agent "${agent.context}"?`)) {
            return;
        }
        
        await this.agentController.deleteAgent(agentId);
    }
    
    /**
     * Handle auto checkbox toggle
     */
    async handleAutoToggle(agentId, enabled) {
        const agent = this.agentManager.agents.get(agentId);
        if (!agent) return;
        
        // Update agent auto state
        agent.auto = enabled;
        
        // Send to backend
        await this.agentController.updateAgentAuto(agentId, enabled);
    }
    
    /**
     * Handle halt checkbox toggle
     */
    async handleHaltToggle(agentId, enabled) {
        const agent = this.agentManager.agents.get(agentId);
        if (!agent) return;
        
        // Update agent halt state
        agent.halt = enabled;
        
        // Send to backend
        await this.agentController.updateAgentHalt(agentId, enabled);
    }
    
    /**
     * Handle expand checkbox toggle
     */
    async handleExpandToggle(agentId, enabled) {
        const agent = this.agentManager.agents.get(agentId);
        if (!agent) return;
        
        // Disable transitions for immediate repositioning
        this.canvasManager.addNoTransitionClass();
        
        // Update local state
        agent.expanded = enabled;
        
        // Update agent node UI (add/remove expanded class)
        const agentElement = document.querySelector(`[data-agent-id="${agentId}"]`);
        if (agentElement) {
            const contentElement = agentElement.querySelector('.agent-node-content');
            if (contentElement) {
                if (enabled) {
                    contentElement.classList.add('expanded');
                } else {
                    contentElement.classList.remove('expanded');
                }
            }
        }
        
        // Wait for DOM to update with new content height
        await new Promise(resolve => requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
        }));
        
        // Recalculate positions immediately (no animation)
        this.canvasManager.recalculateAllPositions();
        
        // Re-enable transitions after recalculation completes
        setTimeout(() => {
            this.canvasManager.removeNoTransitionClass();
            // Then recenter the agent smoothly
            this.canvasManager.scrollAgentToCenter(agentId);
        }, POSITIONING_DELAYS.EXPAND_TRANSITION_REENABLE);
    }
}
