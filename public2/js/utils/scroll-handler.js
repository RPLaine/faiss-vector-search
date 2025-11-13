/**
 * Scroll Handler - Manages canvas scrolling with mouse wheel
 * 
 * Responsibilities:
 * - Handle mouse wheel events for vertical camera movement
 * - Update camera position immediately
 * - Coordinate element position updates
 * - Manage transition states during scroll
 */

export class ScrollHandler {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.scrollTimeout = null;
        
        this.setupScrollHandler();
    }
    
    /**
     * Setup mouse wheel handler for vertical camera movement
     */
    setupScrollHandler() {
        const container = this.canvasManager.canvas.parentElement;
        
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // Add no-transition class on first scroll
            this.canvasManager.addNoTransitionClass();
            
            // Update camera Y position directly
            this.canvasManager.camera.y += e.deltaY;
            
            // Update all element positions immediately
            this.canvasManager.updateAllElementPositions();
            
            // Update connection lines immediately
            this.canvasManager.connectionLinesManager.updateAllConnections();
            
            // Remove no-transition class after scrolling stops (debounced)
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.canvasManager.removeNoTransitionClass();
            }, 150);
        }, { passive: false });
    }
}
