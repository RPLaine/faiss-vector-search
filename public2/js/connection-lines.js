/**
 * Connection Lines Manager - Draws bendy SVG connection lines between agent and tasks
 * 
 * Line colors based on task status:
 * - Incomplete: grey (#404040)
 * - Processing: blue animated (#2563eb)
 * - Complete: green (#10b981)
 * - Failed: red (#ef4444)
 */

export class ConnectionLinesManager {
    constructor(canvasManager, taskManager) {
        this.canvasManager = canvasManager;
        this.taskManager = taskManager;
        this.svg = document.getElementById('connectionLines');
        this.lines = new Map(); // connection_key -> SVG path element
        
        // Initialize SVG dimensions
        this.updateSVGDimensions();
        
        // Listen for window resize - update both dimensions and line positions
        window.addEventListener('resize', () => {
            this.updateSVGDimensions();
            this.updateAllConnections();
        });
    }
    
    /**
     * Update SVG viewBox to match canvas dimensions
     */
    updateSVGDimensions() {
        const canvas = document.getElementById('agentCanvas');
        if (canvas) {
            this.svg.setAttribute('width', canvas.scrollWidth);
            this.svg.setAttribute('height', canvas.scrollHeight);
            this.svg.setAttribute('viewBox', `0 0 ${canvas.scrollWidth} ${canvas.scrollHeight}`);
        }
    }
    
    /**
     * Create or update all connection lines for an agent and its tasks
     */
    updateConnectionsForAgent(agentId) {
        const taskKeys = this.taskManager.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) {
            // No tasks, remove any existing connections
            this.removeConnectionsForAgent(agentId);
            return;
        }
        
        const agentPos = this.canvasManager.getAgentPosition(agentId);
        if (!agentPos) return;
        
        const agentElement = this.canvasManager.agents.get(agentId)?.element;
        if (!agentElement) return;
        
        // Use getBoundingClientRect for accurate rendered dimensions
        const agentRect = agentElement.getBoundingClientRect();
        const containerRect = agentElement.parentElement.getBoundingClientRect();
        
        // Calculate agent width and height from bounding rect
        const agentWidth = agentRect.width;
        const agentHeight = agentRect.height;
        
        // Calculate agent center (using actual position on canvas)
        const agentCenterX = agentPos.x + (agentWidth / 2);
        const agentCenterY = agentPos.y + (agentHeight / 2);
        
        // Sort tasks by ID to get proper order
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskManager.taskNodes.get(a);
            const taskB = this.taskManager.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Connect EVERY task to the agent (center to center)
        sortedTaskKeys.forEach((taskKey) => {
            const taskData = this.taskManager.taskNodes.get(taskKey);
            if (!taskData || !taskData.element) return;
            
            const taskElement = taskData.element;
            
            // Use getBoundingClientRect for accurate rendered dimensions
            const taskRect = taskElement.getBoundingClientRect();
            const taskWidth = taskRect.width;
            const taskHeight = taskRect.height;
            
            // Calculate task center (using actual position on canvas)
            const taskCenterX = taskData.x + (taskWidth / 2);
            const taskCenterY = taskData.y + (taskHeight / 2);
            
            // Create connection from agent to this task
            const connectionKey = `agent-${agentId}-to-task-${taskData.taskId}`;
            this.createConnection(
                connectionKey,
                agentCenterX,
                agentCenterY,
                taskCenterX,
                taskCenterY,
                this.getStatusClass(taskData.element)
            );
        });
        
