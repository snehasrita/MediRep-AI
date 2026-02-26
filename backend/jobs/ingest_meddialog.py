#!/usr/bin/env python3
"""
ChatDoctor Dataset Ingestion Script

Loads the lavita/ChatDoctor-HealthCareMagic-100k dataset from HuggingFace
and creates embeddings in Qdrant for semantic search.

Dataset: lavita/ChatDoctor-HealthCareMagic-100k
Collection: medical_qa
Structure:
  - input: Patient query
  - output: Doctor response
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
BATCH_SIZE = 200
DATASET_NAME = "lavita/ChatDoctor-HealthCareMagic-100k"
START_INDEX = 0 # Process all records

def get_qdrant_client() -> QdrantClient:
    """Create Qdrant client."""
    if not QDRANT_URL or not QDRANT_API_KEY:
        raise ValueError("QDRANT_URL and QDRANT_API_KEY must be set")
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def generate_point_id(unique_str: str) -> int:
    """Generate a stable integer ID."""
    hash_bytes = hashlib.md5(unique_str.encode()).digest()
    return int.from_bytes(hash_bytes[:8], byteorder='big') % (2**63)

def process_batch(
    client: QdrantClient,
    model: SentenceTransformer,
    batch: List[Dict[str, Any]]
) -> int:
    """Process a batch of dialogues and upsert."""
    points = []

    for item in batch:
        try:
            # Map columns
            question = item.get("input", "").strip()
            answer = item.get("output", "").strip()
            
            if not question or not answer:
                continue
            
            # Combine for embedding: Question + first 256 chars of Answer
            embed_text = f"{question} {answer[:256]}"
            embedding = model.encode(embed_text).tolist()
            
            # Generate ID from question content to avoid duplicates
            point_id = generate_point_id(question)
            
            points.append(models.PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "question": question[:1000],
                    "answer": answer[:2000], # Truncate for storage efficiency
                    "source": "chatdoctor",
                    "type": "qa"
                }
            ))
            
        except Exception as e:
            logger.warning(f"Skipping malformed record: {e}")
            continue

    if not points:
        return 0

    client.upsert(collection_name=COLLECTION_NAME, points=points)
    return len(points)

def main():
    logger.info("=" * 60)
    logger.info(f"ChatDoctor Ingestion ({DATASET_NAME})")
    logger.info("=" * 60)

    client = get_qdrant_client()
    model = SentenceTransformer("all-MiniLM-L6-v2")

    logger.info("Loading dataset...")
    try:
        dataset = load_dataset(DATASET_NAME, split="train")
        total_records = len(dataset)
        logger.info("Total records: %d", total_records)
        
        effective_total = total_records
        if START_INDEX > 0:
             logger.info("Skipping first %d records...", START_INDEX)
             dataset = dataset.select(range(START_INDEX, total_records))
             effective_total = total_records - START_INDEX
             logger.info("Effective records to process: %d", effective_total)
            
    except Exception as e:
        logger.error("Failed to load dataset: %s", e)
        return 1

    logger.info("Processing...")
    total_processed = 0
    total_success = 0
    failed_batches = []
    
    batch = []
    for item in dataset:
        batch.append(item)
        if len(batch) >= BATCH_SIZE:
            for attempt in range(3):
                try:
                    success = process_batch(client, model, batch)
                    total_success += success
                    total_processed += len(batch)
                    
                    if total_processed % 2000 == 0:
                        logger.info(f"Progress: {total_processed}/{effective_total} ({(total_processed/effective_total)*100:.1f}%)")
                    
                    batch = []
                    break
                except Exception as e:
                    if attempt < 2:
                        wait = 2 ** attempt
                        logger.warning(f"Batch failed (attempt {attempt+1}/3). Retrying in {wait}s: {e}")
                        time.sleep(wait)
                    else:
                        logger.error(f"Batch failed permanently after 3 attempts: {e}")
                        failed_batches.append(list(batch))
                        batch = []

    # Final batch
    if batch:
        try:
            success = process_batch(client, model, batch)
            total_success += success
            total_processed += len(batch)
        except Exception as e:
            logger.error(f"Final batch failed: {e}")
            total_processed += len(batch) # Count as processed even if failed

    logger.info("=" * 60)
    logger.info(f"Ingested {total_success} dialogues")
    logger.info("=" * 60)
    return 0

if __name__ == "__main__":
    main()
