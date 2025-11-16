/**
 * Task Position Manager - Centralized task positioning and transition control
 * 
 * Single Source of Truth for all task node position updates.
 * 
 * Responsibilities:
 * - Coordinate all task position updates through a single code path
 * - Manage transition states before/after position changes
 * - Clear conflicting inline styles that override CSS transitions
 * - Convert between global and screen coordinates
 * - Log all position updates for debugging
 * 
 * Benefits:
 * - Eliminates race conditions between different update mechanisms
 * - Ensures transitions are always properly disabled before position changes
 * - Prevents inline styles from overriding global transition control
 * - Single debugging point for all position-related issues
 */

export class TaskPositionManager {
    constructor(canvasManager, transitionManager) {
        this.canvasManager = canvasManager;
        this.transitionManager = transitionManager;
        
        // Debug mode - set to false in production
        this.debugMode = false;
    }
    
    /**
     * Update task position - SINGLE METHOD for all position updates
     * 
     * @param {string} taskKey - Task identifier
     * @param {HTMLElement} element - Task DOM element
     * @param {number} globalX - Global X coordinate
     * @param {number} globalY - Global Y coordinate
     * @param {Object} options - Update options
     * @param {boolean} options.immediate - Skip transitions (default: false)
     * @param {boolean} options.skipTransitionManager - Don't use TransitionManager (default: false)
     * @param {string} options.reason - Debug reason for update
     */
    updateTaskPosition(taskKey, element, globalX, globalY, options = {}) {
        const {
            immediate = false,
            skipTransitionManager = false,
            reason = 'position_update'
        } = options;
        
        if (this.debugMode) {
            console.log(`[TaskPositionManager] ${reason} - ${taskKey}`, {
                globalX,
                globalY,
                immediate,
                skipTransitionManager
            });
        }
        
        // Step 1: Clear conflicting inline styles that override CSS transitions
        this._clearInlineTransitionStyles(element);
        
        // Step 2: Disable transitions if immediate update requested
        if (immediate && !skipTransitionManager) {
            // Add no-transition class directly (skip TransitionManager for single element)
            element.classList.add('no-transition');
        }
        
        // Step 3: Convert to screen coordinates
        const screenPos = this.canvasManager.globalToScreen(globalX, globalY);
        
        // Step 4: Update DOM position
        element.style.left = `${screenPos.x}px`;
        element.style.top = `${screenPos.y}px`;
        
        // Step 5: Re-enable transitions if needed (after position applied)
        if (immediate && !skipTransitionManager) {
            // Remove no-transition class after a microtask to ensure position applied
            requestAnimationFrame(() => {
                element.classList.remove('no-transition');
            });
        }
    }
    
    /**
     * Update multiple tasks at once (batch operation)
     * 
     * @param {Array} updates - Array of {taskKey, element, globalX, globalY}
     * @param {Object} options - Update options
     */
    updateMultipleTaskPositions(updates, options = {}) {
        const { immediate = false, reason = 'batch_update' } = options;
        
        if (this.debugMode) {
            console.log(`[TaskPositionManager] ${reason} - Updating ${updates.length} tasks`, {
                immediate
            });
        }
        
        // For batch updates, use TransitionManager for better performance
        if (immediate && this.transitionManager) {
            this.transitionManager.disableAllTransitions();
        }
        
        // Update all positions
        updates.forEach(({ taskKey, element, globalX, globalY }) => {
            // Clear conflicting inline styles
            this._clearInlineTransitionStyles(element);
            
            // Convert and apply position
            const screenPos = this.canvasManager.globalToScreen(globalX, globalY);
            element.style.left = `${screenPos.x}px`;
            element.style.top = `${screenPos.y}px`;
        });
        
        // Re-enable transitions after all updates
        if (immediate && this.transitionManager) {
            requestAnimationFrame(() => {
                this.transitionManager.enableAllTransitions();
            });
        }
    }
    
    /**
     * Clear inline transition-related styles that override CSS classes
     * 
     * These inline styles have higher specificity than CSS classes,
     * so they must be removed before applying transition control via classes.
     * 
     * @private
     */
    _clearInlineTransitionStyles(element) {
        // Clear transition delay (set by show/hide animations)
        element.style.transitionDelay = '';
        
        // Clear transition duration (if set)
        element.style.transitionDuration = '';
        
        // Clear transition property (if set)
        element.style.transitionProperty = '';
        
        // Clear transition timing function (if set)
        element.style.transitionTimingFunction = '';
        
        // Don't clear transition itself - that's controlled by CSS classes
    }
    
    /**
     * Enable debug mode for verbose logging
     */
    enableDebugMode() {
        this.debugMode = true;
        console.log('[TaskPositionManager] Debug mode enabled');
    }
    
    /**
     * Disable debug mode
     */
    disableDebugMode() {
        this.debugMode = false;
    }
}
