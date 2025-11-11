/**
 * Vector Store Modal Component
 * Handles the UI for managing the vector store (adding documents)
 */

class VectorStoreModal {
    constructor() {
        this.modal = null;
        this.isOpen = false;
    }

    /**
     * Create and show the vector store modal
     */
    show() {
        if (this.isOpen) return;
        
        this.modal = this.createModal();
        document.body.appendChild(this.modal);
        this.isOpen = true;
        
        // Animate in
        requestAnimationFrame(() => {
            this.modal.classList.add('active');
        });
        
        this.attachEventListeners();
    }

    /**
     * Hide and remove the modal
     */
    hide() {
        if (!this.isOpen || !this.modal) return;
        
        this.modal.classList.remove('active');
        
        setTimeout(() => {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            this.modal = null;
            this.isOpen = false;
        }, 200);
    }

    /**
     * Create the modal HTML structure
     */
    createModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'vectorStoreModal';
        
        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h2 class="modal-title">📦 Vector Store Management</h2>
                    <button type="button" class="modal-close" id="closeVectorModal">✕</button>
                </div>
                
                <div class="modal-body">
                    <div class="vector-store-section">
                        <h3 class="section-title">📊 Current Status</h3>
                        <div class="status-grid" id="vectorStoreStatus">
                            <div class="status-item">
                                <span class="status-label">Documents:</span>
                                <span class="status-value" id="docCount">Loading...</span>
                            </div>
                            <div class="status-item">
                                <span class="status-label">Embedding Model:</span>
                                <span class="status-value" id="embeddingModel">Loading...</span>
                            </div>
                            <div class="status-item">
                                <span class="status-label">LLM Model:</span>
                                <span class="status-value" id="llmModel">Loading...</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="vector-store-section">
                        <h3 class="section-title">📂 Unprocessed Files</h3>
                        <div class="unprocessed-info">
                            <p class="info-text">Upload DOCX or text files to the unprocessed directory. These files will be converted and chunked before being added to the vector store.</p>
                        </div>
                        <div class="upload-area" id="unprocessedUploadArea">
                            <input type="file" id="unprocessedFileInput" multiple accept=".docx,.doc,.txt,.md,.text" style="display: none;">
                            <div class="upload-placeholder">
                                <div class="upload-icon">📄</div>
                                <p class="upload-text">Click to select files or drag and drop</p>
                                <p class="upload-hint">Supported formats: .docx, .doc, .txt, .md</p>
                            </div>
                        </div>
                        <div class="unprocessed-list" id="unprocessedFilesList"></div>
                        <div class="button-group">
                            <button type="button" class="btn btn-primary" id="processUnprocessedBtn" disabled>
                                🔄 Process All Unprocessed Files
                            </button>
                        </div>
                    </div>
                    
                    <div class="vector-store-section">
                        <h3 class="section-title">➕ Add Documents Directly</h3>
                        <div class="direct-add-info">
                            <p class="info-text">Add pre-processed text documents directly to the vector store without chunking.</p>
                        </div>
                        <div class="upload-area" id="uploadArea">
                            <input type="file" id="fileInput" multiple accept=".txt,.md,.text" style="display: none;">
                            <div class="upload-placeholder">
                                <div class="upload-icon">📄</div>
                                <p class="upload-text">Click to select files or drag and drop</p>
                                <p class="upload-hint">Supported formats: .txt, .md, .text</p>
                            </div>
                            <div class="file-list" id="fileList"></div>
                        </div>
                        <div class="button-group">
                            <button type="button" class="btn btn-primary" id="addDocumentsBtn" disabled>
                                Add to Vector Store
                            </button>
                        </div>
                    </div>
                    
