"""
Data Migration Job - Migrate 250k drugs from CSV to Turso + Qdrant.

Flow:
1. Read CSV file (A_Z_medicines_dataset_of_India.csv)
2. Insert drug data into Turso (SQLite)
3. Generate embeddings and insert into Qdrant

Run with: python jobs/migrate_drugs.py
"""
import os
import sys
import csv
import uuid
import logging
from typing import Optional
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Batch sizes
TURSO_BATCH_SIZE = 500
QDRANT_BATCH_SIZE = 100


def migrate_to_turso(csv_path: str) -> int:
    """Migrate drug data from CSV to Turso."""
    from services.turso_service import get_connection, init_schema
    
    logger.info("Initializing Turso schema...")
    if not init_schema():
        logger.error("Failed to init Turso schema")
        return 0
    
    conn = get_connection()
    if not conn:
        logger.error("Failed to connect to Turso")
        return 0
    
    count = 0
    batch = []
    
    logger.info(f"Reading CSV: {csv_path}")
    
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            drug_id = str(uuid.uuid4())
            
            # Parse price if available
            price = None
            price_raw = row.get('price(₹)', '') or row.get('Price', '')
            if price_raw:
                try:
                    # Remove currency symbol and parse
                    price = float(price_raw.replace('₹', '').replace(',', '').strip())
                except ValueError:
                    pass
            
            batch.append((
                drug_id,
                row.get('name', '') or row.get('Medicine Name', ''),
                row.get('salt_composition', '') or row.get('Composition', ''),
                row.get('manufacturer', '') or row.get('Manufacturer', ''),
                price_raw,
                price,
                row.get('pack_size', '') or row.get('Pack Size', ''),
                1 if row.get('Is_discontinued', '').lower() == 'true' else 0,
                row.get('type', '') or row.get('Type', ''),
                row.get('action_class', '') or row.get('Action Class', ''),
                row.get('side_effects', '') or row.get('Side Effects', ''),
                row.get('short_composition', '') or row.get('Uses', ''),
                ''  # substitutes - can be populated later
            ))
            
            if len(batch) >= TURSO_BATCH_SIZE:
                try:
                    conn.executemany(
                        """
                        INSERT OR REPLACE INTO drugs 
                        (id, name, generic_name, manufacturer, price_raw, price,
                         pack_size, is_discontinued, therapeutic_class, action_class,
                         side_effects, description, substitutes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        batch
                    )
                    conn.commit()
                    count += len(batch)
                    logger.info(f"Inserted {count} drugs into Turso")
                except Exception as e:
                    logger.error(f"Turso batch insert failed: {e}")
                
                batch = []
        
        # Insert remaining
        if batch:
            try:
                conn.executemany(
                    """
                    INSERT OR REPLACE INTO drugs 
                    (id, name, generic_name, manufacturer, price_raw, price,
                     pack_size, is_discontinued, therapeutic_class, action_class,
                     side_effects, description, substitutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    batch
                )
                conn.commit()
                count += len(batch)
            except Exception as e:
                logger.error(f"Turso final batch failed: {e}")
    
    logger.info(f"✅ Migrated {count} drugs to Turso")
    return count


def migrate_embeddings_to_qdrant() -> int:
    """Generate embeddings for drugs in Turso and insert into Qdrant."""
    from services.turso_service import get_connection
    from services.qdrant_service import get_client, init_collection, get_embedding_model
    from qdrant_client.http import models
    
    logger.info("Initializing Qdrant collection...")
    if not init_collection():
        logger.error("Failed to init Qdrant collection")
        return 0
    
    client = get_client()
    model = get_embedding_model()
    conn = get_connection()
    
    if not client or not model or not conn:
        logger.error("Failed to init services for embedding migration")
        return 0
    
    count = 0
    offset = 0
    
    while True:
        try:
            cursor = conn.execute(
                """
                SELECT id, name, generic_name, description
                FROM drugs
                LIMIT ? OFFSET ?
                """,
                (QDRANT_BATCH_SIZE, offset)
            )
            
            rows = cursor.fetchall()
            if not rows:
                break
            
            # Prepare batch
            points = []
            for row in rows:
                drug_id, name, generic_name, description = row
                
                # Create text for embedding
                text_parts = [f"Drug: {name}"]
                if generic_name:
                    text_parts.append(f"Generic: {generic_name}")
                if description:
                    text_parts.append(f"Uses: {description}")
                text = ". ".join(text_parts)
                
                # Generate embedding
                embedding = model.encode(text).tolist()
                
                points.append(
                    models.PointStruct(
                        id=hash(drug_id) % (2**63),
                        vector=embedding,
                        payload={
                            "drug_id": drug_id,
                            "drug_name": name
                        }
                    )
                )
            
            # Upsert to Qdrant
            client.upsert(
                collection_name="drug_embeddings",
                points=points
            )
            
            count += len(rows)
            offset += QDRANT_BATCH_SIZE
            
            logger.info(f"Embedded {count} drugs into Qdrant")
            
        except Exception as e:
            logger.error(f"Qdrant batch failed at offset {offset}: {e}")
            offset += QDRANT_BATCH_SIZE  # Skip problematic batch
    
    logger.info(f"✅ Migrated {count} embeddings to Qdrant")
    return count


def main():
    """Run the full migration."""
    # Find CSV file
    csv_paths = [
        "data/A_Z_medicines_dataset_of_India.csv",
        "data/medicines.csv",
        "A_Z_medicines_dataset_of_India.csv"
    ]
    
    csv_path = None
    for path in csv_paths:
        if os.path.exists(path):
            csv_path = path
            break
    
    if not csv_path:
        logger.error("CSV file not found. Please ensure drug data CSV is in the data/ directory.")
        logger.info(f"Looked in: {csv_paths}")
        return
    
    logger.info("=" * 60)
    logger.info("Starting Drug Data Migration")
    logger.info("=" * 60)
    
    # Step 1: Migrate to Turso
    turso_count = migrate_to_turso(csv_path)
    
    if turso_count == 0:
        logger.error("Turso migration failed. Aborting.")
        return
    
    # Step 2: Generate embeddings and insert into Qdrant
    qdrant_count = migrate_embeddings_to_qdrant()
    
    logger.info("=" * 60)
    logger.info("Migration Complete!")
    logger.info(f"  Turso: {turso_count} drugs")
    logger.info(f"  Qdrant: {qdrant_count} embeddings")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
