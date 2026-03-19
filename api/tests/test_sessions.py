"""Tests for the in-memory SessionStore."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from server.sessions import SessionStore, run_cleanup_loop


# ─── Basic CRUD ───────────────────────────────────────────────


async def test_store_and_retrieve(session_store, sample_research_result):
    """store() saves a result, get() returns it by session_id."""
    await session_store.store("sess-1", sample_research_result)
    result = await session_store.get("sess-1")
    assert result is not None
    assert result.topic == sample_research_result.topic


async def test_get_unknown_session_returns_none(session_store):
    """get() returns None when the session_id does not exist in the store."""
    assert await session_store.get("nonexistent") is None


async def test_get_returns_stored_result(session_store, sample_research_result):
    """get() returns the exact ResearchResult that was stored."""
    await session_store.store("sess-1", sample_research_result)
    result = await session_store.get("sess-1")
    assert result == sample_research_result


async def test_get_updates_timestamp(session_store, sample_research_result):
    """Accessing a session via get() refreshes its timestamp, extending its TTL."""
    await session_store.store("sess-1", sample_research_result)
    ts_before = session_store._timestamps["sess-1"]
    await asyncio.sleep(0.05)
    await session_store.get("sess-1")
    ts_after = session_store._timestamps["sess-1"]
    assert ts_after > ts_before


# ─── Expiration ───────────────────────────────────────────────


async def test_get_returns_none_for_expired_session(session_store, sample_research_result):
    """After TTL elapses without access, get() returns None."""
    await session_store.store("sess-1", sample_research_result)
    # Backdate timestamp to simulate TTL expiry
    session_store._timestamps["sess-1"] = datetime.now(timezone.utc) - timedelta(seconds=10)
    assert await session_store.get("sess-1") is None


async def test_get_removes_expired_session(session_store, sample_research_result):
    """An expired session is deleted from internal state on access."""
    await session_store.store("sess-1", sample_research_result)
    session_store._timestamps["sess-1"] = datetime.now(timezone.utc) - timedelta(seconds=10)
    await session_store.get("sess-1")
    assert "sess-1" not in session_store._sessions
    assert "sess-1" not in session_store._timestamps


async def test_session_not_expired_within_ttl(session_store, sample_research_result):
    """Session remains accessible when accessed before TTL expires."""
    await session_store.store("sess-1", sample_research_result)
    result = await session_store.get("sess-1")
    assert result is not None


async def test_sliding_window_ttl_resets(session_store, sample_research_result):
    """Accessing a session resets the TTL clock."""
    await session_store.store("sess-1", sample_research_result)
    # Set timestamp to 1 second before expiry (TTL is 5s)
    almost_expired = datetime.now(timezone.utc) - timedelta(seconds=4)
    session_store._timestamps["sess-1"] = almost_expired
    # Access resets the clock
    result = await session_store.get("sess-1")
    assert result is not None
    # Now timestamp should be fresh — setting to almost-expired again should still work
    session_store._timestamps["sess-1"] = datetime.now(timezone.utc) - timedelta(seconds=4)
    result = await session_store.get("sess-1")
    assert result is not None


# ─── Cleanup ──────────────────────────────────────────────────


async def test_cleanup_removes_expired(session_store, sample_research_result):
    """cleanup_expired() sweeps and removes sessions past their TTL."""
    await session_store.store("sess-1", sample_research_result)
    session_store._timestamps["sess-1"] = datetime.now(timezone.utc) - timedelta(seconds=10)
    await session_store.cleanup_expired()
    assert "sess-1" not in session_store._sessions


async def test_cleanup_keeps_non_expired(session_store, sample_research_result):
    """cleanup_expired() leaves sessions that are still within TTL."""
    await session_store.store("sess-1", sample_research_result)
    await session_store.cleanup_expired()
    assert "sess-1" in session_store._sessions


async def test_cleanup_returns_removed_count(session_store, sample_research_result):
    """Return value is the integer count of sessions that were evicted."""
    await session_store.store("sess-1", sample_research_result)
    await session_store.store("sess-2", sample_research_result)
    session_store._timestamps["sess-1"] = datetime.now(timezone.utc) - timedelta(seconds=10)
    session_store._timestamps["sess-2"] = datetime.now(timezone.utc) - timedelta(seconds=10)
    removed = await session_store.cleanup_expired()
    assert removed == 2


async def test_cleanup_empty_store(session_store):
    """cleanup_expired() returns 0 and does not raise on an empty store."""
    removed = await session_store.cleanup_expired()
    assert removed == 0


# ─── Capacity / Eviction ─────────────────────────────────────


async def test_store_evicts_oldest_when_full(session_store, sample_research_result):
    """When max_sessions is reached, the oldest session is removed."""
    # max_sessions=3 in fixture
    now = datetime.now(timezone.utc)
    await session_store.store("s1", sample_research_result)
    session_store._timestamps["s1"] = now - timedelta(seconds=3)
    await session_store.store("s2", sample_research_result)
    session_store._timestamps["s2"] = now - timedelta(seconds=2)
    await session_store.store("s3", sample_research_result)
    session_store._timestamps["s3"] = now - timedelta(seconds=1)
    # This should evict s1 (oldest)
    await session_store.store("s4", sample_research_result)
    assert "s1" not in session_store._sessions
    assert "s4" in session_store._sessions


async def test_eviction_targets_oldest_timestamp(session_store, sample_research_result):
    """The session with the earliest timestamp is the one evicted."""
    await session_store.store("s1", sample_research_result)
    await session_store.store("s2", sample_research_result)
    await session_store.store("s3", sample_research_result)
    # Make s2 the oldest by backdating
    session_store._timestamps["s2"] = datetime.now(timezone.utc) - timedelta(seconds=100)
    await session_store.store("s4", sample_research_result)
    assert await session_store.get("s2") is None
    assert await session_store.get("s1") is not None
    assert await session_store.get("s3") is not None


async def test_store_succeeds_after_eviction(session_store, sample_research_result):
    """After evicting, the new session is stored and count equals max_sessions."""
    await session_store.store("s1", sample_research_result)
    await session_store.store("s2", sample_research_result)
    await session_store.store("s3", sample_research_result)
    await session_store.store("s4", sample_research_result)
    assert len(session_store._sessions) == 3
    assert "s4" in session_store._sessions


# ─── Concurrency ──────────────────────────────────────────────


async def test_concurrent_stores(sample_research_result):
    """Multiple simultaneous store() calls produce expected session count."""
    store = SessionStore(ttl_seconds=60, max_sessions=100)
    ids = [f"concurrent-{i}" for i in range(50)]
    await asyncio.gather(*(store.store(sid, sample_research_result) for sid in ids))
    assert len(store._sessions) == 50


async def test_concurrent_get_and_cleanup(sample_research_result):
    """Simultaneous get() and cleanup_expired() don't deadlock or raise."""
    store = SessionStore(ttl_seconds=60, max_sessions=100)
    ids = [f"concurrent-{i}" for i in range(20)]
    for sid in ids:
        await store.store(sid, sample_research_result)

    async def get_all():
        for sid in ids:
            await store.get(sid)

    # Run gets and cleanup concurrently
    await asyncio.gather(get_all(), store.cleanup_expired(), get_all())
    # All sessions should still be present (none expired)
    assert len(store._sessions) == 20


