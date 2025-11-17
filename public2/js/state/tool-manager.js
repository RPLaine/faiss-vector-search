/**
 * Tool Manager - Pure state management for tool calls (FAISS retrieval)
 * 
 * Responsibilities:
 * - Store tool call data
 * - Manage tool-task-agent relationships
 * - Provide tool query methods
 * 
 * NOT responsible for:
 * - DOM manipulation (delegated to ToolRenderer)
 * - HTML generation (delegated to ToolRenderer)
 * - Business logic (delegated to ToolController)
 * - Layout calculations (delegated to utility functions)
 */

import { ToolLayoutCalculator } from '../utils/tool-layout-calculator.js';
import { LAYOUT_DIMENSIONS } from '../constants.js';

export class ToolManager {
    constructor(canvasManager, transitionManager) {
        this.canvasManager = canvasManager;
        this.transitionManager = transitionManager;
        this.toolNodes = new Map(); // tool_key -> {element, agentId, taskId, toolId, globalX, globalY, type, data}
        this.taskTools = new Map(); // task_key -> Set of tool_keys
        this.agentTools = new Map(); // agent_id -> Set of tool_keys
    }
    
    // ========================================
    // State Management Methods
    // ========================================
    
    /**
     * Generate tool key from agent, task, and tool ID
     */
    static getToolKey(agentId, taskId, toolId) {
        return `tool_${agentId}_${taskId}_${toolId}`;
    }
    
    /**
     * Generate task key (for cross-referencing with TaskManager)
     * MUST match TaskController format: agentId-task-taskId
     */
    static getTaskKey(agentId, taskId) {
        return `${agentId}-task-${taskId}`;
    }
    
    /**
     * Add a tool call to the manager
     */
    addTool(toolKey, toolData) {
        this.toolNodes.set(toolKey, toolData);
        
        // Register with transition manager if element exists
        if (toolData.element && this.transitionManager) {
            this.transitionManager.registerTool(toolKey, toolData.element);
        }
        
        // Track task-tool relationship
        const taskKey = ToolManager.getTaskKey(toolData.agentId, toolData.taskId);
        if (!this.taskTools.has(taskKey)) {
            this.taskTools.set(taskKey, new Set());
        }
        this.taskTools.get(taskKey).add(toolKey);
        
        // Track agent-tool relationship
        if (!this.agentTools.has(toolData.agentId)) {
            this.agentTools.set(toolData.agentId, new Set());
        }
        this.agentTools.get(toolData.agentId).add(toolKey);
    }
    
    /**
     * Get a tool by key
     */
    getTool(toolKey) {
        return this.toolNodes.get(toolKey);
    }
    
    /**
     * Remove a tool
     */
    removeTool(toolKey) {
        const toolData = this.toolNodes.get(toolKey);
        if (!toolData) return;
        
        // Unregister from transition manager
        if (this.transitionManager) {
            this.transitionManager.unregisterTool(toolKey);
        }
        
        // Remove from task-tool relationship
        const taskKey = ToolManager.getTaskKey(toolData.agentId, toolData.taskId);
        const taskToolSet = this.taskTools.get(taskKey);
        if (taskToolSet) {
            taskToolSet.delete(toolKey);
            if (taskToolSet.size === 0) {
                this.taskTools.delete(taskKey);
            }
        }
        
        // Remove from agent-tool relationship
        const agentToolSet = this.agentTools.get(toolData.agentId);
        if (agentToolSet) {
            agentToolSet.delete(toolKey);
            if (agentToolSet.size === 0) {
                this.agentTools.delete(toolData.agentId);
            }
        }
        
        this.toolNodes.delete(toolKey);
    }
    
    /**
     * Get tool keys for a task
     */
    getTaskTools(agentId, taskId) {
        const taskKey = ToolManager.getTaskKey(agentId, taskId);
        const toolKeys = this.taskTools.get(taskKey);
        return toolKeys ? Array.from(toolKeys) : [];
    }
    
    /**
     * Get tool keys for an agent
     */
    getAgentTools(agentId) {
        const toolKeys = this.agentTools.get(agentId);
        return toolKeys ? Array.from(toolKeys) : [];
    }
    
    /**
     * Clear tools for a task
     */
    clearTaskTools(agentId, taskId) {
        const taskKey = ToolManager.getTaskKey(agentId, taskId);
        const toolKeys = this.taskTools.get(taskKey);
        
        if (toolKeys) {
            // Remove each tool
            toolKeys.forEach(toolKey => {
                this.removeTool(toolKey);
            });
        }
    }
    
