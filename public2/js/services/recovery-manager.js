/**
 * Recovery Manager
 * 
 * Handles application recovery after sudden disconnections, crashes, or errors.
 * 
 * Responsibilities:
 * - Detect connection loss and recovery
 * - Restore UI state after reconnection
 * - Handle browser refresh/reload
 * - Detect and recover from stale state
 * - Provide user feedback during recovery
 * 
 * Recovery Flow:
 * 1. Detect disconnection → Show reconnecting UI
 * 2. Attempt reconnection with exponential backoff
 * 3. On reconnection → Fetch current state from backend
 * 4. Reconcile frontend state with backend state
 * 5. Update UI to match backend state
 * 6. Notify user of recovery status
 */

import { NETWORK } from '../constants.js';

export class RecoveryManager {
    constructor(canvasInitializer, agentStatusHandler, taskStatusHandler) {
        this.canvasInitializer = canvasInitializer;
        this.agentStatusHandler = agentStatusHandler;
        this.taskStatusHandler = taskStatusHandler;
        
        this.isRecovering = false;
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 10;
        this.connectionLostTime = null;
        
        this._setupVisibilityChangeHandler();
        this._setupBeforeUnloadHandler();
    }
    
    /**
     * Handle connection loss
     * Called when WebSocket disconnects
     */
    handleConnectionLost() {
        if (this.isRecovering) return;
        
        this.connectionLostTime = Date.now();
        console.warn('[RecoveryManager] Connection lost');
        
        // Show reconnecting UI
        this._showReconnectingUI();
    }
    
    /**
     * Handle connection restored
     * Called when WebSocket reconnects successfully
     * 
     * @param {Array} agents - Current agents from backend
     * @param {string} selectedAgentId - Currently selected agent
     */
    async handleConnectionRestored(agents, selectedAgentId) {
        if (!this.isRecovering && this.connectionLostTime) {
            this.isRecovering = true;
            
            const downtime = Date.now() - this.connectionLostTime;
            console.log(`[RecoveryManager] Connection restored after ${downtime}ms`);
            
            try {
                // Reconcile state with backend
                await this._reconcileState(agents, selectedAgentId);
                
                // Hide reconnecting UI
                this._hideReconnectingUI();
                
                // Show recovery success message
                this._showRecoveryMessage('success', 'Connection restored. State synchronized.');
                
                this.reconnectionAttempts = 0;
                this.connectionLostTime = null;
            } catch (error) {
                console.error('[RecoveryManager] Recovery failed:', error);
                this._showRecoveryMessage('error', 'Failed to restore state. Please refresh the page.');
            } finally {
                this.isRecovering = false;
            }
        }
    }
    
    /**
     * Reconcile frontend state with backend state
     * Identifies differences and updates UI accordingly
     */
    async _reconcileState(backendAgents, selectedAgentId) {
        console.log('[RecoveryManager] Reconciling state with backend');
        
        // Clear current UI and reinitialize from backend
        // This is the safest approach to ensure consistency
        await this.canvasInitializer.clearCanvas();
        await this.canvasInitializer.initializeFromBackend(backendAgents, selectedAgentId);
        
        console.log('[RecoveryManager] State reconciliation complete');
    }
    
    /**
     * Show reconnecting UI overlay
     */
    _showReconnectingUI() {
        // Check if overlay already exists
        let overlay = document.getElementById('reconnecting-overlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'reconnecting-overlay';
            overlay.className = 'reconnecting-overlay';
            overlay.innerHTML = `
                <div class="reconnecting-content">
                    <div class="reconnecting-spinner"></div>
                    <h3>Connection Lost</h3>
                    <p>Attempting to reconnect...</p>
                    <div class="reconnecting-attempts" id="reconnectingAttempts"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        overlay.style.display = 'flex';
    }
    
    /**
     * Hide reconnecting UI overlay
     */
    _hideReconnectingUI() {
        const overlay = document.getElementById('reconnecting-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    /**
     * Update reconnection attempt counter
     */
    updateReconnectionAttempts(attempts) {
        this.reconnectionAttempts = attempts;
        
        const attemptsEl = document.getElementById('reconnectingAttempts');
        if (attemptsEl) {
            attemptsEl.textContent = `Attempt ${attempts} of ${this.maxReconnectionAttempts}`;
            
            if (attempts >= this.maxReconnectionAttempts) {
                attemptsEl.innerHTML = `
                    <p class="reconnect-failed">Unable to reconnect</p>
                    <button onclick="location.reload()" class="btn btn-primary">Refresh Page</button>
                `;
            }
        }
    }
    
    /**
     * Show recovery status message
     */
    _showRecoveryMessage(type, message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `recovery-toast recovery-toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    /**
     * Handle page visibility change
     * Checks for stale connections when page becomes visible
     */
    _setupVisibilityChangeHandler() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Page became visible - check if we need to reconnect
                console.log('[RecoveryManager] Page became visible, checking connection');
                this._checkConnectionHealth();
            }
        });
    }
    
    /**
     * Handle before page unload
     * Clean up resources and warn about running agents
     */
    _setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', (e) => {
            // Check if any agents are running
            const runningAgents = this._getRunningAgents();
            
            if (runningAgents.length > 0) {
                // Show confirmation dialog
                const message = `${runningAgents.length} agent(s) are still running. They will continue in the background.`;
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        });
    }
    
    /**
     * Check connection health
     * Verifies WebSocket is still connected and responsive
     */
    _checkConnectionHealth() {
        // This will be called by the external WebSocket service
        // which can trigger a ping/pong to verify connection
        console.log('[RecoveryManager] Connection health check triggered');
    }
    
    /**
     * Get list of running agents
     */
    _getRunningAgents() {
        // This should query AgentManager through the status handler
        // For now, return empty array (will be implemented when integrated)
        return [];
    }
    
    /**
     * Handle server restart detection
     * Detects when backend has restarted and reloads state
     */
    handleServerRestart() {
        console.warn('[RecoveryManager] Server restart detected');
        
        // Show notification
        this._showRecoveryMessage('info', 'Server restarted. Reloading state...');
        
        // Trigger full state reload
        // This will be handled by the WebSocket connection_established event
    }
    
    /**
     * Detect stale agent state
     * Checks if any agents are stuck in "running" state after reconnection
     */
    detectStaleRunningAgents(agents) {
        const staleAgents = agents.filter(agent => {
            // Backend should have reset running agents to "created" on startup
            // If we see running agents after reconnection, they're stale
            return agent.status === 'running' && this.connectionLostTime;
        });
        
        if (staleAgents.length > 0) {
            console.warn(`[RecoveryManager] Found ${staleAgents.length} stale running agents`);
            // Backend handles this by resetting on load, but we log for awareness
        }
        
        return staleAgents;
    }
}
