/**
 * Canvas Manager - Manages the agent canvas and node positioning
 */

export class CanvasManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.agents = new Map(); // agent_id -> {x, y, element}
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        
        // Recalculate agent positions to keep them centered
        this.recalculateAgentPositions();
        
        this.draw();
    }
    
    recalculateAgentPositions() {
        // Recenter all agents based on new canvas dimensions
        const center = this.getCenterPosition();
        
        for (const [agentId, agent] of this.agents.entries()) {
            // Offset from center so the node is centered (node width is 320px)
            const x = center.x - 160;
            const y = center.y - 100;
            
            agent.x = x;
            agent.y = y;
            agent.element.style.left = `${x}px`;
            agent.element.style.top = `${y}px`;
        }
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections between agents if needed in the future
        // For now, just keep canvas as backdrop
    }
    
    getCenterPosition() {
        return {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2
        };
    }
    
    addAgent(agentId, element) {
        // Place at center
        const center = this.getCenterPosition();
        
        // Offset from center so the node is centered (node width is 320px)
        const x = center.x - 160;
        const y = center.y - 100;
        
        this.agents.set(agentId, { x, y, element });
        
        // Position the element
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        
        return { x, y };
    }
    
    removeAgent(agentId) {
        this.agents.delete(agentId);
        this.draw();
    }
    
    getAgentPosition(agentId) {
        const agent = this.agents.get(agentId);
        return agent ? { x: agent.x, y: agent.y } : null;
    }
    
    updateAgentPosition(agentId, x, y) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.x = x;
            agent.y = y;
            agent.element.style.left = `${x}px`;
            agent.element.style.top = `${y}px`;
            this.draw();
        }
    }
    
    recenterAgent(agentId) {
        // Recalculate position for a specific agent to center it
        const agent = this.agents.get(agentId);
        if (!agent) return;
        
        const center = this.getCenterPosition();
        const element = agent.element;
        
        // Get the actual height of the element
        const elementHeight = element.offsetHeight;
        
        // Offset from center so the node is centered
        const x = center.x - 160; // Node width is 320px
        const y = center.y - (elementHeight / 2);
        
        agent.x = x;
        agent.y = y;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        
        this.draw();
    }
}
