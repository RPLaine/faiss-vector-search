"""
Index Manager module for the FAISS-External LLM RAG system.

This module handles FAISS index creation, management, and file processing operations.
It separates index management concerns from the main query processing logic.
"""

import os
import json
import glob
from pathlib import Path
from typing import Tuple, List, Dict, Any

from .rag_system import RAGSystem


class IndexManager:
    """Manages FAISS index creation and document processing operations."""
    
    def __init__(self, ui_manager, data_dir: str = "files"):
        """Initialize the index manager with UI manager and data directory."""
        self.ui = ui_manager
        self.data_dir = data_dir
        self.files_dir = Path("files")  # Source directory for documents
    
    def validate_and_prepare_data_directory(self) -> bool:
        """Validate data directory and create FAISS index if needed."""
        # Always ensure data directory exists
        os.makedirs(self.data_dir, exist_ok=True)
        
        # Check if index files exist
        index_path = os.path.join(self.data_dir, "faiss.index")
        metadata_path = os.path.join(self.data_dir, "metadata.pkl")
        index_exists = os.path.exists(index_path) and os.path.exists(metadata_path)
        
        if not index_exists:
            # Create fresh index from files directory
            self.ui.display_index_creation_panel()
            return self.create_faiss_index_from_files()
        else:
            # Index already exists, no need to recreate (silent - already shown in check_and_handle_index_regeneration)
            return True
    
    def create_faiss_index_from_files(self) -> bool:
        """Create initial FAISS files using documents from the files directory."""
        try:
            # Ensure data directory exists
            os.makedirs(self.data_dir, exist_ok=True)
            
            # Clear existing index
            self.clear_existing_index()
            
            # Process documents from files directory
            document_contents, document_metadata, processed_files = self.process_documents_from_files()
            
            if not document_contents:
                raise ValueError("No readable text files found in 'files' directory. Please add .txt, .md, or .text files with UTF-8 content.")
            
            # Save processed files info for reference
            self._save_processed_files_info(processed_files, len(document_contents))
            
            # Create FAISS index using temporary RAG system
            self._create_index_with_documents(document_contents, document_metadata)
            
            self.ui.print(f"[bold green]✅ Successfully created FAISS index from {len(document_contents)} files![/bold green]")
            self.ui.print(f"[dim]Processed files: {', '.join(processed_files)}[/dim]")
            
            return True
            
        except Exception as e:
            self.ui.print(f"[bold red]❌ Failed to create FAISS index: {e}[/bold red]")
            raise
    
    def clear_existing_index(self):
        """Clear any existing FAISS files to ensure fresh start."""
        index_file = os.path.join(self.data_dir, "faiss.index")
        metadata_file = os.path.join(self.data_dir, "metadata.pkl")
        
        files_removed = 0
        
        if os.path.exists(index_file):
            os.remove(index_file)
            files_removed += 1
            self.ui.print("[yellow]🗑️ Removed existing faiss.index[/yellow]")
        if os.path.exists(metadata_file):
            os.remove(metadata_file)
            files_removed += 1
            self.ui.print("[yellow]🗑️ Removed existing metadata.pkl[/yellow]")
        
        if files_removed > 0:
            self.ui.print(f"[green]✅ Cleared {files_removed} existing index file(s)[/green]")
        else:
            self.ui.print("[dim]No existing index files to remove[/dim]")
    
    def process_documents_from_files(self) -> Tuple[List[str], List[Dict[str, Any]], List[str]]:
        """
        Process all text files in the files directory.
        
        Returns:
            Tuple of (document_contents, document_metadata, processed_files)
        """
        if not self.files_dir.exists():
            raise FileNotFoundError("Files directory 'files' not found. Please create it and add your documents.")
        
        # Process all text files in the files directory
        text_extensions = ["*.txt", "*.md", "*.text"]
        document_contents = []  # For embedding
        document_metadata = []  # For storage with filenames
        processed_files = []
        
        for pattern in text_extensions:
            for file_path in self.files_dir.glob(pattern):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read().strip()
                        if content:  # Only add non-empty files
                            # Store content for embedding
                            document_contents.append(content)
                            # Store metadata separately
                            document_metadata.append({
                                "content": content,
                                "filename": file_path.name,
                                "file_path": str(file_path),
                                "size": len(content)
                            })
                            processed_files.append(file_path.name)
                except Exception as e:
                    self.ui.print(f"[yellow]⚠️ Warning: Could not read {file_path.name}: {e}[/yellow]")
        
        return document_contents, document_metadata, processed_files
    
    def _save_processed_files_info(self, processed_files: List[str], total_documents: int):
        """Save processed files info for reference."""
        from datetime import datetime
        
        files_info = {
            "processed_files": processed_files,
            "total_documents": total_documents,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        info_path = os.path.join(self.data_dir, "processed_files.json")
        with open(info_path, 'w', encoding='utf-8') as f:
            json.dump(files_info, f, indent=2)
    
    def _create_index_with_documents(self, document_contents: List[str], document_metadata: List[Dict[str, Any]]):
        """Create FAISS index using temporary RAG system."""
        from .services import ConfigurationProvider
        
        # Create temporary config for this data directory
        temp_config_path = ConfigurationProvider.create_temp_config_for_directory(
            self.data_dir, 
            base_config_path="config.json"
        )
        
        try:
            # Create RAG system and add documents (this will save to our data directory)
            temp_rag = RAGSystem(config_path=temp_config_path)
            
            # Add document contents for embedding (strings only)
            temp_rag.add_documents(document_contents, save=True)
            
            # The new refactored RAGSystem saves metadata automatically via IndexService
            # No need to manually update metadata or call _save_index()
            
            # Save detailed metadata separately for our reference
            self._save_detailed_metadata(document_metadata)
            
        finally:
            # Clean up temporary config
            ConfigurationProvider.cleanup_temp_config(temp_config_path)
    
    def _save_detailed_metadata(self, document_metadata: List[Dict[str, Any]]):
        """Save detailed metadata separately from FAISS metadata."""
        detailed_metadata_path = os.path.join(self.data_dir, "detailed_metadata.json")
        with open(detailed_metadata_path, 'w', encoding='utf-8') as f:
            json.dump(document_metadata, f, indent=2)
    
    def check_and_handle_index_regeneration(self) -> bool:
        """Check if FAISS index should be regenerated and handle user choice."""
        index_path = os.path.join(self.data_dir, "faiss.index")
        metadata_path = os.path.join(self.data_dir, "metadata.pkl")
        
        # Check if index files exist
        index_exists = os.path.exists(index_path) and os.path.exists(metadata_path)
        
        if index_exists:
            # Ask user if they want to regenerate
            should_regenerate = self.ui.confirm(
                "[yellow]📁 Existing FAISS index found. Regenerate index from documents?[/yellow]",
                default=False
            )
            
            if should_regenerate:
                self.ui.print("[blue]🔄 Regenerating FAISS index...[/blue]")
                self.clear_existing_index()
                return True  # Needs regeneration
            else:
                self.ui.print("[green]✅ Using existing FAISS index[/green]")
                return False  # No regeneration needed
        else:
            self.ui.print("[blue]🆕 No existing FAISS index found. Creating new index...[/blue]")
            return True  # Needs creation

    def get_index_stats(self) -> Dict[str, Any]:
        """Get statistics about the current index."""
        info_path = os.path.join(self.data_dir, "processed_files.json")
        
        if os.path.exists(info_path):
            with open(info_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return {
            "processed_files": [],
            "total_documents": 0,
            "created_at": "Unknown"
        }