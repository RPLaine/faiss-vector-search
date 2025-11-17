/**
 * WebSocket Event Handler
 * 
 * Coordinates WebSocket events between controllers and managers.
 * No direct DOM manipulation - delegates to controllers/managers only.
 */

import { SCROLL_DELAYS, POSITIONING_DELAYS, ANIMATION_DURATIONS } from '../constants.js';

export class WebSocketEventHandler {
    constructor(agentManager, agentController, taskController, uiManager, canvasManager, taskManager, canvasInitializer, agentStatusHandler = null, toolController = null) {
        this.agentManager = agentManager;
        this.agentController = agentController;
        this.taskController = taskController;
        this.toolController = toolController;
        this.uiManager = uiManager;
        this.canvasManager = canvasManager;
        this.taskManager = taskManager;
        this.canvasInitializer = canvasInitializer;
        this.agentStatusHandler = agentStatusHandler;
        this.tasklistStreamStarted = new Set();
    }
    
    /**
     * Register all WebSocket event handlers
     */
    registerHandlers(wsService, statsService) {
        this.wsService = wsService;
        this.statsService = statsService;
        
        // Connection events
        wsService.on('connection_established', (data) => this.handleConnectionEstablished(data));
        
        // Agent lifecycle events
        wsService.on('agent_created', (data) => this.handleAgentCreated(data));
        wsService.on('agent_updated', (data) => this.handleAgentUpdated(data));
        wsService.on('agent_started', (data) => this.handleAgentStarted(data));
        wsService.on('agent_halted', (data) => this.handleAgentHalted(data));
        wsService.on('agent_continued', (data) => this.handleAgentContinued(data));
        wsService.on('agent_redo', (data) => this.handleAgentRedo(data));
        wsService.on('agent_completed', (data) => this.handleAgentCompleted(data));
        wsService.on('agent_failed', (data) => this.handleAgentFailed(data));
        wsService.on('agent_stopped', (data) => this.handleAgentStopped(data));
        wsService.on('agent_deleted', (data) => this.handleAgentDeleted(data));
        
        // Workflow events
        wsService.on('workflow_status', (data) => this.handleWorkflowStatus(data));
        
        // Task events
        wsService.on('task_running', (data) => this.handleTaskRunning(data));
        wsService.on('task_completed', (data) => this.handleTaskCompleted(data));
        wsService.on('task_failed', (data) => this.handleTaskFailed(data));
        wsService.on('task_cancelled', (data) => this.handleTaskCancelled(data));
        wsService.on('task_chunk', (data) => this.handleTaskChunk(data));
        wsService.on('task_validation', (data) => this.handleTaskValidation(data));
        wsService.on('task_reset', (data) => this.handleTaskReset(data));
        
        // Tool call events (FAISS retrieval)
        wsService.on('tool_call_start', (data) => this.handleToolCallStart(data));
        wsService.on('tool_threshold_attempt', (data) => this.handleToolThresholdAttempt(data));
        wsService.on('tool_call_complete', (data) => this.handleToolCallComplete(data));
        wsService.on('tool_call_failed', (data) => this.handleToolCallFailed(data));
        
        // Streaming events
        wsService.on('chunk', (data) => this.handleChunk(data));
        
        // LLM action events
        wsService.on('action', (data) => this.handleAction(data));
        
        // Bulk operations
        wsService.on('agents_cleared', (data) => this.handleAgentsCleared(data));
    }
    
    // Connection handlers
    
    handleConnectionEstablished(data) {
        if (!data.data.agents) {
            this.statsService.update();
            return;
        }
        
        // Delegate to CanvasInitializer for proper initialization
        const selectedAgentId = data.data.selected_agent_id;
        this.canvasInitializer.initializeFromBackend(data.data.agents, selectedAgentId);
    }
    
    // Agent lifecycle handlers
    
    handleAgentCreated(data) {
        console.log('[WebSocket] agent_created:', data);
        const agent = data.data;
        
        // Delegate to CanvasInitializer for proper initialization
        this.canvasInitializer.initializeNewAgent(agent);
    }
    
