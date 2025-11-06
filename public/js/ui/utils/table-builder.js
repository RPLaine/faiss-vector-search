/**
 * Table Builder Utility
 * Generic table creation for accumulating and static data displays
 */

/**
 * Create a dynamic table with accumulator pattern
 * @param {Object} config - Table configuration
 * @param {string} config.title - Table title
 * @param {Array} config.columns - Column definitions [{key, label, format, className}]
 * @param {string} config.className - CSS class for the table
 * @param {boolean} config.collapsible - Whether the table is collapsible
 * @param {boolean} config.collapsed - Initial collapsed state
 * @returns {Object} Table controller with update methods
 */
export function createAccumulatorTable(config) {
    const {
        title,
        columns,
        className = 'data-table',
        collapsible = true,
        collapsed = false
    } = config;
    
    const container = document.createElement('div');
    container.className = `action-box ${className}-box`;
    
    const header = document.createElement('div');
    header.className = collapsible ? `action-header ${className}-collapsible` : 'action-header';
    header.textContent = title;
    
    const content = document.createElement('div');
    content.className = collapsible ? `action-details ${className}-content${collapsed ? ' collapsed' : ''}` : 'action-details';
    
    if (collapsible) {
        header.onclick = () => content.classList.toggle('collapsed');
    }
    
    // Build table structure
    const table = document.createElement('table');
    table.className = className;
    
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    
    content.appendChild(table);
    container.appendChild(header);
    container.appendChild(content);
    
    // Controller API
    const dataStore = [];
    
    return {
        element: container,
        
        /**
         * Add a row to the table
         */
        addRow(data) {
            dataStore.push(data);
            const row = document.createElement('tr');
            
            columns.forEach(col => {
                const td = document.createElement('td');
                const value = data[col.key];
                
                // Apply formatter if provided
                if (col.format && typeof col.format === 'function') {
                    td.innerHTML = col.format(value, data);
                } else {
                    td.textContent = value;
                }
                
                // Apply CSS class if provided
                if (col.className && typeof col.className === 'function') {
                    td.className = col.className(value, data);
                }
                
                row.appendChild(td);
            });
            
            tbody.appendChild(row);
        },
        
        /**
         * Clear all rows
         */
        clear() {
            dataStore.length = 0;
            tbody.innerHTML = '';
        },
        
        /**
         * Update header title
         */
        setTitle(newTitle) {
            header.textContent = newTitle;
        },
        
        /**
         * Apply header style
         */
        setHeaderStyle(styles) {
            Object.assign(header.style, styles);
        },
        
        /**
         * Mark as complete
         */
        finalize(finalTitle, styles = {}) {
            if (finalTitle) this.setTitle(finalTitle);
            if (styles) this.setHeaderStyle(styles);
            container.classList.add('table-complete');
            // Ensure content remains collapsed
            if (!content.classList.contains('collapsed')) {
                content.classList.add('collapsed');
            }
        },
        
        /**
         * Get all data
         */
        getData() {
            return [...dataStore];
        }
    };
}

/**
 * Create a static table from data
 * @param {Object} config - Table configuration
 * @param {string} config.title - Optional section title
 * @param {Array} config.columns - Column definitions [{key, label, format}]
 * @param {Array} config.data - Array of row data objects
 * @param {string} config.className - CSS class for the table
 * @returns {HTMLElement} Table container element
 */
export function createStaticTable(config) {
    const { title, columns, data, className = 'data-table' } = config;
    
    const container = document.createElement('div');
    container.className = `${className}-section`;
    
    if (title) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'section-title';
        titleDiv.textContent = title;
        container.appendChild(titleDiv);
    }
    
    const table = document.createElement('table');
    table.className = className;
    
    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    data.forEach(item => {
        const row = document.createElement('tr');
        columns.forEach(col => {
            const td = document.createElement('td');
            const value = item[col.key];
            
            if (col.format && typeof col.format === 'function') {
                td.innerHTML = col.format(value, item);
            } else {
                td.textContent = value;
            }
            
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    
    container.appendChild(table);
    return container;
}
