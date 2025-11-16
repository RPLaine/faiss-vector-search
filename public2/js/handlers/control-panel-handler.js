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
    constructor(agentController, haltController, modalManager, controlPanelManager, agentManager, canvasManager) {
        this.agentController = agentController;
        this.haltController = haltController;
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
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) return;
        
        const action = this.controlPanelManager.actionBtn?.dataset.action;
        
        if (action === 'start') {
            await this.agentController.startAgent(agentId);
        } else if (action === 'stop') {
            await this.agentController.stopAgent(agentId);
        } else if (action === 'redo') {
            await this.agentController.redoPhase(agentId);
        } else if (action === 'restart') {
            await this.agentController.restartAgent(agentId);
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
        const agent = this.agentManager.getAgent(agentId);
        if (!agent) return;
        
        // Open edit modal via ModalManager
        this.modalManager.showEditModal(agent);
    }
    
    /**
     * Handle delete button click
     */
    async handleDeleteAgent(agentId) {
        const agent = this.agentManager.getAgent(agentId);
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
        await this.agentController.toggleAuto(agentId, enabled);
    }
    
    /**
     * Handle halt checkbox toggle
     */
    async handleHaltToggle(agentId, enabled) {
        // Delegate to HaltController for all halt logic
        await this.haltController.toggleHalt(agentId, enabled);
    }
    
    /**
     * Handle expand checkbox toggle
     */
    async handleExpandToggle(agentId, enabled) {
        // Delegate to controller for all business logic and coordination
        await this.agentController.toggleExpanded(agentId, enabled);
        
        // After expand state changes, recalculate layout
        // Disable transitions for immediate repositioning
        this.canvasManager.addNoTransitionClass();
        
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
