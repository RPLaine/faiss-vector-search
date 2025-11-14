/**
 * Task Status Handler
 * 
 * Centralized task status management and coordination.
 * 
 * Responsibilities:
 * - Handle task status transitions
 * - Validate status changes
 * - Coordinate status updates across managers and renderers
 * - Trigger layout updates when task status changes
 * 
 * This handler acts as the single source of truth for task status changes.
 */

import { 
    TASK_STATUS, 
    TASK_STATUS_DISPLAY, 
    TASK_STATUS_CLASSES,
    TaskStatusPredicates,
    isValidTaskStatus
} from '../constants/status-constants.js';

export class TaskStatusHandler {
    constructor(taskManager, taskRenderer) {
        this.taskManager = taskManager;
        this.taskRenderer = taskRenderer;
    }
    
    /**
     * Update task status with validation and coordination
     * 
     * @param {string} agentId - Agent ID
     * @param {number} taskId - Task ID
     * @param {string} newStatus - New status value
     */
    updateStatus(agentId, taskId, newStatus) {
        // Validate status
        if (!isValidTaskStatus(newStatus)) {
            console.error(`[TaskStatusHandler] Invalid status: ${newStatus}`);
            return false;
        }
        
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) {
            console.warn(`[TaskStatusHandler] Task not found: ${taskKey}`);
            return false;
        }
        
        const oldStatus = this._getCurrentStatus(taskData);
        
        // Validate transition
        if (!this._isValidTransition(oldStatus, newStatus)) {
            console.warn(`[TaskStatusHandler] Invalid transition: ${oldStatus} → ${newStatus} for task ${taskId}`);
            // Allow it anyway for now (backend is authoritative)
        }
        
        console.log(`[TaskStatusHandler] Task ${agentId}/${taskId}: ${oldStatus} → ${newStatus}`);
        
        // Update UI
        this.taskRenderer.updateStatus(taskKey, newStatus);
        
        // Trigger layout alignment if task is becoming active
        if (newStatus === TASK_STATUS.RUNNING && oldStatus !== TASK_STATUS.RUNNING) {
            this._handleTaskBecameActive(agentId, taskId);
        }
        
        return true;
    }
    
    /**
     * Get current status from task DOM element
     */
    _getCurrentStatus(taskData) {
        if (!taskData.element) return null;
        
        const statusEl = taskData.element.querySelector('.task-node-status');
        if (!statusEl) return null;
        
        // Status is stored in the element's text content
        const statusText = statusEl.textContent.toLowerCase();
        
        // Map display text back to status constant
        for (const [key, value] of Object.entries(TASK_STATUS_DISPLAY)) {
            if (value.toLowerCase() === statusText) {
                return TASK_STATUS[key.toUpperCase()];
            }
        }
        
        return statusText;
    }
    
    /**
     * Handle task becoming active (align to agent top border)
     */
    _handleTaskBecameActive(agentId, taskId) {
        // Delegate to task manager for alignment
        this.taskManager.alignTaskToAgent(agentId, taskId);
    }
    
    /**
     * Validate status transition
     * 
     * @param {string} oldStatus - Current status
     * @param {string} newStatus - New status
     * @returns {boolean} True if transition is valid
     */
    _isValidTransition(oldStatus, newStatus) {
        // Allow any transition if no old status
        if (!oldStatus) return true;
        
        // Same status is always valid
        if (oldStatus === newStatus) return true;
        
        // Define valid transitions
        const validTransitions = {
            [TASK_STATUS.CREATED]: [
                TASK_STATUS.RUNNING,
                TASK_STATUS.CANCELLED
            ],
            [TASK_STATUS.RUNNING]: [
                TASK_STATUS.COMPLETED,
                TASK_STATUS.FAILED,
                TASK_STATUS.CANCELLED
            ],
            [TASK_STATUS.COMPLETED]: [
                TASK_STATUS.RUNNING,  // When redoing
                TASK_STATUS.FAILED    // When validation fails
            ],
            [TASK_STATUS.FAILED]: [
                TASK_STATUS.CREATED,  // When reset for retry
                TASK_STATUS.RUNNING   // When redoing
            ],
            [TASK_STATUS.CANCELLED]: [
                TASK_STATUS.CREATED   // When reset
            ]
        };
        
        const allowed = validTransitions[oldStatus] || [];
        return allowed.includes(newStatus);
    }
    
    /**
     * Get display text for status
     */
    getDisplayText(status) {
        return TASK_STATUS_DISPLAY[status] || status;
    }
    
    /**
     * Get CSS class for status
     */
    getCssClass(status) {
        return TASK_STATUS_CLASSES[status] || status;
    }
    
    /**
     * Check if task can be rerun
     */
    canRerun(agentId, taskId) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) return false;
        
        const status = this._getCurrentStatus(taskData);
        return TaskStatusPredicates.canRerun(status);
    }
    
    /**
     * Check if task is in terminal state
     */
    isTerminal(agentId, taskId) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) return false;
        
        const status = this._getCurrentStatus(taskData);
        return TaskStatusPredicates.isTerminal(status);
    }
    
    /**
     * Get task status
     */
    getStatus(agentId, taskId) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        return taskData ? this._getCurrentStatus(taskData) : null;
    }
}
