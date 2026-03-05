# Section 01 -- Foundation: Project Scaffolding and Configuration

## Overview

This section creates the entire project skeleton for the Beacon Agent Pipeline. After completing this section, the project will have:

- A working `pyproject.toml` with all dependencies
- A `.env.example` documenting required environment variables
- The `beacon/` package directory with `__init__.py` and `config.py`
- The `tests/` directory with `conftest.py` containing all shared fixtures
- A passing test suite that validates configuration loading and depth settings

This is the foundation that every other section depends on. Nothing else can be implemented until this section is complete.

## Dependencies

None -- this is the first section with no prerequisites.

## Files to Create

```
01-agent-pipeline/
  beacon/
    __init__.py          # Empty package init
    config.py            # Environment config + depth settings
  tests/
    __init__.py          # Empty package init
    conftest.py          # Shared fixtures (mock clients, sample data)
    test_config.py       # Tests for config.py
  pyproject.toml         # Project metadata and dependencies
  .env.example           # Documented environment variable template
```

---

## Tests FIRST: `tests/test_config.py`

Write these tests before implementing `config.py`. They define the exact contract that config must fulfill.

```python
"""Tests for beacon.config -- write these FIRST."""
import os
import pytest
from unittest.mock import patch


class TestConfigLoading:
    """Test that config loads environment variables correctly."""

    def test_config_loads_anthropic_api_key_from_environment(self):
        """Config must read ANTHROPIC_API_KEY from os.environ."""
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-anthropic-key",
            "TAVILY_API_KEY": "test-tavily-key",
        }):
            from beacon.config import get_config
            config = get_config()
            assert config.anthropic_api_key == "test-anthropic-key"

    def test_config_loads_tavily_api_key_from_environment(self):
        """Config must read TAVILY_API_KEY from os.environ."""
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-anthropic-key",
            "TAVILY_API_KEY": "test-tavily-key",
        }):
            from beacon.config import get_config
            config = get_config()
            assert config.tavily_api_key == "test-tavily-key"

    def test_config_raises_on_missing_anthropic_key(self):
        """Config must raise ValueError when ANTHROPIC_API_KEY is missing."""
        with patch.dict(os.environ, {"TAVILY_API_KEY": "test"}, clear=True):
            from beacon.config import get_config
            with pytest.raises((ValueError, KeyError)):
                get_config()

    def test_config_raises_on_missing_tavily_key(self):
        """Config must raise ValueError when TAVILY_API_KEY is missing."""
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}, clear=True):
            from beacon.config import get_config
            with pytest.raises((ValueError, KeyError)):
                get_config()


class TestDepthSettings:
    """Test depth configuration values for each research depth level."""

    def test_quick_depth_settings(self):
        """Quick depth: max_results=10, num_queries=1, deep_read_top_n=3."""
        from beacon.config import get_depth_settings
        settings = get_depth_settings("quick")
        assert settings["max_results"] == 10
        assert settings["num_queries"] == 1
        assert settings["deep_read_top_n"] == 3

    def test_standard_depth_settings(self):
        """Standard depth: max_results=20, num_queries=1, deep_read_top_n=7."""
        from beacon.config import get_depth_settings
        settings = get_depth_settings("standard")
        assert settings["max_results"] == 20
        assert settings["num_queries"] == 1
        assert settings["deep_read_top_n"] == 7

    def test_deep_depth_settings(self):
        """Deep depth: max_results=20, num_queries=2, deep_read_top_n=10."""
        from beacon.config import get_depth_settings
        settings = get_depth_settings("deep")
        assert settings["max_results"] == 20
        assert settings["num_queries"] == 2
        assert settings["deep_read_top_n"] == 10

    def test_invalid_depth_raises_value_error(self):
        """An unrecognized depth string must raise ValueError."""
        from beacon.config import get_depth_settings
        with pytest.raises(ValueError):
            get_depth_settings("ultra")
```

---

## Tests FIRST: `tests/conftest.py`

Shared fixtures used by ALL test files across the project. Write this file now so that later sections can import these fixtures immediately.

