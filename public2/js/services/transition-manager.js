/**
 * Transition Manager - Manages CSS transition states for canvas elements
 * 
 * Responsibilities:
 * - Add/remove no-transition class to agent nodes
 * - Add/remove no-transition class to task nodes
 * - Add/remove no-transition class to SVG connection lines
 * 
 * Purpose: Disable transitions during drag/scroll for immediate updates,
 *          re-enable transitions after interaction completes for smooth animations
 * 
 * Separation: Pure CSS transition state management, no positioning logic
 */

export class TransitionManager {
    constructor() {
        this.agentElements = new Map(); // agentId -> element
        this.taskElements = new Map();  // taskKey -> element
        this.connectionElements = new Map(); // connectionKey -> SVG path element
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
        
        // Disable connection line transitions (SVG uses className.baseVal)
        for (const [, path] of this.connectionElements.entries()) {
            if (path) {
                const currentClass = path.className.baseVal;
                if (!currentClass.includes('no-transition')) {
                    path.className.baseVal = currentClass + ' no-transition';
                }
            }
        }
    }
    
    /**
     * Enable all transitions for smooth animations (after drag/scroll)
     */
    enableAllTransitions() {
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
        
        // Enable connection line transitions (SVG uses className.baseVal)
        for (const [, path] of this.connectionElements.entries()) {
            if (path) {
                const currentClass = path.className.baseVal;
                path.className.baseVal = currentClass.replace(/\s*no-transition\s*/g, '').trim();
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
