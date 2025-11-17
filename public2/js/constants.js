/**
 * Application Constants
 * 
 * Centralized constants for timing, animations, and layout values.
 * All timing values are in milliseconds.
 */

// Re-export status constants
export * from './constants/status-constants.js';

// ========================================
// Animation & Transition Durations
// ========================================

export const ANIMATION_DURATIONS = {
    // Agent animations
    AGENT_INITIAL_ANIMATION: 800,
    AGENT_TRANSITION: 800,
    AGENT_FADE_OUT: 400,
    AGENT_REPOSITION: 800,              // Agent position transition (matches CSS --transition-canvas)
    
    // Task animations
    TASK_ANIMATION_IN: 200,
    TASK_STAGGER_DELAY: 200,
    TASK_TRANSITION: 400,
    TASK_ANIMATION_OUT: 400,
    
    // Task visibility animations (selection system)
    TASK_SHOW_STAGGER: 50,              // Stagger between each task when showing (50ms)
    TASK_HIDE_STAGGER: 20,              // Stagger between each task when hiding (20ms, faster)
    TASK_VISIBILITY_DURATION: 400,      // Duration of opacity/transform transition (matches CSS --transition-medium)
    
    // Connection line animations
    CONNECTION_STAGGER_DELAY: 100,      // Delay between connection line animations
    CONNECTION_INITIAL_ANIMATION: 800,  // Duration of initial draw animation
    CONNECTION_SHOW_DELAY: 100,         // Delay before showing connections after tasks
    
    // UI animations
    FADE_IN: 300,
    FADE_OUT: 300,
    PULSE: 300,
    GENERIC_STAGGER: 50,                // Default stagger delay for generic animations
    
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
    AGENT_INITIAL_POSITION_ENABLE: 50,  // Delay before enabling transitions after initial positioning
    
    // Task positioning
    TASK_POSITION_DELAY: 200,           // Wait for task DOM rendering
    TASK_ALIGNMENT_CLEAR: 850,          // Clear alignment flag after animation
    TASK_CONNECTION_UPDATES: [50, 100, 150, 200, 250, 300, 350, 450], // Connection line updates
    
    // Validation UI
    VALIDATION_REPOSITION_DELAY: 400,   // Reposition after validation UI appears
    
    // Agent selection transitions
    // Total time = (max_tasks * TASK_HIDE_STAGGER) + TASK_VISIBILITY_DURATION
    // Assuming max 10 tasks: (10 * 20ms) + 400ms = 600ms
    // We use 350ms as a sweet spot - tasks are mostly faded, feels responsive
    SELECTION_TRANSITION_DELAY: 350,    // Delay between hiding old tasks and moving agents
    
    // Canvas height updates
    CANVAS_HEIGHT_DEBOUNCE: 150,        // Debounce delay for canvas height recalculation
    
    // Resize observer debouncing
    RESIZE_OBSERVER_DEBOUNCE: 50,       // Debounce ResizeObserver callbacks
    
    // Expand/collapse handling
    EXPAND_TRANSITION_REENABLE: 100     // Delay before re-enabling transitions after expand
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
    RECENTER_AFTER_EXPAND: 400,         // Wait for expand transition
    
    // Scroll animation durations (smooth damped feel)
    SCROLL_ANIMATION_MIN: 600,          // Minimum scroll animation duration (smooth)
    SCROLL_ANIMATION_MAX: 1500,         // Maximum scroll animation duration (not too slow)
    SCROLL_DEBOUNCE: 150                // Scroll handler debounce delay
};

// ========================================
// Layout Dimensions
// ========================================

export const LAYOUT_DIMENSIONS = {
    // Agent dimensions
    AGENT_WIDTH: 320,                   // Default agent node width
    AGENT_ESTIMATED_WIDTH: 400,         // Estimated width for calculations
    AGENT_DEFAULT_HEIGHT: 200,          // Default agent height when unknown
    
    // Task dimensions
    TASK_WIDTH: 900,                    // Default task node width
    TASK_DEFAULT_HEIGHT: 300,           // Default task height when unknown
    
    // Gaps and spacing
    GAP_AGENT_TO_TASK: 40,             // Horizontal gap between agent and tasks
    GAP_BETWEEN_TASKS: 20,             // Vertical gap between tasks
    GAP_BETWEEN_AGENTS: 50,            // Vertical spacing between agents
    GAP_TASK_TO_TOOL: 40,              // Horizontal gap between task and tools
    GAP_BETWEEN_TOOLS: 20,             // Vertical gap between tools
    
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
