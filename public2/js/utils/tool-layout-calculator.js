/**
 * Tool Layout Calculator - Pure layout calculation utility
 * 
 * Responsibilities:
 * - Calculate tool positions for a task
 * - Support vertical stacking of multiple tools
 * - NO DOM manipulation
 * - NO state management
 * - Pure functions only
 * 
 * Mirrors TaskLayoutCalculator pattern for consistency.
 */

export class ToolLayoutCalculator {
    /**
     * Calculate tool positions for a task
     * 
     * @param {Object} params - Layout parameters
     * @param {Array} params.toolKeys - Array of tool keys to position
     * @param {Function} params.getToolData - Function to get tool data by key
     * @param {Object} params.taskPos - Task position {x, y}
     * @param {number} params.taskWidth - Task width in pixels
     * @param {number} params.gapBetweenElements - Gap between tools (default: 20)
     * @param {number} params.horizontalGap - Gap between task and tools (default: 40)
     * @returns {Array} Array of {toolKey, x, y} positions
     */
    static calculateToolPositions({
        toolKeys,
        getToolData,
        taskPos,
        taskWidth,
        gapBetweenElements = 20,
        horizontalGap = 40
    }) {
        if (!toolKeys || toolKeys.length === 0) return [];
        if (!taskPos) return [];
        
        // Starting position for tools (right of task with gap)
        const startX = taskPos.x + taskWidth + horizontalGap;
        
        // Sort tools by ID
        const sortedToolKeys = [...toolKeys].sort((a, b) => {
            const toolA = getToolData(a);
            const toolB = getToolData(b);
            return toolA.toolId - toolB.toolId;
        });
        
        // Calculate heights
        const toolHeights = sortedToolKeys.map(toolKey => {
            const toolData = getToolData(toolKey);
            if (!toolData || !toolData.element) return 0;
            return toolData.element.offsetHeight || 200; // Default tool height
        });
        
        // Align first tool with task top (simpler than task alignment logic)
        let startY = taskPos.y;
        let currentY = startY;
        
        // Build positions array
        const positions = [];
        sortedToolKeys.forEach((toolKey, index) => {
            positions.push({
                toolKey,
                x: startX,
                y: currentY
            });
            currentY += toolHeights[index] + gapBetweenElements;
        });
        
        return positions;
    }
}
