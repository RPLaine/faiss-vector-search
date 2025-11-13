/**
 * Application Constants
 * 
 * Centralized constants for timing, animations, and layout values.
 * All timing values are in milliseconds.
 */

// ========================================
// Animation & Transition Durations
// ========================================

export const ANIMATION_DURATIONS = {
    // Agent animations
    AGENT_INITIAL_ANIMATION: 800,
    AGENT_TRANSITION: 800,
    AGENT_FADE_OUT: 400,
    
    // Task animations
    TASK_ANIMATION_IN: 200,
    TASK_STAGGER_DELAY: 200,
    TASK_TRANSITION: 400,
    TASK_ANIMATION_OUT: 400,
    
    // Connection line animations
    CONNECTION_STAGGER_DELAY: 100,      // Delay between connection line animations
    CONNECTION_INITIAL_ANIMATION: 800,  // Duration of initial draw animation
    
    // UI animations
    FADE_IN: 300,
    FADE_OUT: 300,
    PULSE: 300,
    
    // Smooth scrolling
    SCROLL_SMOOTH: 800,
    SCROLL_EASING_DELAY: 400
};

// ========================================
// Positioning & Layout Delays
// ========================================

export const POSITIONING_DELAYS = {
    // Agent positioning
    AGENT_POSITION_DELAY: 200,          // Wait for agent positioning to complete (2 RAF + 50ms buffer)
    AGENT_POSITION_UPDATES: [100, 200, 300, 400, 500, 600, 700, 850], // Connection line updates during transition
    
    // Task positioning
    TASK_POSITION_DELAY: 200,           // Wait for task DOM rendering
    TASK_ALIGNMENT_CLEAR: 850,          // Clear alignment flag after animation
    TASK_CONNECTION_UPDATES: [50, 100, 150, 200, 250, 300, 350, 450], // Connection line updates
    
    // Validation UI
    VALIDATION_REPOSITION_DELAY: 400,   // Reposition after validation UI appears
    
    // Canvas height updates
    CANVAS_HEIGHT_DEBOUNCE: 150         // Debounce delay for canvas height recalculation
};

// ========================================
// Scroll & Focus Delays
// ========================================

export const SCROLL_DELAYS = {
    // Scroll to agent after creation
    SCROLL_AFTER_AGENT_CREATE: 200,     // Wait for agent positioning
    
    // Scroll to agent after loading all
    SCROLL_AFTER_LOAD: 800,             // Base delay for agent animations
    SCROLL_TASK_MULTIPLIER: 100,        // Additional delay per task (max tasks * 100ms)
    SCROLL_BUFFER: 300,                 // Extra buffer time
    
    // Expand/collapse recentering
    RECENTER_AFTER_EXPAND: 400          // Wait for expand transition
};

// ========================================
// Layout Dimensions
// ========================================

export const LAYOUT_DIMENSIONS = {
    // Agent dimensions
    AGENT_WIDTH: 320,                   // Default agent node width
    AGENT_ESTIMATED_WIDTH: 400,         // Estimated width for calculations
    
    // Task dimensions
    TASK_WIDTH: 900,                    // Default task node width
    TASK_DEFAULT_HEIGHT: 300,           // Default task height when unknown
    
    // Gaps and spacing
    GAP_AGENT_TO_TASK: 40,             // Horizontal gap between agent and tasks
    GAP_BETWEEN_TASKS: 20,             // Vertical gap between tasks
    GAP_BETWEEN_AGENTS: 50,            // Vertical spacing between agents
    
    // Canvas margins
    CANVAS_MIN_MARGIN: 50,             // Minimum canvas margin
    CANVAS_HEIGHT_THRESHOLD: 10        // Minimum height change to trigger update
};

// ========================================
// WebSocket & Network
// ========================================

export const NETWORK = {
    // WebSocket reconnection
    WS_RECONNECT_INITIAL: 1000,        // Initial reconnect delay
    WS_RECONNECT_MAX: 30000,           // Maximum reconnect delay
    
    // API timeouts
    API_TIMEOUT: 30000                 // API request timeout
};

// ========================================
// UI Interaction
// ========================================

export const UI_TIMINGS = {
    // Highlight & focus
    HIGHLIGHT_DURATION: 2000,          // Task highlight duration
    
    // Tooltip & hover
    TOOLTIP_DELAY: 500,                // Delay before showing tooltip
    
    // Auto-hide messages
    SUCCESS_MESSAGE_DURATION: 3000,    // Success message auto-hide
    ERROR_MESSAGE_DURATION: 5000       // Error message auto-hide
};