```python
"""Shared test fixtures for the Beacon pipeline test suite."""
import pytest
from unittest.mock import AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_sources():
    """List of 5 Source objects for testing. Imports from beacon.models."""
    from beacon.models import Source
    return [
        Source(url="https://example.com/tutorial", title="Tutorial Guide", snippet="A comprehensive tutorial on the topic."),
        Source(url="https://example.com/paper", title="Research Paper", snippet="An academic paper exploring the fundamentals."),
        Source(url="https://example.com/docs", title="Official Documentation", snippet="The official docs for the framework."),
        Source(url="https://example.com/blog", title="Blog Post", snippet="A blog post with practical examples."),
        Source(url="https://example.com/forum", title="Forum Discussion", snippet="Community discussion with multiple perspectives."),
    ]


@pytest.fixture
def sample_intelligence_signals():
    """A single IntelligenceSignals instance with typical values."""
    from beacon.models import IntelligenceSignals
    return IntelligenceSignals(
        learning_efficiency_score=8,
        content_type="tutorial",
        time_estimate_minutes=15,
        recency="2025",
        key_insight="Comprehensive walkthrough of core concepts with practical examples.",
        coverage=["fundamentals", "best practices", "examples"],
        evaluation_failed=False,
    )


@pytest.fixture
def sample_evaluated_sources(sample_sources, sample_intelligence_signals):
    """List of 5 EvaluatedSource objects with signals attached."""
    from beacon.models import EvaluatedSource
    evaluated = []
    for i, src in enumerate(sample_sources):
        from beacon.models import IntelligenceSignals
        signals = IntelligenceSignals(
            learning_efficiency_score=10 - i * 2,  # 10, 8, 6, 4, 2
            content_type="tutorial",
            time_estimate_minutes=10 + i * 5,
            recency="2025",
            key_insight=f"Key insight for source {i + 1}.",
            coverage=["topic"],
            evaluation_failed=False,
        )
        evaluated.append(EvaluatedSource(
            url=src.url,
            title=src.title,
            snippet=src.snippet,
            signals=signals,
            deep_read_content=None,
            extraction_method=None,
        ))
    return evaluated


@pytest.fixture
def sample_deep_read_content():
    """Realistic markdown content string representing extracted page content."""
    return (
        "# Understanding the Topic\n\n"
        "This guide covers the fundamentals of the topic in depth.\n\n"
        "## Key Concepts\n\n"
        "- Concept A: The foundational building block.\n"
        "- Concept B: Builds on Concept A with additional patterns.\n"
        "- Concept C: Advanced technique for production use.\n\n"
        "## Best Practices\n\n"
        "1. Always start with a clear problem statement.\n"
        "2. Use iterative refinement to improve results.\n"
        "3. Test with diverse inputs to ensure robustness.\n\n"
        "## Conclusion\n\n"
        "By following these practices, you can effectively apply these concepts."
    )


# ---------------------------------------------------------------------------
# Mock client fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_anthropic_client():
    """Returns an AsyncMock mimicking the anthropic.AsyncAnthropic client.

    Pre-configured to return a valid JSON response from messages.create().
    Override the return value in individual tests as needed.
    """
    client = AsyncMock()
    mock_response = MagicMock()
    mock_response.content = [MagicMock()]
    mock_response.content[0].text = '{"learning_efficiency_score": 8, "content_type": "tutorial", "time_estimate_minutes": 15, "recency": "2025", "key_insight": "Great resource.", "coverage": ["topic"]}'
    client.messages.create = AsyncMock(return_value=mock_response)
    return client


@pytest.fixture
def mock_tavily_client():
    """Returns an AsyncMock mimicking the tavily.AsyncTavilyClient.

    Pre-configured with search() and extract() responses.
    Override in individual tests as needed.
    """
    client = AsyncMock()

    # Default search response
    client.search = AsyncMock(return_value={
        "results": [
            {"url": "https://example.com/result1", "title": "Result 1", "content": "Snippet for result 1."},
            {"url": "https://example.com/result2", "title": "Result 2", "content": "Snippet for result 2."},
            {"url": "https://example.com/result3", "title": "Result 3", "content": "Snippet for result 3."},
        ]
    })

    # Default extract response
    client.extract = AsyncMock(return_value={
        "results": [
            {"url": "https://example.com/result1", "raw_content": "# Full Content\n\nDetailed markdown content for result 1." * 10},
        ],
        "failed_results": [],
    })

    return client
```

---

## Implementation: `beacon/config.py`

The config module must expose two public functions:

### `get_config() -> Config`

