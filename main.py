"""
RAG Query System - Production RAG tool with FAISS vector search.

This is the main entry point for the production RAG query system.
The system loads existing FAISS indices and allows interactive querying
with external LLM integration. Sessions are automatically saved with 
timestamped folders containing prompts and results.
"""

import sys
import logging
import argparse
from components.ui_components import UIManager
from components.query_runner import QueryRunner
from components.error_handler import handle_demo_errors


def setup_logging():
    """Configure logging to suppress verbose initialization messages."""
    # Set root logger to WARNING to suppress INFO messages
    logging.basicConfig(
        level=logging.WARNING,
        format='%(levelname)s - %(name)s - %(message)s'
    )
    
    # Only show errors for these noisy modules during initialization
    logging.getLogger('components.rag_system').setLevel(logging.ERROR)
    logging.getLogger('components.session_manager').setLevel(logging.ERROR)
    logging.getLogger('components.optimization.response_evaluator').setLevel(logging.ERROR)
    logging.getLogger('components.query_runner').setLevel(logging.ERROR)
    logging.getLogger('sentence_transformers').setLevel(logging.ERROR)


def main():
    """Main orchestration function for the RAG query system."""
    # Setup logging configuration first
    setup_logging()
    
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser(
            description="RAG Query System - Production semantic search with external LLM integration",
            formatter_class=argparse.RawDescriptionHelpFormatter,
            epilog="""
Examples:
  python main.py                           # Query mode with data/ directory (default)
  python main.py --data-dir files          # Query mode with files/ directory  
  python main.py --data-dir /path/to/data  # Query mode with custom directory

The system loads existing FAISS index and metadata files for querying.
All queries and responses are automatically saved to timestamped session folders.
Press Ctrl+C at any time to exit gracefully.
            """
        )
        parser.add_argument(
            "--data-dir",
            default="data",
            help="Directory containing FAISS index files (default: data)"
        )
        args = parser.parse_args()
        
        # Initialize UI manager
        ui = UIManager()
        
        # Display welcome header
        ui.display_welcome_header()
        
        # Initialize and run interactive query mode
        query_runner = QueryRunner(ui, data_dir=args.data_dir)
        query_runner.run()
        
        # Show completion and next steps
        ui.display_completion_summary()
        
    except KeyboardInterrupt:
        print("\n\n🛑 Operation cancelled by user (Ctrl+C)")
        sys.exit(0)
    except Exception as e:
        handle_demo_errors(e)


if __name__ == "__main__":
    main()