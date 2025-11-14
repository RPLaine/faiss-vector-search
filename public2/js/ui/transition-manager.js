/**
 * Transition Manager - Manages CSS transition states for canvas elements
 * 
 * Responsibilities:
 * - Add/remove no-transition class to agent nodes
 * - Add/remove no-transition class to task nodes
 * - Add/remove no-transition class to SVG connection lines
 * - Set/clear inline transition styles for SVG paths (required for 'd' attribute transitions)
 * 
 * Purpose: Disable transitions during drag/scroll for immediate updates,
 *          re-enable transitions after interaction completes for smooth animations
 * 
 * CRITICAL: SVG path elements require BOTH className changes AND inline style.transition
 *           to properly disable transitions on the 'd' attribute in all browsers.
 *           Other code should NEVER set inline transition styles on SVG paths to avoid conflicts.
 * 
 * Separation: Pure CSS transition state management, no positioning logic
 */

export class TransitionManager {
    constructor() {
        this.agentElements = new Map(); // agentId -> element
        this.taskElements = new Map();  // taskKey -> element
        this.connectionElements = new Map(); // connectionKey -> SVG path element
        this.transitionsEnabled = true; // Track current state
    }
    
    // ========================================
    // Element Registration
    // ========================================
    
    registerAgent(agentId, element) {
        this.agentElements.set(agentId, element);
    }
    
    unregisterAgent(agentId) {
        this.agentElements.delete(agentId);
    }
    
    registerTask(taskKey, element) {
        this.taskElements.set(taskKey, element);
    }
    
    unregisterTask(taskKey) {
        this.taskElements.delete(taskKey);
    }
    
    registerConnection(connectionKey, pathElement) {
        this.connectionElements.set(connectionKey, pathElement);
    }
    
    unregisterConnection(connectionKey) {
        this.connectionElements.delete(connectionKey);
    }
    
    // ========================================
    // Transition Control
    // ========================================
    
    /**
     * Disable all transitions for immediate updates (during drag/scroll)
     */
    disableAllTransitions() {
        this.transitionsEnabled = false;
        
        // Disable agent transitions
        for (const [, element] of this.agentElements.entries()) {
            if (element) {
                element.classList.add('no-transition');
            }
        }
        
        // Disable task transitions
        for (const [, element] of this.taskElements.entries()) {
            if (element) {
                element.classList.add('no-transition');
            }
        }
        
        // Disable connection line transitions (SVG uses className.baseVal + inline style for robustness)
        for (const [, path] of this.connectionElements.entries()) {
            if (path) {
                const currentClass = path.className.baseVal;
                if (!currentClass.includes('no-transition')) {
                    path.className.baseVal = currentClass + ' no-transition';
                }
                // Force disable transitions via inline style for SVG path 'd' attribute
                // (some browsers need explicit inline style to disable 'd' transitions)
                path.style.transition = 'none';
            }
        }
    }
    
    /**
     * Enable all transitions for smooth animations (after drag/scroll)
     */
    enableAllTransitions() {
        this.transitionsEnabled = true;
        
        // Enable agent transitions
        for (const [, element] of this.agentElements.entries()) {
            if (element) {
                element.classList.remove('no-transition');
            }
        }
        
        // Enable task transitions
        for (const [, element] of this.taskElements.entries()) {
            if (element) {
                element.classList.remove('no-transition');
            }
        }
        
        // Enable connection line transitions (SVG uses className.baseVal + clear inline style)
        for (const [, path] of this.connectionElements.entries()) {
            if (path) {
                const currentClass = path.className.baseVal;
                path.className.baseVal = currentClass.replace(/\s*no-transition\s*/g, '').trim();
                // Clear inline style to allow CSS transitions to work
                path.style.transition = '';
            }
        }
    }
    
    /**
     * Clear all registered elements (useful for reset/cleanup)
     */
    clearAll() {
        this.agentElements.clear();
        this.taskElements.clear();
        this.connectionElements.clear();
    }
}
