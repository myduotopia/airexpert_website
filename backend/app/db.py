from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache
def get_supabase() -> Client:
    """Return a cached Supabase client.

    Uses the service-role key (settings.supabase_key), so it bypasses RLS —
    only use server-side. Raises if not configured.
    """
    if not settings.supabase_url or not settings.supabase_key:
        raise RuntimeError(
            "SUPABASE_URL / SUPABASE_KEY 未設定（請填入 backend/.env）"
        )
    return create_client(settings.supabase_url, settings.supabase_key)
