/**
 * Tool Controller - Handles tool call business logic
 * 
 * Coordinates between:
 * - ToolManager (state)
 * - ToolRenderer (UI updates)
 * - CanvasManager (layout updates)
 * - ConnectionLinesManager (tool connection lines)
 */

import { POSITIONING_DELAYS, ANIMATION_DURATIONS, LAYOUT_DIMENSIONS } from '../constants.js';
import { UUIDGenerator } from '../utils/uuid-generator.js';
import { APIService } from '../services/api-service.js';

export class ToolController {
    constructor(toolManager, toolRenderer, canvasManager, taskManager, agentManager) {
        this.toolManager = toolManager;
        this.renderer = toolRenderer;
        this.canvasManager = canvasManager;
        this.taskManager = taskManager; // For task lookups
        this.agentManager = agentManager; // For agent selection state
        
        // Pending tool calls waiting for tasks to be positioned
        this.pendingToolLoads = new Map(); // task_key -> [{agentId, taskId, toolCallData}]
        
        // Event listeners for recalculation
        this._setupEventListeners();
    }
    
    /**
     * Setup event listeners for layout recalculation
     */
    _setupEventListeners() {
        // Listen for tasks being positioned - then load pending tools
        document.addEventListener('tasksPositioned', (e) => {
            const { agentId } = e.detail;
            this._processPendingToolLoads(agentId);
        });
        
        // Listen for tool position recalculation (happens after tasks are repositioned)
        window.addEventListener('recalculateToolPositions', () => {
            this.positionToolsForAllTasks();
        });
        
        // Listen for agent selection visibility events
        document.addEventListener('showToolsForAgent', (e) => {
            const { agentId } = e.detail;
            this.showToolsForAgent(agentId);
        });
        
        document.addEventListener('hideToolsForAgent', (e) => {
            const { agentId } = e.detail;
            this.hideToolsForAgent(agentId);
        });
        
        // Listen for tool call loading from backend state
        document.addEventListener('loadToolCall', (e) => {
            const { agentId, taskId, toolCallData } = e.detail;
            this.loadToolCallsForTask(agentId, taskId, toolCallData);
        });
        
        // Listen for document modal open requests
        document.addEventListener('openDocumentModal', (e) => {
            const { agentId, taskId, toolId, docIndex, filename } = e.detail;
            this.handleOpenDocumentModal(agentId, taskId, toolId, docIndex, filename);
        });
        
        // Listen for document save requests
        document.addEventListener('saveDocument', (e) => {
            const { filename, content } = e.detail;
            this.handleSaveDocument(filename, content);
        });
        
        // Listen for task tool clearing requests
        document.addEventListener('clearTaskTools', (e) => {
            const { agentId, taskId } = e.detail;
            this.clearTaskTools(agentId, taskId);
        });
    }
    
    /**
     * Generate a unique tool ID using UUID
     */
    _generateToolId() {
        return UUIDGenerator.generate();
    }
    
    /**
     * Process pending tool loads for an agent after tasks are positioned
     */
    _processPendingToolLoads(agentId) {
        console.log(`[ToolController] Processing pending tool loads for agent ${agentId}`);
        
        // Find all pending loads for this agent's tasks
        const processedKeys = [];
        
        for (const [taskKey, pendingLoads] of this.pendingToolLoads.entries()) {
            // Check if this task belongs to the agent
            if (pendingLoads.length > 0 && pendingLoads[0].agentId === agentId) {
                // Process all pending loads for this task
                pendingLoads.forEach(({ agentId, taskId, toolCallData }) => {
                    this._loadToolCallImmediate(agentId, taskId, toolCallData);
                });
                processedKeys.push(taskKey);
            }
        }
        
        // Clear processed pending loads
        processedKeys.forEach(key => this.pendingToolLoads.delete(key));
    }
    
