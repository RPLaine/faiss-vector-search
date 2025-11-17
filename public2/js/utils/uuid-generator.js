/**
 * UUID Generator - Simple UUID v4 generator for tool IDs
 */

export class UUIDGenerator {
    /**
     * Generate a UUID v4 (random)
     * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
     */
    static generate() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    /**
     * Generate a short UUID (first 8 characters)
     * Useful for display purposes while maintaining uniqueness
     */
    static generateShort() {
        return UUIDGenerator.generate().substring(0, 8);
    }
}
