"""
Qdrant Service - Vector database for semantic drug search.

Architecture:
- Qdrant stores drug embeddings (384 dims from all-MiniLM-L6-v2)
- Each point has drug_id as payload (reference to Turso)
- Used for semantic search ("medicine for headache" -> finds relevant drugs)
"""
import logging
import threading
from typing import Optional, List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer

from config import QDRANT_URL, QDRANT_API_KEY

logger = logging.getLogger(__name__)

# Constants
COLLECTION_DRUGS = "drug_embeddings"
COLLECTION_MEDICAL_QA = "medical_qa"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2

# Backward compatibility alias
COLLECTION_NAME = COLLECTION_DRUGS

# Singletons with thread-safe initialization
_client: Optional[QdrantClient] = None
_embedding_model: Optional[SentenceTransformer] = None
_client_lock = threading.Lock()
_model_lock = threading.Lock()
_client_init_attempted = False
_model_init_attempted = False


def get_client() -> Optional[QdrantClient]:
    """Get or create Qdrant client (thread-safe)."""
    global _client, _client_init_attempted

    if _client is not None:
        return _client

    if _client_init_attempted:
        return None

    with _client_lock:
        if _client is not None:
            return _client

        if _client_init_attempted:
            return None

        _client_init_attempted = True

        if not QDRANT_URL or not QDRANT_API_KEY:
            logger.warning("Qdrant not configured")
            return None

        try:
            _client = QdrantClient(
                url=QDRANT_URL,
                api_key=QDRANT_API_KEY
            )
            logger.info("Connected to Qdrant")
            return _client
        except Exception as e:
            logger.error("Failed to connect to Qdrant: %s", e)
            return None


def get_embedding_model() -> Optional[SentenceTransformer]:
    """Get or create the embedding model (thread-safe)."""
    global _embedding_model, _model_init_attempted

    if _embedding_model is not None:
        return _embedding_model

    if _model_init_attempted:
        return None

    with _model_lock:
        if _embedding_model is not None:
            return _embedding_model

        if _model_init_attempted:
            return None

        _model_init_attempted = True

        try:
            _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Loaded embedding model")
            return _embedding_model
        except Exception as e:
            logger.error("Failed to load embedding model: %s", e)
            return None


def init_collection() -> bool:
    """Initialize the Qdrant collection if it doesn't exist."""
    client = get_client()
    if not client:
        return False
    
    try:
        # Check if collection exists
        collections = client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if COLLECTION_NAME not in collection_names:
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIM,
                    distance=models.Distance.COSINE
                )
            )
            logger.info(f"Created Qdrant collection: {COLLECTION_NAME}")
        else:
            logger.info(f"Qdrant collection exists: {COLLECTION_NAME}")
        
        return True
    except Exception as e:
        logger.error(f"Failed to init Qdrant collection: {e}")
        return False


def search_similar(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for drugs similar to the query using vector similarity.

    Returns list of {drug_id, drug_name, score} for lookup in Turso.
    """
    model = get_embedding_model()

    if not model:
        return []

    try:
        # Generate query embedding
        query_embedding = model.encode(query).tolist()
        return search_similar_with_embedding(query_embedding, limit=limit)
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []


def _query_collection(collection_name: str, query_embedding: List[float], limit: int):
    """Low-level query helper that reuses a precomputed embedding."""
    client = get_client()
    if not client:
        return []

    # Search Qdrant using query_points (newer API); fallback to search.
    try:
        results = client.query_points(
            collection_name=collection_name,
            query=query_embedding,
            limit=limit
        )
        return results.points
    except AttributeError:
        return client.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=limit
        )


def search_similar_with_embedding(query_embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for drugs similar to a precomputed embedding.

    Returns list of {drug_id, drug_name, score} for lookup in Turso.
    """
    try:
        hits = _query_collection(COLLECTION_NAME, query_embedding, limit)
        return [
            {
                "drug_id": hit.payload.get("drug_id") if hit.payload else None,
                "drug_name": hit.payload.get("drug_name", "") if hit.payload else "",
                "score": hit.score
            }
            for hit in hits
            if hit.payload
        ]
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []

def upsert_drug_embedding(drug_id: str, drug_name: str, text_for_embedding: str) -> bool:
    """
    Add or update a drug embedding in Qdrant.
    
    Args:
        drug_id: Unique ID (matches Turso)
        drug_name: Drug name for reference
        text_for_embedding: Text to embed (name + generic + description)
    """
    client = get_client()
    model = get_embedding_model()
    
    if not client or not model:
        return False
    
    try:
        # Generate embedding
        embedding = model.encode(text_for_embedding).tolist()
        
        # Upsert to Qdrant
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                models.PointStruct(
                    id=hash(drug_id) % (2**63),  # Convert UUID to int
                    vector=embedding,
                    payload={
                        "drug_id": drug_id,
                        "drug_name": drug_name
                    }
                )
            ]
        )
        return True
    except Exception as e:
        logger.error(f"Qdrant upsert failed: {e}")
        return False


def search_medical_qa(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for medical Q&A pairs similar to the query.

    Returns list of {question, answer, question_type, score} for RAG context.
    """
    model = get_embedding_model()

    if not model:
        return []

    try:
        # Generate query embedding
        query_embedding = model.encode(query).tolist()
        return search_medical_qa_with_embedding(query_embedding, limit=limit)
    except Exception as e:
        logger.warning("Medical QA search failed: %s", e)
        return []


def search_medical_qa_with_embedding(query_embedding: List[float], limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for medical Q&A pairs similar to a precomputed embedding.

    Returns list of Q&A payload fields for RAG context + citation metadata.
    """
    try:
        hits = _query_collection(COLLECTION_MEDICAL_QA, query_embedding, limit)
        return [
            {
                "question": hit.payload.get("question", "") if hit.payload else "",
                "answer": hit.payload.get("answer", "") if hit.payload else "",
                "question_type": hit.payload.get("question_type", "") if hit.payload else "",
                "question_focus": hit.payload.get("question_focus", "") if hit.payload else "",
                "document_source": hit.payload.get("document_source", "") if hit.payload else "",
                "umls_cui": hit.payload.get("umls_cui", "") if hit.payload else "",
                "source": hit.payload.get("source", "") if hit.payload else "",
                "type": hit.payload.get("type", "") if hit.payload else "",
                "score": hit.score
            }
            for hit in hits
            if hit.payload
        ]
    except Exception as e:
        # Collection might not exist yet
        logger.warning("medical_qa collection search failed: %s", e)
        return []

def get_collection_info(collection_name: str = None) -> Optional[Dict[str, Any]]:
    """Get information about a collection (for debugging)."""
    client = get_client()
    if not client:
        return None

    target = collection_name or COLLECTION_NAME

    try:
        info = client.get_collection(target)
        return {
            "name": target,
            "points_count": info.points_count,
            "vectors_count": info.vectors_count,
            "status": info.status
        }
    except Exception as e:
        logger.error("Failed to get collection info for %s: %s", target, e)
        return None


def get_all_collections_info() -> Dict[str, Any]:
    """Get information about all known collections."""
    return {
        "drug_embeddings": get_collection_info(COLLECTION_DRUGS),
        "medical_qa": get_collection_info(COLLECTION_MEDICAL_QA)
    }