    /**
     * Handle tool_call_start event
     */
    async handleToolCallStart(data) {
        const { agent_id, task_id, tool_type, query } = data;
        
        console.log(`[ToolController] Tool call started: Agent ${agent_id}, Task ${task_id}, Type: ${tool_type}`);
        
        // Generate unique tool ID
        const toolId = this._generateToolId();
        const toolKey = this.toolManager.constructor.getToolKey(agent_id, task_id, toolId);
        
        // Create tool data
        const toolData = {
            agentId: agent_id,
            taskId: task_id,
            toolId: toolId,
            type: tool_type,
            status: 'running',
            query: query,
            documents: [],
            threshold_stats: {
                progression: []
            }
        };
        
        // Render tool node
        const toolNode = this.renderer.renderTool(agent_id, task_id, toolId, toolData);
        
        // Calculate position (right of task)
        const taskKey = this.toolManager.constructor.getTaskKey(agent_id, task_id);
        const taskData = this.taskManager.getTask(taskKey);
        
        if (taskData && taskData.globalX !== undefined && taskData.globalY !== undefined) {
            // Position tool to the RIGHT of task
            const taskWidth = taskData.element?.offsetWidth || LAYOUT_DIMENSIONS.TASK_WIDTH;
            const toolX = taskData.globalX + taskWidth + LAYOUT_DIMENSIONS.GAP_TASK_TO_TOOL;
            const toolY = taskData.globalY;
            
            console.log(`[ToolController] Positioning tool ${toolKey} - Task: (${taskData.globalX}, ${taskData.globalY}), Tool: (${toolX}, ${toolY})`);
            
            toolData.element = toolNode;
            toolData.globalX = toolX;
            toolData.globalY = toolY;
            
            // Add to manager
            this.toolManager.addTool(toolKey, toolData);
            
            // Position element using centralized manager
            this.canvasManager.taskPositionManager.updateToolPosition(
                toolKey,
                toolNode,
                toolX,
                toolY,
                { immediate: true, reason: 'tool_created' }
            );
            
            // Show with fade-in
            setTimeout(() => {
                this.renderer.show(toolNode);
            }, 100);
            
            // Draw connection line from task to tool
            // Check if agent is selected to determine if connection should start hidden
            const agentId = agent_id;
            const shouldStartHidden = this.agentManager && !this.agentManager.isAgentSelected(agentId);
            
            setTimeout(() => {
                this.canvasManager.connectionLinesManager.createTaskToToolConnection(taskKey, toolKey, true, shouldStartHidden);
            }, POSITIONING_DELAYS.TASK_CONNECTION_UPDATES[0]);
            
            // Update connection lines during transition (staggered)
            POSITIONING_DELAYS.TASK_CONNECTION_UPDATES.forEach((delay) => {
                setTimeout(() => {
                    this.canvasManager.connectionLinesManager.updateConnectionsForTask(taskKey);
                }, delay);
            });
        } else {
            console.warn(`[ToolController] Cannot position tool ${toolKey} - task position not available`, {
                taskKey,
                taskData,
                hasTaskData: !!taskData,
                hasGlobalX: taskData?.globalX !== undefined,
                hasGlobalY: taskData?.globalY !== undefined
            });
            
            // Still add to manager but without position - will be positioned later by recalculation
            toolData.element = toolNode;
            toolData.globalX = 0;
            toolData.globalY = 0;
            this.toolManager.addTool(toolKey, toolData);
            
            // Show immediately and try to reposition after a delay
            setTimeout(() => {
                this.renderer.show(toolNode);
                this.positionToolsForTask(agent_id, task_id);
            }, 200);
        }
    }
    
    /**
     * Handle tool_threshold_attempt event (real-time progression)
     */
    async handleToolThresholdAttempt(data) {
        const { agent_id, task_id, threshold, hits, target } = data;
        
        // Find the running tool for this task
        const toolKeys = this.toolManager.getTaskTools(agent_id, task_id);
        if (toolKeys.length === 0) return;
        
        // Get the most recent tool (should be running)
        const toolKey = toolKeys[toolKeys.length - 1];
        const toolData = this.toolManager.getTool(toolKey);
        
        if (!toolData || toolData.status !== 'running') return;
        
        // Update threshold progression
        if (!toolData.threshold_stats) {
            toolData.threshold_stats = { progression: [] };
        }
        
        toolData.threshold_stats.progression.push({
            threshold: threshold,
            hits: hits,
            target_reached: hits >= target
        });
        
        toolData.threshold_stats.hit_target = target;
        
        // Update UI
        if (toolData.element) {
            this.renderer.updateThresholdProgression(toolData.element, toolData.threshold_stats);
        }
    }
    
