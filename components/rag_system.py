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
            config_path: Path to the configuration file (temp configs for initialization only)
            enable_session_saving: Whether to enable session saving functionality
        """
        # Always use config.json for reloading, even if initialized with temp config
        self.config_path = "config.json"
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
    
    def reload_config(self):
        """
        Reload configuration from file.
        Useful for picking up configuration changes without restarting the system.
        """
        logger.info(f"Reloading configuration from {self.config_path}")
        self.config = self._load_config(self.config_path)
        return self.config
    
    def _init_embedder(self):
        """Initialize the sentence transformer model."""
        model_name = self.config["embedding"]["model"]
        logger.info(f"Loading embedding model: {model_name}")
        try:
            self.embedder = SentenceTransformer(model_name)
            
            # Validate dimension matches config
            actual_dim = self.embedder.get_sentence_embedding_dimension()
            config_dim = self.config["embedding"]["dimension"]
            
            if actual_dim != config_dim:
                error_msg = f"Dimension mismatch! Model '{model_name}' produces {actual_dim}-dim embeddings, but config specifies {config_dim}. Update config.json embedding.dimension to {actual_dim}"
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            logger.info(f"Embedding model loaded successfully (dimension: {actual_dim})")
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
        
        if index_type == "IndexFlatIP":
            # Inner product index for normalized vectors (cosine similarity)
            self.index = faiss.IndexFlatIP(dim)
            logger.info(f"Created IndexFlatIP for cosine similarity (requires normalized vectors)")
        elif index_type == "IndexFlatL2":
            self.index = faiss.IndexFlatL2(dim)
        elif index_type == "IndexIVFFlat":
            # Create IVF index for larger datasets
            quantizer = faiss.IndexFlatL2(dim)
            self.index = faiss.IndexIVFFlat(quantizer, dim, 100)
        else:
            logger.warning(f"Unknown index type {index_type}, using IndexFlatIP")
            self.index = faiss.IndexFlatIP(dim)
        
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
                
                # Generate embedding for single document (normalized for IndexFlatIP)
                vector = self.embedder.encode([doc], normalize_embeddings=True)
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
    
    def _search_with_dynamic_threshold(self, query_vector: np.ndarray, k: int) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """
        Perform FAISS search with dynamic similarity threshold adjustment.
        Starts from threshold=1.0 and gradually lowers it by 'step' until hit_target is reached.
        
        Args:
            query_vector: Query embedding vector
            k: Number of results to retrieve from FAISS
            
        Returns:
            Tuple of (distances, indices, threshold_stats) 
            where threshold_stats contains detailed progression data
        """
        if self.index is None:
            return np.array([[]], dtype=np.float32), np.array([[]], dtype=np.int64), {}
        
        # Get config parameters
        hit_target = self.config["retrieval"].get("hit_target", 3)
        step = self.config["retrieval"].get("step", 0.05)
        initial_threshold = 1.0
        index_type = self.config["index"]["type"]
        is_inner_product = (index_type == "IndexFlatIP")
        
        # Perform initial FAISS search
        k_search = min(k, self.index.ntotal)
        distances_all, indices_all = self.index.search(query_vector, k_search)  # type: ignore[misc]
        
        logger.info(f"Dynamic threshold search: target={hit_target}, step={step}, raw_results={len(indices_all[0])}")
        
        # Track threshold progression
        threshold_progression = []
        
        # Try progressively lower thresholds
        current_threshold = initial_threshold
        best_distances: Optional[np.ndarray] = None
        best_indices: Optional[np.ndarray] = None
        best_count = 0
        final_threshold = current_threshold
        
        while current_threshold >= 0.0:
            # Filter results by current threshold
            filtered_distances = []
            filtered_indices = []
            
            for distance, idx in zip(distances_all[0], indices_all[0]):
                if idx != -1:  # Valid index
                    # Calculate similarity based on index type
                    if is_inner_product:
                        similarity = float(distance)
                    else:
                        similarity = 1.0 / (1.0 + distance)
                    
                    if similarity >= current_threshold:
                        filtered_distances.append(distance)
                        filtered_indices.append(idx)
            
            result_count = len(filtered_indices)
            
            # Record this threshold attempt
            threshold_progression.append({
                "threshold": round(current_threshold, 3),
                "hits": result_count,
                "target_reached": result_count >= hit_target
            })
            
            logger.debug(f"Threshold {current_threshold:.3f}: {result_count} documents")
            
            # Check if we've met the hit target
            if result_count >= hit_target:
                best_distances = np.array([filtered_distances], dtype=np.float32)
                best_indices = np.array([filtered_indices], dtype=np.int64)
                best_count = result_count
                final_threshold = current_threshold
                logger.info(f"Hit target reached at threshold={current_threshold:.3f} with {result_count} documents")
                break
            
            # Keep track of best result so far
            if result_count > best_count:
                best_distances = np.array([filtered_distances], dtype=np.float32)
                best_indices = np.array([filtered_indices], dtype=np.int64)
                best_count = result_count
                final_threshold = current_threshold
            
            # Lower threshold
            current_threshold -= step
        
        # Prepare stats
        threshold_stats = {
            "hit_target": hit_target,
            "step": step,
            "final_threshold": round(final_threshold, 3),
            "final_hits": best_count,
            "target_reached": best_count >= hit_target,
            "attempts": len(threshold_progression),
            "progression": threshold_progression
        }
        
        # If we never reached hit_target, return the best we found
        if best_distances is None or best_indices is None or best_count < hit_target:
            logger.warning(f"Could not reach hit_target={hit_target}. Returning {best_count} documents at lowest threshold")
            if best_distances is None or best_indices is None:
                # Return empty results
                return np.array([[]], dtype=np.float32), np.array([[]], dtype=np.int64), threshold_stats
        
        return best_distances, best_indices, threshold_stats
    
    def search(self, query: str, k: Optional[int] = None) -> List[str]:
        """
        Search for similar documents.
        Reloads configuration to pick up any changes to retrieval parameters.
        
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
        
        # Reload config to pick up any changes to retrieval parameters
        self.reload_config()
        
        if k is None:
            k = self.config["retrieval"]["top_k"]
        
        # k is guaranteed to be not None here
        assert k is not None
        k_int = k if isinstance(k, int) else int(k)
        
        # Check if dynamic threshold is enabled
        use_dynamic = "hit_target" in self.config["retrieval"]
        if use_dynamic:
            logger.info(f"🎯 DYNAMIC THRESHOLD MODE - hit_target={self.config['retrieval']['hit_target']}, step={self.config['retrieval'].get('step', 0.05)}")
        else:
            logger.info(f"📌 FIXED THRESHOLD MODE - threshold={self.config['retrieval'].get('similarity_threshold', 'None')}")
        
        threshold_stats = None
        
        try:
            # Generate query embedding (normalized for IndexFlatIP)
            query_vector = self.embedder.encode([query], normalize_embeddings=True)
            query_vector = np.array(query_vector, dtype=np.float32)
            
            # Use dynamic threshold search if hit_target is configured
            if use_dynamic:
                distances, indices, threshold_stats = self._search_with_dynamic_threshold(query_vector, k_int)
            else:
                # Original search with fixed threshold
                k_search = min(k_int, self.index.ntotal)  # Don't request more than available
                distances, indices = self.index.search(query_vector, k_search)  # type: ignore[misc]
            
            # Determine index type for proper similarity calculation
            index_type = self.config["index"]["type"]
            is_inner_product = (index_type == "IndexFlatIP")
            
            logger.info(f"Search returned {len(indices[0])} documents from index (ntotal={self.index.ntotal})")
            
            # Extract documents from results (dynamic threshold already filtered)
            results = []
            for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
                if idx != -1:  # Valid index
                    # Extract content from metadata (handle both old string format and new dict format)
                    metadata_item = self.metadata[idx]
                    if isinstance(metadata_item, dict):
                        # New format with filename metadata
                        content = metadata_item.get('content', str(metadata_item))
                    else:
                        # Old format (just strings)
                        content = metadata_item
                    results.append(content)
            
            logger.info(f"Retrieved {len(results)} documents for query")
            return results
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
    
    def search_detailed(self, query: str, k: Optional[int] = None) -> Dict:
        """
        Search for similar documents with detailed information.
        Reloads configuration to pick up any changes to retrieval parameters.
        
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
        
        # Reload config to pick up any changes to retrieval parameters
        self.reload_config()
        
        if k is None:
            k = self.config["retrieval"]["top_k"]
        
        # k is guaranteed to be not None here
        assert k is not None
        k_int = k if isinstance(k, int) else int(k)
        
        # Check if dynamic threshold is enabled
        use_dynamic = "hit_target" in self.config["retrieval"]
        if use_dynamic:
            logger.info(f"🎯 DYNAMIC THRESHOLD MODE (detailed) - hit_target={self.config['retrieval']['hit_target']}, step={self.config['retrieval'].get('step', 0.05)}")
        else:
            logger.info(f"📌 FIXED THRESHOLD MODE (detailed) - threshold={self.config['retrieval'].get('similarity_threshold', 'None')}")
        
        threshold_stats = None
        
        try:
            # Generate query embedding (normalized for IndexFlatIP)
            query_vector = self.embedder.encode([query], normalize_embeddings=True)
            query_vector = np.array(query_vector, dtype=np.float32)
            
            # Use dynamic threshold search if hit_target is configured
            if use_dynamic:
                distances, indices, threshold_stats = self._search_with_dynamic_threshold(query_vector, k_int)
            else:
                # Original search with fixed threshold
                k_search = min(k_int, self.index.ntotal)  # Don't request more than available
                distances, indices = self.index.search(query_vector, k_search)  # type: ignore[misc]
            
            # Determine index type for proper similarity calculation
            index_type = self.config["index"]["type"]
            is_inner_product = (index_type == "IndexFlatIP")
            
            logger.info(f"Detailed search returned {len(indices[0])} documents from index (ntotal={self.index.ntotal})")
            
            # Return detailed results including full metadata
            documents = []
            scores = []
            metadata = []
            
            for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
                if idx != -1:  # Valid index
                    # Calculate similarity based on index type
                    if is_inner_product:
                        # For IndexFlatIP with normalized vectors, distance IS cosine similarity
                        similarity = float(distance)
                    else:
                        # For L2 distance, convert to similarity score
                        similarity = 1.0 / (1.0 + distance)
                    
                    logger.debug(f"Doc {idx}: distance={distance:.4f}, similarity={similarity:.4f}")
                    
                    metadata_item = self.metadata[idx]
                    if isinstance(metadata_item, dict):
                        content = metadata_item.get('content', str(metadata_item))
                        documents.append(content)
                        metadata.append(metadata_item)  # Full metadata for display
                    else:
                        documents.append(metadata_item)
                        metadata.append(metadata_item)  # String format
                    scores.append(similarity)
            
            logger.info(f"Detailed search retrieved {len(documents)} documents")
            
            result: Dict = {
                "documents": documents,
                "scores": scores, 
                "metadata": metadata
            }
            
            # Add threshold stats if available
            if threshold_stats:
                result["threshold_stats"] = threshold_stats  # type: ignore
            
            return result
            
        except Exception as e:
            logger.error(f"Detailed search failed: {e}")
            return {"documents": [], "scores": [], "metadata": []}
            
    def load_prompt_template(self, template_name: str = "base") -> str:
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
        Reloads configuration to pick up any changes to context length limits.
        
        Args:
            query: User question
            context_docs: Pre-retrieved documents (if None, will search automatically)
            template_name: Name of prompt template to use
            use_context: If False, uses empty context; if True, uses FAISS context
            
        Returns:
            Tuple of (generated response, processing time in seconds)
        """
        # Reload config to pick up any changes to context length limits
        self.reload_config()
        
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
        Reloads configuration before each call to pick up any changes.
        
        Args:
            prompt: Formatted prompt string
            
        Returns:
            Tuple of (generated response, processing time in seconds)
        """
        # Reload config to pick up any changes made to config.json
        self.reload_config()
        llm_config = self.config["external_llm"]
        
        # Use the URL exactly as configured without modification
        api_url = llm_config["url"]
        
        # Get payload type from config (default to "prompt" for backward compatibility)
        payload_type = llm_config.get("payload_type", "prompt")
        
        # Prepare payload based on type
        if payload_type == "message":
            # OpenAI-style message format
            payload = {
                "model": llm_config["model"],
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "max_tokens": llm_config["max_tokens"],
                "temperature": llm_config.get("temperature", 0.7)
            }
        else:
            # Ollama-style prompt format (default)
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
            
            # Prepare headers from config
            headers = llm_config.get("headers", {})
            if not headers:
                headers = {"Content-Type": "application/json"}
            
            response = requests.post(
                api_url,
                json=payload,
                headers=headers,
                timeout=llm_config["timeout"]
            )
            processing_time = time.time() - start_time
            
            response.raise_for_status()
            
            result = response.json()
            
            # Extract response text based on payload type
            payload_type = llm_config.get("payload_type", "prompt")
            
            if payload_type == "message":
                # OpenAI-style response format
                if "choices" in result and len(result["choices"]) > 0:
                    return result["choices"][0]["message"]["content"].strip(), processing_time
                elif "content" in result:
                    return result["content"].strip(), processing_time
                else:
                    logger.error(f"Unexpected message API response format: {result}")
                    return "Error: Unexpected message API response format", processing_time
            else:
                # Ollama-style response format (default)
                if "response" in result:
                    return result["response"].strip(), processing_time
                else:
                    logger.error(f"Unexpected prompt API response format: {result}")
                    return "Error: Unexpected prompt API response format", processing_time
            
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
            threshold_stats = search_results.get("threshold_stats")  # Dynamic threshold stats if available
        else:
            context_docs = []
            context_metadata = []
            threshold_stats = None
        
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
        
        # Gather config parameters for display (excluding sensitive data)
        config_params = {
            "llm_model": self.config["external_llm"]["model"],
            "max_tokens": self.config["external_llm"]["max_tokens"],
            "temperature": self.config["external_llm"].get("temperature", 0.7),
            "embedding_model": self.config["embedding"]["model"],
            "dimension": self.config["embedding"]["dimension"],
            "top_k": self.config["retrieval"]["top_k"],
            "similarity_threshold": self.config["retrieval"].get("similarity_threshold", "N/A"),
            "hit_target": self.config["retrieval"].get("hit_target", "N/A"),
            "step": self.config["retrieval"].get("step", "N/A"),
            "max_context_length": self.config["retrieval"]["max_context_length"],
            "index_type": self.config["index"]["type"]
        }
        
        result = {
            "question": question,
            "context_docs": context_metadata,  # Use metadata for display (includes filenames)
            "documents": context_docs,  # Actual document content for evaluation
            "response": response,
            "processing_time": processing_time,
            "num_docs_found": len(context_docs),
            "template_used": template_name,
            "config_params": config_params
        }
        
        # Add threshold stats if available
        if threshold_stats:
            result["threshold_stats"] = threshold_stats
        
        return result
    
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
        
        # Get payload type for display
        payload_type = self.config["external_llm"].get("payload_type", "prompt")
        payload_table.add_row(
            "payload_type", 
            f"[bold blue]{payload_type}[/bold blue]", 
            "Request format type"
        )
        
        payload_table.add_row(
            "stream", 
            f"[yellow]{payload['stream']}[/yellow]", 
            "Streaming response mode"
        )
        # Handle different token limit formats
        if "max_tokens" in payload:
            max_tokens_value = payload["max_tokens"]
        elif "options" in payload and "num_predict" in payload["options"]:
            max_tokens_value = payload["options"]["num_predict"]
        else:
            max_tokens_value = "N/A"
            
        payload_table.add_row(
            "max_tokens", 
            f"[magenta]{max_tokens_value}[/magenta]", 
            "Maximum tokens to generate"
        )
        # Handle different temperature formats
        if "temperature" in payload:
            temperature_value = payload["temperature"]
        elif "options" in payload and "temperature" in payload["options"]:
            temperature_value = payload["options"]["temperature"]
        else:
            temperature_value = "N/A"
            
        payload_table.add_row(
            "temperature", 
            f"[cyan]{temperature_value}[/cyan]", 
            "Randomness in response"
        )
        
        console.print(payload_table)
        
        # Display the prompt with syntax highlighting
        # Handle different payload types for prompt display
        if "prompt" in payload:
            # Prompt-type payload
            display_prompt = payload['prompt']
            title = "[bold cyan]📝 Prompt Content[/bold cyan]"
        elif "messages" in payload:
            # Message-type payload
            messages = payload['messages']
            if messages and len(messages) > 0:
                display_prompt = messages[0].get('content', 'No content found')
            else:
                display_prompt = 'No messages found'
            title = "[bold cyan]📝 Message Content[/bold cyan]"
        else:
            display_prompt = 'No prompt or messages found in payload'
            title = "[bold cyan]📝 Content[/bold cyan]"
            
        console.print(Panel(
            display_prompt,
            title=title,
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