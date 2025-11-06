"""
RAG Initializer module for the FAISS-External LLM RAG system.

This module handles RAG system initialization, session setup, and configuration
management for different data directories.
"""

import os
from pathlib import Path
from typing import Optional

from .rag_system import RAGSystem
from .services import ConfigurationProvider


class RAGInitializer:
    """Handles RAG system initialization and session management."""
    
    def __init__(self, ui_manager):
        """Initialize the RAG initializer with UI manager."""
        self.ui = ui_manager
    
    def initialize_rag_system(self, data_dir: str = "files") -> RAGSystem:
        """
        Initialize RAG system with proper configuration for the specified data directory.
        
        Args:
            data_dir: Directory containing the FAISS index and metadata files
            
        Returns:
            Initialized RAG system
        """
        self.ui.display_initialization_panel(data_dir)
        
        with self.ui.show_progress("[cyan]Loading RAG system...") as progress:
            init_task = progress.add_task("[cyan]Loading RAG system...", total=None)
            
            # Initialize RAG system based on data directory
            rag_system = self._create_rag_system_for_directory(data_dir)
            
            # Create initial session
            session_dir = self._create_initial_session(rag_system, progress, init_task)
            
            progress.update(init_task, description="[green]✅ RAG system ready")
            
        return rag_system
    
    def _create_rag_system_for_directory(self, data_dir: str) -> RAGSystem:
        """
        Create RAG system instance configured for the specified data directory.
        
        Args:
            data_dir: Target data directory
            
        Returns:
            RAG system instance
        """
        if data_dir != "files":
            # Create temporary config for non-default data directory
            temp_config_path = ConfigurationProvider.create_temp_config_for_directory(
                data_dir, 
                base_config_path="config.json"
            )
            
            try:
                # Initialize RAG system with custom config
                rag_system = RAGSystem(config_path=temp_config_path)
            finally:
                # Clean up temporary config
                ConfigurationProvider.cleanup_temp_config(temp_config_path)
        else:
            # Use default config for files directory
            rag_system = RAGSystem()
        
        return rag_system
    
    def _create_initial_session(self, rag_system: RAGSystem, progress, init_task) -> Optional[Path]:
        """
        Create initial session for the RAG system.
        
        Args:
            rag_system: RAG system instance
            progress: Progress tracker
            init_task: Progress task ID
            
        Returns:
            Session directory path if created, None otherwise
        """
        session_dir = None
        
        if rag_system.get_session_manager():
            session_dir = rag_system.create_new_session()
            if session_dir:
                progress.update(init_task, description=f"[yellow]📁 Session created: {session_dir.name}")
        
        return session_dir
    
    def validate_rag_system_data(self, rag_system: RAGSystem, data_dir: str) -> bool:
        """
        Validate that the RAG system has properly loaded data from the specified directory.
        
        Args:
            rag_system: RAG system to validate
            data_dir: Expected data directory
            
        Returns:
            True if validation passes, False otherwise
        """
        try:
            # Check if index and metadata files exist
            index_path = os.path.join(data_dir, "faiss.index")
            metadata_path = os.path.join(data_dir, "metadata.pkl")
            
            if not os.path.exists(index_path):
                self.ui.print(f"[red]❌ FAISS index not found: {index_path}[/red]")
                return False
            
            if not os.path.exists(metadata_path):
                self.ui.print(f"[red]❌ Metadata not found: {metadata_path}[/red]")
                return False
            
            # Check if RAG system has documents loaded
            stats = rag_system.get_stats()
            if stats.get('total_documents', 0) == 0:
                self.ui.print("[red]❌ No documents loaded in RAG system[/red]")
                return False
            
            return True
            
        except Exception as e:
            self.ui.print(f"[red]❌ RAG system validation failed: {e}[/red]")
            return False
    
    def finalize_session(self, rag_system: RAGSystem, query_count: int) -> Optional[Path]:
        """
        Finalize the current session and save summary.
        
        Args:
            rag_system: RAG system instance
            query_count: Number of queries processed in this session
            
        Returns:
            Path to saved session summary if successful, None otherwise
        """
        if rag_system and rag_system.get_session_manager():
            try:
                summary_file = rag_system.end_session(query_count)
                if summary_file:
                    session_manager = rag_system.get_session_manager()
                    if session_manager:
                        session_dir = session_manager.get_current_session_dir()
                        if session_dir:
                            self.ui.print(f"[green]📁 Session saved to: {session_dir}[/green]")
                            self.ui.print(f"[dim]Processed {query_count} queries in this session.[/dim]")
                            return session_dir
            except Exception as e:
                self.ui.print(f"[yellow]⚠️ Failed to finalize session: {e}[/yellow]")
        
        return None