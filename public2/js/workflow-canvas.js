/**
 * Workflow Canvas - Visual representation of journalist phases
 */

export class WorkflowCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nodes = [];
        this.currentPhase = -1;
        
        // Canvas dimensions
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Node styling
        this.nodeRadius = 40;
        this.nodeSpacing = 100;
        this.connectionWidth = 3;
        
        // Colors
        this.colors = {
            pending: '#404040',
            active: '#2563eb',
            completed: '#10b981',
            text: '#e8e8e8',
            textMuted: '#888888',
            connection: '#333333',
            connectionActive: '#2563eb'
        };
        
        // Define workflow phases
        this.phases = [
            { id: 1, label: 'Invent Subject', icon: '💡' },
            { id: 2, label: 'Get Sources', icon: '📚' },
            { id: 3, label: 'Extract Data', icon: '🔍' },
            { id: 4, label: 'Find Names', icon: '👤' },
            { id: 5, label: 'Send Contacts', icon: '📤' },
            { id: 6, label: 'Receive Info', icon: '📥' },
            { id: 7, label: 'Write Article', icon: '✍️' }
        ];
        
        this.initNodes();
    }
    
    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.draw();
    }
    
    initNodes() {
        const totalWidth = (this.phases.length - 1) * this.nodeSpacing;
        const startX = (this.canvas.width - totalWidth) / 2;
        const centerY = this.canvas.height / 2;
        
        this.nodes = this.phases.map((phase, index) => ({
            ...phase,
            x: startX + (index * this.nodeSpacing),
            y: centerY,
            status: 'pending'
        }));
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections
        this.drawConnections();
        
        // Draw nodes
        this.nodes.forEach(node => this.drawNode(node));
    }
    
    drawConnections() {
        for (let i = 0; i < this.nodes.length - 1; i++) {
            const node1 = this.nodes[i];
            const node2 = this.nodes[i + 1];
            
            // Determine connection color
            const isActive = node1.status === 'completed' || 
                           (node1.status === 'active' && i < this.currentPhase);
            const color = isActive ? this.colors.connectionActive : this.colors.connection;
            
            // Draw line
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = this.connectionWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(node1.x + this.nodeRadius, node1.y);
            this.ctx.lineTo(node2.x - this.nodeRadius, node2.y);
            this.ctx.stroke();
            
            // Draw arrow
            this.drawArrow(
                node2.x - this.nodeRadius - 10,
                node2.y,
                color
            );
        }
    }
    
    drawArrow(x, y, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x - 8, y - 5);
        this.ctx.lineTo(x - 8, y + 5);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawNode(node) {
        // Node circle
        let fillColor = this.colors.pending;
        if (node.status === 'active') fillColor = this.colors.active;
        if (node.status === 'completed') fillColor = this.colors.completed;
        
        this.ctx.fillStyle = fillColor;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, this.nodeRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Node border (glow effect for active)
        if (node.status === 'active') {
            this.ctx.strokeStyle = fillColor;
            this.ctx.lineWidth = 3;
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = fillColor;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, this.nodeRadius + 3, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;
        }
        
        // Icon
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = node.status === 'pending' ? this.colors.textMuted : '#ffffff';
        this.ctx.fillText(node.icon, node.x, node.y);
        
        // Label
        this.ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
        this.ctx.fillStyle = this.colors.text;
        this.ctx.fillText(node.label, node.x, node.y + this.nodeRadius + 20);
        
        // Phase number
        this.ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
        this.ctx.fillStyle = this.colors.textMuted;
        this.ctx.fillText(`${node.id}`, node.x, node.y - this.nodeRadius - 15);
    }
    
    setPhase(phaseIndex, status = 'active') {
        if (phaseIndex < 0 || phaseIndex >= this.nodes.length) return;
        
        // Update current phase
        this.currentPhase = phaseIndex;
        
        // Mark previous phases as completed
        for (let i = 0; i < phaseIndex; i++) {
            this.nodes[i].status = 'completed';
        }
        
        // Set current phase status
        this.nodes[phaseIndex].status = status;
        
        // Mark future phases as pending
        for (let i = phaseIndex + 1; i < this.nodes.length; i++) {
            this.nodes[i].status = 'pending';
        }
        
        this.draw();
    }
    
    reset() {
        this.currentPhase = -1;
        this.nodes.forEach(node => node.status = 'pending');
        this.draw();
    }
    
    complete() {
        this.nodes.forEach(node => node.status = 'completed');
        this.currentPhase = this.nodes.length;
        this.draw();
    }
}