                    <div class="vector-store-section">
                        <h3 class="section-title">🔄 Maintenance</h3>
                        <div class="maintenance-info">
                            <p class="info-text">Regenerate the vector store from all files in the <code>files/</code> directory. This will clear the existing index and rebuild it.</p>
                        </div>
                        <div class="button-group">
                            <button type="button" class="btn btn-warning" id="regenerateBtn">
                                Regenerate Vector Store
                            </button>
                        </div>
                    </div>
                    
                    <div class="vector-store-section">
                        <div class="progress-container" id="uploadProgress" style="display: none;">
                            <div class="progress-bar">
                                <div class="progress-fill" id="progressFill"></div>
                            </div>
                            <p class="progress-text" id="progressText">Processing documents...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return overlay;
    }

    /**
     * Attach event listeners to modal elements
     */
    attachEventListeners() {
        // Close button
        const closeBtn = document.getElementById('closeVectorModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        
        // Close on overlay click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        }
        
        // Unprocessed files upload area
        const unprocessedFileInput = document.getElementById('unprocessedFileInput');
        const unprocessedUploadArea = document.getElementById('unprocessedUploadArea');
        const processUnprocessedBtn = document.getElementById('processUnprocessedBtn');
        
        if (unprocessedUploadArea && unprocessedFileInput) {
            unprocessedUploadArea.addEventListener('click', (e) => {
                if (e.target === unprocessedUploadArea || unprocessedUploadArea.contains(e.target)) {
                    unprocessedFileInput.click();
                }
            });
            
            // Drag and drop for unprocessed files
            unprocessedUploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                unprocessedUploadArea.classList.add('drag-over');
            });
            
            unprocessedUploadArea.addEventListener('dragleave', () => {
                unprocessedUploadArea.classList.remove('drag-over');
            });
            
            unprocessedUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                unprocessedUploadArea.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) {
                    this.handleUnprocessedFiles(e.dataTransfer.files);
                }
            });
            
            unprocessedFileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleUnprocessedFiles(e.target.files);
                }
            });
        }
        
        if (processUnprocessedBtn) {
            processUnprocessedBtn.addEventListener('click', () => {
                this.processUnprocessedFiles();
            });
        }
        
        // File input and upload area for direct add
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        const addDocumentsBtn = document.getElementById('addDocumentsBtn');
        const regenerateBtn = document.getElementById('regenerateBtn');
        
        if (uploadArea) {
            uploadArea.addEventListener('click', (e) => {
                if (e.target === uploadArea || uploadArea.contains(e.target)) {
                    fileInput.click();
                }
            });
            
            // Drag and drop
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) {
                    this.handleFiles(e.dataTransfer.files);
                }
            });
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFiles(e.target.files);
                }
            });
        }
        
        if (addDocumentsBtn) {
            addDocumentsBtn.addEventListener('click', () => {
                this.uploadDocuments();
            });
        }
        
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => {
                this.regenerateVectorStore();
            });
        }
        
        // Load initial status
        this.loadStatus();
        this.loadUnprocessedFiles();
    }

    /**
     * Handle selected files
     */
    handleFiles(files) {
        const fileList = document.getElementById('fileList');
        const addBtn = document.getElementById('addDocumentsBtn');
        
        if (!fileList) return;
        
        // Clear previous file list
        fileList.innerHTML = '';
        
        // Store files for later upload
        this.selectedFiles = Array.from(files);
        
        // Display file list
        this.selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-name">📄 ${file.name}</span>
                <span class="file-size">${this.formatFileSize(file.size)}</span>
                <button type="button" class="file-remove" data-index="${index}">✕</button>
            `;
            fileList.appendChild(fileItem);
        });
        
        // Enable add button
        if (addBtn) {
            addBtn.disabled = this.selectedFiles.length === 0;
        }
        
        // Add remove handlers
        fileList.querySelectorAll('.file-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                this.removeFile(index);
            });
        });
    }

    /**
     * Remove a file from the selection
     */
    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.handleFiles(this.selectedFiles);
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Load current vector store status
     */
    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            const docCount = document.getElementById('docCount');
            const embeddingModel = document.getElementById('embeddingModel');
            const llmModel = document.getElementById('llmModel');
            
            if (docCount) {
                docCount.textContent = data.total_documents !== undefined 
                    ? data.total_documents.toLocaleString() 
                    : 'Unknown';
            }
            
            if (embeddingModel) {
                embeddingModel.textContent = data.embedding_model || 'Unknown';
            }
            
            if (llmModel) {
                llmModel.textContent = data.llm_model || 'Unknown';
            }
            
        } catch (error) {
            console.error('Failed to load vector store status:', error);
            const docCount = document.getElementById('docCount');
            if (docCount) docCount.textContent = 'Error loading status';
        }
    }

    /**
     * Upload documents to vector store
     */
    async uploadDocuments() {
        if (!this.selectedFiles || this.selectedFiles.length === 0) {
            return;
        }
        
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const addBtn = document.getElementById('addDocumentsBtn');
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (addBtn) addBtn.disabled = true;
        
        try {
            // Read file contents
            const documents = [];
            for (let i = 0; i < this.selectedFiles.length; i++) {
                const file = this.selectedFiles[i];
                if (progressText) progressText.textContent = `Reading ${file.name}...`;
                
                const content = await this.readFileAsText(file);
                documents.push({
                    filename: file.name,
                    content: content
                });
                
                // Update progress
                const progress = ((i + 1) / this.selectedFiles.length) * 50;
                if (progressFill) progressFill.style.width = `${progress}%`;
            }
            
            if (progressText) progressText.textContent = 'Adding documents to vector store...';
            
            // Send to API
            const response = await fetch('/api/documents/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ documents })
            });
            
            if (!response.ok) {
                throw new Error('Failed to add documents');
            }
            
            const result = await response.json();
            
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) progressText.textContent = `Successfully added ${result.documents_added || documents.length} documents!`;
            
            // Reload status
            setTimeout(() => {
                this.loadStatus();
                this.selectedFiles = [];
                const fileList = document.getElementById('fileList');
                if (fileList) fileList.innerHTML = '';
                if (progressContainer) progressContainer.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
                if (addBtn) addBtn.disabled = true;
            }, 2000);
            
        } catch (error) {
            console.error('Upload failed:', error);
            if (progressText) progressText.textContent = `Error: ${error.message}`;
            if (addBtn) addBtn.disabled = false;
        }
    }

    /**
     * Read file as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Read file as base64
     */
    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Extract base64 part from data URL
                const base64 = e.target.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Load list of unprocessed files
     */
    async loadUnprocessedFiles() {
        try {
            const response = await fetch('/api/unprocessed/list');
            const data = await response.json();
            
            const filesList = document.getElementById('unprocessedFilesList');
            const processBtn = document.getElementById('processUnprocessedBtn');
            
            if (!filesList) return;
            
            filesList.innerHTML = '';
            
            if (data.files && data.files.length > 0) {
                data.files.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.innerHTML = `
                        <span class="file-name">📄 ${file.filename}</span>
                        <span class="file-size">${this.formatFileSize(file.size)}</span>
                        <button type="button" class="file-remove" data-filename="${file.filename}">✕</button>
                    `;
                    filesList.appendChild(fileItem);
                });
                
                // Enable process button
                if (processBtn) {
                    processBtn.disabled = false;
                }
                
                // Add remove handlers
                filesList.querySelectorAll('.file-remove').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const filename = e.target.getAttribute('data-filename');
                        this.deleteUnprocessedFile(filename);
                    });
                });
            } else {
                filesList.innerHTML = '<p class="info-text">No unprocessed files. Upload files to get started.</p>';
                if (processBtn) {
                    processBtn.disabled = true;
                }
            }
            
        } catch (error) {
            console.error('Failed to load unprocessed files:', error);
        }
    }

    /**
     * Handle unprocessed files upload
     */
    async handleUnprocessedFiles(files) {
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (progressContainer) progressContainer.style.display = 'block';
        
        try {
            const filesArray = Array.from(files);
            
            for (let i = 0; i < filesArray.length; i++) {
                const file = filesArray[i];
                if (progressText) progressText.textContent = `Uploading ${file.name}...`;
                
                // Read file as base64
                const base64Content = await this.readFileAsBase64(file);
                
                // Upload to server
                const response = await fetch('/api/unprocessed/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filename: file.name,
                        content: base64Content
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to upload ${file.name}`);
                }
                
                // Update progress
                const progress = ((i + 1) / filesArray.length) * 100;
                if (progressFill) progressFill.style.width = `${progress}%`;
            }
            
            if (progressText) progressText.textContent = `Successfully uploaded ${filesArray.length} file(s)!`;
            
            // Reload unprocessed files list
            setTimeout(() => {
                this.loadUnprocessedFiles();
                if (progressContainer) progressContainer.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
            }, 2000);
            
        } catch (error) {
            console.error('Upload failed:', error);
            if (progressText) progressText.textContent = `Error: ${error.message}`;
        }
    }

    /**
     * Delete an unprocessed file
     */
    async deleteUnprocessedFile(filename) {
        if (!confirm(`Delete ${filename}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/unprocessed/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete file');
            }
            
            // Reload list
            this.loadUnprocessedFiles();
            
        } catch (error) {
            console.error('Delete failed:', error);
            alert(`Failed to delete file: ${error.message}`);
        }
    }

    /**
     * Process all unprocessed files
     */
    async processUnprocessedFiles() {
        const processBtn = document.getElementById('processUnprocessedBtn');
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (!confirm('Process all unprocessed files? This will convert DOCX files, chunk them, and rebuild the vector store.')) {
            return;
        }
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (processBtn) processBtn.disabled = true;
        if (progressText) progressText.textContent = 'Processing unprocessed files...';
        if (progressFill) progressFill.style.width = '0%';
        
        try {
            const response = await fetch('/api/unprocessed/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Processing failed');
            }
            
            const result = await response.json();
            
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) {
                progressText.textContent = `Processing complete! ${result.documents_added || 0} documents added to vector store.`;
            }
            
            // Reload status and file lists
            setTimeout(() => {
                this.loadStatus();
                this.loadUnprocessedFiles();
                if (progressContainer) progressContainer.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
                if (processBtn) processBtn.disabled = false;
            }, 3000);
            
        } catch (error) {
            console.error('Processing failed:', error);
            if (progressText) progressText.textContent = `Error: ${error.message}`;
            if (processBtn) processBtn.disabled = false;
        }
    }

    /**
     * Regenerate the vector store from files directory
     */
    async regenerateVectorStore() {
        const regenerateBtn = document.getElementById('regenerateBtn');
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        // Confirm action
        if (!confirm('This will clear the existing vector store and rebuild it from the files/ directory. Continue?')) {
            return;
        }
        
        if (progressContainer) progressContainer.style.display = 'block';
        if (regenerateBtn) regenerateBtn.disabled = true;
        if (progressText) progressText.textContent = 'Regenerating vector store...';
        if (progressFill) progressFill.style.width = '0%';
        
        try {
            const response = await fetch('/api/vector-store/regenerate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to regenerate vector store');
            }
            
            const result = await response.json();
            
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) {
                progressText.textContent = `Successfully regenerated! ${result.documents_processed || 0} documents indexed.`;
            }
            
            // Reload status
            setTimeout(() => {
                this.loadStatus();
                if (progressContainer) progressContainer.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
                if (regenerateBtn) regenerateBtn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('Regeneration failed:', error);
            if (progressText) progressText.textContent = `Error: ${error.message}`;
            if (regenerateBtn) regenerateBtn.disabled = false;
        }
    }
}

// Export singleton instance
export const vectorStoreModal = new VectorStoreModal();
export default vectorStoreModal;
