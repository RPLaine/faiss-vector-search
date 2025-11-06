"""
Embedding Service

Handles sentence transformer model initialization and embedding generation.
Extracted from RAGSystem for single responsibility.
"""

import logging
from typing import List, Optional
import numpy as np
from sentence_transformers import SentenceTransformer

from ..exceptions import EmbeddingError, ConfigurationError

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Manages embedding model and vector generation."""
    
    def __init__(self, model_name: str, expected_dimension: int):
        """
        Initialize embedding service.
        
        Args:
            model_name: Name of the sentence transformer model
            expected_dimension: Expected embedding dimension from config
            
        Raises:
            EmbeddingError: If model loading fails
            ConfigurationError: If dimension mismatch occurs
        """
        self.model_name = model_name
        self.expected_dimension = expected_dimension
        self.embedder: Optional[SentenceTransformer] = None
        
        self._load_model()
    
    def _load_model(self) -> None:
        """Load the sentence transformer model."""
        logger.info(f"Loading embedding model: {self.model_name}")
        try:
            self.embedder = SentenceTransformer(self.model_name)
            
            # Validate dimension matches config
            actual_dim = self.embedder.get_sentence_embedding_dimension()
            
            if actual_dim != self.expected_dimension:
                error_msg = (
                    f"Dimension mismatch! Model '{self.model_name}' produces {actual_dim}-dim embeddings, "
                    f"but config specifies {self.expected_dimension}. "
                    f"Update config.json embedding.dimension to {actual_dim}"
                )
                logger.error(error_msg)
                raise ConfigurationError(error_msg)
            
            logger.info(f"Embedding model loaded successfully (dimension: {actual_dim})")
        except Exception as e:
            if isinstance(e, ConfigurationError):
                raise
            logger.error(f"Failed to load embedding model: {e}")
            raise EmbeddingError(f"Failed to load embedding model: {e}") from e
    
    def encode(
        self, 
        texts: List[str], 
        normalize: bool = True,
        show_progress_bar: bool = False
    ) -> np.ndarray:
        """
        Generate embeddings for texts.
        
        Args:
            texts: List of text strings to embed
            normalize: Whether to normalize embeddings (for cosine similarity)
            show_progress_bar: Whether to show progress bar during encoding
            
        Returns:
            numpy array of embeddings (shape: [len(texts), dimension])
            
        Raises:
            EmbeddingError: If encoding fails
        """
        if self.embedder is None:
            raise EmbeddingError("Embedder not initialized")
        
        if not texts:
            logger.warning("No texts provided for encoding")
            return np.array([])
        
        try:
            embeddings = self.embedder.encode(
                texts,
                normalize_embeddings=normalize,
                show_progress_bar=show_progress_bar
            )
            
            # Ensure numpy array format
            if not isinstance(embeddings, np.ndarray):
                embeddings = np.array(embeddings)
            
            return embeddings.astype(np.float32)
        except Exception as e:
            logger.error(f"Failed to encode texts: {e}")
            raise EmbeddingError(f"Failed to encode texts: {e}") from e
    
    def encode_single(self, text: str, normalize: bool = True) -> np.ndarray:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text string to embed
            normalize: Whether to normalize embedding
            
        Returns:
            numpy array of embedding (shape: [dimension])
            
        Raises:
            EmbeddingError: If encoding fails
        """
        embeddings = self.encode([text], normalize=normalize)
        return embeddings[0] if len(embeddings) > 0 else np.array([])
    
    def get_dimension(self) -> int:
        """Get the embedding dimension."""
        return self.expected_dimension
    
    def get_model_name(self) -> str:
        """Get the model name."""
        return self.model_name
    
    def reload_model(self) -> None:
        """Reload the embedding model (useful for memory management)."""
        logger.info(f"Reloading embedding model: {self.model_name}")
        self._load_model()