    /**
     * Handle chunk (streaming text during workflow execution)
     */
    handleChunk(data) {
        const agentId = data.data.agent_id;
        const chunk = data.data.chunk;
        
        // Append chunk to agent content
        this.uiManager.updatePhaseContent(agentId, 0, chunk, true);
    }
    
    /**
     * Handle workflow status update
     */
    handleWorkflowStatus(data) {
        const agentId = data.data.agent_id;
        const workflowStatus = data.data.status;
        const message = data.data.message;
        
        console.log(`[Agent ${agentId}] Workflow: ${workflowStatus}`);
        
        // Update agent status based on workflow status
        if (workflowStatus === 'tasklist_generating') {
            this.agentStatusHandler.updateStatus(agentId, 'running');
            // Clear content when starting tasklist generation
            if (!this.tasklistStreamStarted.has(agentId)) {
                this.uiManager.clearAgentContent(agentId);
                this.tasklistStreamStarted.add(agentId);
            }
        } else if (workflowStatus === 'tasklist_generated') {
            // Create tasks from tasklist
            const tasklist = data.data.tasklist;
            if (tasklist && tasklist.tasks) {
                console.log(`[Agent ${agentId}] Creating ${tasklist.tasks.length} tasks from tasklist`);
                this.taskController.createTasksForAgent(agentId, tasklist);
                
                // If agent is currently selected, show tasks after positioning completes
                if (this.agentManager.isAgentSelected(agentId)) {
                    (async () => {
                        await new Promise(resolve => setTimeout(resolve, POSITIONING_DELAYS.TASK_POSITION_DELAY + 100));
                        await this.taskController.showTasksForAgent(agentId);
                    })();
                }
            }
        } else if (workflowStatus === 'error') {
            this.agentStatusHandler.updateStatus(agentId, 'failed');
        }
        
        // If message provided, display it
        if (message) {
            this.uiManager.updatePhaseContent(agentId, 0, message, false);
        }
    }
    
    handleAgentUpdated(data) {
        console.log('[WebSocket] agent_updated:', data);
        const agent = data.data;
        this.agentManager.updateAgent(agent.id, agent);
        this.uiManager.updateAgentFields(agent);
        this.statsService.update();
    }
    
