"""
Turso Service - SQLite edge database for drug data.

Architecture:
- Turso stores all drug records (name, generic, price, side_effects, etc.)
- Fast text search via SQLite indexes
- No embeddings stored here (those go to Qdrant)
"""
import logging
import threading
from typing import Optional, List, Dict, Any
import libsql_client as libsql

from config import TURSO_DATABASE_URL, TURSO_AUTH_TOKEN

logger = logging.getLogger(__name__)

# Connection singleton with thread-safe initialization
_connection = None
_connection_lock = threading.Lock()
_init_attempted = False


def get_connection():
    """Get or create Turso database connection (thread-safe)."""
    global _connection, _init_attempted

    if _connection is not None:
        return _connection

    if _init_attempted:
        return None

    with _connection_lock:
        if _connection is not None:
            return _connection

        if _init_attempted:
            return None

        _init_attempted = True

        if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
            logger.warning("Turso not configured")
            return None

        try:
            # Force HTTPS instead of WSS/LibSQL to avoid protocol errors (505)
            url = TURSO_DATABASE_URL.replace("wss://", "https://").replace("libsql://", "https://")
            
            logger.info("Initializing Turso client with URL: %s", url)

            _connection = libsql.create_client_sync(
                url=url,
                auth_token=TURSO_AUTH_TOKEN
            )
            logger.info("Connected to Turso database")
            return _connection
        except Exception as e:
            logger.error("Failed to connect to Turso: %s", e)
            return None


def init_schema():
    """Initialize the drug table schema in Turso."""
    conn = get_connection()
    if not conn:
        return False
    
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS drugs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                generic_name TEXT,
                manufacturer TEXT,
                price_raw TEXT,
                price REAL,
                pack_size TEXT,
                is_discontinued INTEGER DEFAULT 0,
                therapeutic_class TEXT,
                action_class TEXT,
                side_effects TEXT,
                description TEXT,
                substitutes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for fast search
        conn.execute("CREATE INDEX IF NOT EXISTS idx_drugs_name ON drugs(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_drugs_generic ON drugs(generic_name)")
        
        # conn.commit() # Removed as libsql-client works differently
        logger.info("Turso schema initialized")
        return True
    except Exception as e:
        logger.error("Failed to init Turso schema: %s", e)
        return False


