/**
 * Task Selection Handler
 * 
 * Orchestrates task selection with coordinated state updates, visual feedback,
 * and tool visibility control. Mirrors the SelectionHandler pattern for agents.
 * 
 * Responsibilities:
 * - Handle task selection/deselection flow
 * - Coordinate state, visual, and tool visibility updates
 * - Manage smooth transitions between selections
 * 
 * NOT responsible for:
 * - State storage (delegated to TaskManager)
 * - Visual rendering (delegated to TaskRenderer)
 * - Tool visibility implementation (delegated to ToolController)
 */

import { POSITIONING_DELAYS } from '../constants.js';

export class TaskSelectionHandler {
    constructor(taskManager, taskRenderer, toolController) {
        this.taskManager = taskManager;
        this.taskRenderer = taskRenderer;
        this.toolController = toolController;
    }
    
    /**
     * Select a task with full coordination and smooth transitions
     * 
     * @param {string} taskKey - Task key to select (format: agentId-task-taskId)
     * @returns {boolean} True if selection changed
     */
    async selectTask(taskKey) {
        console.log(`[TaskSelectionHandler] Selecting task ${taskKey}`);
        
        const previouslySelected = this.taskManager.getSelectedTaskKey();
        
        // If clicking already-selected task, deselect it
        if (previouslySelected === taskKey) {
            await this.deselectTask(taskKey);
            return false;
        }
        
        // Deselect previous task (if any)
        if (previouslySelected) {
            await this._deselectTask(previouslySelected);
            await new Promise(resolve => setTimeout(resolve, POSITIONING_DELAYS.SELECTION_TRANSITION_DELAY));
        }
        
        // Perform selection
        await this._performSelection(taskKey);
        
        return true;
    }
    
    /**
     * Select a task with transition support for both auto and manual selection
     * Centralized method ensuring consistent animation choreography
     * 
     * @param {string} taskKey - Task key to select
     * @param {Object} options - Selection options
     * @param {boolean} options.isAutomatic - If true, this is automatic workflow selection
     * @param {number} options.delay - Optional delay before selection (for transition choreography)
     * @returns {Promise<boolean>} True if selection changed
     */
    async selectTaskWithTransition(taskKey, options = {}) {
        const { isAutomatic = false, delay = 0 } = options;
        
        console.log(`[TaskSelectionHandler] Selecting task ${taskKey} (${isAutomatic ? 'automatic' : 'manual'})`);
        
        // Wrapper for delayed execution
        const performSelection = async () => {
            const previouslySelected = this.taskManager.getSelectedTaskKey();
            
            // If clicking already-selected task (manual only), deselect it
            if (!isAutomatic && previouslySelected === taskKey) {
                await this.deselectTask(taskKey);
                return false;
            }
            
            // For automatic selection during workflow, allow selecting even if another task is selected
            // Deselect previous task (if any) with smooth transition
            if (previouslySelected && previouslySelected !== taskKey) {
                await this._deselectTask(previouslySelected);
                // Wait for deselection transition to complete before selecting new task
                await new Promise(resolve => setTimeout(resolve, POSITIONING_DELAYS.SELECTION_TRANSITION_DELAY));
            }
            
            // Perform selection
            await this._performSelection(taskKey);
            
            return true;
        };
        
        // Apply delay if specified (for transition choreography)
        if (delay > 0) {
            return new Promise(resolve => {
                setTimeout(async () => {
                    const result = await performSelection();
                    resolve(result);
                }, delay);
            });
        } else {
            return await performSelection();
        }
    }
    
    /**
     * Deselect current task
     * 
     * @param {string} taskKey - Optional task key to deselect (defaults to currently selected)
     */
    async deselectTask(taskKey) {
        if (!taskKey) taskKey = this.taskManager.getSelectedTaskKey();
        if (!taskKey) return;
        
        await this._deselectTask(taskKey);
        this.taskManager.clearTaskSelection();
    }
    
    /**
     * Deselect a task (internal)
     * 
     * @private
     */
    async _deselectTask(taskKey) {
        console.log(`[TaskSelectionHandler] Deselecting task ${taskKey}`);
        
        const taskData = this.taskManager.getTask(taskKey);
        if (!taskData) return;
        
        // Update visual state (pass element directly for pure rendering)
        this.taskRenderer.setSelected(taskData.element, false);
        
        // Hide tools for this task
        if (taskData.agentId && taskData.taskId) {
            await this.toolController.hideToolsForTask(taskData.agentId, taskData.taskId);
        }
    }
    
    /**
     * Perform task selection (internal)
     * 
     * @private
     */
    async _performSelection(taskKey) {
        console.log(`[TaskSelectionHandler] Performing selection for task ${taskKey}`);
        
        const taskData = this.taskManager.getTask(taskKey);
        if (!taskData) return;
        
        // Update state
        this.taskManager.selectTask(taskKey);
        
        // Update visual state (pass element directly for pure rendering)
        this.taskRenderer.setSelected(taskData.element, true);
        
        // Show tools for selected task
        if (taskData.agentId && taskData.taskId) {
            await this.toolController.showToolsForTask(taskData.agentId, taskData.taskId);
        }
    }
    
    /**
     * Get currently selected task key
     */
    getSelectedTaskKey() {
        return this.taskManager.getSelectedTaskKey();
    }
    
    /**
     * Check if a task is selected
     */
    isTaskSelected(taskKey) {
        return this.taskManager.isTaskSelected(taskKey);
    }
    
    /**
     * Clear task selection
     */
    clearSelection() {
        const currentlySelected = this.taskManager.getSelectedTaskKey();
        if (currentlySelected) {
            this._deselectTask(currentlySelected);
            this.taskManager.clearTaskSelection();
        }
    }
    
    /**
     * Auto-select a task if no other task is currently selected
     * Used for automatic selection when task starts running
     * 
     * @param {string} agentId - Agent ID
     * @param {string} taskId - Task ID
     * @returns {boolean} True if task was auto-selected
     */
    async selectTaskIfNoneSelected(agentId, taskId) {
        const currentlySelected = this.taskManager.getSelectedTaskKey();
        
        // Don't auto-select if user has manually selected another task
        if (currentlySelected) {
            return false;
        }
        
        const taskKey = `${agentId}-task-${taskId}`;
        console.log(`[TaskSelectionHandler] Auto-selecting running task ${taskKey}`);
        
        await this._performSelection(taskKey);
        return true;
    }
}
