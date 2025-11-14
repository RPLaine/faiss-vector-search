/**
 * API Service - Centralized HTTP communication layer
 * 
 * All REST API calls go through this service to ensure:
 * - Consistent error handling
 * - Request/response logging
 * - Single point of API configuration
 */

export class APIService {
    static BASE_URL = '/api';
    
    /**
     * Generic HTTP request handler
     */
    static async _request(method, endpoint, body = null) {
        const url = `${this.BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        try {
            console.log(`[API] ${method} ${endpoint}`, body || '');
            const response = await fetch(url, options);
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`[API] ${method} ${endpoint} failed:`, data);
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
            }
            
            console.log(`[API] ${method} ${endpoint} success:`, data);
            return { success: true, data, status: response.status };
            
        } catch (error) {
            console.error(`[API] ${method} ${endpoint} error:`, error);
            return { success: false, error: error.message, status: 0 };
        }
    }
    
    // Agent CRUD Operations
    
    static async createAgent(name, context, temperature, auto = false) {
        return this._request('POST', '/agents/create', {
            name: name || null,
            context,
            temperature,
            auto
        });
    }
    
    static async updateAgent(agentId, updates) {
        return this._request('PUT', `/agents/${agentId}`, updates);
    }
    
    static async deleteAgent(agentId) {
        return this._request('DELETE', `/agents/${agentId}`);
    }
    
    static async getAgent(agentId) {
        return this._request('GET', `/agents/${agentId}`);
    }
    
    static async listAgents() {
        return this._request('GET', '/agents');
    }
    
    // Agent Lifecycle Operations
    
    static async startAgent(agentId, halt = false) {
        return this._request('POST', `/agents/${agentId}/start`, { halt });
    }
    
    static async stopAgent(agentId) {
        return this._request('POST', `/agents/${agentId}/stop`);
    }
    
    static async continueAgent(agentId) {
        return this._request('POST', `/agents/${agentId}/continue`);
    }
    
    static async continueFromFailedTask(agentId) {
        return this._request('POST', `/agents/${agentId}/continue-from-failed`);
    }
    
    static async redoPhase(agentId, phase) {
        return this._request('POST', `/agents/${agentId}/redo`, { phase });
    }
    
    static async redoFailedTask(agentId) {
        return this._request('POST', `/agents/${agentId}/redo-task`);
    }
    
    // Agent Configuration Operations
    
    static async setAgentAuto(agentId, auto) {
        return this._request('POST', `/agents/${agentId}/auto`, { auto });
    }
    
    static async setAgentHalt(agentId, halt) {
        return this._request('POST', `/agents/${agentId}/halt`, { halt });
    }
    
    static async setAgentExpanded(agentId, expanded) {
        return this._request('POST', `/agents/${agentId}/expand`, { expanded });
    }
    
    static async selectAgent(agentId) {
        return this._request('POST', `/agents/${agentId}/select`);
    }
    
    // Batch Operations
    
    static async clearCompletedAgents() {
        return this._request('POST', '/agents/clear');
    }
}
