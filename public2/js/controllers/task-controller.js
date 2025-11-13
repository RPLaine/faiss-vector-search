/**
 * Task Controller - Handles task business logic
 * 
 * Coordinates between:
 * - TaskManager (state)
 * - TaskRenderer (UI updates)
 * - CanvasManager (layout updates)
 */

export class TaskController {
    constructor(taskManager, taskRenderer, canvasManager) {
        this.taskManager = taskManager;
        this.renderer = taskRenderer;
        this.canvasManager = canvasManager;
        
        // Listen for centralized recalculation events
        window.addEventListener('recalculateTaskPositions', () => {
            this.recalculateAllTaskPositions();
        });
    }
    
    /**
     * Recalculate and apply positions for all tasks
     * Called by centralized canvas recalculation system
     */
    recalculateAllTaskPositions() {
        console.log('[TaskController] Recalculating all task positions');
        
        // Get all agents that have tasks
        for (const agentId of this.taskManager.agentTasks.keys()) {
            const taskKeys = this.taskManager.getAgentTasks(agentId);
            if (!taskKeys || taskKeys.length === 0) continue;
            
            const agentPos = this.canvasManager.getAgentPosition(agentId);
            if (!agentPos) continue;
            
            // Calculate new positions
            const positions = this.taskManager.calculateTaskPositions(agentId, agentPos);
            
            // Apply positions to DOM immediately (centralized recalculation handles timing)
            positions.forEach(({ taskKey, x, y }) => {
                const taskData = this.taskManager.getTask(taskKey);
                if (!taskData) return;
                
                // Update stored position
                taskData.x = x;
                taskData.y = y;
                
                // Apply to DOM immediately (no animation during recalculation)
                this.renderer.setPosition(taskData.element, x, y, true);
            });
        }
        
        console.log('[TaskController] Task repositioning complete');
        
        // Note: Canvas height and connection lines are updated by CanvasManager
        // after this method completes as part of the coordinated recalculation
    }
    
    /**
     * Create tasks for an agent from a tasklist
     */
    createTasksForAgent(agentId, tasklist) {
        if (!tasklist || !tasklist.tasks || !Array.isArray(tasklist.tasks)) {
            console.warn(`No valid tasklist for agent ${agentId}`);
            return;
        }
        
        console.log(`[TaskController] Creating ${tasklist.tasks.length} tasks for agent ${agentId}`);
        
        // Clear existing tasks
        this.clearTasksForAgent(agentId);
        
        // Sort tasks by ID
        const sortedTasks = [...tasklist.tasks].sort((a, b) => a.id - b.id);
        
        // Create task nodes
        const taskKeys = [];
        sortedTasks.forEach((task, index) => {
            const taskKey = `${agentId}-task-${task.id}`;
            
            // Render task node
            const taskNode = this.renderer.renderTask(agentId, task, index, sortedTasks.length);
            
            // Store task data
            this.taskManager.addTask(taskKey, {
                element: taskNode,
                agentId: agentId,
                taskId: task.id,
                x: 0,
                y: 0
            });
            
            taskKeys.push(taskKey);
        });
        
        // Store task keys for this agent
        this.taskManager.setAgentTasks(agentId, taskKeys);
        
        // Position tasks after DOM elements have rendered
        // Use requestAnimationFrame to ensure offsetHeight is calculated
        requestAnimationFrame(() => {
            this.positionTasksForAgent(agentId, true);
        });
        
        console.log(`[TaskController] Created ${taskKeys.length} tasks for agent ${agentId}`);
    }
    
