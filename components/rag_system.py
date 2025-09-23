import json
import os
import pickle
import logging
import time
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Callable

import faiss
import numpy as np
import requests
from sentence_transformers import SentenceTransformer
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table
from rich import box

from .session_manager import SessionManager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Rich console for beautiful output
console = Console()


class RAGSystem:
    """
    Retrieval-Augmented Generation system using FAISS for vector search and external LLM APIs for inference.
    """
    
    def __init__(self, config_path: str = "config.json", enable_session_saving: bool = True):
        """
        Initialize the RAG system.
        
        Args:
            config_path: Path to the configuration file
            enable_session_saving: Whether to enable session saving functionality
        """
        self.config = self._load_config(config_path)
        self.embedder: Optional[SentenceTransformer] = None
        self.index: Optional[faiss.Index] = None
        self.metadata: List[str] = []
        
        # Initialize session manager if enabled
        self.session_manager = SessionManager() if enable_session_saving else None
        self.enable_session_saving = enable_session_saving
        
        # Initialize embedding model
        self._init_embedder()
        
        # Ensure directories exist
        self.files_dir = Path("files")
        self.files_dir.mkdir(exist_ok=True)
        
        # Load or create FAISS index
        self._load_or_create_index()
    
    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from JSON file."""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                logger.info(f"Configuration loaded from {config_path}")
                return config
        except FileNotFoundError:
            logger.error(f"Configuration file {config_path} not found")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in {config_path}: {e}")
            raise
    
    def _init_embedder(self):
        """Initialize the sentence transformer model."""
        model_name = self.config["embedding"]["model"]
        logger.info(f"Loading embedding model: {model_name}")
        try:
            self.embedder = SentenceTransformer(model_name)
            logger.info("Embedding model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise
    
    def _load_or_create_index(self):
        """Load existing FAISS index or create a new one."""
        index_path = self.config["index"]["save_path"]
        metadata_path = self.config["index"]["metadata_path"]
        
        if os.path.exists(index_path) and os.path.exists(metadata_path):
            logger.info("Loading existing FAISS index and metadata")
            try:
                self.index = faiss.read_index(index_path)
                with open(metadata_path, 'rb') as f:
                    self.metadata = pickle.load(f)
                if self.index is not None:
                    logger.info(f"Loaded index with {self.index.ntotal} documents")
            except Exception as e:
                logger.error(f"Failed to load existing index: {e}")
                self._create_new_index()
        else:
            logger.info("Creating new FAISS index")
            self._create_new_index()
    
    def _create_new_index(self):
        """Create a new FAISS index."""
        dim = self.config["embedding"]["dimension"]
        index_type = self.config["index"]["type"]
        
        if index_type == "IndexFlatL2":
            self.index = faiss.IndexFlatL2(dim)
        elif index_type == "IndexIVFFlat":
            # Create IVF index for larger datasets
            quantizer = faiss.IndexFlatL2(dim)
            self.index = faiss.IndexIVFFlat(quantizer, dim, 100)
        else:
            logger.warning(f"Unknown index type {index_type}, using IndexFlatL2")
            self.index = faiss.IndexFlatL2(dim)
        
        self.metadata = []
        logger.info(f"Created new {index_type} index with dimension {dim}")
    
    def _clear_index(self):
        """Clear the FAISS index and metadata, then save."""
        if self.index is None:
            logger.warning("Index not initialized, nothing to clear")
            return
        
        logger.info(f"Clearing index with {self.index.ntotal} documents")
        
        # Create a fresh index of the same type
        self._create_new_index()
        
        # Save the empty index
        self._save_index()
        
        logger.info("Index cleared and saved")
    
    def _save_index(self):
        """Save FAISS index and metadata to disk."""
        if self.index is None:
            logger.error("Cannot save index: index not initialized")
            return
            
        index_path = self.config["index"]["save_path"]
        metadata_path = self.config["index"]["metadata_path"]
        
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(index_path), exist_ok=True)
            os.makedirs(os.path.dirname(metadata_path), exist_ok=True)
            
            faiss.write_index(self.index, index_path)
            with open(metadata_path, 'wb') as f:
                pickle.dump(self.metadata, f)
            
            logger.info(f"Saved index with {self.index.ntotal} documents")
        except Exception as e:
            logger.error(f"Failed to save index: {e}")
            raise
    
    def add_documents(self, documents: List[str], save: bool = True, progress_callback: Optional[Callable] = None) -> None:
        """
        Add documents to the FAISS index.
        
        Args:
            documents: List of document texts to add
            save: Whether to save the index after adding documents
            progress_callback: Optional callback function for progress updates (current, total, message)
        """
        if not documents:
            logger.warning("No documents provided")
            return

        if self.embedder is None:
            logger.error("Embedder not initialized")
            raise RuntimeError("Embedder not initialized")

        if self.index is None:
            logger.error("Index not initialized")
            raise RuntimeError("Index not initialized")

        if not isinstance(documents, list):
            documents = [documents]

        logger.info(f"Adding {len(documents)} documents to index")

        try:
            # Process documents one by one for real-time progress
            all_vectors = []
            
            for i, doc in enumerate(documents):
                if progress_callback:
                    progress_callback(i, len(documents), f"Embedding document {i+1}/{len(documents)}")
                
                # Generate embedding for single document
                vector = self.embedder.encode([doc])
                all_vectors.append(vector[0])
                
            if progress_callback:
                progress_callback(len(documents), len(documents), "Adding vectors to index...")
            
            # Convert to numpy array
            vectors = np.array(all_vectors, dtype=np.float32)
            
            # Add to index
            if hasattr(self.index, 'is_trained') and not self.index.is_trained:
                # Train IVF index if necessary
                if len(vectors) >= 100:  # Need enough data to train
                    if progress_callback:
                        progress_callback(len(documents), len(documents), "Training index...")
                    # Type hint: FAISS train method expects numpy array
                    self.index.train(vectors)  # type: ignore[misc]
                    logger.info("Trained IVF index")

            # Type hint: FAISS add method expects numpy array
            self.index.add(vectors)  # type: ignore[misc]
            self.metadata.extend(documents)

            # Save to disk
            if save:
                if progress_callback:
                    progress_callback(len(documents), len(documents), "Saving index...")
                self._save_index()

            if progress_callback:
                progress_callback(len(documents), len(documents), "✅ Documents added successfully!")
            
            logger.info(f"Index now contains {self.index.ntotal} documents")

        except Exception as e:
            logger.error(f"Failed to add documents: {e}")
            raise
    
    def search(self, query: str, k: Optional[int] = None) -> List[str]:
        """
        Search for similar documents.
        
        Args:
            query: Query text
            k: Number of documents to retrieve (defaults to config value)
            
        Returns:
            List of relevant document texts
        """
        if self.index is None:
            logger.error("Index not initialized")
            return []
        
        if self.embedder is None:
            logger.error("Embedder not initialized")
            return []
        
        if self.index.ntotal == 0:
            logger.warning("Index is empty")
            return []
        
        if k is None:
            k = self.config["retrieval"]["top_k"]
        
        try:
            # Generate query embedding
            query_vector = self.embedder.encode([query])
            query_vector = np.array(query_vector, dtype=np.float32)
            
            # Search
            k = min(k, self.index.ntotal)  # Don't request more than available
            # Type hint: FAISS search method returns (distances, indices) tuple
            distances, indices = self.index.search(query_vector, k)  # type: ignore[misc]
            
            # Filter by similarity threshold if configured
            similarity_threshold = self.config["retrieval"].get("similarity_threshold")
            
            # Return relevant documents
            results = []
            for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
                if idx != -1:  # Valid index
                    # Convert L2 distance to similarity score (lower distance = higher similarity)
                    similarity = 1.0 / (1.0 + distance)
                    
                    if similarity_threshold is None or similarity >= similarity_threshold:
                        # Extract content from metadata (handle both old string format and new dict format)
                        metadata_item = self.metadata[idx]
                        if isinstance(metadata_item, dict):
                            # New format with filename metadata
                            content = metadata_item.get('content', str(metadata_item))
                        else:
                            # Old format (just strings)
                            content = metadata_item
                        results.append(content)
                    else:
                        logger.debug(f"Document {idx} filtered out (similarity: {similarity:.3f})")
            
            logger.info(f"Retrieved {len(results)} documents for query")
            return results
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
    
    def search_detailed(self, query: str, k: Optional[int] = None) -> Dict:
        """
        Search for similar documents with detailed information.
        
        Args:
            query: Query text
            k: Number of documents to retrieve (defaults to config value)
            
        Returns:
            Dictionary containing search results, scores, and metadata
        """
        if self.index is None:
            logger.error("Index not initialized")
            return {"documents": [], "scores": [], "metadata": []}
        
        if self.embedder is None:
            logger.error("Embedder not initialized")
            return {"documents": [], "scores": [], "metadata": []}
        
        if self.index.ntotal == 0:
            logger.warning("Index is empty")
            return {"documents": [], "scores": [], "metadata": []}
        
        if k is None:
            k = self.config["retrieval"]["top_k"]
        
        try:
            # Generate query embedding
            query_vector = self.embedder.encode([query])
            query_vector = np.array(query_vector, dtype=np.float32)
            
            # Search
            k = min(k, self.index.ntotal)  # Don't request more than available
            # Type hint: FAISS search method returns (distances, indices) tuple
            distances, indices = self.index.search(query_vector, k)  # type: ignore[misc]
            
            # Filter by similarity threshold if configured
            similarity_threshold = self.config["retrieval"].get("similarity_threshold")
            
            # Return detailed results including full metadata
            documents = []
            scores = []
            metadata = []
            
            for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
                if idx != -1:  # Valid index
                    similarity = 1.0 / (1.0 + distance)
                    
                    if similarity_threshold is None or similarity >= similarity_threshold:
                        metadata_item = self.metadata[idx]
                        if isinstance(metadata_item, dict):
                            content = metadata_item.get('content', str(metadata_item))
                            documents.append(content)
                            metadata.append(metadata_item)  # Full metadata for display
                        else:
                            documents.append(metadata_item)
                            metadata.append(metadata_item)  # String format
                        scores.append(similarity)
            
            return {
                "documents": documents,
                "scores": scores, 
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"Detailed search failed: {e}")
            return {"documents": [], "scores": [], "metadata": []}
            
    def load_prompt_template(self, template_name: str = "basic_rag") -> str:
        """
        Load a prompt template from the prompts directory.
        
        Args:
            template_name: Name of the template file (without .txt extension)
            
        Returns:
            Template string
        """
        template_path = f"prompts/{template_name}.txt"
        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            logger.warning(f"Template {template_path} not found, using default")
            return "Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
    
    def generate_response(self, 
                         query: str, 
                         context_docs: Optional[List[str]] = None,
                         template_name: str = "basic_rag",
                         use_context: bool = True) -> Tuple[str, float]:
        """
        Generate response using external LLM API with optional retrieved context.
        
        Args:
            query: User question
            context_docs: Pre-retrieved documents (if None, will search automatically)
            template_name: Name of prompt template to use
            use_context: If False, uses empty context; if True, uses FAISS context
            
        Returns:
            Tuple of (generated response, processing time in seconds)
        """
        if use_context and context_docs is None:
            context_docs = self.search(query)
        
        # Prepare context
        if not use_context or not context_docs:
            context = ""  # Empty context for direct LLM response
        else:
            # Limit context length
            max_length = self.config["retrieval"]["max_context_length"]
            context_parts = []
            current_length = 0
            
            for doc in context_docs:
                if current_length + len(doc) < max_length:
                    context_parts.append(doc)
                    current_length += len(doc)
                else:
                    # Add partial document if there's space
                    remaining_space = max_length - current_length
                    if remaining_space > 100:  # Only add if meaningful space left
                        context_parts.append(doc[:remaining_space] + "...")
                    break
            
            context = "\n\n".join(context_parts)
        
        # Load and format prompt template
        template = self.load_prompt_template(template_name)
        prompt = template.format(context=context, question=query)
        
        # Save prompt to session if enabled
        if self.enable_session_saving and self.session_manager:
            try:
                self.session_manager.save_prompt(prompt, query, template_name)
            except Exception as e:
                logger.warning(f"Failed to save prompt to session: {e}")
        
        # Send to external LLM API and return both response and timing
        return self._call_external_llm(prompt)
    
    def _call_external_llm(self, prompt: str) -> Tuple[str, float]:
        """
        Call external LLM API with the formatted prompt.
        
        Args:
            prompt: Formatted prompt string
            
        Returns:
            Tuple of (generated response, processing time in seconds)
        """
        llm_config = self.config["external_llm"]
        
        # Use the URL exactly as configured without modification
        api_url = llm_config["url"]
        
        # Prepare Ollama-style payload
        payload = {
            "model": llm_config["model"],
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_predict": llm_config["max_tokens"],
                "temperature": llm_config.get("temperature", 0.7)
            }
        }
        
        # Display the payload with rich visuals
        self._display_llm_payload(api_url, payload)
        
        try:
            start_time = time.time()
            response = requests.post(
                api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=llm_config["timeout"]
            )
            processing_time = time.time() - start_time
            
            response.raise_for_status()
            
            result = response.json()
            
            # Extract response text (Ollama format)
            if "response" in result:
                return result["response"].strip(), processing_time
            else:
                logger.error(f"Unexpected API response format: {result}")
                return "Error: Unexpected API response format", processing_time
            
        except requests.RequestException as e:
            processing_time = time.time() - start_time if 'start_time' in locals() else 0.0
            logger.error(f"Error communicating with external LLM: {e}")
            return f"Error: Could not generate response. Please check your API configuration and connection.", processing_time
        except KeyError as e:
            processing_time = time.time() - start_time if 'start_time' in locals() else 0.0
            logger.error(f"Error parsing API response: {e}")
            return f"Error: Invalid API response format", processing_time
        except Exception as e:
            processing_time = time.time() - start_time if 'start_time' in locals() else 0.0
            logger.error(f"Unexpected error: {e}")
            return f"Error: {str(e)}", processing_time
    
    def query(self, question: str, k: Optional[int] = None, template_name: str = "basic_rag", use_context: bool = True) -> Dict:
        """
        Complete RAG pipeline: search + generate.
        
        Args:
            question: User question
            k: Number of documents to retrieve
            template_name: Prompt template to use
            use_context: If False, uses empty context; if True, uses FAISS context
            
        Returns:
            Dictionary with question, context, response, and metadata
        """
        # Get both content (for response generation) and metadata (for display)
        if use_context:
            search_results = self.search_detailed(question, k)
            context_docs = search_results["documents"]  # String content for response
            context_metadata = search_results["metadata"]  # Full metadata for display
        else:
            context_docs = []
            context_metadata = []
        
        response, processing_time = self.generate_response(question, context_docs, template_name, use_context)
        
        # Save result to session if enabled
        if self.enable_session_saving and self.session_manager:
            try:
                self.session_manager.save_result(
                    response, question, processing_time, 
                    len(context_docs), template_name
                )
            except Exception as e:
                logger.warning(f"Failed to save result to session: {e}")
        
        return {
            "question": question,
            "context_docs": context_metadata,  # Use metadata for display (includes filenames)
            "response": response,
            "processing_time": processing_time,
            "num_docs_found": len(context_docs),
            "template_used": template_name
        }
    
    def get_session_manager(self) -> Optional[SessionManager]:
        """
        Get the session manager instance.
        
        Returns:
            SessionManager instance or None if session saving is disabled
        """
        return self.session_manager
    
    def create_new_session(self) -> Optional[Path]:
        """
        Create a new session folder.
        
        Returns:
            Path to new session folder or None if session saving is disabled
        """
        if self.session_manager:
            return self.session_manager.create_session_folder()
        return None
    
    def end_session(self, queries_processed: int = 0) -> Optional[Path]:
        """
        End the current session and save summary.
        
        Args:
            queries_processed: Number of queries processed in this session
            
        Returns:
            Path to session summary file or None if session saving is disabled
        """
        if self.session_manager:
            return self.session_manager.save_session_summary(queries_processed)
        return None
    
    def _display_llm_payload(self, api_url: str, payload: dict):
        """Display the LLM API payload with rich formatting."""
        console.print()  # Add spacing
        
        # Create main panel
        console.print(Panel.fit(
            "[bold blue]🚀 LLM API Request[/bold blue]",
            border_style="blue"
        ))
        
        # Display endpoint URL
        url_table = Table(show_header=False, box=box.SIMPLE)
        url_table.add_column("Label", style="cyan", width=12)
        url_table.add_column("Value", style="green")
        url_table.add_row("Endpoint:", api_url)
        console.print(url_table)
        
        # Display payload details in a nice table
        payload_table = Table(
            title="📦 Request Payload",
            box=box.ROUNDED,
            title_style="bold yellow"
        )
        payload_table.add_column("Parameter", style="cyan", width=15)
        payload_table.add_column("Value", style="white")
        payload_table.add_column("Description", style="dim")
        
        # Add payload rows
        payload_table.add_row(
            "model", 
            f"[bold green]{payload['model']}[/bold green]", 
            "LLM model to use"
        )
        payload_table.add_row(
            "stream", 
            f"[yellow]{payload['stream']}[/yellow]", 
            "Streaming response mode"
        )
        payload_table.add_row(
            "max_tokens", 
            f"[magenta]{payload['options']['num_predict']}[/magenta]", 
            "Maximum tokens to generate"
        )
        payload_table.add_row(
            "temperature", 
            f"[cyan]{payload['options']['temperature']}[/cyan]", 
            "Randomness in response"
        )
        
        console.print(payload_table)
        
        # Display the prompt with syntax highlighting
        prompt_text = payload['prompt']
        # Display full prompt content without truncation
        display_prompt = prompt_text
            
        console.print(Panel(
            display_prompt,
            title="[bold cyan]📝 Prompt Content[/bold cyan]",
            border_style="cyan",
            padding=(1, 2)
        ))
        
        # Display JSON payload for debugging
        json_payload = json.dumps(payload, indent=2)
        syntax = Syntax(json_payload, "json", theme="monokai", line_numbers=True)
        console.print(Panel(
            syntax,
            title="[bold magenta]🔧 Raw JSON Payload[/bold magenta]",
            border_style="magenta",
            padding=(1, 1)
        ))
        
        console.print("[dim]Sending request...[/dim]")
        console.print()
    
    def get_stats(self) -> Dict:
        """Get statistics about the RAG system."""
        return {
            "total_documents": self.index.ntotal if self.index else 0,
            "embedding_model": self.config["embedding"]["model"],
            "embedding_dimension": self.config["embedding"]["dimension"],
            "external_llm_model": self.config["external_llm"]["model"],
            "external_llm_url": self.config["external_llm"]["url"],
            "index_type": self.config["index"]["type"]
        }