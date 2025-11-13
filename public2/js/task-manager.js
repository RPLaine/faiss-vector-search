/**
 * Task Manager (Refactored) - Pure state management for tasks
 * 
 * Responsibilities:
 * - Store task data
 * - Manage task-agent relationships
 * - Provide task query methods
 * 
 * NOT responsible for:
 * - DOM manipulation (delegated to TaskRenderer)
 * - HTML generation (delegated to TaskRenderer)
 * - Business logic (delegated to TaskController)
 * - Layout calculations (delegated to TaskLayoutCalculator)
 */

import { TaskLayoutCalculator } from './utils/task-layout-calculator.js';
import { POSITIONING_DELAYS, LAYOUT_DIMENSIONS } from './constants.js';

export class TaskManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.taskNodes = new Map(); // task_key -> {element, agentId, taskId, globalX, globalY}
        this.agentTasks = new Map(); // agent_id -> Set of task_keys
        this.isAligning = new Map(); // agent_id -> boolean (prevents conflicts during alignment)
        
        // Listen for camera position updates to update task screen positions
        window.addEventListener('updateTaskScreenPositions', (e) => {
            this.updateAllTaskScreenPositions(e.detail.camera);
        });
        
        // Note: Centralized recalculation is handled by TaskController
        // which listens to 'recalculateTaskPositions' events
    }
    
    /**
     * Update all task DOM positions based on camera position
     */
    updateAllTaskScreenPositions(camera) {
        for (const [taskKey, taskData] of this.taskNodes.entries()) {
            if (!taskData.element) continue;
            
            // Convert global to screen coordinates
            const screenX = taskData.globalX - camera.x;
            const screenY = taskData.globalY - camera.y;
            
            taskData.element.style.left = `${screenX}px`;
            taskData.element.style.top = `${screenY}px`;
        }
    }
    
    // ========================================
    // State Management Methods
    // ========================================
    
    /**
     * Add a task to the manager
     */
    addTask(taskKey, taskData) {
        this.taskNodes.set(taskKey, taskData);
    }
    
    /**
     * Get a task by key
     */
    getTask(taskKey) {
        return this.taskNodes.get(taskKey);
    }
    
    /**
     * Remove a task
     */
    removeTask(taskKey) {
        this.taskNodes.delete(taskKey);
    }
    
    /**
     * Set task keys for an agent
     */
    setAgentTasks(agentId, taskKeys) {
        this.agentTasks.set(agentId, new Set(taskKeys));
    }
    
    /**
     * Get task keys for an agent
     */
    getAgentTasks(agentId) {
        const taskKeys = this.agentTasks.get(agentId);
        return taskKeys ? Array.from(taskKeys) : [];
    }
    
    /**
     * Clear tasks for an agent
     */
    clearAgentTasks(agentId) {
        this.agentTasks.delete(agentId);
    }
    
    /**
     * Get all tasks for an agent sorted by ID
     */
    getSortedTasksForAgent(agentId) {
        const taskKeys = this.getAgentTasks(agentId);
        return taskKeys
            .map(key => this.taskNodes.get(key))
            .filter(task => task != null)
            .sort((a, b) => a.taskId - b.taskId);
    }
    
    // ========================================
    // Layout Calculation Methods (Delegated)
    // ========================================
    
    /**
     * Calculate task positions for an agent
     * Returns array of {taskKey, x, y}
     */
    calculateTaskPositions(agentId, agentPos) {
        const taskKeys = this.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return [];
        
        // Get agent dimensions
        const agentElement = this.canvasManager.agents.get(agentId)?.element;
        if (!agentElement) return [];
        
        const agentWidth = agentElement.offsetWidth || LAYOUT_DIMENSIONS.AGENT_WIDTH;
        
        // Delegate to pure utility function
        return TaskLayoutCalculator.calculateTaskPositions({
            taskKeys,
            getTaskData: (key) => this.taskNodes.get(key),
            agentPos,
            agentWidth,
            gapBetweenElements: LAYOUT_DIMENSIONS.GAP_BETWEEN_TASKS,
            horizontalGap: LAYOUT_DIMENSIONS.GAP_AGENT_TO_TASK
        });
    }
    
    /**
     * Recalculate positions for all tasks (data only)
     * Note: TaskController handles DOM updates and connection lines
     * This method is kept for potential direct state updates
     */
    recalculateAllTaskPositions() {
        for (const agentId of this.agentTasks.keys()) {
            const agentPos = this.canvasManager.getAgentPosition(agentId);
            if (agentPos) {
                const positions = this.calculateTaskPositions(agentId, agentPos);
                
                // Update stored global positions (data only)
                positions.forEach(({ taskKey, x, y }) => {
                    const taskData = this.taskNodes.get(taskKey);
                    if (taskData) {
                        taskData.globalX = x;
                        taskData.globalY = y;
                    }
                });
            }
        }
    }
    
    /**
     * Set alignment flag to prevent concurrent positioning
     */
    setAligning(agentId, isAligning) {
        this.isAligning.set(agentId, isAligning);
    }
    
    /**
     * Check if agent is currently aligning
     */
    isAgentAligning(agentId) {
        return this.isAligning.get(agentId) || false;
    }
    
    /**
     * Mark task to align with agent top border
     * Used when task status changes to 'running'
     */
    alignTaskToAgent(agentId, taskId) {
        // Set alignment flag
        this.setAligning(agentId, true);
        
        // Calculate new positions with this task aligned
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) {
            this.setAligning(agentId, false);
            return;
        }
        
        const positions = this.calculateTaskPositions(agentId, agentPos);
        
        // Update stored global positions
        positions.forEach(({ taskKey, x, y }) => {
            const taskData = this.taskNodes.get(taskKey);
            if (taskData) {
                taskData.globalX = x;
                taskData.globalY = y;
            }
        });
        
        // Clear alignment flag after animation
        setTimeout(() => {
            this.setAligning(agentId, false);
        }, POSITIONING_DELAYS.TASK_ALIGNMENT_CLEAR);
    }
    
    // ========================================
    // Query Methods
    // ========================================
    
    /**
     * Get the first task for an agent
     */
    getFirstTask(agentId) {
        const tasks = this.getSortedTasksForAgent(agentId);
        return tasks.length > 0 ? tasks[0] : null;
    }
    
    /**
     * Get the next unexecuted task for an agent
     */
    getNextUnexecutedTask(agentId) {
        const tasks = this.getSortedTasksForAgent(agentId);
        
        for (const taskData of tasks) {
            if (!taskData || !taskData.element) continue;
            
            const statusEl = taskData.element.querySelector('.task-node-status');
            if (!statusEl) continue;
            
            const status = statusEl.textContent.toLowerCase();
            
            // Return first task that is not completed, failed, or running
            if (status === 'created' || status === 'halted') {
                return taskData;
            }
        }
        
        return null;
    }
    
    /**
     * Check if agent has any failed tasks
     */
    hasFailedTasks(agentId) {
        const tasks = this.getSortedTasksForAgent(agentId);
        
        for (const taskData of tasks) {
            if (!taskData || !taskData.element) continue;
            
            const statusEl = taskData.element.querySelector('.task-node-status');
            if (!statusEl) continue;
            
            const status = statusEl.textContent.toLowerCase();
            if (status === 'failed') {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Get the first failed task for an agent
     */
    getFirstFailedTask(agentId) {
        const tasks = this.getSortedTasksForAgent(agentId);
        
        for (const taskData of tasks) {
            if (!taskData || !taskData.element) continue;
            
            const statusEl = taskData.element.querySelector('.task-node-status');
            if (!statusEl) continue;
            
            const status = statusEl.textContent.toLowerCase();
            if (status === 'failed') {
                return taskData;
            }
        }
        
        return null;
    }
}
