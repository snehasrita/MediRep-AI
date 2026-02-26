#!/usr/bin/env python3
"""
MedQuAD Dataset Ingestion Script

Loads the lavita/MedQuAD medical Q&A dataset from HuggingFace and creates
embeddings in Qdrant for semantic search.

Dataset: lavita/MedQuAD (47.4k Q&A pairs from NIH)
Collection: medical_qa

Usage:
    source ~/python/bin/activate
    cd backend
    python jobs/ingest_medquad.py
"""
import logging
import sys
import os
import hashlib
import time
from typing import List, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datasets import load_dataset
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.http import models

from config import QDRANT_URL, QDRANT_API_KEY

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
COLLECTION_NAME = "medical_qa"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2
BATCH_SIZE = 100
DATASET_NAME = "lavita/MedQuAD"


def get_qdrant_client() -> QdrantClient:
    """Create Qdrant client."""
    if not QDRANT_URL or not QDRANT_API_KEY:
        raise ValueError("QDRANT_URL and QDRANT_API_KEY must be set")

    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)


def init_collection(client: QdrantClient) -> bool:
    """Initialize the medical_qa collection if it doesn't exist."""
    try:
        collections = client.get_collections().collections
        collection_names = [c.name for c in collections]

        if COLLECTION_NAME in collection_names:
            logger.info("Collection '%s' already exists", COLLECTION_NAME)
            info = client.get_collection(COLLECTION_NAME)
            logger.info("  Points: %d, Status: %s", info.points_count, info.status)
            return True

        # Create new collection
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=EMBEDDING_DIM,
                distance=models.Distance.COSINE
            )
        )
        logger.info("Created collection: %s", COLLECTION_NAME)
        return True

    except Exception as e:
        logger.error("Failed to init collection: %s", e)
        return False


def generate_point_id(question_id: str, question: str) -> int:
    """Generate a stable integer ID from question content."""
    content = f"{question_id}:{question}"
    hash_bytes = hashlib.md5(content.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder='big') % (2**63)


def process_batch(
    client: QdrantClient,
    model: SentenceTransformer,
    batch: List[Dict[str, Any]]
) -> tuple[int, int]:
    """Process a batch of Q&A pairs and upsert to Qdrant. Returns (success_count, skipped_count)."""
    points = []
    skipped = 0

    for item in batch:
        question = (item.get("question") or "").strip()
        answer = (item.get("answer") or "").strip()
        question_id = item.get("question_id", "")
        question_type = (item.get("question_type") or "general").strip()
        question_focus = (item.get("question_focus") or "").strip()
        document_source = (item.get("document_source") or "").strip()
        umls_cui = (item.get("umls_cui") or "").strip()

        if not question or not answer:
            skipped += 1
            continue

        # Create embedding text: Question + Focus + truncated Answer
        answer_truncated = answer[:500] if len(answer) > 500 else answer
        embed_text = f"{question} {question_focus} {answer_truncated}"

        # Generate embedding
        embedding = model.encode(embed_text).tolist()

        # Generate stable ID
        point_id = generate_point_id(question_id, question)

        points.append(models.PointStruct(
            id=point_id,
            vector=embedding,
            payload={
                "question": question,
                "answer": answer[:2000],  # Truncate for storage
                "question_type": question_type,
                "question_focus": question_focus,
                "document_source": document_source,
                "umls_cui": umls_cui,
                "source": "medquad"
            }
        ))

    if not points:
        return 0

    # Upsert to Qdrant
    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points), skipped


def main():
    """Main ingestion function."""
    logger.info("=" * 60)
    logger.info("MedQuAD Dataset Ingestion (lavita/MedQuAD)")
    logger.info("=" * 60)

    # Initialize Qdrant
    logger.info("Connecting to Qdrant...")
    client = get_qdrant_client()

    if not init_collection(client):
        logger.error("Failed to initialize collection. Exiting.")
        return 1

    # Load embedding model
    logger.info("Loading embedding model: all-MiniLM-L6-v2")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Load dataset from HuggingFace
    logger.info("Loading dataset: %s", DATASET_NAME)
    try:
        dataset = load_dataset(DATASET_NAME, split="train")
        total_records = len(dataset)
        logger.info("Loaded %d records", total_records)
    except Exception as e:
        logger.error("Failed to load dataset: %s", e)
        return 1

    # Process in batches
    logger.info("Processing in batches of %d...", BATCH_SIZE)
    total_processed = 0
    total_success = 0
    total_skipped_empty = 0
    failed_batches = []

    batch = []
    for i, item in enumerate(dataset):
        batch.append(item)

        if len(batch) >= BATCH_SIZE:
            for attempt in range(3):
                try:
                    success, skipped = process_batch(client, model, batch)
                    total_success += success
                    total_skipped_empty += skipped
                    total_processed += len(batch)

                    if total_processed % 1000 == 0:
                        logger.info("Progress: %d/%d (%.1f%%)",
                                   total_processed, total_records,
                                   100 * total_processed / total_records)
                    
                    batch = [] # Clear on success
                    break # Success, exit retry loop
                    
                except Exception as e:
                    if attempt < 2:
                        wait = 2 ** attempt
                        logger.warning(f"Batch failed (attempt {attempt+1}/3). Retrying in {wait}s: {e}")
                        time.sleep(wait)
                    else:
                        logger.error(f"Batch failed permanently after 3 attempts: {e}")
                        failed_batches.append(list(batch))
                        batch = [] # Clear so we can proceed, but data is saved in failed_batches

    # Process remaining
    if batch:
        try:
            success, skipped = process_batch(client, model, batch)
            total_success += success
            total_skipped_empty += skipped
            total_processed += len(batch)
        except Exception as e:
            logger.error("Final batch error: %s", e)

    # Summary
    logger.info("=" * 60)
    logger.info("Ingestion Complete")
    logger.info("  Total records: %d", total_records)
    logger.info("  Processed: %d", total_processed)
    logger.info("  Successful: %d", total_success)
    logger.info("  Skipped (Empty Q/A): %d", total_skipped_empty)
    logger.info("  Failed Batches: %d (Records lost: %d)", len(failed_batches), len(failed_batches) * BATCH_SIZE)
    logger.info("=" * 60)

    # Persist failed batches
    if failed_batches:
        import json
        dump_file = "failed_batches_medquad.json"
        try:
            with open(dump_file, "w") as f:
                json.dump(failed_batches, f)
            logger.error(f"Saved {len(failed_batches)} failed batches to {dump_file}")
        except Exception as e:
            logger.error(f"Failed to save debug dump: {e}")

    # Verify collection
    info = client.get_collection(COLLECTION_NAME)
    logger.info("Collection '%s': %d points", COLLECTION_NAME, info.points_count)

    return 0


if __name__ == "__main__":
    sys.exit(main())
