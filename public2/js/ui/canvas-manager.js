/**
 * Canvas Manager - Manages the agent canvas and node positioning
 * 
 * Responsibilities:
 * - Camera/viewport system for scroll-free navigation
 * - Agent and task positioning (global and screen coordinates)
 * - Canvas resize and dimension management
 * - Coordinate recalculation and layout updates
 * 
 * Delegation:
 * - Connection lines: ConnectionLinesManager
 * - Drag interactions: DragHandler
 * - Scroll interactions: ScrollHandler
 * - CSS transitions: TransitionManager (injected)
 */

import { ANIMATION_DURATIONS, POSITIONING_DELAYS, LAYOUT_DIMENSIONS, SCROLL_DELAYS } from '../constants.js';
import { AnimationUtils, Easing } from '../utils/animation-utils.js';
import { ConnectionLinesManager } from './connection-lines-manager.js';
import { DragHandler } from '../utils/drag-handler.js';
import { ScrollHandler } from '../utils/scroll-handler.js';
import { TaskPositionManager } from '../services/task-position-manager.js';

export class CanvasManager {
    constructor(canvasId, taskManager, transitionManager, agentManager, toolManager = null) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.agents = new Map(); // agent_id -> {globalX, globalY, element}
        this.heightUpdateTimeout = null; // Debounce timer for height updates
        this.isRecalculating = false; // Flag to prevent nested recalculations
        this.agentManager = agentManager; // For checking agent selection state
        
        // Camera/viewport system for scroll-free navigation
        this.camera = {
            x: 0,  // Camera X offset (changed by mouse drag)
            y: 0   // Camera Y offset (changed by mouse wheel)
        };
        
        // Transition manager (injected dependency)
        this.transitionManager = transitionManager;
        
        // Connection lines manager (delegated to separate class)
        this.taskManager = taskManager;
        this.toolManager = toolManager; // Tool manager for tool connections
        this.connectionLinesManager = new ConnectionLinesManager('connectionLines', this, taskManager, toolManager);
        
        // Centralized task positioning manager
        this.taskPositionManager = new TaskPositionManager(this, transitionManager);
        
        // Drag handler (delegated to separate class)
        this.dragHandler = new DragHandler(this.canvas, this);
        
        // Scroll handler (delegated to separate class)
        this.scrollHandler = new ScrollHandler(this);
        
        // Zoom detection - track zoom level for automatic recalculation
        this.currentZoom = window.devicePixelRatio;
        