    handleAgentStarted(data) {
        console.log('[WebSocket] agent_started:', data);
        const agentId = data.data.agent_id;
        
        // Use AgentStatusHandler as single entry point for status updates
        if (this.agentStatusHandler) {
            this.agentStatusHandler.updateStatus(agentId, 'running');
        } else {
            // Fallback to old flow if handler not available
            this.agentManager.updateAgentStatus(agentId, 'running');
            this.uiManager.updateAgentStatus(agentId, 'running');
        }
        
        this.taskController.clearTasksForAgent(agentId);
        
        // Clear tool nodes for restarted agent
        if (this.toolController) {
            this.toolController.clearAgentTools(agentId);
        }
        
        this.statsService.update();
        
        // Update control panels for all agents (disable controls for other agents)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentHalted(data) {
        console.log('[WebSocket] agent_halted:', data);
        const agentId = data.data.agent_id;
        
        // Use AgentStatusHandler as single entry point
        if (this.agentStatusHandler) {
            this.agentStatusHandler.updateStatus(agentId, 'halted');
        } else {
            this.agentManager.updateAgentStatus(agentId, 'halted');
            this.uiManager.updateAgentStatus(agentId, 'halted');
        }
        
        this.statsService.update();
        
        // Update control panels (halted also prevents other agents from starting)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentContinued(data) {
        console.log('[WebSocket] agent_continued:', data);
        const agentId = data.data.agent_id;
        
        // Use AgentStatusHandler as single entry point
        if (this.agentStatusHandler) {
            this.agentStatusHandler.updateStatus(agentId, 'running');
        } else {
            this.agentManager.updateAgentStatus(agentId, 'running');
            this.uiManager.updateAgentStatus(agentId, 'running');
        }
        
        // Scroll to first task if available
        const firstTask = this.taskManager.getFirstTask(agentId);
        if (firstTask) {
            this.taskController.focusTask(agentId, firstTask.taskId);
        }
        
        this.statsService.update();
        
        // Update control panels (agent is running again)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentRedo(data) {
        console.log('[WebSocket] agent_redo:', data);
        const agentId = data.data.agent_id;
        const phase = data.data.phase;
        
        // Use AgentStatusHandler as single entry point
        if (this.agentStatusHandler) {
            this.agentStatusHandler.updateStatus(agentId, 'running');
        } else {
            this.agentManager.updateAgentStatus(agentId, 'running');
            this.uiManager.updateAgentStatus(agentId, 'running');
        }
        
        // Clear tasks if redoing phase 0 (tasklist generation)
        if (phase === 0) {
            this.taskController.clearTasksForAgent(agentId);
        }
        
        this.statsService.update();
        
        // Update control panels (agent is running)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentCompleted(data) {
        console.log('[WebSocket] agent_completed:', data);
        const { agent_id, article, word_count, generation_time } = data.data;
        
        this.agentManager.completeAgent(agent_id, article, word_count, generation_time);
        this.uiManager.completeAgent(agent_id, { article, word_count, generation_time });
        this.statsService.update();
        
        // Update control panels (agent is no longer running, re-enable controls)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentFailed(data) {
        console.log('[WebSocket] agent_failed:', data);
        const { agent_id, error } = data.data;
        
        this.agentManager.failAgent(agent_id, error);
        this.uiManager.showAgentError(agent_id, error);
        this.statsService.update();
        
        // Update control panels (agent is no longer running, re-enable controls)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentStopped(data) {
        console.log('[WebSocket] agent_stopped:', data);
        const agentId = data.data.agent_id;
        
        // Use 'stopped' status from backend (or default to 'stopped' if not provided)
        const status = data.data.status || 'stopped';
        
        // Use AgentStatusHandler as single entry point
        if (this.agentStatusHandler) {
            this.agentStatusHandler.updateStatus(agentId, status);
        } else {
            this.agentManager.updateAgentStatus(agentId, status);
            this.uiManager.updateAgentStatus(agentId, status);
        }
        
        // If there's an error message (from LLM API failure), display it
        if (data.data.error) {
            const agent = this.agentManager.getAgent(agentId);
            if (agent) {
                // Show error in agent content area
                this.uiManager.agentRenderer.updateContent(
                    agentId,
                    `⚠️ **Agent Stopped Due to Error:**\n\n${data.data.error}\n\n*Click Continue to retry.*`,
                    false
                );
            }
        }
        
        this.statsService.update();
        
        // Update control panels (agent is no longer running, re-enable controls)
        if (this.uiManager.controlPanelHandler) {
            this.uiManager.controlPanelHandler.updateAllControlPanels();
        }
    }
    
    handleAgentDeleted(data) {
        console.log('[WebSocket] agent_deleted:', data);
        const agentId = data.data.agent_id;
        
        // Check if the deleted agent was selected
        const wasSelected = this.agentManager.isAgentSelected(agentId);
        
        this.agentManager.removeAgent(agentId);
        this.uiManager.removeAgent(agentId);
        this.taskController.removeTasksForAgent(agentId);
        
        // If the deleted agent was selected, clear selection and hide control panel
        if (wasSelected && this.uiManager.selectionHandler) {
            this.uiManager.selectionHandler.clearSelection();
        }
        
        this.statsService.update();
    }
    
    // Workflow handlers
    
    handleWorkflowPhase(data) {
        console.log('[WebSocket] workflow_phase:', data);
        const { agent_id, phase, status, content, tasklist } = data.data;
        
        this.uiManager.updateWorkflowPhase(agent_id, phase, status);
        
        if (status === 'active') {
            this.uiManager.clearAgentContent(agent_id);
        }
        
        if (status === 'completed' && content) {
            this.uiManager.updatePhaseContent(agent_id, phase, content, false);
            
            if (phase === 0 && tasklist) {
                this.agentManager.updateAgentTasklist(agent_id, tasklist);
                
                // Delegate to CanvasInitializer for proper task initialization
                this.canvasInitializer.initializeAgentTasks(agent_id, tasklist);
            }
        }
    }
    