Returns a configuration object (dataclass or Pydantic model) with:
- `anthropic_api_key: str` -- loaded from `ANTHROPIC_API_KEY` env var
- `tavily_api_key: str` -- loaded from `TAVILY_API_KEY` env var

Raises `ValueError` if either key is missing or empty. Use `python-dotenv` to load from a `.env` file if present (call `load_dotenv()` at the top of the function).

### `get_depth_settings(depth: str) -> dict`

Accepts one of `"quick"`, `"standard"`, `"deep"`. Returns a dict with these exact keys and values:

| Depth      | `max_results` | `num_queries` | `deep_read_top_n` |
|------------|--------------|---------------|-------------------|
| `"quick"`  | 10           | 1             | 3                 |
| `"standard"` | 20         | 1             | 7                 |
| `"deep"`   | 20           | 2             | 10                |

Raises `ValueError` for any unrecognized depth string.

### Additional constants to define in config.py

These constants are used by other modules:

```python
EVAL_SEMAPHORE_LIMIT = 10       # Max concurrent Claude evaluation calls
EXTRACT_SEMAPHORE_LIMIT = 5     # Max concurrent extraction calls
EVAL_MODEL = "claude-sonnet-4-6"   # Model for source evaluation
SYNTH_MODEL = "claude-opus-4-6"    # Model for synthesis artifacts
EVAL_TIMEOUT = 30               # Seconds before evaluation call times out
SYNTH_TIMEOUT = 120             # Seconds before synthesis call times out
EVAL_MAX_TOKENS = 512           # Max tokens for evaluation responses
CONTENT_MIN_LENGTH = 200        # Min chars for valid extracted content
CONTENT_MAX_LENGTH = 8000       # Max chars per extracted source
```

---

## Implementation: `pyproject.toml`

```toml
[project]
name = "beacon-pipeline"
version = "0.1.0"
description = "Beacon Agent Pipeline - AI research agent that builds knowledge bases"
requires-python = ">=3.11"
dependencies = [
    "anthropic>=0.52.0",
    "tavily-python>=0.5.0",
    "trafilatura>=2.0.0",
    "httpx>=0.28.0",
    "pydantic>=2.10.0",
    "python-dotenv>=1.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.25.0",
    "respx>=0.22.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

---

## Implementation: `.env.example`

```
ANTHROPIC_API_KEY=your-anthropic-api-key
TAVILY_API_KEY=tvly-your-tavily-key
```

---

## Implementation: `beacon/__init__.py`

Empty file. Just needs to exist so Python recognizes `beacon` as a package.

```python
"""Beacon Agent Pipeline - AI research agent that builds knowledge bases."""
```

---

## Implementation: `tests/__init__.py`

Empty file. Ensures `tests` is a package for pytest discovery.

---

## Verification Steps

After implementing this section, run:

```bash
uv run pytest tests/test_config.py -v
```

All tests should pass. Additionally verify:

1. `uv sync` installs all dependencies without errors
2. `from beacon.config import get_config, get_depth_settings` works in a Python REPL
3. The conftest fixtures can be loaded: `uv run pytest --co tests/` should list available fixtures without errors

---

## Design Decisions

- **python-dotenv**: Used for local development convenience. `load_dotenv()` is called inside `get_config()` so it is automatic but does not override existing environment variables.
- **Depth settings as dict**: A plain dict (not a dataclass) keeps things simple. The keys (`max_results`, `num_queries`, `deep_read_top_n`) are accessed by string key throughout the pipeline.
- **Constants in config.py**: All magic numbers (semaphore limits, model names, timeouts, token limits) are centralized here so other modules import them rather than hardcoding values.
- **pytest-asyncio `asyncio_mode = "auto"`**: Configured in pyproject.toml so that async test functions are automatically detected without needing `@pytest.mark.asyncio` on every test.

---

## Implementation Notes (Post-Build)

### Deviations from Plan
1. **pyproject.toml**: Added `[tool.hatch.build.targets.wheel]` section with `packages = ["beacon"]`. This was required for hatchling to discover the `beacon` package correctly during `uv sync`.
2. **get_depth_settings()**: Returns `_DEPTH_SETTINGS[depth].copy()` instead of a direct reference, per code review recommendation to prevent callers from mutating module-level state.
3. **Config class**: Implemented as `@dataclass(frozen=True)` for immutability, consistent with best practices for configuration objects.

### Test Results
- 8/8 tests passing
- All files created as specified
