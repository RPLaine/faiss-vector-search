/**
 * Task Manager - Handles task node creation, positioning, and lifecycle
 * 
 * Tasks appear to the right of their parent agent node in a vertical column.
 * Task execution order is by ID (ascending).
 */

export class TaskManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.taskNodes = new Map(); // task_key -> {element, agentId, taskId, x, y}
        this.agentTasks = new Map(); // agent_id -> Set of task_keys
        
        // Listen for global recalculation events
        window.addEventListener('recalculateTaskPositions', () => {
            this.recalculateAllTaskPositions();
            // Update canvas height after recalculation (debounced in canvas-manager)
            this.canvasManager.updateCanvasHeight();
        });
    }
    
    /**
     * Recalculate positions for all tasks
     */
    recalculateAllTaskPositions() {
        for (const agentId of this.agentTasks.keys()) {
            this.positionTasksForAgent(agentId);
        }
    }
    
    /**
     * Shift tasks up so the next unexecuted task aligns with the agent top border.
     * This creates a visual effect of completed tasks moving up.
     */
    shiftTasksToNextUnexecuted(agentId) {
        const taskKeys = this.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) return;
        
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) return;
        
        const agentElement = this.canvasManager.agents.get(agentId)?.element;
        if (!agentElement) return;
        
        const agentWidth = agentElement.offsetWidth || 320;
        const startX = agentPos.x + agentWidth + 40;
        
        // Sort tasks by ID
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskNodes.get(a);
            const taskB = this.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Find the first unexecuted task (smallest ID that's not completed)
        let firstUnexecutedIndex = -1;
        for (let i = 0; i < sortedTaskKeys.length; i++) {
            const taskData = this.taskNodes.get(sortedTaskKeys[i]);
            if (!taskData) continue;
            
            const status = taskData.element.querySelector('.task-node-status')?.textContent.toLowerCase();
            if (status === 'created' || status === 'halted') {
                firstUnexecutedIndex = i;
                break;
            }
        }
        
        // If we found an unexecuted task
        if (firstUnexecutedIndex >= 0) {
            const gapBetweenElements = 20; // 20px gap between tasks
            
            // Calculate heights for all tasks
            const taskHeights = [];
            let totalTaskHeight = 0;
            for (const taskKey of sortedTaskKeys) {
                const taskData = this.taskNodes.get(taskKey);
                if (!taskData) continue;
                const height = taskData.element.offsetHeight || 300;
                taskHeights.push(height);
                totalTaskHeight += height;
            }
            
            // Calculate where the last task (largest ID) should be positioned
            const taskCount = sortedTaskKeys.length;
            const totalGapsHeight = (taskCount - 1) * gapBetweenElements;
            const totalContentHeight = totalTaskHeight + totalGapsHeight;
            
            // Position so the LAST task's top border aligns exactly with agent's top border
            let startY = agentPos.y - totalContentHeight + taskHeights[taskCount - 1];
            let currentY = startY;
            
            sortedTaskKeys.forEach((taskKey, index) => {
                const taskData = this.taskNodes.get(taskKey);
                if (!taskData) return;
                
                const element = taskData.element;
                const taskHeight = taskHeights[index];
                
                // Position element
                element.style.left = `${startX}px`;
                element.style.top = `${currentY}px`;
                
                taskData.x = startX;
                taskData.y = currentY;
                
                // Move to next position with gap
                currentY += taskHeight + gapBetweenElements;
            });
            
            // Update canvas height after animation (debounced)
            this.canvasManager.updateCanvasHeight();
        }
    }
    
    /**
     * Create task nodes from a tasklist after phase 0 completes.
     * 
     * @param {string} agentId - Parent agent ID
     * @param {object} tasklist - Tasklist object with goal and tasks array
     */
    createTasksForAgent(agentId, tasklist) {
        if (!tasklist || !tasklist.tasks || !Array.isArray(tasklist.tasks)) {
            console.warn(`No valid tasklist for agent ${agentId}`);
            return;
        }
        
        // Clear existing tasks for this agent
        this.clearTasksForAgent(agentId);
        
        // Get agent position
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) {
            console.error(`Agent ${agentId} not found in canvas manager`);
            return;
        }
        
        // Sort tasks by ID to ensure correct order
        const sortedTasks = [...tasklist.tasks].sort((a, b) => a.id - b.id);
        
        // First, position tasks immediately without animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.positionTasksForAgent(agentId);
            });
        });
        
        // Create task nodes with staggered animation
        const taskKeys = [];
        sortedTasks.forEach((task, index) => {
            const taskKey = `${agentId}-task-${task.id}`;
            
            // Create node with animation classes
            const taskNode = this.createTaskNode(agentId, task, index, sortedTasks.length);
            taskNode.classList.add('animating-in');
            
            this.taskNodes.set(taskKey, {
                element: taskNode,
                agentId: agentId,
                taskId: task.id,
                x: 0,
                y: 0
            });
            
            taskKeys.push(taskKey);
            
            // Animate in with stagger - use CSS classes
            setTimeout(() => {
                taskNode.classList.remove('animating-in');
                taskNode.classList.add('visible');
                
                // Update canvas height only after last task is visible (debounced)
                if (index === sortedTasks.length - 1) {
                    this.canvasManager.updateCanvasHeight();
                }
            }, 200 * (index + 1)); // Start after initial positioning, stagger each task
        });
        
        // Store task keys for this agent
        this.agentTasks.set(agentId, new Set(taskKeys));
        
        // Position tasks with their coordinates immediately
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.positionTasksForAgent(agentId, true); // true = immediate positioning
                // Update canvas height after positioning (debounced in canvas-manager)
                this.canvasManager.updateCanvasHeight();
            });
        });
        
        console.log(`Created ${taskKeys.length} task nodes for agent ${agentId}`);
    }
    
    /**
     * Create a single task node element.
     */
    createTaskNode(agentId, task, index, totalTasks) {
        const container = document.getElementById('agentNodesContainer');
        
        const node = document.createElement('div');
        node.className = 'task-node';
        node.id = `task-${agentId}-${task.id}`;
        node.dataset.agentId = agentId;
        node.dataset.taskId = task.id;
        
        // Get task status and output from task object (restore from agent state)
        const taskStatus = task.status || 'created';
        const taskOutput = task.output || 'Waiting to start...';
        
        node.innerHTML = `
            <div class="task-node-header">
                <div class="task-node-header-info">
                    <h4>${this.escapeHtml(task.name)}</h4>
                    <div class="task-node-order">Task ${index + 1} of ${totalTasks}</div>
                </div>
                <div class="task-node-status ${taskStatus}">${taskStatus}</div>
            </div>
            <div class="task-node-body">
                <div class="task-node-info-column">
                    <div class="task-node-section">
                        <div class="task-node-section-title">Objective</div>
                        <div class="task-node-section-content">
                            ${this.escapeHtml(task.description)}
                        </div>
                    </div>
                    <div class="task-node-section">
                        <div class="task-node-section-title">Expectation</div>
                        <div class="task-node-section-content">
                            ${this.escapeHtml(task.expected_output)}
                        </div>
                    </div>
                    <div class="task-node-section">
                        <div class="task-node-section-title">Validation</div>
                        <div class="task-node-validation" id="task-validation-${agentId}-${task.id}">
                            <div class="validation-result">Not yet validated</div>
                        </div>
                    </div>
                </div>
                <div class="task-node-output-column">
                    <div class="task-node-section">
                        <div class="task-node-section-title">Output</div>
                        <div class="task-node-content" id="task-content-${agentId}-${task.id}">
                            <div class="content-text">${this.escapeHtml(taskOutput)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(node);
        
        // If task has validation data, show it
        if (task.validation) {
            setTimeout(() => {
                this.showValidation(
                    agentId,
                    task.id,
                    task.validation.is_valid,
                    task.validation.reason,
                    task.validation.score || 0
                );
            }, 100);
        }
        
        return node;
    }
    
    /**
     * Position all tasks for an agent in a vertical column to the right.
     * @param {string} agentId - The agent ID
     * @param {boolean} immediate - If true, position without animation
     */
    positionTasksForAgent(agentId, immediate = false) {
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) return;
        
        const taskKeys = this.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) return;
        
        // Get agent element to calculate dimensions
        const agentElement = this.canvasManager.agents.get(agentId)?.element;
        if (!agentElement) return;
        
        const agentWidth = agentElement.offsetWidth || 320;
        const agentHeight = agentElement.offsetHeight || 200;
        
        // Starting position for tasks (right of agent with gap)
        const startX = agentPos.x + agentWidth + 40; // 40px gap
        
        // Sort tasks by ID
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskNodes.get(a);
            const taskB = this.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Calculate total height of all tasks
        let totalTaskHeight = 0;
        const taskHeights = [];
        
        for (const taskKey of sortedTaskKeys) {
            const taskData = this.taskNodes.get(taskKey);
            if (!taskData) continue;
            const height = taskData.element.offsetHeight || 300;
            taskHeights.push(height);
            totalTaskHeight += height;
        }
        
        // Calculate spacing between tasks with fixed gap
        const taskCount = sortedTaskKeys.length;
        const gapBetweenElements = 20; // 20px gap between all elements (task-to-task)
        
        // Calculate total height of all tasks including gaps
        const totalGapsHeight = (taskCount - 1) * gapBetweenElements;
        const totalContentHeight = totalTaskHeight + totalGapsHeight;
        
        // Position tasks so the LAST task's top border aligns exactly with agent's top border
        // Start from: agent.y - (all previous tasks heights + gaps)
        let startY = agentPos.y - totalContentHeight + taskHeights[taskCount - 1];
        let currentY = startY;
        
        sortedTaskKeys.forEach((taskKey, index) => {
            const taskData = this.taskNodes.get(taskKey);
            if (!taskData) return;
            
            const element = taskData.element;
            const taskHeight = taskHeights[index];
            
            // Control transition with class instead of inline styles
            if (immediate) {
                element.classList.add('no-transition');
            } else {
                element.classList.remove('no-transition');
            }
            
            // Position element
            element.style.left = `${startX}px`;
            element.style.top = `${currentY}px`;
            
            taskData.x = startX;
            taskData.y = currentY;
            
            // Move to next position with gap
            currentY += taskHeight + gapBetweenElements;
        });
        
        // Update canvas height to accommodate all tasks
        this.canvasManager.updateCanvasHeight();
        
        // Don't draw connection lines - removed
    }
    
    /**
     * Draw connection lines from agent to tasks.
     * DISABLED - No longer drawing connection lines
     */
    drawConnectionLines(agentId) {
        // Do nothing - connection lines removed
    }
    
    /**
     * Draw all connection lines for all agents with tasks.
     * DISABLED - No longer drawing connection lines
     */
    drawAllConnectionLines() {
        // Clear the canvas but don't draw lines
        this.canvasManager.draw();
    }
    
    /**
     * Update task status.
     */
    updateTaskStatus(agentId, taskId, status) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskNodes.get(taskKey);
        if (!taskData) return;
        
        const statusEl = taskData.element.querySelector('.task-node-status');
        if (statusEl) {
            statusEl.className = `task-node-status ${status}`;
            statusEl.textContent = status;
        }
        
        // Update task node class for border styling
        const element = taskData.element;
        element.classList.remove('running', 'completed', 'failed', 'cancelled');
        element.classList.add(status);
        
        // Add pulse animation when task becomes active
        if (status === 'running') {
            taskData.element.classList.add('pulse-scale');
            
            // Remove animation class after it completes
            setTimeout(() => {
                taskData.element.classList.remove('pulse-scale');
            }, 300);
        }
        
        console.log(`Task ${taskId} status: ${status}`);
    }
    
    /**
     * Update task content (streaming or final).
     */
    updateTaskContent(agentId, taskId, content, append = false) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskNodes.get(taskKey);
        if (!taskData) return;
        
        const contentEl = taskData.element.querySelector(`#task-content-${agentId}-${taskId} .content-text`);
        if (contentEl) {
            if (append) {
                contentEl.textContent += content;
            } else {
                contentEl.textContent = content;
            }
            
            // Auto-scroll to bottom
            contentEl.scrollTop = contentEl.scrollHeight;
        }
        
        // Reposition tasks if height changed
        this.positionTasksForAgent(agentId);
        
        // Update canvas height to ensure scrolling works (debounced)
        this.canvasManager.updateCanvasHeight();
    }
    
    /**
     * Show validation result.
     */
    showValidation(agentId, taskId, isValid, reason, score) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskNodes.get(taskKey);
        if (!taskData) return;
        
        const validationEl = taskData.element.querySelector(`#task-validation-${agentId}-${taskId}`);
        if (!validationEl) return;
        
        const resultEl = validationEl.querySelector('.validation-result');
        if (!resultEl) return;
        
        validationEl.className = `task-node-validation ${isValid ? 'valid' : 'invalid'}`;
        
        resultEl.innerHTML = `
            <strong>${isValid ? '✓ Valid' : '✗ Invalid'}</strong>
            <span class="validation-score">Score: ${score}/100</span>
            <div class="validation-reason">${this.escapeHtml(reason)}</div>
        `;
        
        // Animate in using CSS classes
        requestAnimationFrame(() => {
            validationEl.classList.add('show');
        });
        
        // Reposition tasks if height changed
        setTimeout(() => {
            this.positionTasksForAgent(agentId);
            // Update canvas height (debounced)
            this.canvasManager.updateCanvasHeight();
        }, 400);
    }
    
    /**
     * Clear all tasks for an agent with smooth animation.
     */
    clearTasksForAgent(agentId) {
        const taskKeys = this.agentTasks.get(agentId);
        if (!taskKeys) return;
        
        // Animate out each task with stagger
        const taskKeysArray = Array.from(taskKeys);
        taskKeysArray.forEach((taskKey, index) => {
            const taskData = this.taskNodes.get(taskKey);
            if (taskData && taskData.element) {
                // Add fade-out animation class
                setTimeout(() => {
                    taskData.element.classList.add('animating-out');
                    
                    // Remove element after animation completes
                    setTimeout(() => {
                        taskData.element.remove();
                        this.taskNodes.delete(taskKey);
                        
                        // Redraw lines after last task is removed
                        if (index === taskKeysArray.length - 1) {
                            this.drawAllConnectionLines();
                        }
                    }, 400); // Match animation duration
                }, index * 50); // 50ms stagger
            } else {
                this.taskNodes.delete(taskKey);
            }
        });
        
        this.agentTasks.delete(agentId);
    }
    
    /**
     * Remove all tasks when agent is removed.
     */
    removeTasksForAgent(agentId) {
        this.clearTasksForAgent(agentId);
    }
    
    /**
     * Reposition tasks when agent moves or resizes.
     */
    repositionTasksForAgent(agentId) {
        this.positionTasksForAgent(agentId);
    }
    
    /**
     * Focus on a specific task - center it in viewport.
     * 
     * @param {string} agentId - Parent agent ID
     * @param {number} taskId - Task ID to focus
     */
    focusTask(agentId, taskId) {
        const taskKey = `${agentId}-task-${taskId}`;
        const taskData = this.taskNodes.get(taskKey);
        if (!taskData) return;
        
        const element = taskData.element;
        
        // Center task in viewport
        const rect = element.getBoundingClientRect();
        const container = document.querySelector('.agents-grid');
        const containerRect = container.getBoundingClientRect();
        
        // Calculate center position
        const centerX = containerRect.width / 2 - rect.width / 2;
        const centerY = containerRect.height / 2 - rect.height / 2;
        
        // Scroll to center the task
        container.scrollTo({
            left: taskData.x - centerX,
            top: taskData.y - centerY,
            behavior: 'smooth'
        });
        
        // Add highlight effect
        element.classList.add('focused');
        setTimeout(() => {
            element.classList.remove('focused');
        }, 2000);
        
        console.log(`Focused on task ${taskId} of agent ${agentId}`);
    }
    
    /**
     * Get the first task for an agent.
     * 
     * @param {string} agentId - Parent agent ID
     * @returns {object|null} - Task data or null
     */
    getFirstTask(agentId) {
        const taskKeys = this.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) return null;
        
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskNodes.get(a);
            const taskB = this.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        if (sortedTaskKeys.length === 0) return null;
        
        const firstTaskKey = sortedTaskKeys[0];
        return this.taskNodes.get(firstTaskKey);
    }
    
    /**
     * Get the next unexecuted task for an agent.
     * Returns the task with the smallest ID that has status 'created' or 'halted'.
     * 
     * @param {string} agentId - Parent agent ID
     * @returns {object|null} - Task data or null
     */
    getNextUnexecutedTask(agentId) {
        const taskKeys = this.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) return null;
        
        // Sort tasks by ID
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskNodes.get(a);
            const taskB = this.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Find first task that hasn't been executed (created status)
        for (const taskKey of sortedTaskKeys) {
            const taskData = this.taskNodes.get(taskKey);
            if (!taskData) continue;
            
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
     * Escape HTML to prevent XSS.
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
