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
        
        // Update visual state
        this.taskRenderer.setSelected(taskKey, false);
        
        // Hide tools for this task
        const taskData = this.taskManager.getTask(taskKey);
        if (taskData) {
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
        
        // Update state
        this.taskManager.selectTask(taskKey);
        
        // Update visual state
        this.taskRenderer.setSelected(taskKey, true);
        
        // Show tools for selected task
        const taskData = this.taskManager.getTask(taskKey);
        if (taskData) {
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
}