        this.resize();
        window.addEventListener('resize', () => this.handleResize());
    }
    
    /**
     * Delegate transition management to TransitionManager
     */
    addNoTransitionClass() {
        this.transitionManager.disableAllTransitions();
    }
    
    removeNoTransitionClass() {
        this.transitionManager.enableAllTransitions();
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
     * Update a single element's position based on global coordinates
     * @param {HTMLElement} element - The element to position
     * @param {number} globalX - Global X coordinate
     * @param {number} globalY - Global Y coordinate
     */
    updateElementPosition(element, globalX, globalY) {
        const screenPos = this.globalToScreen(globalX, globalY);
        element.style.left = `${screenPos.x}px`;
        element.style.top = `${screenPos.y}px`;
    }
    
    /**
     * Update all element DOM positions based on current camera position
     * Centralized handler for agents, tasks, and tools
     */
    updateAllElementPositions() {
        // Update all agent positions
        for (const [agentId, agent] of this.agents.entries()) {
            const screenPos = this.globalToScreen(agent.globalX, agent.globalY);
            agent.element.style.left = `${screenPos.x}px`;
            agent.element.style.top = `${screenPos.y}px`;
        }
        
        // Update all task positions via centralized TaskPositionManager
        if (this.taskManager && this.taskPositionManager) {
            const taskUpdates = [];
            for (const [taskKey, taskData] of this.taskManager.taskNodes.entries()) {
                if (!taskData.element) continue;
                taskUpdates.push({
                    taskKey,
                    element: taskData.element,
                    globalX: taskData.globalX,
                    globalY: taskData.globalY
                });
            }
            
            // Batch update all tasks (transitions already disabled by caller)
            if (taskUpdates.length > 0) {
                this.taskPositionManager.updateMultipleTaskPositions(taskUpdates, {
                    immediate: true,
                    skipTransitionManager: true, // Caller already handled transitions
                    reason: 'camera_update'
                });
            }
        }
        
        // Update all tool positions via centralized TaskPositionManager
        if (this.toolManager && this.taskPositionManager) {
            const toolUpdates = [];
            for (const [toolKey, toolData] of this.toolManager.toolNodes.entries()) {
                if (!toolData.element) continue;
                
                // Skip tools with invalid positions
                if (toolData.globalX === undefined || toolData.globalY === undefined ||
                    isNaN(toolData.globalX) || isNaN(toolData.globalY)) {
                    console.warn(`[CanvasManager] Skipping tool ${toolKey} with invalid position:`, {
                        globalX: toolData.globalX,
                        globalY: toolData.globalY
                    });
                    continue;
                }
                
                toolUpdates.push({
                    toolKey,
                    element: toolData.element,
                    globalX: toolData.globalX,
                    globalY: toolData.globalY
                });
            }
            
            // Batch update all tools (transitions already disabled by caller)
            if (toolUpdates.length > 0) {
                this.taskPositionManager.updateMultipleToolPositions(toolUpdates, {
                    immediate: true,
                    skipTransitionManager: true, // Caller already handled transitions
                    reason: 'camera_update'
                });
            }
        }
    }
    
    /**
     * Handle window resize events - detects zoom changes and triggers appropriate updates
     */
    handleResize() {
        const newZoom = window.devicePixelRatio;
        const zoomChanged = Math.abs(newZoom - this.currentZoom) > 0.01;
        
        if (zoomChanged) {
            console.log(`[CanvasManager] Zoom detected: ${this.currentZoom.toFixed(2)} → ${newZoom.toFixed(2)}`);
            this.currentZoom = newZoom;
        }
        
        // Always call resize to update dimensions and positions
        this.resize();
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
            const height = agent.element.offsetHeight || LAYOUT_DIMENSIONS.AGENT_DEFAULT_HEIGHT;
            const isSelected = this.agentManager ? this.agentManager.isAgentSelected(agentId) : false;
            agentData.push({ agentId, agent, height, isSelected });
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
        
        for (const { agentId, agent, height, isSelected } of agentData) {
            // Selected agents use full left margin, unselected use half width offset
            const horizontalOffset = isSelected ? 0 : -(LAYOUT_DIMENSIONS.AGENT_WIDTH / 2);
            const globalX = leftMargin + horizontalOffset;
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
        
        // Register with transition manager
        this.transitionManager.registerAgent(agentId, element);
        
        // Disable transition for initial positioning
        element.classList.add('no-transition');
        
        // Wait for element to be rendered before calculating positions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.recalculateAgentPositions();
                // Enable transitions after initial positioning
                setTimeout(() => {
                    element.classList.remove('no-transition');
                }, POSITIONING_DELAYS.AGENT_INITIAL_POSITION_ENABLE);
            });
        });
        
        const agent = this.agents.get(agentId);
        return { x: agent.globalX, y: agent.globalY };
    }
    
    removeAgent(agentId) {
        // Unregister from transition manager
        this.transitionManager.unregisterAgent(agentId);
        
        // Remove agent from canvas tracking
        this.agents.delete(agentId);
        this.recalculateAgentPositions();
        this.draw();
    }
    
    /**
     * Recalculate all positions (agents, tasks, and tools) in correct order
     * Order: Agent positions → Task positions → Tool positions → Connection lines
     */
    recalculateAllPositions() {
        // Avoid nested RAF calls if already in progress
        if (this.isRecalculating) return;
        this.isRecalculating = true;
        
        requestAnimationFrame(() => {
            // Step 1: Calculate and apply agent positions (in global coords)
            this.recalculateAgentPositions();
            
            // Step 2: Calculate and apply task positions (in global coords)
            // Dispatch event synchronously for TaskController to handle
            const taskRecalculationEvent = new CustomEvent('recalculateTaskPositions', {
                detail: { immediate: true }
            });
            window.dispatchEvent(taskRecalculationEvent);
            
            // Step 3: Wait for task positioning to complete, then reposition tools
            requestAnimationFrame(() => {
                // Step 3a: Reposition tools based on updated task positions
                const toolRecalculationEvent = new CustomEvent('recalculateToolPositions', {
                    detail: { immediate: true }
                });
                window.dispatchEvent(toolRecalculationEvent);
                
                // Step 3b: Update all connection lines last (after tools repositioned)
                requestAnimationFrame(() => {
                    this.connectionLinesManager.updateAllConnections();
                    
                    this.isRecalculating = false;
                });
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
     * Uses smooth animated camera movement with centralized animation utilities
     * Positions agent both vertically (centered) and horizontally (same as initialization)
     */
    scrollAgentToCenter(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        
        const agentElement = agent.element;
        const agentHeight = agentElement.offsetHeight || LAYOUT_DIMENSIONS.AGENT_DEFAULT_HEIGHT;
        const viewportWidth = this.canvas.width;
        const viewportHeight = this.canvas.height;
        
        // Calculate target horizontal position (same as initialization)
        // During initialization, agents are positioned at leftMargin (selected) or leftMargin - halfWidth (unselected)
        const agentWidth = LAYOUT_DIMENSIONS.AGENT_ESTIMATED_WIDTH;
        const gapWidth = LAYOUT_DIMENSIONS.GAP_AGENT_TO_TASK;
        const taskWidth = LAYOUT_DIMENSIONS.TASK_WIDTH;
        const totalContentWidth = agentWidth + gapWidth + taskWidth;
        const horizontalCenter = (viewportWidth - totalContentWidth) / 2;
        const leftMargin = Math.max(LAYOUT_DIMENSIONS.CANVAS_MIN_MARGIN, horizontalCenter);
        
        // Selected agents should appear at leftMargin in screen coordinates
        // screenX = globalX - camera.x
        // leftMargin = agent.globalX - camera.x
        // camera.x = agent.globalX - leftMargin
        const targetCameraX = agent.globalX - leftMargin;
        
        // Calculate target camera Y to center the agent vertically
        // Agent global center Y
        const agentCenterGlobalY = agent.globalY + (agentHeight / 2);
        
        // We want agent center at viewport center
        // screenY = globalY - camera.y
        // viewportHeight/2 = agentCenterGlobalY - camera.y
        // camera.y = agentCenterGlobalY - viewportHeight/2
        const targetCameraY = agentCenterGlobalY - (viewportHeight / 2);
        
        // Calculate animation duration based on total distance (both X and Y)
        const startCameraX = this.camera.x;
        const startCameraY = this.camera.y;
        const cameraChangeX = targetCameraX - startCameraX;
        const cameraChangeY = targetCameraY - startCameraY;
        const totalDistance = Math.sqrt(cameraChangeX * cameraChangeX + cameraChangeY * cameraChangeY);
        const duration = Math.min(
            SCROLL_DELAYS.SCROLL_ANIMATION_MAX, 
            Math.max(SCROLL_DELAYS.SCROLL_ANIMATION_MIN, totalDistance * 0.8)
        );
        
        // Use centralized animation with easeInOutCubic for smooth damped movement
        // Animate both X and Y camera positions simultaneously
        AnimationUtils.animateValue(
            0,  // Start at 0
            1,  // End at 1 (progress ratio)
            duration,
            (progress) => {
                // Interpolate both camera positions
                this.camera.x = startCameraX + (cameraChangeX * progress);
                this.camera.y = startCameraY + (cameraChangeY * progress);
                // Update all positions and connections
                this.updateAllElementPositions();
                this.connectionLinesManager.updateAllConnections();
            },
            Easing.easeInOutCubic  // Smooth damped easing - more natural than easeInOutQuad
        );
    }
}
