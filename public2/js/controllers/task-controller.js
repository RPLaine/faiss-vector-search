/**
 * Task Controller - Handles task business logic
 * 
 * Coordinates between:
 * - TaskManager (state)
 * - TaskRenderer (UI updates)
 * - CanvasManager (layout updates)
 */

import { POSITIONING_DELAYS } from '../constants.js';

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
                
                // Update stored global position
                taskData.globalX = x;
                taskData.globalY = y;
                
                // Convert to screen coordinates
                const screenPos = this.taskManager.canvasManager.globalToScreen(x, y);
                
                // Apply to DOM immediately (no animation during recalculation)
                this.renderer.setPosition(taskData.element, screenPos.x, screenPos.y, true);
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
                globalX: 0,
                globalY: 0
            });
            
            taskKeys.push(taskKey);
        });
        
        // Store task keys for this agent
        this.taskManager.setAgentTasks(agentId, taskKeys);
        
        // Position tasks after DOM elements have rendered
        // Use requestAnimationFrame to ensure offsetHeight is calculated
        // IMPORTANT: Connection lines are created/updated AFTER task positioning
        // This ensures proper render order: agents → tasks → connections
        requestAnimationFrame(() => {
            this.positionTasksForAgent(agentId, true, true); // immediate=true, isInitialCreation=true
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
        }, POSITIONING_DELAYS.VALIDATION_REPOSITION_DELAY);
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
        }, POSITIONING_DELAYS.VALIDATION_REPOSITION_DELAY);
    }
    
    /**
     * Position tasks for an agent
     * @param {string} agentId - The agent ID
     * @param {boolean} immediate - Whether to position immediately without transition
     * @param {boolean} isInitialCreation - Whether this is initial task creation (for animations)
     */
    positionTasksForAgent(agentId, immediate = false, isInitialCreation = false) {
        const taskKeys = this.taskManager.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return;
        
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) return;
        
        // Calculate positions using layout logic from TaskManager (returns global coords)
        const positions = this.taskManager.calculateTaskPositions(agentId, agentPos);
        
        // Apply positions to task elements
        positions.forEach(({ taskKey, x, y }) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (!taskData) return;
            
            // Update global position
            taskData.globalX = x;
            taskData.globalY = y;
            
            // Convert to screen coordinates
            const screenPos = this.canvasManager.globalToScreen(x, y);
            
            // Apply to DOM
            this.renderer.setPosition(taskData.element, screenPos.x, screenPos.y, immediate);
        });
        
        // CRITICAL: Connection lines are drawn AFTER all task nodes are positioned
        // This ensures proper rendering order: agent nodes → task nodes → connection lines
        // Connection lines are NOT updated during centralized recalculation (handled separately)
        if (this.canvasManager && this.canvasManager.connectionLinesManager) {
            if (immediate) {
                // Update immediately if positioning is immediate
                // Pass isInitialCreation flag for animation on first creation
                this.canvasManager.connectionLinesManager.updateConnectionsForAgent(agentId, isInitialCreation);
            } else {
                // Update connection lines during transitions (similar to agent positioning)
                // Tasks have transition, update multiple times to keep lines in sync
                this.canvasManager.connectionLinesManager.updateConnectionsForAgent(agentId, isInitialCreation);
                POSITIONING_DELAYS.TASK_CONNECTION_UPDATES.forEach(delay => {
                    setTimeout(() => {
                        if (this.canvasManager && this.canvasManager.connectionLinesManager) {
                            // Don't animate on subsequent updates
                            this.canvasManager.connectionLinesManager.updateConnectionsForAgent(agentId, false);
                        }
                    }, delay);
                });
            }
        }
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
        this.canvasManager.connectionLinesManager.removeConnectionsForAgent(agentId);
        
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