    /**
     * Handle tool_call_complete event
     */
    async handleToolCallComplete(data) {
        const { agent_id, task_id, num_documents, threshold_used, retrieval_time, documents, threshold_stats } = data;
        
        console.log(`[ToolController] Tool call completed: Agent ${agent_id}, Task ${task_id}, Docs: ${num_documents}`);
        
        // Find the running tool for this task
        const toolKeys = this.toolManager.getTaskTools(agent_id, task_id);
        if (toolKeys.length === 0) return;
        
        // Get the most recent tool
        const toolKey = toolKeys[toolKeys.length - 1];
        const toolData = this.toolManager.getTool(toolKey);
        
        if (!toolData) return;
        
        // Update tool data
        toolData.status = 'completed';
        toolData.documents = documents || [];
        toolData.threshold_used = threshold_used;
        toolData.retrieval_time = retrieval_time;
        toolData.threshold_stats = threshold_stats || toolData.threshold_stats;
        
        // Update UI
        if (toolData.element) {
            this.renderer.updateStatus(toolData.element, 'completed');
            this.renderer.updateDocuments(toolData.element, toolData.documents);
            this.renderer.updateStats(toolData.element, {
                threshold_used: threshold_used,
                retrieval_time: retrieval_time,
                attempts: threshold_stats?.attempts
            });
            
            if (threshold_stats) {
                this.renderer.updateThresholdProgression(toolData.element, threshold_stats);
            }
        }
    }
    
    /**
     * Handle tool_call_failed event
     */
    async handleToolCallFailed(data) {
        const { agent_id, task_id, error } = data;
        
        console.warn(`[ToolController] Tool call failed: Agent ${agent_id}, Task ${task_id}, Error: ${error}`);
        
        // Find the running tool for this task
        const toolKeys = this.toolManager.getTaskTools(agent_id, task_id);
        if (toolKeys.length === 0) return;
        
        // Get the most recent tool
        const toolKey = toolKeys[toolKeys.length - 1];
        const toolData = this.toolManager.getTool(toolKey);
        
        if (!toolData) return;
        
        // Update tool data
        toolData.status = 'failed';
        toolData.error = error;
        
        // Update UI
        if (toolData.element) {
            this.renderer.updateStatus(toolData.element, 'failed');
        }
    }
    
    /**
     * Load existing tool calls from agent state (for recovery/refresh)
     * Defers loading until tasks are positioned to ensure correct positioning
     */
    loadToolCallsForTask(agentId, taskId, toolCallData) {
        if (!toolCallData) return;
        
        const taskKey = this.toolManager.constructor.getTaskKey(agentId, taskId);
        const taskData = this.taskManager.getTask(taskKey);
        
        // Check if task is already positioned (not at origin 0,0 which is initial state)
        // Tasks are created at 0,0 then positioned to actual coordinates
        const isPositioned = taskData && 
                            taskData.globalX !== undefined && 
                            taskData.globalY !== undefined &&
                            (taskData.globalX !== 0 || taskData.globalY !== 0);
        
        if (isPositioned) {
            // Task is positioned - load immediately
            this._loadToolCallImmediate(agentId, taskId, toolCallData);
        } else {
            // Task not yet positioned - add to pending queue
            console.log(`[ToolController] Deferring tool load for task ${taskKey} - waiting for task positioning`, {
                hasTaskData: !!taskData,
                globalX: taskData?.globalX,
                globalY: taskData?.globalY
            });
            
            if (!this.pendingToolLoads.has(taskKey)) {
                this.pendingToolLoads.set(taskKey, []);
            }
            this.pendingToolLoads.get(taskKey).push({ agentId, taskId, toolCallData });
        }
    }
    
