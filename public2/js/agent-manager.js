/**
 * Agent Manager - Manages agent state
 */

export class AgentManager {
    constructor() {
        this.agents = new Map();
        this.selectedAgentId = null; // Currently selected agent
    }
    
    addAgent(agent) {
        this.agents.set(agent.id, agent);
    }
    
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    
    removeAgent(agentId) {
        this.agents.delete(agentId);
    }
    
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    
    updateAgent(agentId, updates) {
        const agent = this.agents.get(agentId);
        if (agent) {
            Object.assign(agent, updates);
        }
    }
    
    updateAgentStatus(agentId, status) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = status;
        }
    }
    
    updateAgentTasklist(agentId, tasklist) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.tasklist = tasklist;
        }
    }
    
    completeAgent(agentId, article, wordCount, generationTime) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = 'completed';
            agent.article = article;
            agent.word_count = wordCount;
            agent.generation_time = generationTime;
        }
    }
    
    failAgent(agentId, error) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = 'failed';
            agent.error = error;
        }
    }
    
    // ========================================
    // Selection Management
    // ========================================
    
    /**
     * Select an agent (deselects others)
     */
    selectAgent(agentId) {
        this.selectedAgentId = agentId;
    }
    
    /**
     * Get currently selected agent ID
     */
    getSelectedAgentId() {
        return this.selectedAgentId;
    }
    
    /**
     * Check if an agent is selected
     */
    isAgentSelected(agentId) {
        return this.selectedAgentId === agentId;
    }
    
    /**
     * Clear selection
     */
    clearSelection() {
        this.selectedAgentId = null;
    }
}