    // Task handlers
    
    handleTaskRunning(data) {
        console.log('[WebSocket] task_running:', data);
        const { agent_id, task_id, status } = data.data;
        this.taskController.updateTaskStatus(agent_id, task_id, status);
        this.taskController.updateTaskContent(agent_id, task_id, '');
        
        // Auto-select running task with smooth transition
        if (this.uiManager.taskSelectionHandler) {
            const taskKey = `${agent_id}-task-${task_id}`;
            this.uiManager.taskSelectionHandler.selectTaskWithTransition(taskKey, { isAutomatic: true });
        }
    }
    
    handleTaskCompleted(data) {
        console.log('[WebSocket] task_completed:', data);
        const { agent_id, task_id, status, output, validation } = data.data;
        
        // Determine actual task status based on validation
        let actualStatus = status;
        if (validation && !validation.is_valid) {
            actualStatus = 'failed';
        }
        
        this.taskController.updateTaskStatus(agent_id, task_id, actualStatus);
        
        if (output) {
            this.taskController.updateTaskContent(agent_id, task_id, output, false);
        }
        
        // Show validation spinner if no validation data yet
        if (!validation) {
            this.taskController.showValidationLoading(agent_id, task_id);
        } else {
            this.taskController.showValidation(
                agent_id,
                task_id,
                validation.is_valid,
                validation.reason,
                validation.score
            );
        }
        
        // Auto-deselect completed task and select next running task for smooth workflow progression
        // Keep failed tasks selected for user review/debugging
        if (actualStatus === 'completed' && this.uiManager.taskSelectionHandler) {
            const taskKey = `${agent_id}-task-${task_id}`;
            const selectedTaskKey = this.uiManager.taskSelectionHandler.getSelectedTaskKey();
            
            if (selectedTaskKey === taskKey) {
                console.log(`[WebSocket] Auto-deselecting completed task ${taskKey}`);
                this.uiManager.taskSelectionHandler.deselectTask(taskKey);
                
                // Find and auto-select next running task with smooth transition
                const nextRunningTask = this.taskManager.getNextRunningTask(agent_id);
                if (nextRunningTask) {
                    const nextTaskKey = `${agent_id}-task-${nextRunningTask.taskId}`;
                    console.log(`[WebSocket] Auto-selecting next running task: ${nextTaskKey}`);
                    
                    // Use selectTaskWithTransition with delay for smooth transition choreography
                    // Delay allows deselection animation to complete before new selection
                    this.uiManager.taskSelectionHandler.selectTaskWithTransition(nextTaskKey, {
                        isAutomatic: true,
                        delay: 350 // SELECTION_TRANSITION_DELAY from constants
                    });
                }
            }
        }
    }
    
    handleTaskFailed(data) {
        console.log('[WebSocket] task_failed:', data);
        const { agent_id, task_id, error } = data.data;
        this.taskController.updateTaskStatus(agent_id, task_id, 'failed');
        this.taskController.updateTaskContent(agent_id, task_id, `Error: ${error}`, false);
    }
    
    handleTaskCancelled(data) {
        console.log('[WebSocket] task_cancelled:', data);
        const { agent_id, task_id } = data.data;
        this.taskController.updateTaskStatus(agent_id, task_id, 'cancelled');
    }
    
    handleTaskChunk(data) {
        const { agent_id, task_id, chunk } = data.data;
        
        // Ensure task is in running state
        const taskKey = `${agent_id}-task-${task_id}`;
        const taskData = this.taskManager.getTask(taskKey);
        if (taskData) {
            const statusEl = taskData.element.querySelector('.task-node-status');
            if (statusEl && !statusEl.classList.contains('running')) {
                this.taskController.updateTaskStatus(agent_id, task_id, 'running');
            }
        }
        
        this.taskController.updateTaskContent(agent_id, task_id, chunk, true);
    }
    