    /**
     * Load tool call immediately (tasks are already positioned)
     */
    _loadToolCallImmediate(agentId, taskId, toolCallData) {
        if (!toolCallData) return;
        
        const toolId = this._generateToolId();
        const toolKey = this.toolManager.constructor.getToolKey(agentId, taskId, toolId);
        
        // Create tool data from saved state
        const toolData = {
            agentId: agentId,
            taskId: taskId,
            toolId: toolId,
            type: toolCallData.type || 'faiss_retrieval',
            status: 'completed',
            query: toolCallData.query || '',
            documents: toolCallData.documents || [],
            threshold_used: toolCallData.threshold_used,
            retrieval_time: toolCallData.retrieval_time,
            threshold_stats: toolCallData.threshold_stats || {}
        };
        
        // Render tool node (collapsed by default for loaded tools)
        const toolNode = this.renderer.renderTool(agentId, taskId, toolId, toolData);
        
        // Calculate position (right of task)
        const taskKey = this.toolManager.constructor.getTaskKey(agentId, taskId);
        const taskData = this.taskManager.getTask(taskKey);
        
        if (taskData && taskData.globalX !== undefined && taskData.globalY !== undefined) {
            const taskWidth = taskData.element?.offsetWidth || LAYOUT_DIMENSIONS.TASK_WIDTH;
            const toolX = taskData.globalX + taskWidth + LAYOUT_DIMENSIONS.GAP_TASK_TO_TOOL;
            const toolY = taskData.globalY;
            
            console.log(`[ToolController] Loading tool ${toolKey}:`, {
                taskGlobalX: taskData.globalX,
                taskGlobalY: taskData.globalY,
                taskElementWidth: taskData.element?.offsetWidth,
                taskWidthUsed: taskWidth,
                gapTaskToTool: LAYOUT_DIMENSIONS.GAP_TASK_TO_TOOL,
                calculatedToolX: toolX,
                calculatedToolY: toolY
            });
            
            toolData.element = toolNode;
            toolData.globalX = toolX;
            toolData.globalY = toolY;
            
            // Add to manager (positions are stored in memory only, not persisted)
            this.toolManager.addTool(toolKey, toolData);
            
            // Position element using centralized manager
            this.canvasManager.taskPositionManager.updateToolPosition(
                toolKey,
                toolNode,
                toolX,
                toolY,
                { immediate: true, reason: 'tool_loaded' }
            );
            
            // Show immediately (no fade for loaded tools)
            toolNode.classList.remove('tool-hidden');
            
            // Draw connection line from task to tool
            // Check if agent is selected to determine if connection should start hidden
            const shouldStartHidden = this.agentManager && !this.agentManager.isAgentSelected(agentId);
            
            setTimeout(() => {
                this.canvasManager.connectionLinesManager.createTaskToToolConnection(taskKey, toolKey, true, shouldStartHidden);
            }, POSITIONING_DELAYS.TASK_CONNECTION_UPDATES[0]);
            
            // Update connection lines during transition (staggered)
            POSITIONING_DELAYS.TASK_CONNECTION_UPDATES.forEach((delay) => {
                setTimeout(() => {
                    this.canvasManager.connectionLinesManager.updateToolConnectionsForTask(taskKey);
                }, delay);
            });
        } else {
            console.warn(`[ToolController] Cannot load tool ${toolKey} - task position not available. This should not happen with deferred loading.`, {
                taskKey,
                taskData
            });
        }
    }
    
