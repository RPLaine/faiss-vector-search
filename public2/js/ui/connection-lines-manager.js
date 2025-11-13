/**
 * Connection Lines Manager - Manages SVG connection lines between agents and tasks
 * 
 * Responsibilities:
 * - Create and update SVG path elements for connections
 * - Handle transition modes (immediate vs smooth)
 * - Clean up orphaned connections
 */

export class ConnectionLinesManager {
    constructor(svgId, canvasManager, taskManager) {
        this.svg = document.getElementById(svgId);
        this.canvasManager = canvasManager;
        this.taskManager = taskManager;
        this.lines = new Map(); // connection_key -> SVG path element
        this.transitionsEnabled = true; // Controls smooth vs immediate updates
    }
    
    /**
     * Enable smooth transitions for scrolling
     */
    enableTransitions() {
        this.transitionsEnabled = true;
        for (const [key, path] of this.lines.entries()) {
            if (path) {
                path.classList.remove('no-transition');
            }
        }
    }
    
    /**
     * Disable transitions for immediate drag updates
     */
    disableTransitions() {
        this.transitionsEnabled = false;
        for (const [key, path] of this.lines.entries()) {
            if (path) {
                path.classList.add('no-transition');
            }
        }
    }
    
    /**
     * Update SVG viewBox to match canvas dimensions
     */
    updateSVGDimensions(width, height) {
        if (this.svg) {
            this.svg.setAttribute('width', width);
            this.svg.setAttribute('height', height);
            this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }
    }
    
    /**
     * Create or update all connection lines for an agent and its tasks
     * @param {string} agentId - The agent ID
     * @param {boolean} isInitialCreation - Whether this is the initial creation (for animation)
     */
    updateConnectionsForAgent(agentId, isInitialCreation = false) {
        if (!this.taskManager) return;
        
        const taskKeys = this.taskManager.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) {
            // No tasks, remove any existing connections
            this.removeConnectionsForAgent(agentId);
            return;
        }
        
        const agentPos = this.canvasManager.getAgentPosition(agentId); // Returns global coords
        if (!agentPos) return;
        
        const agentElement = this.canvasManager.agents.get(agentId)?.element;
        if (!agentElement) return;
        
        // Use getBoundingClientRect for accurate rendered dimensions
        const agentRect = agentElement.getBoundingClientRect();
        
        // Calculate agent width and height from bounding rect
        const agentWidth = agentRect.width;
        const agentHeight = agentRect.height;
        
        // Calculate agent center in global coordinates
        const agentCenterGlobalX = agentPos.x + (agentWidth / 2);
        const agentCenterGlobalY = agentPos.y + (agentHeight / 2);
        
        // Convert to screen coordinates for SVG
        const agentCenterScreen = this.canvasManager.globalToScreen(agentCenterGlobalX, agentCenterGlobalY);
        
        // Sort tasks by ID to get proper order
        const sortedTaskKeys = Array.from(taskKeys).sort((a, b) => {
            const taskA = this.taskManager.taskNodes.get(a);
            const taskB = this.taskManager.taskNodes.get(b);
            return taskA.taskId - taskB.taskId;
        });
        
        // Connect EVERY task to the agent (center to center)
        sortedTaskKeys.forEach((taskKey, index) => {
            const taskData = this.taskManager.taskNodes.get(taskKey);
            if (!taskData || !taskData.element) return;
            
            const taskElement = taskData.element;
            
            // Use getBoundingClientRect for accurate rendered dimensions
            const taskRect = taskElement.getBoundingClientRect();
            const taskWidth = taskRect.width;
            const taskHeight = taskRect.height;
            
            // Calculate task center in global coordinates
            const taskCenterGlobalX = taskData.globalX + (taskWidth / 2);
            const taskCenterGlobalY = taskData.globalY + (taskHeight / 2);
            
            // Convert to screen coordinates for SVG
            const taskCenterScreen = this.canvasManager.globalToScreen(taskCenterGlobalX, taskCenterGlobalY);
            
            // Create connection from agent to this task (using screen coords)
            const connectionKey = `agent-${agentId}-to-task-${taskData.taskId}`;
            
            // Stagger the animation for initial creation
            const staggerDelay = isInitialCreation ? index * 100 : 0;
            
            if (isInitialCreation && staggerDelay > 0) {
                // Delay the creation for staggered animation effect
                setTimeout(() => {
                    this.createConnection(
                        connectionKey,
                        agentCenterScreen.x,
                        agentCenterScreen.y,
                        taskCenterScreen.x,
                        taskCenterScreen.y,
                        this.getStatusClass(taskData.element),
                        true // isInitialCreation
                    );
                }, staggerDelay);
            } else {
                this.createConnection(
                    connectionKey,
                    agentCenterScreen.x,
                    agentCenterScreen.y,
                    taskCenterScreen.x,
                    taskCenterScreen.y,
                    this.getStatusClass(taskData.element),
                    isInitialCreation
                );
            }
        });
        
        // Clean up any orphaned connections
        this.cleanupOrphanedConnections(agentId, sortedTaskKeys);
    }
    
    /**
     * Create or update a single connection line
     */
    createConnection(key, x1, y1, x2, y2, statusClass, isInitialCreation = false) {
        if (!this.svg) return;
        
        let path = this.lines.get(key);
        const isNewPath = !path;
        
        if (!path) {
            // Create new path element
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('connection-line');
            
            // Apply initial animation for new connections
            if (isInitialCreation) {
                path.classList.add('initial-animation');
                
                // Remove animation class after animation completes (800ms)
                // Also reset stroke-dasharray/dashoffset to allow proper styling
                setTimeout(() => {
                    path.classList.remove('initial-animation');
                    // Reset dasharray/dashoffset so status classes can apply properly
                    path.style.strokeDasharray = '';
                    path.style.strokeDashoffset = '';
                }, 800);
            }
            
            // Apply no-transition immediately if transitions are disabled
            if (!this.transitionsEnabled) {
                path.classList.add('no-transition');
            }
            
            this.svg.appendChild(path);
            this.lines.set(key, path);
        }
        
        // Update path data with bendy curve
        const pathData = this.createBendyPath(x1, y1, x2, y2);
        path.setAttribute('d', pathData);
        
        // Update status class
        path.className.baseVal = `connection-line ${statusClass}${!this.transitionsEnabled ? ' no-transition' : ''}${isNewPath && isInitialCreation ? ' initial-animation' : ''}`;
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
        const verticalStrength = Math.abs(dy) * 0.8;
        
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
        if (!this.taskManager) return;
        
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
        if (!this.taskManager) return;
        
        for (const agentId of this.taskManager.agentTasks.keys()) {
            this.updateConnectionsForAgent(agentId);
        }
    }
}
