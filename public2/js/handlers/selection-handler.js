/**
 * Selection Handler
 * 
 * Centralized agent selection management and coordination.
 * 
 * Responsibilities:
 * - Handle agent selection changes
 * - Coordinate selection updates across managers and renderers
 * - Manage selection state transitions (deselect previous, select new)
 * - Trigger layout updates when selection changes
 * - Persist selection to backend
 * - Auto-scroll to newly selected agent
 * 
 * This handler acts as the single source of truth for agent selection changes.
 * 
 * IMPORTANT: During app initialization (CanvasInitializer), this handler should NOT
 * be called until AFTER tasks are created. The handler calls showTasksForAgent(),
 * which requires task DOM elements to exist. See CanvasInitializer for proper initialization order.
 */

import { APIService } from '../services/api-service.js';
import { POSITIONING_DELAYS } from '../constants.js';

export class SelectionHandler {
    constructor(agentManager, agentRenderer, taskController, controlPanelManager, canvasManager) {
        this.agentManager = agentManager;
        this.agentRenderer = agentRenderer;
        this.taskController = taskController;
        this.controlPanelManager = controlPanelManager;
        this.canvasManager = canvasManager;
    }
    
    /**
     * Select an agent with full coordination
     * 
     * @param {string} agentId - Agent ID to select
     * @returns {boolean} True if selection changed, false if already selected
     */
    selectAgent(agentId) {
        console.log(`[SelectionHandler] Selecting agent ${agentId}`);
        
        // Get previously selected agent
        const previouslySelected = this.agentManager.getSelectedAgentId();
        
        // If clicking the already-selected agent, do nothing
        if (previouslySelected === agentId) {
            console.log(`[SelectionHandler] Agent ${agentId} is already selected`);
            return false;
        }
        
        // Deselect previous agent
        if (previouslySelected) {
            this._deselectAgent(previouslySelected);
        }
        
        // Select new agent
        this._performSelection(agentId);
        
        // Persist selection to backend
        this._persistSelection(agentId);
        
        return true;
    }
    
    /**
     * Deselect an agent
     * 
     * @param {string} agentId - Agent ID to deselect
     * @private
     */
    _deselectAgent(agentId) {
        console.log(`[SelectionHandler] Deselecting agent ${agentId}`);
        
        // Update renderer (visual state)
        this.agentRenderer.setSelected(agentId, false);
        
        // Hide tasks for deselected agent
        this.taskController.hideTasksForAgent(agentId);
    }
    
    /**
     * Perform agent selection
     * 
     * @param {string} agentId - Agent ID to select
     * @private
     */
    _performSelection(agentId) {
        console.log(`[SelectionHandler] Performing selection for agent ${agentId}`);
        
        // Update state manager
        this.agentManager.selectAgent(agentId);
        
        // Update renderer (visual state)
        this.agentRenderer.setSelected(agentId, true);
        
        // Update control panel with selected agent state
        const selectedAgent = this.agentManager.getAgent(agentId);
        if (selectedAgent) {
            // Add hasFailedTasks flag to agent object for control panel
            const agentWithTaskInfo = {
                ...selectedAgent,
                hasFailedTasks: this.taskController.taskManager?.hasFailedTasks(agentId)
            };
            this.controlPanelManager.updateForAgent(agentWithTaskInfo);
        }
        
        // Show tasks for selected agent
        this.taskController.showTasksForAgent(agentId);
        
        // Recalculate agent positions (selected agent moves right, unselected move left)
        this.canvasManager.recalculateAgentPositions();
        
        // Recalculate task positions for the newly selected agent
        const agentTasks = this.taskController.taskManager?.getAgentTasks(agentId);
        if (agentTasks && agentTasks.length > 0) {
            this.taskController.positionTasksForAgent(agentId);
        }
        
        // Auto-scroll to the selected agent after layout recalculation completes
        // Use TASK_POSITION_DELAY to ensure tasks are positioned before scrolling
        setTimeout(() => {
            this.canvasManager.scrollAgentToCenter(agentId);
        }, POSITIONING_DELAYS.TASK_POSITION_DELAY);
    }
    
    /**
     * Persist selection to backend
     * 
     * @param {string} agentId - Agent ID
     * @private
     */
    _persistSelection(agentId) {
        APIService.selectAgent(agentId).catch(error => {
            console.error(`[SelectionHandler] Failed to persist agent selection: ${error}`);
        });
    }
    
    /**
     * Get currently selected agent ID
     * 
     * @returns {string|null} Selected agent ID or null
     */
    getSelectedAgentId() {
        return this.agentManager.getSelectedAgentId();
    }
    
    /**
     * Check if an agent is selected
     * 
     * @param {string} agentId - Agent ID to check
     * @returns {boolean} True if agent is selected
     */
    isAgentSelected(agentId) {
        return this.agentManager.isAgentSelected(agentId);
    }
    
    /**
     * Clear selection
     */
    clearSelection() {
        const currentlySelected = this.agentManager.getSelectedAgentId();
        if (currentlySelected) {
            this._deselectAgent(currentlySelected);
            this.agentManager.clearSelection();
            this.controlPanelManager.updateForAgent(null);
        }
    }
}