    /**
     * Update task status
     */
    updateTaskStatus(agentId, taskId, status) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) {
            console.warn(`Task ${taskKey} not found`);
            return;
        }
        
        console.log(`[TaskController] Task ${taskId} status: ${status}`);
        
        // Update UI
        this.renderer.updateStatus(taskData.element, status);
        
        // Handle status-specific actions
        if (status === 'running') {
            this.handleTaskRunning(agentId, taskId);
        }
    }
    
    /**
     * Handle task running state
     */
    handleTaskRunning(agentId, taskId) {
        // Align running task with agent
        this.shiftTasksToRunning(agentId, taskId);
    }
    
    /**
     * Update task content
     */
    updateTaskContent(agentId, taskId, content, append = false) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) return;
        
        // Update UI
        this.renderer.updateContent(agentId, taskId, content, append);
        
        // Reposition if height changed
        this.positionTasksForAgent(agentId);
    }
    
    /**
     * Show validation loading spinner
     */
    showValidationLoading(agentId, taskId) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) return;
        
        console.log(`[TaskController] Task ${taskId} validating...`);
        
        // Update UI
        this.renderer.showValidationLoading(agentId, taskId);
        
        // Reposition after validation UI appears
        setTimeout(() => {
            this.positionTasksForAgent(agentId);
        }, 400);
    }
    
    /**
     * Show task validation result
     */
    showValidation(agentId, taskId, isValid, reason, score) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) return;
        
        console.log(`[TaskController] Task ${taskId} validation: ${isValid} (score: ${score})`);
        
        // Update UI
        this.renderer.showValidation(agentId, taskId, isValid, reason, score);
        
        // Reposition after validation UI appears
        setTimeout(() => {
            this.positionTasksForAgent(agentId);
        }, 400);
    }
    
    /**
     * Position tasks for an agent
     */
    positionTasksForAgent(agentId, immediate = false) {
        const taskKeys = this.taskManager.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return;
        
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) return;
        
        // Calculate positions using layout logic from TaskManager
        const positions = this.taskManager.calculateTaskPositions(agentId, agentPos);
        
        // Apply positions to task elements
        positions.forEach(({ taskKey, x, y }) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (!taskData) return;
            
            // Update position
            taskData.x = x;
            taskData.y = y;
            
            // Apply to DOM
            this.renderer.setPosition(taskData.element, x, y, immediate);
        });
        
        // Update connection lines after positioning (not during centralized recalculation)
        if (this.taskManager.connectionLines) {
            if (immediate) {
                // Update immediately if positioning is immediate
                this.taskManager.connectionLines.updateConnectionsForAgent(agentId);
            } else {
                // Update connection lines during transitions (similar to agent positioning)
                // Tasks have 400ms transition, update multiple times to keep lines in sync
                this.taskManager.connectionLines.updateConnectionsForAgent(agentId);
                const updateIntervals = [50, 100, 150, 200, 250, 300, 350, 450];
                updateIntervals.forEach(delay => {
                    setTimeout(() => {
                        if (this.taskManager.connectionLines) {
                            this.taskManager.connectionLines.updateConnectionsForAgent(agentId);
                        }
                    }, delay);
                });
            }
        }
        
        // Update canvas height after task positioning (not during centralized recalculation)
        // This handles runtime task updates that aren't part of a full recalculation
        this.canvasManager.updateCanvasHeight();
    }
    
    /**
     * Shift tasks so running task aligns with agent
     */
    shiftTasksToRunning(agentId, runningTaskId) {
        // Delegate to TaskManager for calculation
        this.taskManager.alignTaskToAgent(agentId, runningTaskId);
        
        // Reposition after alignment
        this.positionTasksForAgent(agentId);
    }
    
    /**
     * Clear tasks for an agent
     */
    clearTasksForAgent(agentId) {
        const taskKeys = this.taskManager.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return;
        
        console.log(`[TaskController] Clearing ${taskKeys.length} tasks for agent ${agentId}`);
        
        // Remove connection lines first
        if (this.taskManager.connectionLines) {
            this.taskManager.connectionLines.removeConnectionsForAgent(agentId);
        }
        
        // Animate out tasks
        taskKeys.forEach((taskKey, index) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (taskData && taskData.element) {
                setTimeout(() => {
                    this.renderer.animateOut(taskData.element, () => {
                        taskData.element.remove();
                        this.taskManager.removeTask(taskKey);
                    });
                }, index * 50);
            } else {
                this.taskManager.removeTask(taskKey);
            }
        });
        
        this.taskManager.clearAgentTasks(agentId);
    }
    
    /**
     * Remove tasks when agent is removed
     */
    removeTasksForAgent(agentId) {
        this.clearTasksForAgent(agentId);
    }
    
    /**
     * Focus on a specific task
     */
    focusTask(agentId, taskId) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData) return;
        
        // Scroll into view
        this.renderer.scrollToTask(taskData.element);
        
        // Add highlight
        this.renderer.highlightTask(taskData.element);
        
        console.log(`[TaskController] Focused on task ${taskId}`);
    }
}
