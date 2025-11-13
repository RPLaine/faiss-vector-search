/**
 * Drag Handler - Manages canvas dragging with mouse
 * 
 * Responsibilities:
 * - Handle mouse drag events for camera panning
 * - Update camera position during drag
 * - Coordinate element position updates
 * - Manage transition states during drag
 */

export class DragHandler {
    constructor(canvas, canvasManager) {
        this.canvas = canvas;
        this.canvasManager = canvasManager;
        this.container = canvas.parentElement;
        
        // Drag state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.cameraStartX = 0;
        this.cameraStartY = 0;
        this.dragUpdateScheduled = false; // RAF debouncing flag
        
        this.setupEventListeners();
    }
    
    /**
     * Setup mouse event listeners for drag functionality
     */
    setupEventListeners() {
        // Mouse down - start drag
        this.container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        
        // Mouse move - update camera if dragging
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        // Mouse up - end drag
        window.addEventListener('mouseup', () => this.onMouseUp());
        
        // Set initial cursor style
        this.container.style.cursor = 'grab';
    }
    
    /**
     * Handle mouse down event to start dragging
     */
    onMouseDown(e) {
        // Only start drag if clicking on canvas background (not on elements)
        if (e.target !== this.canvas && e.target !== this.container) {
            return;
        }
        
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.cameraStartX = this.canvasManager.camera.x;
        this.cameraStartY = this.canvasManager.camera.y;
        
        // Disable transitions for immediate updates
        this.canvasManager.addNoTransitionClass();
        
        // Change cursor
        this.container.style.cursor = 'grabbing';
        
        // Prevent text selection during drag
        e.preventDefault();
    }
    
    /**
     * Handle mouse move event during drag
     */
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        // Calculate drag delta
        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;
        
        // Update camera position (drag right = camera moves left = positive delta, negative camera change)
        this.canvasManager.camera.x = this.cameraStartX - deltaX;
        this.canvasManager.camera.y = this.cameraStartY - deltaY;
        
        // Schedule update on next frame to avoid excessive updates
        if (!this.dragUpdateScheduled) {
            this.dragUpdateScheduled = true;
            requestAnimationFrame(() => {
                // Update all element positions immediately
                this.canvasManager.updateAllElementPositions();
                
                // Update connection lines immediately after positions are set
                // Use setTimeout to ensure task position event has been processed
                setTimeout(() => {
                    this.canvasManager.connectionLinesManager.updateAllConnections();
                    this.dragUpdateScheduled = false;
                }, 0);
            });
        }
    }
    
    /**
     * Handle mouse up event to end dragging
     */
    onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            
            // Re-enable transitions after drag completes
            this.canvasManager.removeNoTransitionClass();
            
            // Final update of connections
            this.canvasManager.connectionLinesManager.updateAllConnections();
            
            this.container.style.cursor = '';
        }
    }
}
