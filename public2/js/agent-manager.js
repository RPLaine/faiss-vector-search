/**
 * Agent Manager - Manages agent state
 */

export class AgentManager {
    constructor() {
        this.agents = new Map();
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
}
