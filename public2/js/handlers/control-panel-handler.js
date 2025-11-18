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
    constructor(agentController, haltController, modalManager, controlPanelManager, agentManager, canvasManager, languageService = null) {
        this.agentController = agentController;
        this.haltController = haltController;
        this.modalManager = modalManager;
        this.controlPanelManager = controlPanelManager;
        this.agentManager = agentManager; // For querying agent state
        this.canvasManager = canvasManager; // For expand/collapse repositioning
        this.lang = languageService;
        
        this._attachHandlers();
    }
    
    /**
     * Update control panel states for all agents based on running/halted status
     * Called when any agent starts, stops, completes, or gets halted
     */
    updateAllControlPanels() {
        const runningOrHaltedAgentId = this.agentManager.getRunningOrHaltedAgentId();
        const selectedAgentId = this.agentManager.getSelectedAgentId();
        
        // Only update if an agent is selected
        if (!selectedAgentId) {
            return;
        }
        
        const selectedAgent = this.agentManager.getAgent(selectedAgentId);
        if (!selectedAgent) {
            return;
        }
        
        // If another agent is running/halted, disable controls for the selected agent
        if (runningOrHaltedAgentId && runningOrHaltedAgentId !== selectedAgentId) {
            this.controlPanelManager.setControlsEnabled(false);
        } else {
            // No other agent is running/halted, or this agent is the one running/halted
            // Just enable controls - updateForAgent already set the correct button state
            this.controlPanelManager.setControlsEnabled(true);
        }
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
        
        try {
            if (action === 'start') {
                await this.agentController.startAgent(agentId);
            } else if (action === 'stop') {
                await this.agentController.stopAgent(agentId);
            } else if (action === 'redo') {
                await this.agentController.redoPhase(agentId);
            } else if (action === 'restart') {
                await this.agentController.restartAgent(agentId);
            }
        } catch (error) {
            // Check if this is a 409 conflict error (race condition)
            const is409Conflict = error.message && (
                error.message.includes('409') || 
                error.message.includes('already running') ||
                error.message.includes('not running')
            );
            
            if (is409Conflict) {
                // Log as info - this is expected during race conditions
                console.info(`[ControlPanelHandler] ${action} ignored - agent state changed:`, error.message);
                // Trigger control panel refresh to sync button state
                this.updateAllControlPanels();
            } else {
                // Unexpected error - show to user
                console.error(`[ControlPanelHandler] ${action} failed:`, error);
                alert(`Action failed: ${error.message}`);
            }
        }
    }
    
    /**
     * Handle continue button click
     */
    async handleContinueAgent(agentId) {
        try {
            await this.agentController.continueAgent(agentId);
        } catch (error) {
            // Check if this is a 409 conflict error (race condition)
            const is409Conflict = error.message && (
                error.message.includes('409') || 
                error.message.includes('already running') ||
                error.message.includes('cannot continue')
            );
            
            if (is409Conflict) {
                // Log as info - this is expected during race conditions
                console.info(`[ControlPanelHandler] Continue ignored - agent state changed:`, error.message);
                // Trigger control panel refresh to sync button state
                this.updateAllControlPanels();
            } else {
                // Unexpected error - show to user
                console.error(`[ControlPanelHandler] Continue failed:`, error);
                alert(`Continue failed: ${error.message}`);
            }
        }
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
