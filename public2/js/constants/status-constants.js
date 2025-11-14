/**
 * Status Constants
 * 
 * Centralized status definitions for agents and tasks.
 * These statuses must match the backend implementation.
 */

// ========================================
// Agent Statuses
// ========================================

/**
 * Agent Status Enum
 * 
 * Lifecycle:
 * created → running → [halted] → running → completed/failed
 *                   ↓
 *                stopped (cancelled mid-execution)
 */
export const AGENT_STATUS = {
    /** Agent has been created but not started */
    CREATED: 'created',
    
    /** Agent is currently executing workflow */
    RUNNING: 'running',
    
    /** Agent has paused between phases (halt flag was set) */
    HALTED: 'halted',
    
    /** Agent was stopped/cancelled during execution (has partial task completion) */
    STOPPED: 'stopped',
    
    /** Agent completed all tasks successfully */
    COMPLETED: 'completed',
    
    /** Agent encountered an error during execution */
    FAILED: 'failed',
    
    /** Agent's tasklist generation failed validation */
    TASKLIST_ERROR: 'tasklist_error'
};

/**
 * Agent status display mapping
 */
export const AGENT_STATUS_DISPLAY = {
    [AGENT_STATUS.CREATED]: 'Created',
    [AGENT_STATUS.RUNNING]: 'Running',
    [AGENT_STATUS.HALTED]: 'Phase Complete',
    [AGENT_STATUS.STOPPED]: 'Stopped',
    [AGENT_STATUS.COMPLETED]: 'Completed',
    [AGENT_STATUS.FAILED]: 'Failed',
    [AGENT_STATUS.TASKLIST_ERROR]: 'Tasklist Error'
};

/**
 * Agent status CSS classes
 */
export const AGENT_STATUS_CLASSES = {
    [AGENT_STATUS.CREATED]: 'created',
    [AGENT_STATUS.RUNNING]: 'active',
    [AGENT_STATUS.HALTED]: 'halted',
    [AGENT_STATUS.STOPPED]: 'stopped',
    [AGENT_STATUS.COMPLETED]: 'completed',
    [AGENT_STATUS.FAILED]: 'failed',
    [AGENT_STATUS.TASKLIST_ERROR]: 'tasklist_error'
};

// ========================================
// Task Statuses
// ========================================

/**
 * Task Status Enum
 * 
 * Lifecycle:
 * created → running → completed/failed/cancelled
 */
export const TASK_STATUS = {
    /** Task has been defined but not started */
    CREATED: 'created',
    
    /** Task is currently being executed */
    RUNNING: 'running',
    
    /** Task completed successfully (validation passed) */
    COMPLETED: 'completed',
    
    /** Task completed but validation failed, or execution error */
    FAILED: 'failed',
    
    /** Task was cancelled before completion */
    CANCELLED: 'cancelled'
};

/**
 * Task status display mapping
 */
export const TASK_STATUS_DISPLAY = {
    [TASK_STATUS.CREATED]: 'Created',
    [TASK_STATUS.RUNNING]: 'Running',
    [TASK_STATUS.COMPLETED]: 'Completed',
    [TASK_STATUS.FAILED]: 'Failed',
    [TASK_STATUS.CANCELLED]: 'Cancelled'
};

/**
 * Task status CSS classes
 */
export const TASK_STATUS_CLASSES = {
    [TASK_STATUS.CREATED]: 'created',
    [TASK_STATUS.RUNNING]: 'running',
    [TASK_STATUS.COMPLETED]: 'completed',
    [TASK_STATUS.FAILED]: 'failed',
    [TASK_STATUS.CANCELLED]: 'cancelled'
};

// ========================================
// Status Validation
// ========================================

/**
 * Valid agent status values
 */
export const VALID_AGENT_STATUSES = Object.values(AGENT_STATUS);

/**
 * Valid task status values
 */
export const VALID_TASK_STATUSES = Object.values(TASK_STATUS);

/**
 * Check if agent status is valid
 */
export function isValidAgentStatus(status) {
    return VALID_AGENT_STATUSES.includes(status);
}

/**
 * Check if task status is valid
 */
export function isValidTaskStatus(status) {
    return VALID_TASK_STATUSES.includes(status);
}

// ========================================
// Status Predicates
// ========================================

/**
 * Agent status predicates
 */
export const AgentStatusPredicates = {
    isCreated: (status) => status === AGENT_STATUS.CREATED,
    isRunning: (status) => status === AGENT_STATUS.RUNNING,
    isHalted: (status) => status === AGENT_STATUS.HALTED,
    isStopped: (status) => status === AGENT_STATUS.STOPPED,
    isCompleted: (status) => status === AGENT_STATUS.COMPLETED,
    isFailed: (status) => status === AGENT_STATUS.FAILED,
    isTasklistError: (status) => status === AGENT_STATUS.TASKLIST_ERROR,
    
    /** Agent can be started */
    canStart: (status) => status === AGENT_STATUS.CREATED || status === AGENT_STATUS.STOPPED || status === AGENT_STATUS.COMPLETED || status === AGENT_STATUS.FAILED,
    
    /** Agent can be stopped */
    canStop: (status) => status === AGENT_STATUS.RUNNING,
    
    /** Agent can be continued (resume execution) */
    canContinue: (status) => status === AGENT_STATUS.HALTED || status === AGENT_STATUS.STOPPED,
    
    /** Agent can be edited */
    canEdit: (status) => status !== AGENT_STATUS.RUNNING,
    
    /** Agent can be deleted */
    canDelete: (status) => true,  // Can always delete
    
    /** Agent is in a terminal state */
    isTerminal: (status) => status === AGENT_STATUS.COMPLETED || status === AGENT_STATUS.FAILED || status === AGENT_STATUS.TASKLIST_ERROR
};

/**
 * Task status predicates
 */
export const TaskStatusPredicates = {
    isCreated: (status) => status === TASK_STATUS.CREATED,
    isRunning: (status) => status === TASK_STATUS.RUNNING,
    isCompleted: (status) => status === TASK_STATUS.COMPLETED,
    isFailed: (status) => status === TASK_STATUS.FAILED,
    isCancelled: (status) => status === TASK_STATUS.CANCELLED,
    
    /** Task is in a terminal state */
    isTerminal: (status) => status === TASK_STATUS.COMPLETED || status === TASK_STATUS.FAILED || status === TASK_STATUS.CANCELLED,
    
    /** Task can be rerun */
    canRerun: (status) => status === TASK_STATUS.FAILED
};
