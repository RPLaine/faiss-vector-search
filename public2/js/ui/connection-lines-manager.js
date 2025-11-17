/**
 * Connection Lines Manager - Manages SVG connection lines between agents and tasks
 * 
 * Responsibilities:
 * - Create and update SVG path elements for connections
 * - Clean up orphaned connections
 * - Calculate bendy paths between nodes
 * 
 * Delegation:
 * - CSS transitions: TransitionManager (via CanvasManager)
 * 
 * CRITICAL: Never set inline `style.transition` on path elements - TransitionManager 
 *           controls this via inline styles + className for proper drag/scroll behavior.
 *           Use CSS classes and let TransitionManager handle transition states.
 */

import { ANIMATION_DURATIONS } from '../constants.js';

export class ConnectionLinesManager {
    constructor(svgId, canvasManager, taskManager, toolManager = null) {
        this.svg = document.getElementById(svgId);
        this.canvasManager = canvasManager;
        this.taskManager = taskManager;
        this.toolManager = toolManager; // Optional tool manager for tool connections
        this.lines = new Map(); // connection_key -> SVG path element
        this.animationTimeouts = new Map(); // connection_key -> timeout ID for cleanup
        this.transitionManager = canvasManager.transitionManager; // Reference for registration
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
     * @param {boolean} shouldStartHidden - Whether connections should start hidden (for non-selected agents)
     */
    updateConnectionsForAgent(agentId, isInitialCreation = false, shouldStartHidden = false) {
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
            const staggerDelay = isInitialCreation ? index * ANIMATION_DURATIONS.CONNECTION_STAGGER_DELAY : 0;
            
            if (isInitialCreation && staggerDelay > 0) {
                // Delay the creation for staggered animation effect
                const timeoutId = setTimeout(() => {
                    this.createConnection(
                        connectionKey,
                        agentCenterScreen.x,
                        agentCenterScreen.y,
                        taskCenterScreen.x,
                        taskCenterScreen.y,
                        this.getStatusClass(taskData.element),
                        true, // isInitialCreation
                        shouldStartHidden
                    );
                }, staggerDelay);
                // Store timeout ID for cleanup
                this.animationTimeouts.set(connectionKey, timeoutId);
            } else {
                this.createConnection(
                    connectionKey,
                    agentCenterScreen.x,
                    agentCenterScreen.y,
                    taskCenterScreen.x,
                    taskCenterScreen.y,
                    this.getStatusClass(taskData.element),
                    isInitialCreation,
                    shouldStartHidden
                );
            }
        });
        
        // Clean up any orphaned connections
        this.cleanupOrphanedConnections(agentId, sortedTaskKeys);
        
