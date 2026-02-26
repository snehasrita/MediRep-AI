"""
FULL Re-Vectorization Job for indian_drugs table.

Creates FRESH embeddings for ALL records, replacing existing ones.
Uses bulk processing and concurrent updates for speed.
"""
import asyncio
import logging
import os
import time
from typing import List
from dotenv import load_dotenv
from supabase import create_client, Client
from sentence_transformers import SentenceTransformer
import concurrent.futures

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants - TUNED FOR SPEED
BATCH_SIZE = 200  # Records per batch
CONCURRENT_UPDATES = 10  # Parallel update workers
TABLE_NAME = "indian_drugs"
MODEL_NAME = "all-MiniLM-L6-v2"  # 384 dimensions

# Set to 0 to start from beginning, or set higher to resume
START_OFFSET = 0


def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
    return create_client(url, key)


def update_single_record(supabase: Client, record_id: str, embedding: list) -> bool:
    """Update a single record with its embedding."""
    try:
        supabase.table(TABLE_NAME).update({"embedding": embedding}).eq("id", record_id).execute()
        return True
    except Exception as e:
        # Log error details for diagnosis while keeping flow
        logger.debug(
            f"Failed to update record_id={record_id} in table={TABLE_NAME}: "
            f"{type(e).__name__}: {e}"
        )
        return False


def vectorize_all_drugs():
    """Synchronous vectorization job - uses blocking I/O."""
    logger.info("🔄 Starting FULL RE-VECTORIZATION (replacing all embeddings)...")
    
    try:
        supabase = get_supabase()
        
        # Initialize model
        logger.info(f"Loading embedding model: {MODEL_NAME}")
        model = SentenceTransformer(MODEL_NAME)
        
        offset = START_OFFSET
        total_processed = 0
        total_success = 0
        consecutive_errors = 0
        
        while True:
            try:
                # Fetch ALL records using pagination (no null filter)
                response = supabase.table(TABLE_NAME)\
                    .select("id, name, description, generic_name")\
                    .range(offset, offset + BATCH_SIZE - 1)\
                    .execute()
                
                records = response.data
                
                if not records:
                    logger.info("✅ Reached end of table. Job complete!")
                    break
                
                batch_start = time.time()
                
                # Prepare text for embedding
                texts_to_embed = []
                for record in records:
                    text_parts = [f"Drug Name: {record['name']}"]
                    if record.get('generic_name'):
                        text_parts.append(f"Generic: {record['generic_name']}")
                    if record.get('description'):
                        text_parts.append(f"Description: {record['description']}")
                    texts_to_embed.append(". ".join(text_parts))
                
                # Generate embeddings (batch operation - fast)
                embeddings = model.encode(texts_to_embed)
                
                # Update records using thread pool for concurrency
                success_count = 0
                
                with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_UPDATES) as executor:
                    futures = []
                    for record, embedding in zip(records, embeddings):
                        futures.append(
                            executor.submit(
                                update_single_record,
                                supabase,
                                record['id'],
                                embedding.tolist()
                            )
                        )
                    
                    # Wait for all updates to complete
                    for future in concurrent.futures.as_completed(futures):
                        if future.result():
                            success_count += 1
                
                batch_time = time.time() - batch_start
                total_processed += len(records)
                total_success += success_count
                offset += BATCH_SIZE
                
                # Calculate progress
                progress_pct = (offset / 250000) * 100  # Approximate total
                
                logger.info(
                    f"📊 Batch: {success_count}/{len(records)} ok | "
                    f"Total: {total_success:,}/{total_processed:,} | "
                    f"~{progress_pct:.1f}% | "
                    f"{batch_time:.1f}s/batch"
                )
                consecutive_errors = 0
            
            except Exception as e:
                logger.error(f"❌ Batch error at offset {offset}: {e}")
                consecutive_errors += 1
                if consecutive_errors > 10:
                    logger.critical("Too many consecutive errors. Aborting.")
                    logger.info(f"💾 Resume from offset: {offset}")
                    break
                time.sleep(3)  # Brief backoff
            
            # Small delay between batches
            time.sleep(0.2)
        
        # Safe logging with ZeroDivisionError protection
        if total_processed > 0:
            success_rate = (total_success / total_processed) * 100
            logger.info(f"🎉 DONE! Processed {total_processed:,} records, {total_success:,} successful.")
            logger.info(f"📈 Success rate: {success_rate:.1f}%")
        else:
            logger.info("⚠️ DONE! No records processed - table may be empty or offset too high.")
                
    except Exception as e:
        logger.error(f"Vectorization job failed: {e}")

if __name__ == "__main__":
    vectorize_all_drugs()
