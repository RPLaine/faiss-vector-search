/**
 * Task Layout Calculator - Pure layout calculation utility
 * 
 * Responsibilities:
 * - Calculate task positions for an agent
 * - Determine alignment logic
 * - NO DOM manipulation
 * - NO state management
 * - Pure functions only
 */

export class TaskLayoutCalculator {
    /**
     * Calculate task positions for an agent
     * 
     * @param {Object} params - Layout parameters
     * @param {Array} params.taskKeys - Array of task keys to position
     * @param {Function} params.getTaskData - Function to get task data by key
     * @param {Object} params.agentPos - Agent position {x, y}
     * @param {number} params.agentWidth - Agent width in pixels
     * @param {number} params.gapBetweenElements - Gap between tasks (default: 20)
     * @param {number} params.horizontalGap - Gap between agent and tasks (default: 40)
     * @returns {Array} Array of {taskKey, x, y} positions
     */
    static calculateTaskPositions({
        taskKeys,
        getTaskData,
        agentPos,
        agentWidth,
        gapBetweenElements = 20,
        horizontalGap = 40
    }) {
        if (!taskKeys || taskKeys.length === 0) return [];
        if (!agentPos) return [];
        
        // Starting position for tasks (right of agent with gap)
        const startX = agentPos.x + agentWidth + horizontalGap;
        
        // Sort tasks by ID
        const sortedTaskKeys = [...taskKeys].sort((a, b) => {
            const taskA = getTaskData(a);
            const taskB = getTaskData(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Calculate heights
        const taskHeights = sortedTaskKeys.map(taskKey => {
            const taskData = getTaskData(taskKey);
            if (!taskData) return 0;
            return taskData.element.offsetHeight || 300;
        });
        
        // Determine alignment based on task status
        const alignTaskIndex = this._getAlignmentIndex(sortedTaskKeys, getTaskData);
        
        // Calculate start Y position
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
     * 
     * Priority:
     * 1. Running task
     * 2. Last task if all completed
     * 3. First task (default)
     * 
     * @param {Array} sortedTaskKeys - Task keys sorted by ID
     * @param {Function} getTaskData - Function to get task data by key
     * @returns {number} Index of task to align with agent
     */
    static _getAlignmentIndex(sortedTaskKeys, getTaskData) {
        // Find running task
        for (let i = 0; i < sortedTaskKeys.length; i++) {
            const taskData = getTaskData(sortedTaskKeys[i]);
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
            const taskData = getTaskData(taskKey);
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
}
