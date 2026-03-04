# Section 03: Session Management (sessions.py)

## Overview

This section implements the in-memory `SessionStore` class that holds completed `ResearchResult` objects for later export. The store is backed by a plain `dict` and protected by an `asyncio.Lock` for safe concurrent access. It supports sliding-window TTL (time-to-live), capacity limits with oldest-entry eviction, and a periodic background cleanup coroutine.

**Files to create:**
- `C:\git_repos\playground\hackathon\02-api-streaming\server\sessions.py`
- `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_sessions.py`

**Dependencies (from other sections -- do not implement here):**
- Section 01 (Foundation) must be complete: `pyproject.toml`, directory structure, `conftest.py` with the `session_store` fixture and `sample_research_result` fixture.
- The `ResearchResult` model is imported from the pipeline package: `from beacon.models import ResearchResult`.

---

## Tests First: `tests/test_sessions.py`

All tests go in `C:\git_repos\playground\hackathon\02-api-streaming\tests\test_sessions.py`. The project uses `asyncio_mode = "auto"` in `pyproject.toml`, so no `@pytest.mark.asyncio` decorators are needed -- all `async def` test functions run automatically as async.

The tests import the `SessionStore` class from `server.sessions` and use the `session_store` and `sample_research_result` fixtures defined in `conftest.py` (Section 01). The `session_store` fixture provides a `SessionStore` with a short TTL (e.g., 2 seconds) and small `max_sessions` (e.g., 3) for fast testing.

### Basic CRUD Tests

```python
# Test: store() saves a ResearchResult retrievable by session_id
async def test_store_and_retrieve(session_store, sample_research_result):
    """store() saves a result, get() returns it by session_id."""

# Test: get() returns None for unknown session_id
async def test_get_unknown_session_returns_none(session_store):
    """get() returns None when the session_id does not exist in the store."""

# Test: get() returns stored result for known session_id
async def test_get_returns_stored_result(session_store, sample_research_result):
    """get() returns the exact ResearchResult that was stored."""

# Test: get() updates timestamp on access (sliding window)
async def test_get_updates_timestamp(session_store, sample_research_result):
    """Accessing a session via get() refreshes its timestamp, extending its TTL."""
```

### Expiration Tests

```python
# Test: get() returns None for expired session (TTL exceeded)
async def test_get_returns_none_for_expired_session(session_store, sample_research_result):
    """After TTL elapses without access, get() returns None."""
    # Store, then sleep longer than TTL, then get() should return None.

# Test: get() removes expired session from store
async def test_get_removes_expired_session(session_store, sample_research_result):
    """An expired session is deleted from internal state on access."""

# Test: session not expired when accessed within TTL
async def test_session_not_expired_within_ttl(session_store, sample_research_result):
    """Session remains accessible when accessed before TTL expires."""

# Test: sliding window TTL resets on access
async def test_sliding_window_ttl_resets(session_store, sample_research_result):
    """Accessing a session resets the TTL clock, so it survives longer than the original TTL
    if accessed periodically."""
```

### Cleanup Tests

```python
# Test: cleanup_expired() removes all expired sessions
async def test_cleanup_removes_expired(session_store, sample_research_result):
    """cleanup_expired() sweeps and removes sessions past their TTL."""

# Test: cleanup_expired() does not remove non-expired sessions
async def test_cleanup_keeps_non_expired(session_store, sample_research_result):
    """cleanup_expired() leaves sessions that are still within TTL."""

# Test: cleanup_expired() returns count of removed sessions
async def test_cleanup_returns_removed_count(session_store, sample_research_result):
    """Return value is the integer count of sessions that were evicted."""

# Test: cleanup_expired() handles empty store
async def test_cleanup_empty_store(session_store):
    """cleanup_expired() returns 0 and does not raise on an empty store."""
```

### Capacity Tests

```python
# Test: store() evicts oldest session when max_sessions reached
async def test_store_evicts_oldest_when_full(session_store, sample_research_result):
    """When max_sessions is reached, the oldest session (by timestamp) is removed
    to make room for the new one."""

# Test: eviction removes the session with the oldest timestamp
async def test_eviction_targets_oldest_timestamp(session_store, sample_research_result):
    """Among multiple sessions, the one with the earliest stored/accessed timestamp
    is the one evicted."""

# Test: store() succeeds after eviction (count stays at max)
async def test_store_succeeds_after_eviction(session_store, sample_research_result):
    """After evicting, the new session is stored and the total count equals max_sessions."""
```

### Concurrency Tests

```python
# Test: concurrent store() calls don't corrupt state
async def test_concurrent_stores(sample_research_result):
    """Multiple simultaneous store() calls via asyncio.gather() produce
    the expected number of sessions without data corruption."""

# Test: concurrent get() and cleanup_expired() don't raise
async def test_concurrent_get_and_cleanup(sample_research_result):
    """Simultaneous get() and cleanup_expired() calls don't deadlock or raise exceptions."""
```

---

## Implementation: `server/sessions.py`

File path: `C:\git_repos\playground\hackathon\02-api-streaming\server\sessions.py`

### Class: SessionStore

The `SessionStore` is the central in-memory store for completed research results. It allows the SSE streaming layer to store a `ResearchResult` when a pipeline run completes, and the export route to retrieve it later by `session_id`.

#### Constructor

```python
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

    def __init__(self, ttl_seconds: int = 3600, max_sessions: int = 1000): ...
```

