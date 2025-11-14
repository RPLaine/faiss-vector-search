/**
 * Control Panel Manager - Manages the centralized agent control panel
 * 
 * Responsibilities:
 * - Render and update control panel based on selected agent state
 * - Handle control panel events and delegate to handlers
 * - Enable/disable controls based on agent status
 * - Synchronize UI state with backend agent state
 */

export class ControlPanelManager {
    constructor() {
        // Control panel elements
        this.panel = document.getElementById('agentNodeControls');
        this.actionBtn = document.getElementById('controlPanelAction');
        this.continueBtn = document.getElementById('controlPanelContinue');
        this.editBtn = document.getElementById('controlPanelEdit');
        this.deleteBtn = document.getElementById('controlPanelDelete');
        this.autoCheckbox = document.getElementById('controlPanelAuto');
        this.haltCheckbox = document.getElementById('controlPanelHalt');
        this.haltLabel = document.getElementById('controlPanelHaltLabel');
        this.expandCheckbox = document.getElementById('controlPanelExpand');
        
        // Current selected agent ID
        this.selectedAgentId = null;
        
        // Event handlers (will be set externally)
        this.handlers = {};
    }
    
    /**
     * Set event handlers for control panel actions
     */
    setHandlers(handlers) {
        this.handlers = handlers;
        this._attachEventListeners();
    }
    
    /**
     * Attach event listeners to control panel elements
     */
    _attachEventListeners() {
        // Action button (Start/Stop/Redo)
        if (this.actionBtn && this.handlers.onAction) {
            this.actionBtn.addEventListener('click', () => {
                if (this.selectedAgentId) {
                    this.handlers.onAction(this.selectedAgentId);
                }
            });
        }
        
        // Continue button
        if (this.continueBtn && this.handlers.onContinue) {
            this.continueBtn.addEventListener('click', () => {
                if (this.selectedAgentId) {
                    this.handlers.onContinue(this.selectedAgentId);
                }
            });
        }
        
        // Edit button
        if (this.editBtn && this.handlers.onEdit) {
            this.editBtn.addEventListener('click', () => {
                if (this.selectedAgentId) {
                    this.handlers.onEdit(this.selectedAgentId);
                }
            });
        }
        
        // Delete button
        if (this.deleteBtn && this.handlers.onDelete) {
            this.deleteBtn.addEventListener('click', () => {
                if (this.selectedAgentId) {
                    this.handlers.onDelete(this.selectedAgentId);
                }
            });
        }
        
        // Auto checkbox
        if (this.autoCheckbox && this.handlers.onAutoToggle) {
            this.autoCheckbox.addEventListener('change', (e) => {
                if (this.selectedAgentId) {
                    this.handlers.onAutoToggle(this.selectedAgentId, e.target.checked);
                }
            });
        }
        
        // Halt checkbox
        if (this.haltCheckbox && this.handlers.onHaltToggle) {
            this.haltCheckbox.addEventListener('change', (e) => {
                if (this.selectedAgentId) {
                    this.handlers.onHaltToggle(this.selectedAgentId, e.target.checked);
                }
            });
        }
        
        // Expand checkbox
        if (this.expandCheckbox && this.handlers.onExpandToggle) {
            this.expandCheckbox.addEventListener('change', (e) => {
                if (this.selectedAgentId) {
                    this.handlers.onExpandToggle(this.selectedAgentId, e.target.checked);
                }
            });
        }
    }
    
    /**
     * Update control panel for a selected agent
     */
    updateForAgent(agent) {
        if (!agent) {
            this._clearPanel();
            return;
        }
        
        this.selectedAgentId = agent.id;
        
        // Enable all controls
        this._enableControls();
        
        // Update checkboxes
        if (this.autoCheckbox) {
            this.autoCheckbox.checked = agent.auto || false;
        }
        
        if (this.haltCheckbox) {
            this.haltCheckbox.checked = agent.halt || false;
        }
        
        if (this.expandCheckbox) {
            this.expandCheckbox.checked = agent.expanded || false;
        }
        
        // Update button visibility and state based on agent status
        this._updateForStatus(agent.status, agent);
    }
    