def search_drugs(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Search drugs by name or generic name with improved matching."""
    conn = get_connection()
    if not conn:
        return []
    
    try:
        results = []
        seen_ids = set()
        
        # Clean the query - remove spaces between brand and strength
        query_clean = query.strip()
        
        # Strategy 1: Direct LIKE search (prefer names starting with query)
        rs = conn.execute(
            """
            SELECT id, name, generic_name, manufacturer, price_raw, description
            FROM drugs
            WHERE name LIKE ? OR generic_name LIKE ?
            ORDER BY
                CASE WHEN LOWER(name) LIKE LOWER(? || '%') THEN 0 ELSE 1 END,
                LENGTH(name)
            LIMIT ?
            """,
            (f"%{query_clean}%", f"%{query_clean}%", query_clean, limit)
        )
        
        for row in rs.rows:
            if row[0] not in seen_ids:
                seen_ids.add(row[0])
                results.append({
                    "id": row[0],
                    "name": row[1],
                    "generic_name": row[2],
                    "manufacturer": row[3],
                    "price_raw": row[4],
                    "description": row[5]
                })
        
        # Strategy 2: If query has spaces, search for first word (brand name)
        if len(results) < limit and ' ' in query_clean:
            parts = query_clean.split()
            brand_name = parts[0]  # e.g., "DOLO" from "DOLO 650"
            
            rs = conn.execute(
                """
                SELECT id, name, generic_name, manufacturer, price_raw, description
                FROM drugs
                WHERE name LIKE ?
                LIMIT ?
                """,
                (f"{brand_name}%", limit - len(results))
            )
            
            for row in rs.rows:
                if row[0] not in seen_ids:
                    seen_ids.add(row[0])
                    results.append({
                        "id": row[0],
                        "name": row[1],
                        "generic_name": row[2],
                        "manufacturer": row[3],
                        "price_raw": row[4],
                        "description": row[5]
                    })
        
        # Strategy 3: Search without spaces (e.g., "DOLO650" for "DOLO 650")
        if len(results) < limit:
            no_space_query = query_clean.replace(" ", "")
            rs = conn.execute(
                """
                SELECT id, name, generic_name, manufacturer, price_raw, description
                FROM drugs
                WHERE REPLACE(LOWER(name), ' ', '') LIKE LOWER(?)
                LIMIT ?
                """,
                (f"%{no_space_query}%", limit - len(results))
            )
            
            for row in rs.rows:
                if row[0] not in seen_ids:
                    seen_ids.add(row[0])
                    results.append({
                        "id": row[0],
                        "name": row[1],
                        "generic_name": row[2],
                        "manufacturer": row[3],
                        "price_raw": row[4],
                        "description": row[5]
                    })
        
        logger.info(f"Search '{query}' returned {len(results)} results")
        return results[:limit]
        
    except Exception as e:
        logger.error("Turso search failed: %s", e)
        return []


def get_drug_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Get a single drug by exact name match."""
    conn = get_connection()
    if not conn:
        return None
    
    try:
        rs = conn.execute(
            """
            SELECT id, name, generic_name, manufacturer, price_raw, price,
                   pack_size, is_discontinued, therapeutic_class, action_class,
                   side_effects, description, substitutes
            FROM drugs
            WHERE LOWER(name) = LOWER(?)
            LIMIT 1
            """,
            (name,)
        )
        
        if not rs.rows:
            return None
            
        row = rs.rows[0]
        
        return {
            "id": row[0],
            "name": row[1],
            "generic_name": row[2],
            "manufacturer": row[3],
            "price_raw": row[4],
            "price": row[5],
            "pack_size": row[6],
            "is_discontinued": bool(row[7]),
            "therapeutic_class": row[8],
            "action_class": row[9],
            "side_effects": row[10],
            "description": row[11],
            "substitutes": row[12].split(",") if row[12] else []
        }
    except Exception as e:
        logger.error("Turso get_drug_by_name failed: %s", e)
        return None


def get_drugs_by_ids(drug_ids: List[str]) -> List[Dict[str, Any]]:
    """Get multiple drugs by their IDs (used after Qdrant vector search)."""
    conn = get_connection()
    if not conn or not drug_ids:
        return []
    
    try:
        placeholders = ",".join(["?" for _ in drug_ids])
        rs = conn.execute(
            f"""
            SELECT id, name, generic_name, manufacturer, price_raw, description
            FROM drugs
            WHERE id IN ({placeholders})
            """,
            drug_ids
        )
        
        rows = rs.rows
        return [
            {
                "id": row[0],
                "name": row[1],
                "generic_name": row[2],
                "manufacturer": row[3],
                "price_raw": row[4],
                "description": row[5]
            }
            for row in rows
        ]
    except Exception as e:
        logger.error("Turso get_drugs_by_ids failed: %s", e)
        return []


def find_cheaper_substitutes(drug_name: str) -> List[Dict[str, Any]]:
    """Find cheaper drugs with the same generic name."""
    conn = get_connection()
    if not conn:
        return []
    
    try:
        # First, get the drug's generic name and price
        current = get_drug_by_name(drug_name)
        if not current or not current.get("generic_name") or not current.get("price"):
            return []
        
        rs = conn.execute(
            """
            SELECT id, name, generic_name, manufacturer, price_raw, price
            FROM drugs
            WHERE LOWER(generic_name) = LOWER(?)
              AND price < ?
              AND price IS NOT NULL
            ORDER BY price ASC
            LIMIT 10
            """,
            (current["generic_name"], current["price"])
        )
        
        rows = rs.rows
        return [
            {
                "id": row[0],
                "name": row[1],
                "generic_name": row[2],
                "manufacturer": row[3],
                "price_raw": row[4],
                "price": row[5]
            }
            for row in rows
        ]
    except Exception as e:
        logger.error("Turso find_cheaper_substitutes failed: %s", e)
        return []