async def test_store_reuse_existing_id_no_eviction(session_store, sample_research_result):
    """Re-storing an existing session_id updates in-place without triggering eviction."""
    # max_sessions=3 in fixture
    await session_store.store("s1", sample_research_result)
    await session_store.store("s2", sample_research_result)
    await session_store.store("s3", sample_research_result)
    # Re-store s1 — should NOT evict anyone
    await session_store.store("s1", sample_research_result)
    assert len(session_store._sessions) == 3
    assert "s1" in session_store._sessions
    assert "s2" in session_store._sessions
    assert "s3" in session_store._sessions


# ─── run_cleanup_loop ─────────────────────────────────────────


async def test_cleanup_loop_calls_cleanup_expired(sample_research_result):
    """run_cleanup_loop calls cleanup_expired on each iteration."""
    store = SessionStore(ttl_seconds=60, max_sessions=100)
    await store.store("s1", sample_research_result)
    store._timestamps["s1"] = datetime.now(timezone.utc) - timedelta(seconds=120)

    task = asyncio.create_task(run_cleanup_loop(store, interval_seconds=0.05))
    await asyncio.sleep(0.15)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    # Expired session should have been cleaned up
    assert "s1" not in store._sessions


async def test_cleanup_loop_survives_exception():
    """run_cleanup_loop continues running after cleanup_expired raises."""
    store = SessionStore(ttl_seconds=60, max_sessions=100)
    call_count = 0
    original_cleanup = store.cleanup_expired

    async def failing_then_ok():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("simulated failure")
        return await original_cleanup()

    store.cleanup_expired = failing_then_ok  # type: ignore[assignment]

    task = asyncio.create_task(run_cleanup_loop(store, interval_seconds=0.05))
    await asyncio.sleep(0.2)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    # Should have been called multiple times despite the first failure
    assert call_count >= 2


async def test_cleanup_loop_sleeps_first():
    """run_cleanup_loop sleeps before the first cleanup (sleep-first pattern)."""
    store = SessionStore(ttl_seconds=60, max_sessions=100)
    cleaned = False
    original_cleanup = store.cleanup_expired

    async def track_cleanup():
        nonlocal cleaned
        cleaned = True
        return await original_cleanup()

    store.cleanup_expired = track_cleanup  # type: ignore[assignment]

    task = asyncio.create_task(run_cleanup_loop(store, interval_seconds=10))
    # Give a small window — cleanup should NOT have run yet
    await asyncio.sleep(0.05)
    assert not cleaned, "cleanup_expired should not run immediately (sleep-first)"
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