- `ttl_seconds` defaults to 3600 (60 minutes). Convert to `timedelta` and store as `_ttl`.
- `max_sessions` defaults to 1000. Store as `_max_sessions`.
- Initialize `_sessions` as an empty `dict[str, ResearchResult]`.
- Initialize `_timestamps` as an empty `dict[str, datetime]`.
- Initialize `_lock` as a new `asyncio.Lock()`.

Use `from datetime import datetime, timedelta, timezone` and always use `datetime.now(timezone.utc)` for timestamp operations.

#### store() Method

```python
async def store(self, session_id: str, result: ResearchResult) -> None:
    """Store a research result.

    If the store is at capacity (max_sessions), evicts the oldest session
    (the one with the earliest timestamp) before inserting the new one.

    Acquires the internal lock to ensure atomicity of the check-and-evict
    sequence.
    """
```

Logic under the lock:
1. Check if `len(self._sessions) >= self._max_sessions`.
2. If at capacity, find the session_id with the minimum value in `_timestamps` using `min(self._timestamps, key=self._timestamps.get)`.
3. Delete that session_id from both `_sessions` and `_timestamps`.
4. Store the new result: `self._sessions[session_id] = result`.
5. Record the timestamp: `self._timestamps[session_id] = datetime.now(timezone.utc)`.

#### get() Method

```python
async def get(self, session_id: str) -> ResearchResult | None:
    """Retrieve a research result by session_id.

    Returns None if:
    - The session_id is not found
    - The session has expired (current time - stored timestamp > TTL)

    If the session is expired, it is removed from the store (lazy cleanup).
    If the session is valid, its timestamp is updated (sliding window TTL).

    Acquires the internal lock to ensure atomicity.
    """
```

Logic under the lock:
1. If `session_id not in self._sessions`, return `None`.
2. Compute `elapsed = datetime.now(timezone.utc) - self._timestamps[session_id]`.
3. If `elapsed > self._ttl`, delete from both dicts, return `None` (lazy expiration).
4. Otherwise, update `self._timestamps[session_id] = datetime.now(timezone.utc)` (sliding window).
5. Return `self._sessions[session_id]`.

#### cleanup_expired() Method

```python
async def cleanup_expired(self) -> int:
    """Remove all expired sessions from the store.

    Scans all sessions and removes any where the time since last access
    exceeds the TTL. Returns the count of removed sessions.

    Called periodically by the background cleanup task.
    Acquires the internal lock for the duration of the scan.
    """
```

Logic under the lock:
1. Compute `now = datetime.now(timezone.utc)`.
2. Build a list of expired session_ids: `[sid for sid, ts in self._timestamps.items() if now - ts > self._ttl]`.
3. Delete each expired session_id from both `_sessions` and `_timestamps`.
4. Return the length of the expired list.

Building the list of expired IDs before deleting avoids modifying the dict during iteration.

### Background Cleanup Coroutine

This is a standalone async function (not a method on `SessionStore`) that runs the cleanup loop. It is started as a background `asyncio.Task` in the app's lifespan (implemented in Section 06).

```python
async def run_cleanup_loop(store: SessionStore, interval_seconds: int = 60) -> None:
    """Periodically run cleanup_expired() on the session store.

    Runs in an infinite loop, sleeping for interval_seconds between sweeps.
    Wraps cleanup_expired() in try/except to prevent the task from dying
    on unexpected errors. Designed to be started as an asyncio.Task and
    cancelled on shutdown.
    """
```

Logic:
1. `while True:`
2. `await asyncio.sleep(interval_seconds)`
3. Inside a `try/except Exception`, call `await store.cleanup_expired()`.
4. On exception, log a warning (use `logging.getLogger(__name__)`), but continue the loop.

The sleep-first pattern means the first cleanup runs after `interval_seconds`, not immediately at startup.

---

## Key Design Decisions

**Why asyncio.Lock?** The `get()` method performs a check-then-act sequence (check if expired, then delete or update timestamp). Without a lock, concurrent coroutines could read stale state. Similarly, `store()` performs a check-then-evict-then-insert sequence. Since this is single-process asyncio (not multi-threaded), `asyncio.Lock` is sufficient and appropriate.

**Sliding-window TTL:** Each successful `get()` call refreshes the timestamp, so a session stays alive as long as it is being accessed. This is preferable to a fixed TTL because users may take time between viewing results and clicking "Export."

**Eviction strategy:** When the store is full, the oldest session (by last-access timestamp) is evicted. This is a simple LRU-like policy implemented by finding `min()` over the timestamps dict. For the default `max_sessions=1000`, this linear scan is negligible.

**No persistence:** This is an MVP with a single uvicorn worker. Sessions are lost on server restart. This is acceptable for the hackathon scope.

---

## Testing Notes

- The `session_store` fixture from `conftest.py` (Section 01) should create a `SessionStore(ttl_seconds=2, max_sessions=3)` -- a short TTL and small capacity so tests can verify expiration and eviction behavior without long waits.
- For expiration tests, use `asyncio.sleep()` to wait past the TTL. With a 2-second TTL, sleeping for 2.5 seconds is sufficient. Alternatively, to avoid slow tests, you can directly manipulate the `_timestamps` dict to simulate time passage (e.g., set a timestamp to `datetime.now(timezone.utc) - timedelta(seconds=10)`). The direct manipulation approach is faster and preferred.
- For the sliding window test, store a session, wait a portion of the TTL, access it (resetting the clock), wait another portion, then verify it is still accessible.
- For concurrency tests, use `asyncio.gather()` to run multiple store/get/cleanup calls simultaneously. Create a `SessionStore` with `max_sessions=100` for the concurrency test to avoid eviction noise. Assert that the final session count matches expectations and no exceptions were raised.
