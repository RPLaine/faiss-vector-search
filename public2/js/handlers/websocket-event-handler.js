/**
 * WebSocket Event Handler
 * 
 * Coordinates WebSocket events between controllers and managers.
 * No direct DOM manipulation - delegates to controllers/managers only.
 */

export class WebSocketEventHandler {
    constructor(agentManager, agentController, taskController, uiManager, canvasManager, taskManager) {
        this.agentManager = agentManager;
        this.agentController = agentController;
        this.taskController = taskController;
        this.uiManager = uiManager;
        this.canvasManager = canvasManager;
        this.taskManager = taskManager;
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
        wsService.on('agent_completed', (data) => this.handleAgentCompleted(data));
        wsService.on('agent_failed', (data) => this.handleAgentFailed(data));
        wsService.on('agent_stopped', (data) => this.handleAgentStopped(data));
        wsService.on('agent_deleted', (data) => this.handleAgentDeleted(data));
        
        // Workflow events
        wsService.on('workflow_phase', (data) => this.handleWorkflowPhase(data));
        
        // Task events
        wsService.on('task_running', (data) => this.handleTaskRunning(data));
        wsService.on('task_completed', (data) => this.handleTaskCompleted(data));
        wsService.on('task_failed', (data) => this.handleTaskFailed(data));
        wsService.on('task_cancelled', (data) => this.handleTaskCancelled(data));
        wsService.on('task_chunk', (data) => this.handleTaskChunk(data));
        wsService.on('task_validation', (data) => this.handleTaskValidation(data));
        wsService.on('task_reset', (data) => this.handleTaskReset(data));
        
        // Streaming events
        wsService.on('phase_chunk', (data) => this.handlePhaseChunk(data));
        wsService.on('agent_chunk', (data) => this.handleAgentChunk(data));
        
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
        
        const agentCount = data.data.agents.length;
        let maxTaskCount = 0;
        
        data.data.agents.forEach((agent) => {
            if (!this.agentManager.getAgent(agent.id)) {
                this.agentManager.addAgent(agent);
                this.uiManager.renderAgent(agent);
                
                if (agent.tasklist && agent.tasklist.tasks) {
                    // Delay task creation to allow agent positioning to complete
                    // Agent positioning takes ~100ms (2 RAF + 50ms), add buffer
                    setTimeout(() => {
                        this.taskController.createTasksForAgent(agent.id, agent.tasklist);
                    }, 200);
                    maxTaskCount = Math.max(maxTaskCount, agent.tasklist.tasks.length);
                }
            }
        });
        
        // Scroll to first agent after loading
        if (agentCount > 0) {
            const firstAgent = data.data.agents[0];
            const scrollDelay = 800 + (maxTaskCount * 100) + 300;
            setTimeout(() => {
                this.canvasManager.scrollAgentToCenter(firstAgent.id);
            }, scrollDelay);
        }
        
        this.statsService.update();
    }
    
    // Agent lifecycle handlers
    
    handleAgentCreated(data) {
        console.log('[WebSocket] agent_created:', data);
        const agent = data.data;
        this.agentManager.addAgent(agent);
        this.uiManager.renderAgent(agent);
        this.statsService.update();
        
        // Scroll to center the newly created agent
        // Delay to allow agent positioning to complete
        // Agent positioning takes ~100ms (2 RAF + 50ms), add buffer
        setTimeout(() => {
            this.canvasManager.scrollAgentToCenter(agent.id);
        }, 200);
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
        
        this.agentManager.updateAgentStatus(agentId, 'running');
        this.uiManager.updateAgentStatus(agentId, 'running');
        this.taskController.clearTasksForAgent(agentId);
        this.statsService.update();
    }
    
    handleAgentHalted(data) {
        console.log('[WebSocket] agent_halted:', data);
        const agentId = data.data.agent_id;
        
        this.agentManager.updateAgentStatus(agentId, 'halted');
        this.uiManager.updateAgentStatus(agentId, 'halted');
        this.statsService.update();
    }
    
    handleAgentContinued(data) {
        console.log('[WebSocket] agent_continued:', data);
        const agentId = data.data.agent_id;
        
        this.agentManager.updateAgentStatus(agentId, 'running');
        this.uiManager.updateAgentStatus(agentId, 'running');
        
        // Scroll to first task if available
        const firstTask = this.taskManager.getFirstTask(agentId);
        if (firstTask) {
            this.taskController.focusTask(agentId, firstTask.taskId);
        }
        
        this.statsService.update();
    }
    
    handleAgentCompleted(data) {
        console.log('[WebSocket] agent_completed:', data);
        const { agent_id, article, word_count, generation_time } = data.data;
        
        this.agentManager.completeAgent(agent_id, article, word_count, generation_time);
        this.uiManager.completeAgent(agent_id, { article, word_count, generation_time });
        this.statsService.update();
    }
    
    handleAgentFailed(data) {
        console.log('[WebSocket] agent_failed:', data);
        const { agent_id, error } = data.data;
        
        this.agentManager.failAgent(agent_id, error);
        this.uiManager.showAgentError(agent_id, error);
        this.statsService.update();
    }
    
    handleAgentStopped(data) {
        console.log('[WebSocket] agent_stopped:', data);
        const agentId = data.data.agent_id;
        
        this.agentManager.updateAgentStatus(agentId, 'created');
        this.uiManager.updateAgentStatus(agentId, 'created');
        this.statsService.update();
    }
    
    handleAgentDeleted(data) {
        console.log('[WebSocket] agent_deleted:', data);
        const agentId = data.data.agent_id;
        
        this.agentManager.removeAgent(agentId);
        this.uiManager.removeAgent(agentId);
        this.taskController.removeTasksForAgent(agentId);
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
                this.taskController.createTasksForAgent(agent_id, tasklist);
            }
        }
    }
    
    // Task handlers
    
    handleTaskRunning(data) {
        console.log('[WebSocket] task_running:', data);
        const { agent_id, task_id, status } = data.data;
        this.taskController.updateTaskStatus(agent_id, task_id, status);
        this.taskController.updateTaskContent(agent_id, task_id, '');
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
        agents.forEach(agent => {
            if (agent.status === 'completed' || agent.status === 'failed') {
                this.agentManager.removeAgent(agent.id);
                this.uiManager.removeAgent(agent.id);
                this.taskController.removeTasksForAgent(agent.id);
            }
        });
        this.statsService.update();
    }
}