        // Update tool connections for this agent's tasks
        if (this.toolManager) {
            sortedTaskKeys.forEach(taskKey => {
                this.updateToolConnectionsForTask(taskKey);
            });
        }
    }
    
    /**
     * Create or update a single connection line
     */
    createConnection(key, x1, y1, x2, y2, statusClass, isInitialCreation = false, shouldStartHidden = false) {
        if (!this.svg) return;
        
        let path = this.lines.get(key);
        const isNewPath = !path;
        
        if (!path) {
            // Create new path element
            path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // Use className.baseVal for consistency with SVG API
            path.className.baseVal = 'connection-line';
            
            // Start hidden if requested (for non-selected agents)
            if (shouldStartHidden) {
                path.style.display = 'none';
                path.style.opacity = '0';
            }
            
            // Register with transition manager
            if (this.transitionManager) {
                this.transitionManager.registerConnection(key, path);
            }
            
            // Apply initial animation for new connections ONLY if not starting hidden
            if (isInitialCreation && !shouldStartHidden) {
                path.className.baseVal = 'connection-line initial-animation';
                
                // Remove animation class after animation completes
                // Also reset stroke-dasharray/dashoffset to allow proper styling
                const timeoutId = setTimeout(() => {
                    // Only run if path still exists in DOM
                    if (this.lines.has(key)) {
                        const currentClass = path.className.baseVal;
                        path.className.baseVal = currentClass.replace(/\s*initial-animation\s*/g, '').trim();
                        // Reset dasharray/dashoffset so status classes can apply properly
                        path.style.strokeDasharray = '';
                        path.style.strokeDashoffset = '';
                    }
                }, ANIMATION_DURATIONS.CONNECTION_INITIAL_ANIMATION);
                
                // Store timeout ID for cleanup
                this.animationTimeouts.set(key, timeoutId);
            }
            
            this.svg.appendChild(path);
            this.lines.set(key, path);
        }
        
        // Update path data with bendy curve
        const pathData = this.createBendyPath(x1, y1, x2, y2);
        path.setAttribute('d', pathData);
        
        // Update status class while preserving transition-related classes
        const currentClass = path.className.baseVal;
        const hasNoTransition = currentClass.includes('no-transition');
        const hasInitialAnimation = currentClass.includes('initial-animation');
        
        // Build new class preserving special classes
        let newClass = `connection-line ${statusClass}`;
        if (hasNoTransition) newClass += ' no-transition';
        if (hasInitialAnimation) newClass += ' initial-animation';
        
        path.className.baseVal = newClass;
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
                // Clear any pending animation timeouts
                const timeoutId = this.animationTimeouts.get(key);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.animationTimeouts.delete(key);
                }
                
                // Unregister from transition manager
                if (this.transitionManager) {
                    this.transitionManager.unregisterConnection(key);
                }
                
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
            // Clear any pending animation timeouts
            const timeoutId = this.animationTimeouts.get(key);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.animationTimeouts.delete(key);
            }
            
            // Unregister from transition manager
            if (this.transitionManager) {
                this.transitionManager.unregisterConnection(key);
            }
            
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
                    // Clear any pending animation timeouts
                    const timeoutId = this.animationTimeouts.get(key);
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        this.animationTimeouts.delete(key);
                    }
                    
                    // Unregister from transition manager
                    if (this.transitionManager) {
                        this.transitionManager.unregisterConnection(key);
                    }
                    
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
        
        // Update agent-to-task connections
        for (const agentId of this.taskManager.agentTasks.keys()) {
            this.updateConnectionsForAgent(agentId);
        }
        
        // Update task-to-tool connections
        if (this.toolManager) {
            for (const [taskKey, toolKeys] of this.toolManager.taskTools.entries()) {
                if (toolKeys && toolKeys.size > 0) {
                    this.updateToolConnectionsForTask(taskKey);
                }
            }
        }
    }
    
    /**
     * Show connection lines for an agent
     * Matches both agent-to-task and task-to-tool connections
     */
    showConnectionsForAgent(agentId) {
        return new Promise((resolve) => {
            const matchingPaths = [];
            
            // Match both connection types:
            // - agent-{agentId}-to-task-{taskId} (agent-to-task)
            // - task-{agentId}-task-{taskId}-to-tool-{toolKey} (task-to-tool)
            for (const [key, path] of this.lines.entries()) {
                if (key.includes(`agent-${agentId}-`) || key.includes(`task-${agentId}-task-`)) {
                    matchingPaths.push(path);
                }
            }
            
            // Force-set initial state to ensure visibility is properly applied
            matchingPaths.forEach(path => {
                path.style.opacity = '0';
                path.style.display = 'block';
            });
            
            // Trigger fade-in animation (let CSS handle transitions)
            requestAnimationFrame(() => {
                matchingPaths.forEach(path => {
                    path.style.opacity = '1';
                });
                
                // Resolve after animation completes
                setTimeout(resolve, 300);
            });
        });
    }
    
    /**
     * Hide connection lines for an agent
     * Matches both agent-to-task and task-to-tool connections
     */
    hideConnectionsForAgent(agentId) {
        return new Promise((resolve) => {
            const matchingPaths = [];
            
            // Match both connection types:
            // - agent-{agentId}-to-task-{taskId} (agent-to-task)
            // - task-{agentId}-task-{taskId}-to-tool-{toolKey} (task-to-tool)
            for (const [key, path] of this.lines.entries()) {
                if (key.includes(`agent-${agentId}-`) || key.includes(`task-${agentId}-task-`)) {
                    matchingPaths.push(path);
                }
            }
            
            // Force-set opacity to trigger fade-out
            matchingPaths.forEach(path => {
                path.style.opacity = '0';
            });
            
            // Hide after animation completes (match CSS transition duration)
            setTimeout(() => {
                matchingPaths.forEach(path => {
                    path.style.display = 'none';
                });
                resolve();
            }, 300);
        });
    }
    
    /**
     * Show tool connections for a specific task
     * Matches task-{taskKey}-to-tool-* connections
     */
    showToolConnectionsForTask(taskKey) {
        return new Promise((resolve) => {
            const matchingPaths = [];
            
            for (const [key, path] of this.lines.entries()) {
                if (key.startsWith(`task-${taskKey}-to-tool-`)) {
                    matchingPaths.push(path);
                }
            }
            
            // Force-set initial state to ensure visibility is properly applied
            matchingPaths.forEach(path => {
                path.style.opacity = '0';
                path.style.display = 'block';
            });
            
            // Trigger fade-in animation
            requestAnimationFrame(() => {
                matchingPaths.forEach(path => {
                    path.style.opacity = '1';
                });
                
                // Resolve after animation completes
                setTimeout(resolve, 300);
            });
        });
    }
    
    /**
     * Hide tool connections for a specific task
     * Matches task-{taskKey}-to-tool-* connections
     */
    hideToolConnectionsForTask(taskKey) {
        return new Promise((resolve) => {
            const matchingPaths = [];
            
            for (const [key, path] of this.lines.entries()) {
                if (key.startsWith(`task-${taskKey}-to-tool-`)) {
                    matchingPaths.push(path);
                }
            }
            
            // Force-set opacity to trigger fade-out
            matchingPaths.forEach(path => {
                path.style.opacity = '0';
            });
            
            // Hide after animation completes
            setTimeout(() => {
                matchingPaths.forEach(path => {
                    path.style.display = 'none';
                });
                resolve();
            }, 300);
        });
    }
    
    /**
     * Create connection from task to its tool node
     * @param {string} taskKey - The task key (agentId-taskId)
     * @param {string} toolKey - The tool key (agentId-taskId-toolId)
     * @param {boolean} isInitialCreation - Whether this is initial creation
     * @param {boolean} shouldStartHidden - Whether connection should start hidden (for non-selected agents)
     */
    createTaskToToolConnection(taskKey, toolKey, isInitialCreation = false, shouldStartHidden = false) {
        if (!this.taskManager || !this.toolManager) return;
        
        const taskData = this.taskManager.taskNodes.get(taskKey);
        const toolData = this.toolManager.toolNodes.get(toolKey);
        
        if (!taskData || !taskData.element || !toolData || !toolData.element) return;
        
        // Get task dimensions and position
        const taskRect = taskData.element.getBoundingClientRect();
        const taskWidth = taskRect.width;
        const taskHeight = taskRect.height;
        
        // Task right edge in global coords
        const taskRightGlobalX = taskData.globalX + taskWidth;
        const taskRightGlobalY = taskData.globalY + (taskHeight / 2);
        
        // Get tool dimensions and position
        const toolRect = toolData.element.getBoundingClientRect();
        const toolHeight = toolRect.height;
        
        // Tool left edge in global coords
        const toolLeftGlobalX = toolData.globalX;
        const toolLeftGlobalY = toolData.globalY + (toolHeight / 2);
        
        // Convert to screen coordinates
        const taskRightScreen = this.canvasManager.globalToScreen(taskRightGlobalX, taskRightGlobalY);
        const toolLeftScreen = this.canvasManager.globalToScreen(toolLeftGlobalX, toolLeftGlobalY);
        
        const connectionKey = `task-${taskKey}-to-tool-${toolKey}`;
        
        this.createConnection(
            connectionKey,
            taskRightScreen.x,
            taskRightScreen.y,
            toolLeftScreen.x,
            toolLeftScreen.y,
            'tool-connection', // Special class for tool connections
            isInitialCreation,
            shouldStartHidden
        );
    }
    
    /**
     * Update all tool connections for a task
     * @param {string} taskKey - The task key
     */
    updateToolConnectionsForTask(taskKey) {
        if (!this.toolManager) return;
        
        const tools = this.toolManager.getTaskTools(taskKey);
        if (!tools || tools.length === 0) {
            this.removeToolConnectionsForTask(taskKey);
            return;
        }
        
        tools.forEach(toolKey => {
            this.createTaskToToolConnection(taskKey, toolKey, false);
        });
    }
    
    /**
     * Remove all tool connections for a task
     * @param {string} taskKey - The task key
     */
    removeToolConnectionsForTask(taskKey) {
        const keysToRemove = [];
        
        for (const [key, path] of this.lines.entries()) {
            if (key.includes(`task-${taskKey}-to-tool-`)) {
                const timeoutId = this.animationTimeouts.get(key);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.animationTimeouts.delete(key);
                }
                
                if (this.transitionManager) {
                    this.transitionManager.unregisterConnection(key);
                }
                
                path.remove();
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => this.lines.delete(key));
    }
    
    /**
     * Remove a specific tool connection
     * @param {string} toolKey - The tool key
     */
    removeToolConnection(toolKey) {
        const keysToRemove = [];
        
        for (const [key, path] of this.lines.entries()) {
            if (key.includes(`-to-tool-${toolKey}`)) {
                const timeoutId = this.animationTimeouts.get(key);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.animationTimeouts.delete(key);
                }
                
                if (this.transitionManager) {
                    this.transitionManager.unregisterConnection(key);
                }
                
                path.remove();
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => this.lines.delete(key));
    }
}