        // Clean up any orphaned connections
        this.cleanupOrphanedConnections(agentId, sortedTaskKeys);
    }
    
    /**
     * Create or update a single connection line
     */
    createConnection(key, x1, y1, x2, y2, statusClass) {
        let path = this.lines.get(key);
        
        if (!path) {
            // Create new path element
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('connection-line');
            this.svg.appendChild(path);
            this.lines.set(key, path);
        }
        
        // Update path data with bendy curve
        const pathData = this.createBendyPath(x1, y1, x2, y2);
        path.setAttribute('d', pathData);
        
        // Update status class
        path.className.baseVal = `connection-line ${statusClass}`;
    }
    
    /**
     * Create a bendy SVG path between two points
     * Uses cubic bezier curves for smooth, organic connections
     * Emphasizes vertical direction at start, horizontal direction at end
     */
    createBendyPath(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        
        // Calculate horizontal curve strength based on distance
        const horizontalStrength = Math.min(Math.abs(dx) * 0.5, 100);
        
        // Calculate vertical curve strength - much stronger for dramatic bending at start
        // Use 80% of vertical distance for strong emphasis on vertical movement
        const verticalStrength = Math.abs(dy) * 0.8; // 80% of vertical distance for strong emphasis
        
        // First control point: move right AND strongly in the vertical direction from start
        const cp1x = x1 + horizontalStrength;
        const cp1y = y1 + (dy > 0 ? verticalStrength : -verticalStrength);
        
        // Second control point: almost entirely horizontal approach to end point
        // Move much further horizontally and keep Y at target level for horizontal entry
        const cp2x = x2 - horizontalStrength * 5; // Strong horizontal emphasis
        const cp2y = y2; // No vertical offset - line arrives horizontally
        
        return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }
    
    /**
     * Get status class from task element
     */
    getStatusClass(taskElement) {
        const statusEl = taskElement.querySelector('.task-node-status');
        if (!statusEl) return 'incomplete';
        
        // Check if element has status class
        if (statusEl.classList.contains('running')) return 'processing';
        if (statusEl.classList.contains('completed')) return 'complete';
        if (statusEl.classList.contains('failed')) return 'failed';
        
        return 'incomplete';
    }
    
    /**
     * Remove all connections for an agent
     */
    removeConnectionsForAgent(agentId) {
        const keysToRemove = [];
        
        for (const [key, path] of this.lines.entries()) {
            if (key.includes(`agent-${agentId}`) || key.includes(`-agent-${agentId}`)) {
                path.remove();
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => this.lines.delete(key));
    }
    
    /**
     * Remove specific connection
     */
    removeConnection(key) {
        const path = this.lines.get(key);
        if (path) {
            path.remove();
            this.lines.delete(key);
        }
    }
    
    /**
     * Clean up orphaned connections that no longer have corresponding tasks
     */
    cleanupOrphanedConnections(agentId, currentTaskKeys) {
        const keysToRemove = [];
        const taskIds = currentTaskKeys.map(key => {
            const taskData = this.taskManager.taskNodes.get(key);
            return taskData ? taskData.taskId : null;
        }).filter(id => id !== null);
        
        for (const [key, path] of this.lines.entries()) {
            // Check if this connection belongs to this agent
            if (!key.includes(`agent-${agentId}`) && !key.includes(`-agent-${agentId}`)) continue;
            
            // Extract task IDs from connection key
            const taskIdMatches = key.match(/task-(\d+)/g);
            if (taskIdMatches) {
                const connectionTaskIds = taskIdMatches.map(match => {
                    const idMatch = match.match(/task-(\d+)/);
                    return idMatch ? parseInt(idMatch[1]) : null;
                }).filter(id => id !== null);
                
                // If any task in this connection no longer exists, remove it
                const hasOrphanedTask = connectionTaskIds.some(id => !taskIds.includes(id));
                if (hasOrphanedTask) {
                    path.remove();
                    keysToRemove.push(key);
                }
            }
        }
        
        keysToRemove.forEach(key => this.lines.delete(key));
    }
    
    /**
     * Update all connections (e.g., after window resize or layout change)
     */
    updateAllConnections() {
        this.updateSVGDimensions();
        
        for (const agentId of this.taskManager.agentTasks.keys()) {
            this.updateConnectionsForAgent(agentId);
        }
    }
}