    /**
     * Position tools for a specific task
     */
    positionToolsForTask(agentId, taskId) {
        const taskKey = this.toolManager.constructor.getTaskKey(agentId, taskId);
        const taskData = this.taskManager.getTask(taskKey);
        
        if (!taskData || taskData.globalX === undefined || taskData.globalY === undefined) {
            console.warn(`[ToolController] Cannot position tools for task ${taskKey} - invalid task position`, {
                hasTaskData: !!taskData,
                globalX: taskData?.globalX,
                globalY: taskData?.globalY
            });
            return;
        }
        
        // Calculate tool positions using ToolManager
        const taskWidth = taskData.element?.offsetWidth || LAYOUT_DIMENSIONS.TASK_WIDTH;
        const positions = this.toolManager.calculateToolPositionsForTask(
            taskKey,
            { x: taskData.globalX, y: taskData.globalY },
            taskWidth
        );
        
        // Apply positions using centralized manager
        const updates = positions.map(({ toolKey, x, y }) => {
            const toolData = this.toolManager.getTool(toolKey);
            return {
                toolKey,
                element: toolData.element,
                globalX: x,
                globalY: y
            };
        }).filter(update => update.element);
        
        if (updates.length > 0) {
            this.canvasManager.taskPositionManager.updateMultipleToolPositions(updates, {
                immediate: false,
                reason: 'task_repositioned'
            });
            
            // Update connection lines during transition
            POSITIONING_DELAYS.TASK_CONNECTION_UPDATES.forEach((delay) => {
                setTimeout(() => {
                    this.canvasManager.connectionLinesManager.updateToolConnectionsForTask(taskKey);
                }, delay);
            });
        }
    }
    
    /**
     * Position tools for all tasks (called during recalculation events)
     */
    positionToolsForAllTasks() {
        console.log('[ToolController] Positioning tools for all tasks - START');
        
        let totalToolsUpdated = 0;
        
        // Get all tasks
        for (const [taskKey, taskData] of this.taskManager.taskNodes.entries()) {
            if (!taskData || taskData.globalX === undefined || taskData.globalY === undefined) {
                console.warn(`[ToolController] Skipping tools for task ${taskKey} - invalid position`);
                continue;
            }
            
            // Calculate tool positions
            const taskWidth = taskData.element?.offsetWidth || LAYOUT_DIMENSIONS.TASK_WIDTH;
            const positions = this.toolManager.calculateToolPositionsForTask(
                taskKey,
                { x: taskData.globalX, y: taskData.globalY },
                taskWidth
            );
            
            if (positions.length > 0) {
                console.log(`[ToolController] Task ${taskKey} at (${taskData.globalX}, ${taskData.globalY}) has ${positions.length} tools:`, positions);
            }
            
            // Apply positions
            const updates = positions.map(({ toolKey, x, y }) => {
                const toolData = this.toolManager.getTool(toolKey);
                return {
                    toolKey,
                    element: toolData.element,
                    globalX: x,
                    globalY: y
                };
            }).filter(update => update.element);
            
            if (updates.length > 0) {
                console.log(`[ToolController] Updating ${updates.length} tools for task ${taskKey}`);
                this.canvasManager.taskPositionManager.updateMultipleToolPositions(updates, {
                    immediate: false,
                    reason: 'recalculate_all'
                });
                totalToolsUpdated += updates.length;
            }
        }
        
        console.log(`[ToolController] Positioning tools for all tasks - COMPLETE (${totalToolsUpdated} tools updated)`);
        
        // Update all connection lines during transition
        POSITIONING_DELAYS.TASK_CONNECTION_UPDATES.forEach((delay) => {
            setTimeout(() => {
                this.canvasManager.connectionLinesManager.updateAllConnections();
            }, delay);
        });
    }
    
    /**
     * Show tools for an agent (when agent is selected)
     */
    showToolsForAgent(agentId) {
        const toolKeys = this.toolManager.getAgentTools(agentId);
        if (!toolKeys || toolKeys.length === 0) return;
        
        console.log(`[ToolController] Showing tools for agent ${agentId}`);
        
        toolKeys.forEach((toolKey) => {
            const toolData = this.toolManager.getTool(toolKey);
            if (toolData && toolData.element) {
                toolData.element.classList.remove('tool-hidden');
                toolData.element.classList.add('tool-visible');
            }
        });
    }
    
