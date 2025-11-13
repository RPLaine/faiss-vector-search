/**
 * Canvas Manager - Manages the agent canvas, node positioning, and connection lines
 * 
 * Merged functionality from ConnectionLinesManager for unified spatial layout management.
 * 
 * Line colors based on task status:
 * - Incomplete: grey (#404040)
 * - Processing: blue animated (#2563eb)
 * - Complete: green (#10b981)
 * - Failed: red (#ef4444)
 */

import { ANIMATION_DURATIONS, POSITIONING_DELAYS, LAYOUT_DIMENSIONS } from './constants.js';

export class CanvasManager {
    constructor(canvasId, taskManager) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.agents = new Map(); // agent_id -> {globalX, globalY, element}
        this.heightUpdateTimeout = null; // Debounce timer for height updates
        this.isRecalculating = false; // Flag to prevent nested recalculations
        
        // Camera/viewport system for scroll-free navigation
        this.camera = {
            x: 0,  // Camera X offset (changed by mouse drag)
            y: 0   // Camera Y offset (changed by mouse wheel and drag)
        };
        
        // Mouse drag state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.cameraStartX = 0;
        this.cameraStartY = 0;
        
        // Connection lines (merged from ConnectionLinesManager)
        this.taskManager = taskManager;
        this.svg = document.getElementById('connectionLines');
        this.lines = new Map(); // connection_key -> SVG path element
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupScrollHandler();
        this.setupDragHandler();
    }
    
    /**
     * Setup mouse wheel handler for camera-based scrolling
     */
    setupScrollHandler() {
        const container = this.canvas.parentElement;
        
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // Update camera Y position (positive delta = scroll down = move camera up)
            this.camera.y += e.deltaY * 0.5; // Scale for smoother scrolling
            
            // Update all element positions based on new camera position
            this.updateAllElementPositions();
            this.updateAllConnections();
        }, { passive: false });
    }
    
    /**
     * Setup mouse drag handler for camera panning
     */
    setupDragHandler() {
        const container = this.canvas.parentElement;
        
        // Mouse down - start drag
        container.addEventListener('mousedown', (e) => {
            // Only start drag if clicking on canvas background (not on elements)
            if (e.target !== this.canvas && e.target !== container) {
                return;
            }
            
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.cameraStartX = this.camera.x;
            this.cameraStartY = this.camera.y;
            
            // Change cursor
            container.style.cursor = 'grabbing';
            
            // Prevent text selection during drag
            e.preventDefault();
        });
        
        // Mouse move - update camera if dragging
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            // Calculate drag delta
            const deltaX = e.clientX - this.dragStartX;
            const deltaY = e.clientY - this.dragStartY;
            
            // Update camera position (drag right = camera moves left = positive delta, negative camera change)
            this.camera.x = this.cameraStartX - deltaX;
            this.camera.y = this.cameraStartY - deltaY;
            
            // Update all element positions
            this.updateAllElementPositions();
            this.updateAllConnections();
        });
        
        // Mouse up - end drag
        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                container.style.cursor = '';
            }
        });
        
        // Set initial cursor style
        container.style.cursor = 'grab';
    }
    
    /**
     * Convert global coordinates to screen coordinates
     */
    globalToScreen(globalX, globalY) {
        return {
            x: globalX - this.camera.x,
            y: globalY - this.camera.y
        };
    }
    
    /**
     * Convert screen coordinates to global coordinates
     */
    screenToGlobal(screenX, screenY) {
        return {
            x: screenX + this.camera.x,
            y: screenY + this.camera.y
        };
    }
    
    /**
     * Update all element DOM positions based on current camera position
     */
    updateAllElementPositions() {
        // Update all agent positions
        for (const [agentId, agent] of this.agents.entries()) {
            const screenPos = this.globalToScreen(agent.globalX, agent.globalY);
            agent.element.style.left = `${screenPos.x}px`;
            agent.element.style.top = `${screenPos.y}px`;
        }
        
        // Update all task positions via event
        if (this.taskManager) {
            const event = new CustomEvent('updateTaskScreenPositions', {
                detail: { camera: this.camera }
            });
            window.dispatchEvent(event);
        }
    }
    
    resize() {
        const container = this.canvas.parentElement;
        
        // Fixed canvas size = viewport size (no dynamic height)
        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight;
        
        this.canvas.width = viewportWidth;
        this.canvas.height = viewportHeight;
        
        // Update nodes container to match (no scrollbar needed)
        const nodesContainer = document.getElementById('agentNodesContainer');
        if (nodesContainer) {
            nodesContainer.style.width = `${viewportWidth}px`;
            nodesContainer.style.height = `${viewportHeight}px`;
            nodesContainer.style.overflow = 'hidden'; // No scrollbar
        }
        
        // Update SVG dimensions to match viewport
        this.updateSVGDimensions();
        
        // Recalculate positions after resize (global coords don't change, but centering might)
        this.recalculateAllPositions();
        
        this.draw();
    }
    
    recalculateAgentPositions() {
        if (this.agents.size === 0) return;
        
        // Get canvas dimensions
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Calculate total content width (agents + gap + tasks)
        const agentWidth = LAYOUT_DIMENSIONS.AGENT_ESTIMATED_WIDTH;
        const gapWidth = LAYOUT_DIMENSIONS.GAP_AGENT_TO_TASK;
        const taskWidth = LAYOUT_DIMENSIONS.TASK_WIDTH;
        const totalContentWidth = agentWidth + gapWidth + taskWidth;
        
        // Calculate horizontal center offset (in global space)
        const horizontalCenter = (canvasWidth - totalContentWidth) / 2;
        const leftMargin = Math.max(LAYOUT_DIMENSIONS.CANVAS_MIN_MARGIN, horizontalCenter);
        
        // Get all agent elements with their heights
        const agentData = [];
        let totalHeight = 0;
        
        for (const [agentId, agent] of this.agents.entries()) {
            const height = agent.element.offsetHeight || 200;
            agentData.push({ agentId, agent, height });
            totalHeight += height;
        }
        
        // Calculate spacing between agents in global space
        const agentCount = agentData.length;
        const padding = LAYOUT_DIMENSIONS.GAP_BETWEEN_AGENTS;
        
        // Start from global Y = 0 and distribute agents vertically
        const totalGapSpace = (agentCount > 1) ? padding * (agentCount + 1) : padding * 2;
        const gapBetweenAgents = totalGapSpace / (agentCount + 1);
        
        // Position agents in global coordinates
        let currentGlobalY = gapBetweenAgents;
        
        for (const { agentId, agent, height } of agentData) {
            const globalX = leftMargin;
            const globalY = currentGlobalY;
            
            // Store global coordinates
            agent.globalX = globalX;
            agent.globalY = globalY;
            
            // Apply camera transform for screen position
            const screenPos = this.globalToScreen(globalX, globalY);
            agent.element.style.left = `${screenPos.x}px`;
            agent.element.style.top = `${screenPos.y}px`;
            
            currentGlobalY += height + gapBetweenAgents;
        }
        
        // Update connection lines immediately
        this.updateAllConnections();
        
        // Also update connection lines during and after agent transitions
        // Use multiple updates to keep lines in sync with animated movement
        POSITIONING_DELAYS.AGENT_POSITION_UPDATES.forEach(delay => {
            setTimeout(() => {
                this.updateAllConnections();
            }, delay);
        });
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections between agents and tasks
        // This will be called by TaskManager when needed
        // Canvas is shared between CanvasManager and TaskManager
    }
    
    getCenterPosition() {
        return {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
    }
    
    addAgent(agentId, element) {
        // Add agent to map first (initialize with global coords)
        this.agents.set(agentId, { globalX: 0, globalY: 0, element });
        
        // Disable transition for initial positioning
        element.classList.add('no-transition');
        
        // Wait for element to be rendered before calculating positions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.recalculateAgentPositions();
                // Enable transitions after initial positioning
                setTimeout(() => {
                    element.classList.remove('no-transition');
                }, 50);
            });
        });
        
        const agent = this.agents.get(agentId);
        return { x: agent.globalX, y: agent.globalY };
    }
    
    removeAgent(agentId) {
        this.removeConnectionsForAgent(agentId);
        this.agents.delete(agentId);
        this.recalculateAgentPositions();
        this.draw();
    }
    
    /**
     * Recalculate all positions (agents and tasks) in correct order
     * Order: Agent positions → Task positions → Connection lines
     */
    recalculateAllPositions() {
        // Avoid nested RAF calls if already in progress
        if (this.isRecalculating) return;
        this.isRecalculating = true;
        
        requestAnimationFrame(() => {
            console.log(`[CanvasManager] Recalculating - viewport: ${this.canvas.width}x${this.canvas.height}`);
            
            // Step 1: Calculate and apply agent positions (in global coords)
            this.recalculateAgentPositions();
            
            // Step 2: Calculate and apply task positions (in global coords)
            // Dispatch event synchronously for TaskController to handle
            const taskRecalculationEvent = new CustomEvent('recalculateTaskPositions', {
                detail: { immediate: true }
            });
            window.dispatchEvent(taskRecalculationEvent);
            
            // Step 3: Wait for task positioning to complete, then update connection lines
            requestAnimationFrame(() => {
                // Update all connection lines last
                this.updateAllConnections();
                
                this.isRecalculating = false;
                console.log('[CanvasManager] Recalculation complete');
            });
        });
    }
    
    getAgentPosition(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
        
        // Return global coordinates
        return { x: agent.globalX, y: agent.globalY };
    }
    
    updateAgentPosition(agentId, globalX, globalY) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.globalX = globalX;
            agent.globalY = globalY;
            
            const screenPos = this.globalToScreen(globalX, globalY);
            agent.element.style.left = `${screenPos.x}px`;
            agent.element.style.top = `${screenPos.y}px`;
            this.draw();
        }
    }
    
    
    /**
     * Center an agent in the viewport by adjusting camera position
     * Uses smooth animated camera movement
     */
    scrollAgentToCenter(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        
        const agentElement = agent.element;
        const agentHeight = agentElement.offsetHeight || 200;
        const viewportHeight = this.canvas.height;
        
        // Calculate target camera Y to center the agent
        // Agent global center Y
        const agentCenterGlobalY = agent.globalY + (agentHeight / 2);
        
        // We want agent center at viewport center
        // screenY = globalY - camera.y
        // viewportHeight/2 = agentCenterGlobalY - camera.y
        // camera.y = agentCenterGlobalY - viewportHeight/2
        const targetCameraY = agentCenterGlobalY - (viewportHeight / 2);
        
        // Smooth camera animation
        const startCameraY = this.camera.y;
        const cameraChange = targetCameraY - startCameraY;
        const duration = Math.min(4000, Math.max(1500, Math.abs(cameraChange) / 1.5));
        
        const startTime = performance.now();
        
        // Easing function for smooth deceleration (ease-out-cubic)
        const easeOutCubic = (t) => {
            return 1 - Math.pow(1 - t, 3);
        };
        
        const animateCamera = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);
            
            this.camera.y = startCameraY + (cameraChange * easedProgress);
            
            // Update all positions and connections
            this.updateAllElementPositions();
            this.updateAllConnections();
            
            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        };
        
        requestAnimationFrame(animateCamera);
    }
    
    // ========================================
    // Connection Lines Management (merged from ConnectionLinesManager)
    // ========================================
    
    /**
     * Update SVG viewBox to match canvas dimensions
     */
    updateSVGDimensions() {
        if (this.svg && this.canvas) {
            // SVG matches viewport size (not scroll area)
            this.svg.setAttribute('width', this.canvas.width);
            this.svg.setAttribute('height', this.canvas.height);
            this.svg.setAttribute('viewBox', `0 0 ${this.canvas.width} ${this.canvas.height}`);
        }
    }
    
    /**
     * Create or update all connection lines for an agent and its tasks
     */
    updateConnectionsForAgent(agentId) {
        if (!this.taskManager) return;
        
        const taskKeys = this.taskManager.agentTasks.get(agentId);
        if (!taskKeys || taskKeys.size === 0) {
            // No tasks, remove any existing connections
            this.removeConnectionsForAgent(agentId);
            return;
        }
        
        const agentPos = this.getAgentPosition(agentId); // Returns global coords
        if (!agentPos) return;
        
        const agentElement = this.agents.get(agentId)?.element;
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
        const agentCenterScreen = this.globalToScreen(agentCenterGlobalX, agentCenterGlobalY);
        
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
            
            // Calculate task center in global coordinates
            const taskCenterGlobalX = taskData.globalX + (taskWidth / 2);
            const taskCenterGlobalY = taskData.globalY + (taskHeight / 2);
            
            // Convert to screen coordinates for SVG
            const taskCenterScreen = this.globalToScreen(taskCenterGlobalX, taskCenterGlobalY);
            
            // Create connection from agent to this task (using screen coords)
            const connectionKey = `agent-${agentId}-to-task-${taskData.taskId}`;
            this.createConnection(
                connectionKey,
                agentCenterScreen.x,
                agentCenterScreen.y,
                taskCenterScreen.x,
                taskCenterScreen.y,
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
        if (!this.svg) return;
        
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
        
        this.updateSVGDimensions();
        
        for (const agentId of this.taskManager.agentTasks.keys()) {
            this.updateConnectionsForAgent(agentId);
        }
    }
}
