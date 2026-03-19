"""In-memory session store with TTL and background cleanup."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from beacon.models import ResearchResult

logger = logging.getLogger(__name__)


class SessionStore:
    """In-memory session store with TTL and background cleanup.

    Stores ResearchResult objects indexed by session_id (UUID4).
    Implements lazy expiration on access + periodic background sweep.

    Attributes:
        _sessions: dict mapping session_id to ResearchResult
        _timestamps: dict mapping session_id to last-access datetime (UTC)
        _lock: asyncio.Lock protecting check-then-act sequences
        _ttl: timedelta for session expiration (default 60 minutes)
        _max_sessions: upper bound on stored sessions (default 1000)
    """

    def __init__(self, ttl_seconds: int = 3600, max_sessions: int = 1000) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._max_sessions = max_sessions
        self._sessions: dict[str, ResearchResult] = {}
        self._timestamps: dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    async def store(self, session_id: str, result: ResearchResult) -> None:
        """Store a research result.

        If the store is at capacity (max_sessions), evicts the oldest session
        (the one with the earliest timestamp) before inserting the new one.
        """
        async with self._lock:
            if session_id not in self._sessions and len(self._sessions) >= self._max_sessions:
                oldest = min(self._timestamps, key=self._timestamps.get)  # type: ignore[arg-type]
                del self._sessions[oldest]
                del self._timestamps[oldest]
            self._sessions[session_id] = result
            self._timestamps[session_id] = datetime.now(timezone.utc)

    async def get(self, session_id: str) -> ResearchResult | None:
        """Retrieve a research result by session_id.

        Returns None if the session_id is not found or has expired.
        Expired sessions are removed (lazy cleanup). Valid sessions
        get their timestamp refreshed (sliding window TTL).
        """
        async with self._lock:
            if session_id not in self._sessions:
                return None
            elapsed = datetime.now(timezone.utc) - self._timestamps[session_id]
            if elapsed > self._ttl:
                del self._sessions[session_id]
                del self._timestamps[session_id]
                return None
            self._timestamps[session_id] = datetime.now(timezone.utc)
            return self._sessions[session_id]

    async def cleanup_expired(self) -> int:
        """Remove all expired sessions from the store.

        Returns the count of removed sessions.
        """
        async with self._lock:
            now = datetime.now(timezone.utc)
            expired = [
                sid
                for sid, ts in self._timestamps.items()
                if now - ts > self._ttl
            ]
            for sid in expired:
                del self._sessions[sid]
                del self._timestamps[sid]
            return len(expired)


async def run_cleanup_loop(store: SessionStore, interval_seconds: int = 60) -> None:
    """Periodically run cleanup_expired() on the session store.

    Runs in an infinite loop, sleeping for interval_seconds between sweeps.
    Designed to be started as an asyncio.Task and cancelled on shutdown.
    """
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await store.cleanup_expired()
        except Exception:
            logger.warning("Session cleanup failed", exc_info=True)