    /**
     * Clear all tools for an agent
     */
    clearAgentTools(agentId) {
        const toolKeys = this.agentTools.get(agentId);
        
        if (toolKeys) {
            // Copy to array to avoid modification during iteration
            Array.from(toolKeys).forEach(toolKey => {
                this.removeTool(toolKey);
            });
        }
    }
    
    /**
     * Update tool data (for threshold progression, status changes, etc.)
     */
    updateToolData(toolKey, updates) {
        const toolData = this.toolNodes.get(toolKey);
        if (toolData) {
            Object.assign(toolData, updates);
        }
    }
    
    // ========================================
    // Query Methods
    // ========================================
    
    /**
     * Check if a task has tool calls
     */
    hasTools(agentId, taskId) {
        const toolKeys = this.getTaskTools(agentId, taskId);
        return toolKeys.length > 0;
    }
    
    /**
     * Get the first tool for a task
     */
    getFirstTool(agentId, taskId) {
        const toolKeys = this.getTaskTools(agentId, taskId);
        if (toolKeys.length === 0) return null;
        
        return this.toolNodes.get(toolKeys[0]);
    }
    
    /**
     * Get tool by type for a task
     */
    getToolByType(agentId, taskId, toolType) {
        const toolKeys = this.getTaskTools(agentId, taskId);
        
        for (const toolKey of toolKeys) {
            const toolData = this.toolNodes.get(toolKey);
            if (toolData && toolData.type === toolType) {
                return toolData;
            }
        }
        
        return null;
    }
    
    /**
     * Get all tools sorted by ID
     */
    getSortedTools() {
        return Array.from(this.toolNodes.values())
            .sort((a, b) => {
                if (a.agentId !== b.agentId) {
                    return a.agentId - b.agentId;
                }
                if (a.taskId !== b.taskId) {
                    return a.taskId - b.taskId;
                }
                return a.toolId - b.toolId;
            });
    }
    
    /**
     * Get sorted tools for an agent
     */
    getSortedToolsForAgent(agentId) {
        const toolKeys = this.getAgentTools(agentId);
        return toolKeys
            .map(key => this.toolNodes.get(key))
            .filter(tool => tool != null)
            .sort((a, b) => {
                if (a.taskId !== b.taskId) {
                    return a.taskId - b.taskId;
                }
                return a.toolId - b.toolId;
            });
    }
    
    /**
     * Get sorted tools for a task
     */
    getSortedToolsForTask(agentId, taskId) {
        const toolKeys = this.getTaskTools(agentId, taskId);
        return toolKeys
            .map(key => this.toolNodes.get(key))
            .filter(tool => tool != null)
            .sort((a, b) => a.toolId - b.toolId);
    }
    
    /**
     * Update tool position
     */
    updateToolPosition(toolKey, x, y) {
        const toolData = this.toolNodes.get(toolKey);
        if (toolData) {
            toolData.globalX = x;
            toolData.globalY = y;
        }
    }
    
    /**
     * Get all tool positions for layout
     */
    getAllToolPositions() {
        const positions = [];
        this.toolNodes.forEach((toolData, toolKey) => {
            if (toolData.globalX !== undefined && toolData.globalY !== undefined) {
                positions.push({
                    toolKey,
                    agentId: toolData.agentId,
                    taskId: toolData.taskId,
                    x: toolData.globalX,
                    y: toolData.globalY
                });
            }
        });
        return positions;
    }
    
    // ========================================
    // Layout Calculation Methods
    // ========================================
    
    /**
     * Calculate tool positions for a task
     * Delegates to ToolLayoutCalculator (pure utility)
     * 
     * @param {string} taskKey - Task identifier
     * @param {Object} taskPos - Task position {x, y}
     * @param {number} taskWidth - Task width in pixels
     * @returns {Array} Array of {toolKey, x, y} positions
     */
    calculateToolPositionsForTask(taskKey, taskPos, taskWidth) {
        // Get all tools for this task
        const toolKeys = Array.from(this.taskTools.get(taskKey) || []);
        
        if (toolKeys.length === 0) return [];
        
        // Calculate positions using pure utility
        const positions = ToolLayoutCalculator.calculateToolPositions({
            toolKeys,
            getToolData: (key) => this.toolNodes.get(key),
            taskPos,
            taskWidth,
            gapBetweenElements: LAYOUT_DIMENSIONS.GAP_BETWEEN_TOOLS,
            horizontalGap: LAYOUT_DIMENSIONS.GAP_TASK_TO_TOOL
        });
        
        // Store calculated positions in tool data
        positions.forEach(({ toolKey, x, y }) => {
            this.updateToolPosition(toolKey, x, y);
        });
        
        return positions;
    }
}
