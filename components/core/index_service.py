"""
Index Service

Manages FAISS index operations: creation, loading, saving, and document addition.
Extracted from RAGSystem for single responsibility.
"""

import os
import pickle
import logging
from pathlib import Path
from typing import List, Optional, Callable
import faiss
import numpy as np

from ..exceptions import IndexError, IndexNotFoundError

logger = logging.getLogger(__name__)


class IndexService:
    """Manages FAISS index operations."""
    
    def __init__(
        self,
        index_path: str,
        metadata_path: str,
        dimension: int,
        index_type: str = "IndexFlatIP"
    ):
        """
        Initialize index service.
        
        Args:
            index_path: Path to save/load FAISS index
            metadata_path: Path to save/load metadata
            dimension: Embedding dimension
            index_type: Type of FAISS index (IndexFlatIP, IndexFlatL2, IndexIVFFlat)
        """
        self.index_path = index_path
        self.metadata_path = metadata_path
        self.dimension = dimension
        self.index_type = index_type
        
        self.index: Optional[faiss.Index] = None
        self.metadata: List[str] = []
    
    def load_or_create(self) -> None:
        """Load existing index or create a new one."""
        if os.path.exists(self.index_path) and os.path.exists(self.metadata_path):
            self.load()
        else:
            logger.info("Creating new FAISS index")
            self.create_new()
    
    def load(self) -> None:
        """
        Load existing FAISS index and metadata.
        
        Raises:
            IndexNotFoundError: If index files don't exist
            IndexError: If loading fails
        """
        if not os.path.exists(self.index_path):
            raise IndexNotFoundError(f"Index file not found: {self.index_path}")
        
        if not os.path.exists(self.metadata_path):
            raise IndexNotFoundError(f"Metadata file not found: {self.metadata_path}")
        
        logger.info("Loading existing FAISS index and metadata")
        try:
            self.index = faiss.read_index(self.index_path)
            with open(self.metadata_path, 'rb') as f:
                self.metadata = pickle.load(f)
            
            if self.index is not None:
                logger.info(f"Loaded index with {self.index.ntotal} documents")
        except Exception as e:
            logger.error(f"Failed to load existing index: {e}")
            raise IndexError(f"Failed to load index: {e}") from e
    
    def create_new(self) -> None:
        """Create a new FAISS index."""
        if self.index_type == "IndexFlatIP":
            # Inner product index for normalized vectors (cosine similarity)
            self.index = faiss.IndexFlatIP(self.dimension)
            logger.info(f"Created IndexFlatIP for cosine similarity (requires normalized vectors)")
        elif self.index_type == "IndexFlatL2":
            self.index = faiss.IndexFlatL2(self.dimension)
            logger.info(f"Created IndexFlatL2 with dimension {self.dimension}")
        elif self.index_type == "IndexIVFFlat":
            # Create IVF index for larger datasets
            quantizer = faiss.IndexFlatL2(self.dimension)
            self.index = faiss.IndexIVFFlat(quantizer, self.dimension, 100)
            logger.info(f"Created IndexIVFFlat with dimension {self.dimension}")
        else:
            logger.warning(f"Unknown index type {self.index_type}, using IndexFlatIP")
            self.index = faiss.IndexFlatIP(self.dimension)
        
        self.metadata = []
        logger.info(f"Created new {self.index_type} index with dimension {self.dimension}")
    
    def save(self) -> None:
        """
        Save FAISS index and metadata to disk.
        
        Raises:
            IndexError: If saving fails
        """
        if self.index is None:
            raise IndexError("Cannot save index: index not initialized")
        
        try:
            # Ensure directories exist
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)
            os.makedirs(os.path.dirname(self.metadata_path), exist_ok=True)
            
            faiss.write_index(self.index, self.index_path)
            with open(self.metadata_path, 'wb') as f:
                pickle.dump(self.metadata, f)
            
            logger.info(f"Saved index with {self.index.ntotal} documents")
        except Exception as e:
            logger.error(f"Failed to save index: {e}")
            raise IndexError(f"Failed to save index: {e}") from e
    
    def clear(self) -> None:
        """Clear the FAISS index and metadata, then save."""
        if self.index is None:
            logger.warning("Index not initialized, nothing to clear")
            return
        
        logger.info(f"Clearing index with {self.index.ntotal} documents")
        
        # Create a fresh index of the same type
        self.create_new()
        
        # Save the empty index
        self.save()
        
        logger.info("Index cleared and saved")
    
    def add_vectors(
        self,
        vectors: np.ndarray,
        metadata: List[str],
        save: bool = True,
        progress_callback: Optional[Callable] = None
    ) -> None:
        """
        Add vectors to the FAISS index.
        
        Args:
            vectors: numpy array of embeddings (shape: [n_docs, dimension])
            metadata: List of document texts corresponding to vectors
            save: Whether to save the index after adding
            progress_callback: Optional callback(current, total, message)
            
        Raises:
            IndexError: If addition fails
        """
        if self.index is None:
            raise IndexError("Index not initialized")
        
        if len(vectors) == 0:
            logger.warning("No vectors provided")
            return
        
        if len(vectors) != len(metadata):
            raise IndexError(f"Vector count ({len(vectors)}) must match metadata count ({len(metadata)})")
        
        try:
            # Ensure vectors are float32
            vectors = vectors.astype(np.float32)
            
            if progress_callback:
                progress_callback(0, len(vectors), "Adding vectors to index...")
            
            # Train IVF index if necessary
            if hasattr(self.index, 'is_trained') and not self.index.is_trained:
                if len(vectors) >= 100:  # Need enough data to train
                    if progress_callback:
                        progress_callback(len(vectors)//2, len(vectors), "Training index...")
                    self.index.train(vectors)  # type: ignore
                    logger.info("Trained IVF index")
            
            # Add vectors to index
            self.index.add(vectors)  # type: ignore
            self.metadata.extend(metadata)
            
            # Save to disk if requested
            if save:
                if progress_callback:
                    progress_callback(len(vectors), len(vectors), "Saving index...")
                self.save()
            
            if progress_callback:
                progress_callback(len(vectors), len(vectors), "✅ Vectors added successfully!")
            
            logger.info(f"Index now contains {self.index.ntotal} documents")
        except Exception as e:
            logger.error(f"Failed to add vectors: {e}")
            raise IndexError(f"Failed to add vectors: {e}") from e
    
    def search(self, query_vector: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
        """
        Search the index for similar vectors.
        
        Args:
            query_vector: Query embedding (shape: [1, dimension] or [dimension])
            k: Number of results to return
            
        Returns:
            Tuple of (distances, indices) arrays
            
        Raises:
            IndexError: If search fails
        """
        if self.index is None:
            raise IndexError("Index not initialized")
        
        # Ensure query vector is 2D
        if query_vector.ndim == 1:
            query_vector = query_vector.reshape(1, -1)
        
        # Ensure float32
        query_vector = query_vector.astype(np.float32)
        
        try:
            k_search = min(k, self.index.ntotal)
            distances, indices = self.index.search(query_vector, k_search)  # type: ignore
            return distances, indices
        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise IndexError(f"Search failed: {e}") from e
    
    def get_document_count(self) -> int:
        """Get the number of documents in the index."""
        if self.index is None:
            return 0
        return self.index.ntotal
    
    def get_metadata(self, indices: List[int]) -> List[str]:
        """
        Get metadata for given indices.
        
        Args:
            indices: List of document indices
            
        Returns:
            List of metadata strings
        """
        return [self.metadata[i] for i in indices if 0 <= i < len(self.metadata)]
    
    def get_all_metadata(self) -> List[str]:
        """Get all metadata."""
        return self.metadata.copy()
    
    def is_initialized(self) -> bool:
        """Check if index is initialized."""
        return self.index is not None
