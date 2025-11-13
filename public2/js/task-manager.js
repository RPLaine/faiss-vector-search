/**
 * Task Manager (Refactored) - Pure state management for tasks
 * 
 * Responsibilities:
 * - Store task data
 * - Calculate task positions (layout logic)
 * - Manage task-agent relationships
 * 
 * NOT responsible for:
 * - DOM manipulation (delegated to TaskRenderer)
 * - HTML generation (delegated to TaskRenderer)
 * - Business logic (delegated to TaskController)
 */

export class TaskManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.taskNodes = new Map(); // task_key -> {element, agentId, taskId, x, y}
        this.agentTasks = new Map(); // agent_id -> Set of task_keys
        this.isAligning = new Map(); // agent_id -> boolean (prevents conflicts during alignment)
        
        // Note: Centralized recalculation is handled by TaskController
        // which listens to 'recalculateTaskPositions' events
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
    // Layout Calculation Methods
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
        
        const agentWidth = agentElement.offsetWidth || 320;
        
        // Starting position for tasks (right of agent with gap)
        const startX = agentPos.x + agentWidth + 40; // 40px gap
        
        // Sort tasks by ID
        const sortedTaskKeys = taskKeys.sort((a, b) => {
            const taskA = this.taskNodes.get(a);
            const taskB = this.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Calculate heights
        const taskHeights = [];
        for (const taskKey of sortedTaskKeys) {
            const taskData = this.taskNodes.get(taskKey);
            if (!taskData) continue;
            const height = taskData.element.offsetHeight || 300;
            taskHeights.push(height);
        }
        
        // Determine alignment based on task status
        const alignTaskIndex = this._getAlignmentIndex(sortedTaskKeys);
        
        // Calculate start Y position
        const gapBetweenElements = 20;
        let heightBeforeAlignedTask = 0;
        for (let i = 0; i < alignTaskIndex; i++) {
            heightBeforeAlignedTask += taskHeights[i] + gapBetweenElements;
        }
        
        let startY = agentPos.y - heightBeforeAlignedTask;
        let currentY = startY;
        
        // Build positions array
        const positions = [];
        sortedTaskKeys.forEach((taskKey, index) => {
            positions.push({
                taskKey,
                x: startX,
                y: currentY
            });
            currentY += taskHeights[index] + gapBetweenElements;
        });
        
        return positions;
    }
    
    /**
     * Determine which task should align with agent top
     */
    _getAlignmentIndex(sortedTaskKeys) {
        // Find running task
        for (let i = 0; i < sortedTaskKeys.length; i++) {
            const taskData = this.taskNodes.get(sortedTaskKeys[i]);
            const statusEl = taskData?.element.querySelector('.task-node-status');
            const status = statusEl?.textContent.toLowerCase();
            if (status === 'running') {
                return i;
            }
        }
        
        // Check if all tasks are completed
        let allCompleted = true;
        let hasAnyNonCreated = false;
        for (const taskKey of sortedTaskKeys) {
            const taskData = this.taskNodes.get(taskKey);
            const statusEl = taskData?.element.querySelector('.task-node-status');
            const status = statusEl?.textContent.toLowerCase();
            if (status !== 'completed') {
                allCompleted = false;
            }
            if (status !== 'created' && status !== 'pending') {
                hasAnyNonCreated = true;
            }
        }
        
        // If all completed, align last task
        if (allCompleted && sortedTaskKeys.length > 0) {
            return sortedTaskKeys.length - 1;
        }
        
        // If all tasks are in initial state (created/pending), start from agent position
        // This prevents tasks from being positioned above the agent on page load
        if (!hasAnyNonCreated) {
            return 0; // First task aligns with agent, rest flow down
        }
        
        // Default: align first task
        return 0;
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
                
                // Update stored positions (data only)
                positions.forEach(({ taskKey, x, y }) => {
                    const taskData = this.taskNodes.get(taskKey);
                    if (taskData) {
                        taskData.x = x;
                        taskData.y = y;
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
        
        // Update stored positions
        positions.forEach(({ taskKey, x, y }) => {
            const taskData = this.taskNodes.get(taskKey);
            if (taskData) {
                taskData.x = x;
                taskData.y = y;
            }
        });
        
        // Clear alignment flag after animation (850ms)
        setTimeout(() => {
            this.setAligning(agentId, false);
        }, 850);
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
