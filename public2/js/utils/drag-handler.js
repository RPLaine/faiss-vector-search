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
        this.rafPending = false; // RAF throttling to match screen refresh rate
        
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
        
        // Update camera position immediately (this is cheap)
        this.canvasManager.camera.x = this.cameraStartX - deltaX;
        this.canvasManager.camera.y = this.cameraStartY - deltaY;
        
        // Throttle DOM updates to screen refresh rate (typically 60fps)
        // This prevents update queue buildup during slow dragging while keeping transitions disabled
        if (!this.rafPending) {
            this.rafPending = true;
            requestAnimationFrame(() => {
                // Update all element positions (synchronous within this frame)
                this.canvasManager.updateAllElementPositions();
                
                // Update connection lines after positions are set
                this.canvasManager.connectionLinesManager.updateAllConnections();
                
                this.rafPending = false;
            });
        }
    }
    
    /**
     * Handle mouse up event to end dragging
     */
    onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            
            // Re-enable transitions after a short delay to ensure smooth settling
            setTimeout(() => {
                this.canvasManager.removeNoTransitionClass();
            }, 50);
            
            // Final update of connections
            this.canvasManager.connectionLinesManager.updateAllConnections();
            
            this.container.style.cursor = '';
        }
    }
}