    /**
     * Update control panel based on agent status
     */
    _updateForStatus(status, agent) {
        const hasFailedTasks = agent.hasFailedTasks || false;
        const haltEnabled = agent.halt || false;
        
        if (status === 'running') {
            this._setActionButton('stop', '⏹️', 'Stop');
            this._showButton(this.actionBtn);
            this._hideButton(this.continueBtn);
            this._showControl(this.haltLabel);
        } else if (status === 'halted') {
            // Show "Redo" button only if there are failed tasks
            if (hasFailedTasks) {
                this._setActionButton('redo', '🔄', 'Redo');
                this._showButton(this.actionBtn);
            } else {
                this._hideButton(this.actionBtn);
            }
            
            if (haltEnabled) {
                this._showButton(this.continueBtn);
            } else {
                this._hideButton(this.continueBtn);
            }
            this._hideControl(this.haltLabel);
        } else if (status === 'completed' || status === 'failed') {
            this._setActionButton('redo', '🔄', 'Restart');
            this._showButton(this.actionBtn);
            this._hideButton(this.continueBtn);
            this._showControl(this.haltLabel);
        } else {
            // Default: created or unknown status
            this._setActionButton('start', '▶️', 'Start');
            this._showButton(this.actionBtn);
            this._hideButton(this.continueBtn);
            this._showControl(this.haltLabel);
        }
    }
    
    /**
     * Clear control panel (no agent selected)
     */
    _clearPanel() {
        this.selectedAgentId = null;
        this._disableControls();
        this._setActionButton('start', '▶️', 'Start');
        this._hideButton(this.continueBtn);
        this._showControl(this.haltLabel);
        
        // Clear checkboxes
        if (this.autoCheckbox) this.autoCheckbox.checked = false;
        if (this.haltCheckbox) this.haltCheckbox.checked = false;
        if (this.expandCheckbox) this.expandCheckbox.checked = false;
    }
    
    /**
     * Enable all controls
     */
    _enableControls() {
        if (this.actionBtn) this.actionBtn.disabled = false;
        if (this.continueBtn) this.continueBtn.disabled = false;
        if (this.editBtn) this.editBtn.disabled = false;
        if (this.deleteBtn) this.deleteBtn.disabled = false;
        if (this.autoCheckbox) this.autoCheckbox.disabled = false;
        if (this.haltCheckbox) this.haltCheckbox.disabled = false;
        if (this.expandCheckbox) this.expandCheckbox.disabled = false;
    }
    
    /**
     * Disable all controls
     */
    _disableControls() {
        if (this.actionBtn) this.actionBtn.disabled = true;
        if (this.continueBtn) this.continueBtn.disabled = true;
        if (this.editBtn) this.editBtn.disabled = true;
        if (this.deleteBtn) this.deleteBtn.disabled = true;
        if (this.autoCheckbox) this.autoCheckbox.disabled = true;
        if (this.haltCheckbox) this.haltCheckbox.disabled = true;
        if (this.expandCheckbox) this.expandCheckbox.disabled = true;
    }
    
    /**
     * Set action button state
     */
    _setActionButton(action, icon, text) {
        if (!this.actionBtn) return;
        
        this.actionBtn.dataset.action = action;
        
        const iconSpan = this.actionBtn.querySelector('.btn-icon');
        const textSpan = this.actionBtn.querySelector('.btn-text');
        
        if (iconSpan) iconSpan.textContent = icon;
        if (textSpan) textSpan.textContent = text;
        
        // Update button style
        if (action === 'stop') {
            this.actionBtn.classList.remove('btn-primary');
            this.actionBtn.classList.add('btn-danger');
        } else {
            this.actionBtn.classList.remove('btn-danger');
            this.actionBtn.classList.add('btn-primary');
        }
    }
    
    /**
     * Show button
     */
    _showButton(btn) {
        if (btn) btn.style.display = 'inline-flex';
    }
    
    /**
     * Hide button
     */
    _hideButton(btn) {
        if (btn) btn.style.display = 'none';
    }
    
    /**
     * Show control label
     */
    _showControl(control) {
        if (control) control.style.display = 'flex';
    }
    
    /**
     * Hide control label
     */
    _hideControl(control) {
        if (control) control.style.display = 'none';
    }
    
    /**
     * Update control panel when agent status changes
     * This is called by UIManager when agent status is updated
     */
    updateStatus(agentId, status, agent) {
        // Only update if this is the currently selected agent
        if (this.selectedAgentId !== agentId) {
            return;
        }
        
        this._updateForStatus(status, agent);
    }
    
    /**
     * Refresh control panel with current agent state
     * Called when selection changes
     */
    refresh(agent) {
        this.updateForAgent(agent);
    }
}
