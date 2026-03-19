"""Beacon configuration: environment loading and depth settings."""
import os
from dataclasses import dataclass

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Constants used by other modules
# ---------------------------------------------------------------------------
EVAL_SEMAPHORE_LIMIT = 10
EXTRACT_SEMAPHORE_LIMIT = 5
EVAL_MODEL = "claude-sonnet-4-6"
SYNTH_MODEL = "claude-opus-4-6"
EVAL_TIMEOUT = 30
SYNTH_TIMEOUT = 120
EVAL_MAX_TOKENS = 512
CONTENT_MIN_LENGTH = 200
CONTENT_MAX_LENGTH = 8000

# ---------------------------------------------------------------------------
# Depth settings lookup
# ---------------------------------------------------------------------------
_DEPTH_SETTINGS: dict[str, dict] = {
    "quick": {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3},
    "standard": {"max_results": 20, "num_queries": 1, "deep_read_top_n": 7},
    "deep": {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10},
}


@dataclass(frozen=True)
class Config:
    """Application configuration loaded from environment variables."""
    anthropic_api_key: str
    tavily_api_key: str


def get_config() -> Config:
    """Load configuration from environment variables.

    Calls ``load_dotenv()`` so a local ``.env`` file is picked up
    automatically without overriding existing env vars.

    Raises ``ValueError`` if a required key is missing or empty.
    """
    load_dotenv()

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    tavily_key = os.environ.get("TAVILY_API_KEY", "").strip()

    if not anthropic_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is required")
    if not tavily_key:
        raise ValueError("TAVILY_API_KEY environment variable is required")

    return Config(anthropic_api_key=anthropic_key, tavily_api_key=tavily_key)


def get_depth_settings(depth: str) -> dict:
    """Return search parameters for the given research depth.

    Args:
        depth: One of ``"quick"``, ``"standard"``, ``"deep"``.

    Returns:
        Dict with keys ``max_results``, ``num_queries``, ``deep_read_top_n``.

    Raises:
        ValueError: If *depth* is not a recognized level.
    """
    if depth not in _DEPTH_SETTINGS:
        raise ValueError(
            f"Unknown depth {depth!r}. Choose from: {', '.join(_DEPTH_SETTINGS)}"
        )
    return _DEPTH_SETTINGS[depth].copy()