    /**
     * Hide tools for an agent (when agent is deselected)
     */
    hideToolsForAgent(agentId) {
        const toolKeys = this.toolManager.getAgentTools(agentId);
        if (!toolKeys || toolKeys.length === 0) return;
        
        console.log(`[ToolController] Hiding tools for agent ${agentId}`);
        
        toolKeys.forEach((toolKey) => {
            const toolData = this.toolManager.getTool(toolKey);
            if (toolData && toolData.element) {
                toolData.element.classList.remove('tool-visible');
                toolData.element.classList.add('tool-hidden');
            }
        });
    }
    
    /**
     * Clear all tools for an agent
     */
    clearAgentTools(agentId) {
        console.log(`[ToolController] Clearing tools for agent ${agentId}`);
        
        const toolKeys = this.toolManager.getAgentTools(agentId);
        
        toolKeys.forEach(toolKey => {
            const toolData = this.toolManager.getTool(toolKey);
            if (toolData && toolData.element) {
                this.renderer.remove(toolData.element);
            }
            this.toolManager.removeTool(toolKey);
        });
        
        // Clear pending tool loads for this agent
        const pendingKeys = [];
        for (const [taskKey, pendingLoads] of this.pendingToolLoads.entries()) {
            if (pendingLoads.length > 0 && pendingLoads[0].agentId === agentId) {
                pendingKeys.push(taskKey);
            }
        }
        pendingKeys.forEach(key => this.pendingToolLoads.delete(key));
    }
    
    /**
     * Clear tools for a specific task
     */
    clearTaskTools(agentId, taskId) {
        console.log(`[ToolController] Clearing tools for task ${agentId}-${taskId}`);
        
        const toolKeys = this.toolManager.getTaskTools(agentId, taskId);
        
        // Remove connection lines first
        const taskKey = this.toolManager.constructor.getTaskKey(agentId, taskId);
        if (this.canvasManager && this.canvasManager.connectionLinesManager) {
            this.canvasManager.connectionLinesManager.removeToolConnectionsForTask(taskKey);
        }
        
        // Then remove tool elements and state
        toolKeys.forEach(toolKey => {
            const toolData = this.toolManager.getTool(toolKey);
            if (toolData && toolData.element) {
                this.renderer.remove(toolData.element);
            }
            this.toolManager.removeTool(toolKey);
        });
        
        // Clear pending tool loads for this task
        this.pendingToolLoads.delete(taskKey);
    }
    
    /**
     * Handle document modal open request
     */
    handleOpenDocumentModal(agentId, taskId, toolId, docIndex, filename) {
        console.log(`[ToolController] Opening document modal: ${filename}`);
        
        // Get tool data
        const toolKey = this.toolManager.constructor.getToolKey(agentId, taskId, toolId);
        const toolData = this.toolManager.getTool(toolKey);
        
        if (!toolData || !toolData.documents || !toolData.documents[docIndex]) {
            console.error(`[ToolController] Document not found: ${docIndex}`);
            return;
        }
        
        const document = toolData.documents[docIndex];
        const content = document.content || '';
        
        // Open modal using renderer
        this.renderer.openDocumentModal(filename, content);
    }
    
    /**
     * Handle document save request
     */
    async handleSaveDocument(filename, content) {
        console.log(`[ToolController] Saving document: ${filename}`);
        
        try {
            const result = await APIService.saveDocument(filename, content);
            
            if (result.success) {
                console.log(`[ToolController] Document saved successfully:`, result.data);
                // You could emit a success notification here
                this._showNotification('success', `Document '${filename}' saved and index rebuilt`);
            } else {
                console.error(`[ToolController] Failed to save document:`, result.error);
                this._showNotification('error', `Failed to save document: ${result.error}`);
            }
        } catch (error) {
            console.error(`[ToolController] Error saving document:`, error);
            this._showNotification('error', `Error saving document: ${error.message}`);
        }
    }
    
    /**
     * Show notification (simple implementation - could be enhanced with a notification service)
     */
    _showNotification(type, message) {
        // Create a simple notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }
    
}
