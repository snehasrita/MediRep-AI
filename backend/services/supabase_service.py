import logging
import threading
from typing import Optional

from supabase import create_client, Client, ClientOptions

from config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)


class SupabaseService:
    """Thread-safe singleton for Supabase client."""
    
    _client: Optional[Client] = None
    _lock: threading.Lock = threading.Lock()
    _init_attempted: bool = False
    
    @classmethod
    def get_client(cls) -> Optional[Client]:
        """Get the Supabase client singleton with double-checked locking.
        
        Only attempts initialization once to avoid repeated logging.
        """
        if cls._client is not None:
            return cls._client
        
        # Fast path: already attempted and failed
        if cls._init_attempted:
            return None
        
        with cls._lock:
            # Double-check after acquiring lock
            if cls._client is not None:
                return cls._client
            
            if cls._init_attempted:
                return None
            
            cls._init_attempted = True
            
            if not SUPABASE_URL or not SUPABASE_KEY:
                logger.warning("Supabase credentials not configured")
                return None
            
            try:
                cls._client = create_client(SUPABASE_URL, SUPABASE_KEY)
                logger.info("Supabase client initialized")
                return cls._client
            except Exception as e:
                logger.error("Failed to initialize Supabase: %s", e)
                return None

    @staticmethod
    def get_auth_client(token: str) -> Client:
        """Create a client authenticated with the user's token (Required for RLS)."""
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("Supabase credentials missing")
        
        # Explicitly set the Authorization header to ensure RLS context is passed
        # Explicitly set the Authorization header to ensure RLS context is passed
        client = create_client(
            SUPABASE_URL, 
            SUPABASE_KEY, 
            options=ClientOptions(headers={"Authorization": f"Bearer {token}"})
        )
        # Redundant safety: ensure postgrest library has the token
        client.postgrest.auth(token)
        return client

    @staticmethod
    def get_service_client() -> Optional[Client]:
        """Create a client with the Service Role Key (Admin privileges)."""
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            logger.warning("Supabase Service Role Key not configured")
            return None
        
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
