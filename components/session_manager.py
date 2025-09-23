"""
Session Manager for RAG System

This module handles session folder creation and saving of prompts and results
with timestamped organization for query tracking and analysis.
"""

import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages session folders and file saving for RAG queries."""
    
    def __init__(self, sessions_root: str = "sessions"):
        """
        Initialize session manager.
        
        Args:
            sessions_root: Root directory for all sessions (default: "sessions")
        """
        self.sessions_root = Path(sessions_root)
        self.current_session_dir: Optional[Path] = None
        
    def create_session_folder(self) -> Path:
        """
        Create a new session folder with timestamp.
        
        Returns:
            Path to the created session directory
        """
        # Generate timestamp for session folder
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_dir = self.sessions_root / f"session_{timestamp}"
        
        # Create the directory structure
        session_dir.mkdir(parents=True, exist_ok=True)
        
        # Set as current session
        self.current_session_dir = session_dir
        
        logger.info(f"Created session folder: {session_dir}")
        return session_dir
    
    def get_current_session_dir(self) -> Optional[Path]:
        """
        Get the current session directory.
        
        Returns:
            Path to current session directory or None if no session is active
        """
        return self.current_session_dir
    
    def save_prompt(self, prompt: str, query: str, template_name: str) -> Path:
        """
        Save the prompt to a timestamped file.
        
        Args:
            prompt: The complete formatted prompt sent to LLM (already contains FAISS context)
            query: The original user query
            template_name: The template used for formatting
            
        Returns:
            Path to the saved prompt file
        """
        if not self.current_session_dir:
            self.create_session_folder()
        
        assert self.current_session_dir is not None
        
        # Generate timestamp for this specific query
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
        prompt_file = self.current_session_dir / f"prompt_{timestamp}.txt"
        
        # Create prompt content with metadata
        prompt_content = f"""QUERY METADATA
================
Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Template: {template_name}
Original Query: {query}

FORMATTED PROMPT (WITH FAISS CONTEXT)
=====================================
{prompt}
"""
        
        # Save to file
        with open(prompt_file, 'w', encoding='utf-8') as f:
            f.write(prompt_content)
        
        logger.info(f"Saved prompt to: {prompt_file}")
        return prompt_file
    
    def save_result(self, result: str, query: str, processing_time: float, 
                   num_docs_found: int, template_name: str) -> Path:
        """
        Save the LLM result to a timestamped file.
        
        Args:
            result: The LLM response
            query: The original user query
            processing_time: Time taken to process the query
            num_docs_found: Number of documents retrieved
            template_name: The template used
            
        Returns:
            Path to the saved result file
        """
        if not self.current_session_dir:
            self.create_session_folder()
        
        assert self.current_session_dir is not None
        
        # Generate timestamp for this specific query (should match prompt timestamp approximately)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
        result_file = self.current_session_dir / f"result_{timestamp}.txt"
        
        # Create detailed result content with metadata
        result_content = f"""RESULT METADATA
===============
Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Template: {template_name}
Original Query: {query}
Processing Time: {processing_time:.2f} seconds
Documents Found: {num_docs_found}

LLM RESPONSE
============
{result}
"""
        
        # Save to file
        with open(result_file, 'w', encoding='utf-8') as f:
            f.write(result_content)
        
        logger.info(f"Saved result to: {result_file}")
        return result_file
    
    def save_session_summary(self, queries_processed: int) -> Optional[Path]:
        """
        Save a summary of the session.
        
        Args:
            queries_processed: Number of queries processed in this session
            
        Returns:
            Path to the saved summary file or None if no session is active
        """
        if not self.current_session_dir:
            return None
        
        summary_file = self.current_session_dir / "session_summary.txt"
        
        # Get list of files in session directory
        prompt_files = list(self.current_session_dir.glob("prompt_*.txt"))
        result_files = list(self.current_session_dir.glob("result_*.txt"))
        
        summary_content = f"""SESSION SUMMARY
===============
Session Directory: {self.current_session_dir}
Session Started: {self.current_session_dir.name.replace('session_', '').replace('_', ' ')}
Queries Processed: {queries_processed}
Prompt Files: {len(prompt_files)}
Result Files: {len(result_files)}

FILES CREATED
=============
"""
        
        # List all files created
        all_files = sorted(list(self.current_session_dir.iterdir()))
        for file_path in all_files:
            if file_path.is_file() and file_path.name != "session_summary.txt":
                summary_content += f"- {file_path.name}\n"
        
        # Save summary
        with open(summary_file, 'w', encoding='utf-8') as f:
            f.write(summary_content)
        
        logger.info(f"Saved session summary to: {summary_file}")
        return summary_file
    
    def cleanup_old_sessions(self, max_sessions: int = 10):
        """
        Clean up old session folders, keeping only the most recent ones.
        
        Args:
            max_sessions: Maximum number of sessions to keep
        """
        if not self.sessions_root.exists():
            return
        
        # Get all session directories
        session_dirs = [d for d in self.sessions_root.iterdir() 
                       if d.is_dir() and d.name.startswith("session_")]
        
        # Sort by creation time (newest first)
        session_dirs.sort(key=lambda x: x.stat().st_ctime, reverse=True)
        
        # Remove old sessions
        for old_session in session_dirs[max_sessions:]:
            try:
                # Remove all files in the directory
                for file_path in old_session.iterdir():
                    file_path.unlink()
                # Remove the directory
                old_session.rmdir()
                logger.info(f"Removed old session: {old_session}")
            except Exception as e:
                logger.warning(f"Failed to remove old session {old_session}: {e}")