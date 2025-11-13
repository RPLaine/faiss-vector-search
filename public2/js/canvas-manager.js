/**
 * Canvas Manager - Manages the agent canvas and node positioning
 * 
 * Camera/viewport system for scroll-free navigation
 */

import { ANIMATION_DURATIONS, POSITIONING_DELAYS, LAYOUT_DIMENSIONS } from './constants.js';
import { ConnectionLinesManager } from './ui/connection-lines-manager.js';

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
        this.dragAnimationFrame = null; // RAF handle for smooth updates
        
        // Connection lines manager (delegated to separate class)
        this.taskManager = taskManager;
        this.connectionLinesManager = new ConnectionLinesManager('connectionLines', this, taskManager);
        this.dragStartY = 0;
        this.cameraStartX = 0;
        this.cameraStartY = 0;
        this.dragAnimationFrame = null; // RAF handle for smooth updates
        
        // Connection lines manager (delegated to separate class)
        this.taskManager = taskManager;
        this.connectionLinesManager = new ConnectionLinesManager('connectionLines', this, taskManager);
        
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
            
            // Ensure transitions are enabled for smooth scrolling
            this.enableTransitions();
            
            // Update camera Y position (positive delta = scroll down = move camera up)
            this.camera.y += e.deltaY * 0.5; // Scale for smoother scrolling
            
            // Update all element positions based on new camera position
            this.updateAllElementPositions();
            this.connectionLinesManager.updateAllConnections();
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
            
            // Disable transitions on all elements for immediate updates
            this.disableTransitions();
            
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
            
            // Request animation frame for smooth updates
            if (!this.dragAnimationFrame) {
                this.dragAnimationFrame = requestAnimationFrame(() => {
                    // Update all element positions immediately
                    this.updateAllElementPositions();
                    
                    // Update connection lines immediately
                    this.connectionLinesManager.updateAllConnections();
                    
                    // Clear RAF handle for next frame
                    this.dragAnimationFrame = null;
                });
            }
        });
        
        // Mouse up - end drag
        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                
                // Cancel any pending animation frame
                if (this.dragAnimationFrame) {
                    cancelAnimationFrame(this.dragAnimationFrame);
                    this.dragAnimationFrame = null;
                }
                
                // Re-enable transitions after drag completes
                this.enableTransitions();
                
                // Final update of connections
                this.connectionLinesManager.updateAllConnections();
                
                container.style.cursor = '';
            }
        });
        
        // Set initial cursor style
        container.style.cursor = 'grab';
    }
    
    /**
     * Disable transitions on all elements for immediate drag updates
     */
    disableTransitions() {
        // Disable agent element transitions
        for (const [agentId, agent] of this.agents.entries()) {
            if (agent.element) {
                agent.element.classList.add('no-transition');
            }
        }
        
        // Disable task element transitions
        if (this.taskManager && this.taskManager.taskNodes) {
            for (const [taskKey, taskData] of this.taskManager.taskNodes.entries()) {
                if (taskData && taskData.element) {
                    taskData.element.classList.add('no-transition');
                }
            }
        }
        
        // Disable connection line transitions (delegated)
        this.connectionLinesManager.disableTransitions();
    }
    
    /**
     * Re-enable transitions after drag completes
     */
    enableTransitions() {
        // Re-enable agent element transitions
        for (const [agentId, agent] of this.agents.entries()) {
            if (agent.element) {
                agent.element.classList.remove('no-transition');
            }
        }
        
        // Re-enable task element transitions
        if (this.taskManager && this.taskManager.taskNodes) {
            for (const [taskKey, taskData] of this.taskManager.taskNodes.entries()) {
                if (taskData && taskData.element) {
                    taskData.element.classList.remove('no-transition');
                }
            }
        }
        
        // Re-enable connection line transitions (delegated)
        this.connectionLinesManager.enableTransitions();
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
        this.connectionLinesManager.updateSVGDimensions(viewportWidth, viewportHeight);
        
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
        
        // Note: Connection lines are NOT updated here during agent positioning.
        // They will be updated after tasks are created and positioned.
        // This ensures proper order: agents → tasks → connections.
        
        // Connection lines will be updated by:
        // 1. task-controller when tasks are positioned (initial creation)
        // 2. recalculateAllPositions when full layout recalculation is needed
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
        // Remove agent from canvas tracking
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
                this.connectionLinesManager.updateAllConnections();
                
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
            this.connectionLinesManager.updateAllConnections();
            
            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        };
        
        requestAnimationFrame(animateCamera);
    }
}
