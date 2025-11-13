/**
 * Canvas Manager - Manages the agent canvas and node positioning
 */

export class CanvasManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.agents = new Map(); // agent_id -> {x, y, element}
        this.heightUpdateTimeout = null; // Debounce timer for height updates
        this.isRecalculating = false; // Flag to prevent nested recalculations
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        const container = this.canvas.parentElement;
        const nodesContainer = document.getElementById('agentNodesContainer');
        
        // Calculate required height based on content
        let maxContentHeight = container.clientHeight;
        
        // Check if we have agents and tasks that extend beyond viewport
        if (nodesContainer) {
            const children = nodesContainer.children;
            let bottomMostY = 0;
            
            for (const child of children) {
                // Get the absolute bottom position of each element
                const computedTop = parseInt(child.style.top) || 0;
                const elementHeight = child.offsetHeight || 0;
                const elementBottom = computedTop + elementHeight;
                
                bottomMostY = Math.max(bottomMostY, elementBottom);
            }
            
            // Add padding to bottom (100px for better UX)
            if (bottomMostY > 0) {
                maxContentHeight = Math.max(container.clientHeight, bottomMostY + 100);
            }
        }
        
        this.canvas.width = container.clientWidth;
        this.canvas.height = maxContentHeight;
        
        // Update nodes container height
        if (nodesContainer) {
            nodesContainer.style.height = `${maxContentHeight}px`;
        }
        
        // Recalculate all positions when viewport changes
        this.recalculateAllPositions();
        
        this.draw();
    }
    
    recalculateAgentPositions() {
        if (this.agents.size === 0) return;
        
        // Get canvas dimensions
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Calculate total content width (agents + gap + tasks)
        // Assume agent width ~400px, gap 40px, task width ~900px
        const agentWidth = 400;
        const gapWidth = 40;
        const taskWidth = 900;
        const totalContentWidth = agentWidth + gapWidth + taskWidth;
        
        // Calculate horizontal center offset
        const horizontalCenter = (canvasWidth - totalContentWidth) / 2;
        const leftMargin = Math.max(50, horizontalCenter); // At least 50px margin
        
        // Get all agent elements with their heights
        const agentData = [];
        let totalHeight = 0;
        
        for (const [agentId, agent] of this.agents.entries()) {
            const height = agent.element.offsetHeight || 200;
            agentData.push({ agentId, agent, height });
            totalHeight += height;
        }
        
        // Calculate spacing between agents
        const agentCount = agentData.length;
        const padding = 50;
        const availableHeight = canvasHeight - (padding * 2);
        const totalGapSpace = Math.max(0, availableHeight - totalHeight);
        const gapBetweenAgents = agentCount > 1 ? totalGapSpace / (agentCount + 1) : totalGapSpace / 2;
        
        // Position agents with calculated gaps, centered horizontally
        let currentY = padding + gapBetweenAgents;
        
        for (const { agentId, agent, height } of agentData) {
            const x = leftMargin;
            const y = currentY;
            
            agent.x = x;
            agent.y = y;
            agent.element.style.left = `${x}px`;
            agent.element.style.top = `${y}px`;
            
            currentY += height + gapBetweenAgents;
        }
        
        // Update connection lines immediately
        if (this.connectionLines) {
            this.connectionLines.updateAllConnections();
        }
        
        // Also update connection lines during and after agent transitions (800ms)
        // Use multiple updates to keep lines in sync with animated movement
        if (this.connectionLines) {
            const updateIntervals = [100, 200, 300, 400, 500, 600, 700, 850];
            updateIntervals.forEach(delay => {
                setTimeout(() => {
                    this.connectionLines.updateAllConnections();
                }, delay);
            });
        }
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
        // Add agent to map first
        this.agents.set(agentId, { x: 0, y: 0, element });
        
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
        return { x: agent.x, y: agent.y };
    }
    
    removeAgent(agentId) {
        this.agents.delete(agentId);
        this.recalculateAgentPositions();
        this.draw();
    }
    
    /**
     * Recalculate all positions (agents and tasks) in correct order
     * Order: Canvas size → Agent positions → Task positions → Connection lines
     */
    recalculateAllPositions() {
        // Avoid nested RAF calls if already in progress
        if (this.isRecalculating) return;
        this.isRecalculating = true;
        
        requestAnimationFrame(() => {
            // Step 1: Update canvas size first (measures viewport)
            const container = this.canvas.parentElement;
            const viewportHeight = container.clientHeight;
            const viewportWidth = container.clientWidth;
            
            console.log(`[CanvasManager] Recalculating - viewport: ${viewportWidth}x${viewportHeight}`);
            
            // Step 2: Calculate and apply agent positions
            this.recalculateAgentPositions();
            
            // Step 3: Calculate and apply task positions
            // Dispatch event synchronously for TaskController to handle
            const taskRecalculationEvent = new CustomEvent('recalculateTaskPositions', {
                detail: { immediate: true }
            });
            window.dispatchEvent(taskRecalculationEvent);
            
            // Step 4: Wait for task positioning to complete, then update canvas height and connection lines
            requestAnimationFrame(() => {
                // Update canvas height based on all positioned elements
                this.updateCanvasHeightImmediate();
                
                // Update all connection lines last
                if (this.connectionLines) {
                    this.connectionLines.updateAllConnections();
                }
                
                this.isRecalculating = false;
                console.log('[CanvasManager] Recalculation complete');
            });
        });
    }
    
    getAgentPosition(agentId) {
        const agent = this.agents.get(agentId);
        return agent ? { x: agent.x, y: agent.y } : null;
    }
    
    updateAgentPosition(agentId, x, y) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.x = x;
            agent.y = y;
            agent.element.style.left = `${x}px`;
            agent.element.style.top = `${y}px`;
            this.draw();
        }
    }
    
    recenterAgent(agentId) {
        // Recalculate position for a specific agent to center it
        const agent = this.agents.get(agentId);
        if (!agent) return;
        
        const center = this.getCenterPosition();
        const element = agent.element;
        
        // Get the actual height of the element
        const elementHeight = element.offsetHeight;
        
        // Offset from center so the node is centered
        const x = center.x - 160; // Node width is 320px
        const y = center.y - (elementHeight / 2);
        
        agent.x = x;
        agent.y = y;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        
        this.draw();
    }
    
    /**
     * Update canvas height based on current content.
     * Call this after tasks are positioned or content changes.
     * Uses debouncing to prevent excessive recalculations.
     */
    updateCanvasHeight() {
        // Clear any pending updates
        if (this.heightUpdateTimeout) {
            clearTimeout(this.heightUpdateTimeout);
        }
        
        // Debounce the update to prevent rapid recalculations
        this.heightUpdateTimeout = setTimeout(() => {
            this.updateCanvasHeightImmediate();
            this.heightUpdateTimeout = null;
        }, 150); // 150ms debounce delay
    }
    
    /**
     * Update canvas height immediately without debounce
     * Used during coordinated recalculations
     */
    updateCanvasHeightImmediate() {
        const container = this.canvas.parentElement;
        const nodesContainer = document.getElementById('agentNodesContainer');
        
        if (!nodesContainer) return;
        
        const viewportHeight = container.clientHeight;
        let maxContentHeight = viewportHeight;
        const children = nodesContainer.children;
        let topMostY = 0;
        let bottomMostY = 0;
        
        console.log(`[CanvasManager] Updating canvas height - ${children.length} elements`);
        
        // Find both the highest and lowest points
        for (const child of children) {
            const computedTop = parseInt(child.style.top) || 0;
            const elementHeight = child.offsetHeight || 0;
            const elementBottom = computedTop + elementHeight;
            
            topMostY = Math.min(topMostY, computedTop);
            bottomMostY = Math.max(bottomMostY, elementBottom);
        }
        
        console.log(`[CanvasManager] Content bounds: top=${topMostY}, bottom=${bottomMostY}, height=${bottomMostY - topMostY}`);
        
        // Calculate total required height including content above viewport
        if (bottomMostY > 0 || topMostY < 0) {
            // Add padding (50px top, 100px bottom)
            const totalContentHeight = (bottomMostY - topMostY) + 150;
            
            // Ensure enough space below content to center agent in viewport
            // Add at least half viewport height below the bottom-most content
            const minHeightForCentering = totalContentHeight + (viewportHeight / 2);
            maxContentHeight = Math.max(viewportHeight, minHeightForCentering);
            
            // If content starts above 0, adjust the canvas and container
            if (topMostY < 0) {
                const offset = Math.abs(topMostY) + 50; // Add 50px padding at top
                
                // Shift all children down by the offset
                for (const child of children) {
                    const currentTop = parseInt(child.style.top) || 0;
                    child.style.top = `${currentTop + offset}px`;
                }
                
                // Update stored agent positions
                for (const [agentId, agent] of this.agents.entries()) {
                    agent.y += offset;
                    agent.element.style.top = `${agent.y}px`;
                }
                
                maxContentHeight += offset;
            }
        }
        
        // Only update if height changed significantly (more than 10px)
        if (Math.abs(this.canvas.height - maxContentHeight) > 10) {
            console.log(`[CanvasManager] Canvas height changed: ${this.canvas.height} → ${maxContentHeight}`);
            this.canvas.height = maxContentHeight;
            if (nodesContainer) {
                nodesContainer.style.height = `${maxContentHeight}px`;
            }
        }
    }
    
    /**
     * Scroll an agent to the vertical center of the viewport
     */
    scrollAgentToCenter(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        
        const container = this.canvas.parentElement;
        const agentElement = agent.element;
        const agentTop = agent.y;
        const agentHeight = agentElement.offsetHeight || 200;
        const viewportHeight = container.clientHeight;
        
        // Calculate scroll position to center the agent
        const agentCenter = agentTop + (agentHeight / 2);
        const targetScrollTop = agentCenter - (viewportHeight / 2);
        
        // Use a slower, more controlled smooth scroll
        // First ensure we're starting from top
        const currentScroll = container.scrollTop;
        const scrollDistance = Math.abs(targetScrollTop - currentScroll);
        
        // Calculate duration based on distance (longer distance = longer duration)
        // Min 1500ms, max 4000ms - slower and more elegant
        const duration = Math.min(4000, Math.max(1500, scrollDistance / 1.5));
        
        const startTime = performance.now();
        const startScroll = currentScroll;
        const scrollChange = targetScrollTop - currentScroll;
        
        // Easing function for smooth deceleration (ease-out-cubic)
        const easeOutCubic = (t) => {
            return 1 - Math.pow(1 - t, 3);
        };
        
        const animateScroll = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutCubic(progress);
            
            const newScroll = startScroll + (scrollChange * easedProgress);
            container.scrollTop = Math.max(0, newScroll);
            
            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            }
        };
        
        requestAnimationFrame(animateScroll);
    }
}
