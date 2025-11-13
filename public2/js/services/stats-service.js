/**
 * Statistics Service
 * 
 * Manages application statistics display.
 * Encapsulates DOM updates for stats panel.
 */

export class StatsService {
    constructor(agentManager) {
        this.agentManager = agentManager;
        this.elements = {
            active: document.getElementById('activeCount'),
            completed: document.getElementById('completedCount'),
            total: document.getElementById('totalCount')
        };
    }
    
    /**
     * Update all statistics displays
     */
    update() {
        const agents = this.agentManager.getAllAgents();
        
        const stats = this.calculateStats(agents);
        this.render(stats);
    }
    
    /**
     * Calculate statistics from agent list
     */
    calculateStats(agents) {
        return {
            active: agents.filter(a => a.status === 'running').length,
            completed: agents.filter(a => a.status === 'completed').length,
            total: agents.length
        };
    }
    
    /**
     * Render statistics to DOM
     */
    render(stats) {
        if (this.elements.active) {
            this.elements.active.textContent = stats.active;
        }
        if (this.elements.completed) {
            this.elements.completed.textContent = stats.completed;
        }
        if (this.elements.total) {
            this.elements.total.textContent = stats.total;
        }
    }
}
