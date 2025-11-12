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
        
        // Create task nodes
        const taskKeys = [];
        sortedTasks.forEach((task, index) => {
            const taskKey = `${agentId}-task-${task.id}`;
            const taskNode = this.createTaskNode(agentId, task, index, sortedTasks.length);
            
            this.taskNodes.set(taskKey, {
                element: taskNode,
                agentId: agentId,
                taskId: task.id,
                x: 0,
                y: 0
            });
            
            taskKeys.push(taskKey);
        });
        
        // Store task keys for this agent
        this.agentTasks.set(agentId, new Set(taskKeys));
        
        // Position tasks relative to agent after DOM is updated
        // Use requestAnimationFrame to ensure elements are rendered
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.positionTasksForAgent(agentId);
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
        
        node.innerHTML = `
            <div class="task-node-header">
                <div class="task-node-info">
                    <h4>${this.escapeHtml(task.name)}</h4>
                    <div class="task-node-order">Task ${index + 1} of ${totalTasks}</div>
                </div>
                <div class="task-node-status created">created</div>
            </div>
            <div class="task-node-description">
                ${this.escapeHtml(task.description)}
            </div>
            <div class="task-node-expected">
                <strong>Expected:</strong> ${this.escapeHtml(task.expected_output)}
            </div>
            <div class="task-node-content" id="task-content-${agentId}-${task.id}">
                <div class="content-text">Waiting to start...</div>
            </div>
            <div class="task-node-validation" id="task-validation-${agentId}-${task.id}" style="display: none;">
                <div class="validation-result"></div>
            </div>
        `;
        
        container.appendChild(node);
        return node;
    }
    
    /**
     * Position all tasks for an agent in a vertical column to the right.
     */
    positionTasksForAgent(agentId) {
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
        let currentY = agentPos.y;
        
        // Position each task
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskNodes.get(a);
            const taskB = this.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        sortedTaskKeys.forEach((taskKey, index) => {
            const taskData = this.taskNodes.get(taskKey);
            if (!taskData) return;
            
            const element = taskData.element;
            
            // Position element
            element.style.left = `${startX}px`;
            element.style.top = `${currentY}px`;
            
            taskData.x = startX;
            taskData.y = currentY;
            
            // Update Y for next task (height + gap)
            const taskHeight = element.offsetHeight || 180;
            currentY += taskHeight + 16; // 16px gap between tasks
        });
        
        // Draw connection lines
        this.drawConnectionLines(agentId);
    }
    
    /**
     * Draw connection lines from agent to tasks.
     */
    drawConnectionLines(agentId) {
        // Redraw all connection lines for all agents
        this.drawAllConnectionLines();
    }
    
    /**
     * Draw all connection lines for all agents with tasks.
     */
    drawAllConnectionLines() {
        // Clear the canvas
        this.canvasManager.draw();
        
        const ctx = this.canvasManager.ctx;
        
        // Draw lines for each agent that has tasks
        for (const [agentId, taskKeys] of this.agentTasks.entries()) {
            if (!taskKeys || taskKeys.size === 0) continue;
            
            const agentPos = this.canvasManager.getAgentPosition(agentId);
            if (!agentPos) continue;
            
            // Get agent dimensions
            const agentElement = this.canvasManager.agents.get(agentId)?.element;
            if (!agentElement) continue;
            
            const agentWidth = agentElement.offsetWidth || 320;
            const agentHeight = agentElement.offsetHeight || 200;
            
            // Agent right edge center point
            const agentX = agentPos.x + agentWidth;
            const agentY = agentPos.y + (agentHeight / 2);
            
            // Draw lines to each task
            ctx.strokeStyle = '#404040';
            ctx.lineWidth = 2;
            
            taskKeys.forEach(taskKey => {
                const taskData = this.taskNodes.get(taskKey);
                if (!taskData) return;
                
                const taskElement = taskData.element;
                const taskHeight = taskElement.offsetHeight || 180;
                
                // Task left edge center point
                const taskX = taskData.x;
                const taskY = taskData.y + (taskHeight / 2);
                
                // Draw line
                ctx.beginPath();
                ctx.moveTo(agentX, agentY);
                ctx.lineTo(taskX, taskY);
                ctx.stroke();
            });
        }
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
        
        validationEl.style.display = 'block';
        validationEl.className = `task-node-validation ${isValid ? 'valid' : 'invalid'}`;
        
        resultEl.innerHTML = `
            <strong>${isValid ? '✓ Valid' : '✗ Invalid'}</strong>
            <span class="validation-score">Score: ${score}/100</span>
            <div class="validation-reason">${this.escapeHtml(reason)}</div>
        `;
        
        // Reposition tasks if height changed
        this.positionTasksForAgent(agentId);
    }
    
    /**
     * Clear all tasks for an agent.
     */
    clearTasksForAgent(agentId) {
        const taskKeys = this.agentTasks.get(agentId);
        if (!taskKeys) return;
        
        taskKeys.forEach(taskKey => {
            const taskData = this.taskNodes.get(taskKey);
            if (taskData && taskData.element) {
                taskData.element.remove();
            }
            this.taskNodes.delete(taskKey);
        });
        
        this.agentTasks.delete(agentId);
        
        // Redraw all connection lines
        this.drawAllConnectionLines();
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
     * Escape HTML to prevent XSS.
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