    handleTaskValidation(data) {
        console.log('[WebSocket] task_validation:', data);
        const { agent_id, task_id, is_valid, reason, score } = data.data;
        
        // Update task status to failed if validation is invalid
        if (!is_valid) {
            this.taskController.updateTaskStatus(agent_id, task_id, 'failed');
        }
        
        this.taskController.showValidation(agent_id, task_id, is_valid, reason, score || 0);
    }
    
    handleTaskReset(data) {
        console.log('[WebSocket] task_reset:', data);
        const { agent_id, task_id } = data.data;
        
        // Reset task to created state
        this.taskController.updateTaskStatus(agent_id, task_id, 'created');
        this.taskController.updateTaskContent(agent_id, task_id, 'Waiting to start...', false);
        
        // Hide validation (will be re-shown when task completes)
        const taskKey = `${agent_id}-task-${task_id}`;
        const taskData = this.taskManager.getTask(taskKey);
        if (taskData) {
            const validationEl = taskData.element.querySelector('.task-node-validation');
            if (validationEl) {
                validationEl.className = 'task-node-validation';
                const resultEl = validationEl.querySelector('.validation-result');
                if (resultEl) {
                    resultEl.textContent = 'Not yet validated';
                }
            }
        }
    }
    
    // Streaming handlers
    
    handlePhaseChunk(data) {
        const { agent_id, phase, chunk } = data.data;
        this.uiManager.updatePhaseContent(agent_id, phase, chunk, true);
    }
    
    handleAgentChunk(data) {
        this.uiManager.appendAgentChunk(data.data.agent_id, data.data.chunk);
    }
    
    // Action handlers
    
    handleAction(data) {
        if (data.action && data.action.startsWith('llm_')) {
            // Delegate to logger service (will be injected later)
            console.log('[WebSocket] LLM action:', data.action);
        }
        
        if (data.action === 'llm_stream_start' && data.agent_id) {
            this.uiManager.startAgentStreaming(data.agent_id);
        }
    }
    
    // Bulk operation handlers
    
    handleAgentsCleared(data) {
        const agents = this.agentManager.getAllAgents();
        const selectedAgentId = this.agentManager.getSelectedAgentId();
        let selectedAgentRemoved = false;
        
        agents.forEach(agent => {
            if (agent.status === 'completed' || agent.status === 'failed') {
                // Track if selected agent is being removed
                if (agent.id === selectedAgentId) {
                    selectedAgentRemoved = true;
                }
                
                // Remove tasks and connections first
                this.taskController.removeTasksForAgent(agent.id);
                
                // Remove tools if tool controller exists
                if (this.toolController) {
                    this.toolController.clearAgentTools(agent.id);
                }
                
                // Then remove agent UI
                this.uiManager.removeAgent(agent.id);
                // Finally remove from data model
                this.agentManager.removeAgent(agent.id);
            }
        });
        
        // If selected agent was removed, clear selection and hide control panel
        if (selectedAgentRemoved && this.uiManager.selectionHandler) {
            this.uiManager.selectionHandler.clearSelection();
        }
        
        this.statsService.update();
    }
    
    // Tool call event handlers
    
    handleToolCallStart(data) {
        if (!this.toolController) {
            console.warn('[WebSocket] Tool controller not available');
            return;
        }
        
        console.log('[WebSocket] tool_call_start:', data);
        this.toolController.handleToolCallStart(data.data);
    }
    
    handleToolThresholdAttempt(data) {
        if (!this.toolController) return;
        
        this.toolController.handleToolThresholdAttempt(data.data);
    }
    
    handleToolCallComplete(data) {
        if (!this.toolController) {
            console.warn('[WebSocket] Tool controller not available');
            return;
        }
        
        console.log('[WebSocket] tool_call_complete:', data);
        this.toolController.handleToolCallComplete(data.data);
    }
    
    handleToolCallFailed(data) {
        if (!this.toolController) {
            console.warn('[WebSocket] Tool controller not available');
            return;
        }
        
        console.log('[WebSocket] tool_call_failed:', data);
        this.toolController.handleToolCallFailed(data.data);
    }
}
