/**
 * Task Controller - Handles task business logic
 * 
 * Coordinates between:
 * - TaskManager (state)
 * - TaskRenderer (UI updates)
 * - CanvasManager (layout updates, TaskPositionManager)
 */

import { POSITIONING_DELAYS } from '../constants.js';
import { ANIMATION_DURATIONS } from '../constants.js';

export class TaskController {
    constructor(taskManager, taskRenderer, canvasManager, agentManager) {
        this.taskManager = taskManager;
        this.renderer = taskRenderer;
        this.canvasManager = canvasManager;
        this.agentManager = agentManager;
        
        // Access centralized task positioning via CanvasManager
        // (TaskPositionManager is initialized there)
        
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
            
            // Apply positions to DOM with smooth transition (not immediate)
            positions.forEach(({ taskKey, x, y }) => {
                const taskData = this.taskManager.getTask(taskKey);
                if (!taskData) return;
                
                // Update stored global position
                taskData.globalX = x;
                taskData.globalY = y;
                
                // Apply to DOM with smooth transition via centralized TaskPositionManager
                this.canvasManager.taskPositionManager.updateTaskPosition(
                    taskKey,
                    taskData.element,
                    x,
                    y,
                    {
                        immediate: false, // Smooth transition for viewport resize
                        reason: 'recalculate_all'
                    }
                );
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
        
        // Clear existing tasks immediately (no animation) to avoid race conditions
        this._clearTasksImmediate(agentId);
        
        // Sort tasks by ID
        const sortedTasks = [...tasklist.tasks].sort((a, b) => a.id - b.id);
        
        // Create task nodes and load tool calls if present
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
            
            // Load tool call data if present (FAISS retrieval)
            if (task.tool_call) {
                // Dispatch event to load tool call via ToolController
                const event = new CustomEvent('loadToolCall', {
                    detail: {
                        agentId,
                        taskId: task.id,
                        toolCallData: task.tool_call
                    }
                });
                document.dispatchEvent(event);
            }
        });
        
        // Store task keys for this agent
        this.taskManager.setAgentTasks(agentId, taskKeys);
        
        // Position tasks after DOM elements have rendered
        // Use requestAnimationFrame to ensure offsetHeight is calculated
        // IMPORTANT: Connection lines are created/updated AFTER task positioning
        // This ensures proper render order: agents → tasks → connections
        requestAnimationFrame(() => {
            this.positionTasksForAgent(agentId, true, true); // immediate=true, isInitialCreation=true
            
            // Dispatch event after positioning completes - tools can now load
            setTimeout(() => {
                document.dispatchEvent(new CustomEvent('tasksPositioned', {
                    detail: { agentId }
                }));
            }, 100);
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
        
        // Prepare batch update for centralized TaskPositionManager
        const taskUpdates = [];
        positions.forEach(({ taskKey, x, y }) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (!taskData) return;
            
            // Update global position
            taskData.globalX = x;
            taskData.globalY = y;
            
            // Add to batch update
            taskUpdates.push({
                taskKey,
                element: taskData.element,
                globalX: x,
                globalY: y
            });
        });
        
        // Apply all positions via centralized TaskPositionManager
        if (taskUpdates.length > 0) {
            this.canvasManager.taskPositionManager.updateMultipleTaskPositions(taskUpdates, {
                immediate,
                reason: isInitialCreation ? 'initial_creation' : 'layout_update'
            });
        }
        
        // CRITICAL: Connection lines are drawn AFTER all task nodes are positioned
        // This ensures proper rendering order: agent nodes → task nodes → connection lines
        // Connection lines are NOT updated during centralized recalculation (handled separately)
        if (this.canvasManager && this.canvasManager.connectionLinesManager) {
            // Determine if connections should start hidden (agent not selected)
            const shouldStartHidden = this.agentManager && !this.agentManager.isAgentSelected(agentId);
            
            if (immediate) {
                // Update immediately if positioning is immediate
                // Pass isInitialCreation flag for animation on first creation
                this.canvasManager.connectionLinesManager.updateConnectionsForAgent(agentId, isInitialCreation, shouldStartHidden);
            } else {
                // Update connection lines during transitions (similar to agent positioning)
                // Tasks have transition, update multiple times to keep lines in sync
                this.canvasManager.connectionLinesManager.updateConnectionsForAgent(agentId, isInitialCreation, shouldStartHidden);
                POSITIONING_DELAYS.TASK_CONNECTION_UPDATES.forEach(delay => {
                    setTimeout(() => {
                        if (this.canvasManager && this.canvasManager.connectionLinesManager) {
                            // Don't animate on subsequent updates
                            this.canvasManager.connectionLinesManager.updateConnectionsForAgent(agentId, false, shouldStartHidden);
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
     * Clear tasks for an agent immediately without animation
     * Used when recreating task list to avoid race conditions
     */
    _clearTasksImmediate(agentId) {
        const taskKeys = this.taskManager.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return;
        
        console.log(`[TaskController] Clearing ${taskKeys.length} tasks immediately for agent ${agentId}`);
        
        // Remove connection lines first
        this.canvasManager.connectionLinesManager.removeConnectionsForAgent(agentId);
        
        // Remove tasks immediately without animation
        taskKeys.forEach((taskKey) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (taskData && taskData.element) {
                taskData.element.remove();
            }
            this.taskManager.removeTask(taskKey);
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
    
    /**
     * Show tasks for an agent (when agent is selected)
     */
    showTasksForAgent(agentId) {
        const taskKeys = this.taskManager.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return;
        
        console.log(`[TaskController] Showing tasks for agent ${agentId}`);
        
        taskKeys.forEach((taskKey, index) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (taskData && taskData.element) {
                // Remove hidden class and trigger fade-in animation
                taskData.element.classList.remove('task-hidden');
                taskData.element.classList.add('task-visible');
                
                // Stagger the animation for each task
                taskData.element.style.transitionDelay = `${index * ANIMATION_DURATIONS.TASK_SHOW_STAGGER}ms`;
                
                // Clear transitionDelay after animation completes to prevent conflicts
                // Total time = stagger delay + visibility animation duration
                setTimeout(() => {
                    if (taskData.element) {
                        taskData.element.style.transitionDelay = '';
                    }
                }, (index * ANIMATION_DURATIONS.TASK_SHOW_STAGGER) + ANIMATION_DURATIONS.TASK_VISIBILITY_DURATION);
            }
        });
        
        // Show connection lines with delay to sync with task animations
        setTimeout(() => {
            if (this.canvasManager && this.canvasManager.connectionLinesManager) {
                this.canvasManager.connectionLinesManager.showConnectionsForAgent(agentId);
            }
        }, ANIMATION_DURATIONS.CONNECTION_SHOW_DELAY);
        
        // Also show tools for this agent's tasks
        const showToolsEvent = new CustomEvent('showToolsForAgent', { detail: { agentId } });
        document.dispatchEvent(showToolsEvent);
    }
    
    /**
     * Hide tasks for an agent (when agent is deselected)
     */
    hideTasksForAgent(agentId) {
        const taskKeys = this.taskManager.getAgentTasks(agentId);
        if (!taskKeys || taskKeys.length === 0) return;
        
        console.log(`[TaskController] Hiding tasks for agent ${agentId}`);
        
        // Hide tools first
        const hideToolsEvent = new CustomEvent('hideToolsForAgent', { detail: { agentId } });
        document.dispatchEvent(hideToolsEvent);
        
        // Hide connection lines first
        if (this.canvasManager && this.canvasManager.connectionLinesManager) {
            this.canvasManager.connectionLinesManager.hideConnectionsForAgent(agentId);
        }
        
        taskKeys.forEach((taskKey, index) => {
            const taskData = this.taskManager.getTask(taskKey);
            if (taskData && taskData.element) {
                // Add hidden class to trigger fade-out animation
                taskData.element.classList.remove('task-visible');
                taskData.element.classList.add('task-hidden');
                
                // Stagger the animation for each task (reverse order for hide, faster than show)
                const reverseIndex = taskKeys.length - 1 - index;
                taskData.element.style.transitionDelay = `${reverseIndex * ANIMATION_DURATIONS.TASK_HIDE_STAGGER}ms`;
                
                // Clear transitionDelay after animation completes to prevent conflicts
                // Total time = stagger delay + visibility animation duration
                setTimeout(() => {
                    if (taskData.element) {
                        taskData.element.style.transitionDelay = '';
                    }
                }, (reverseIndex * ANIMATION_DURATIONS.TASK_HIDE_STAGGER) + ANIMATION_DURATIONS.TASK_VISIBILITY_DURATION);
            }
        });
    }
}
