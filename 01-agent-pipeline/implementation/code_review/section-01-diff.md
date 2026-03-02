diff --git a/01-agent-pipeline/.env.example b/01-agent-pipeline/.env.example
new file mode 100644
index 0000000..c85e762
--- /dev/null
+++ b/01-agent-pipeline/.env.example
@@ -0,0 +1,2 @@
+ANTHROPIC_API_KEY=your-anthropic-api-key
+TAVILY_API_KEY=tvly-your-tavily-key
diff --git a/01-agent-pipeline/beacon/__init__.py b/01-agent-pipeline/beacon/__init__.py
new file mode 100644
index 0000000..8bb9211
--- /dev/null
+++ b/01-agent-pipeline/beacon/__init__.py
@@ -0,0 +1 @@
+"""Beacon Agent Pipeline - AI research agent that builds knowledge bases."""
diff --git a/01-agent-pipeline/beacon/config.py b/01-agent-pipeline/beacon/config.py
new file mode 100644
index 0000000..2ce3050
--- /dev/null
+++ b/01-agent-pipeline/beacon/config.py
@@ -0,0 +1,74 @@
+"""Beacon configuration: environment loading and depth settings."""
+import os
+from dataclasses import dataclass
+
+from dotenv import load_dotenv
+
+# ---------------------------------------------------------------------------
+# Constants used by other modules
+# ---------------------------------------------------------------------------
+EVAL_SEMAPHORE_LIMIT = 10
+EXTRACT_SEMAPHORE_LIMIT = 5
+EVAL_MODEL = "claude-sonnet-4-6"
+SYNTH_MODEL = "claude-opus-4-6"
+EVAL_TIMEOUT = 30
+SYNTH_TIMEOUT = 120
+EVAL_MAX_TOKENS = 512
+CONTENT_MIN_LENGTH = 200
+CONTENT_MAX_LENGTH = 8000
+
+# ---------------------------------------------------------------------------
+# Depth settings lookup
+# ---------------------------------------------------------------------------
+_DEPTH_SETTINGS: dict[str, dict] = {
+    "quick": {"max_results": 10, "num_queries": 1, "deep_read_top_n": 3},
+    "standard": {"max_results": 20, "num_queries": 1, "deep_read_top_n": 7},
+    "deep": {"max_results": 20, "num_queries": 2, "deep_read_top_n": 10},
+}
+
+
+@dataclass(frozen=True)
+class Config:
+    """Application configuration loaded from environment variables."""
+    anthropic_api_key: str
+    tavily_api_key: str
+
+
+def get_config() -> Config:
+    """Load configuration from environment variables.
+
+    Calls ``load_dotenv()`` so a local ``.env`` file is picked up
+    automatically without overriding existing env vars.
+
+    Raises ``ValueError`` if a required key is missing or empty.
+    """
+    load_dotenv()
+
+    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
+    tavily_key = os.environ.get("TAVILY_API_KEY", "").strip()
+
+    if not anthropic_key:
+        raise ValueError("ANTHROPIC_API_KEY environment variable is required")
+    if not tavily_key:
+        raise ValueError("TAVILY_API_KEY environment variable is required")
+
+    return Config(anthropic_api_key=anthropic_key, tavily_api_key=tavily_key)
+
+
+def get_depth_settings(depth: str) -> dict:
+    """Return search parameters for the given research depth.
+
+    Args:
+        depth: One of ``"quick"``, ``"standard"``, ``"deep"``.
+
+    Returns:
+        Dict with keys ``max_results``, ``num_queries``, ``deep_read_top_n``.
+
+    Raises:
+        ValueError: If *depth* is not a recognized level.
+    """
+    if depth not in _DEPTH_SETTINGS:
+        raise ValueError(
+            f"Unknown depth {depth!r}. Choose from: {', '.join(_DEPTH_SETTINGS)}"
+        )
+    return _DEPTH_SETTINGS[depth]
diff --git a/01-agent-pipeline/pyproject.toml b/01-agent-pipeline/pyproject.toml
new file mode 100644
index 0000000..8e6838b
--- /dev/null
+++ b/01-agent-pipeline/pyproject.toml
@@ -0,0 +1,31 @@
+[project]
+name = "beacon-pipeline"
+version = "0.1.0"
+description = "Beacon Agent Pipeline - AI research agent that builds knowledge bases"
+requires-python = ">=3.11"
+dependencies = [
+    "anthropic>=0.52.0",
+    "tavily-python>=0.5.0",
+    "trafilatura>=2.0.0",
+    "httpx>=0.28.0",
+    "pydantic>=2.10.0",
+    "python-dotenv>=1.0.0",
+]
+
+[project.optional-dependencies]
+dev = [
+    "pytest>=8.0",
+    "pytest-asyncio>=0.25.0",
+    "respx>=0.22.0",
+]
+
+[tool.pytest.ini_options]
+asyncio_mode = "auto"
+testpaths = ["tests"]
+
+[tool.hatch.build.targets.wheel]
+packages = ["beacon"]
+
+[build-system]
+requires = ["hatchling"]
+build-backend = "hatchling.build"
diff --git a/01-agent-pipeline/tests/__init__.py b/01-agent-pipeline/tests/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/01-agent-pipeline/tests/conftest.py b/01-agent-pipeline/tests/conftest.py
new file mode 100644
index 0000000..9d63d7b
--- /dev/null
+++ b/01-agent-pipeline/tests/conftest.py
@@ -0,0 +1,129 @@
+"""Shared test fixtures for the Beacon pipeline test suite."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock
+
+
+# ---------------------------------------------------------------------------
+# Sample data fixtures
+# ---------------------------------------------------------------------------
+
+@pytest.fixture
+def sample_sources():
+    """List of 5 Source objects for testing. Imports from beacon.models."""
+    from beacon.models import Source
+    return [
+        Source(url="https://example.com/tutorial", title="Tutorial Guide", snippet="A comprehensive tutorial on the topic."),
+        Source(url="https://example.com/paper", title="Research Paper", snippet="An academic paper exploring the fundamentals."),
+        Source(url="https://example.com/docs", title="Official Documentation", snippet="The official docs for the framework."),
+        Source(url="https://example.com/blog", title="Blog Post", snippet="A blog post with practical examples."),
+        Source(url="https://example.com/forum", title="Forum Discussion", snippet="Community discussion with multiple perspectives."),
+    ]
+
+
+@pytest.fixture
+def sample_intelligence_signals():
+    """A single IntelligenceSignals instance with typical values."""
+    from beacon.models import IntelligenceSignals
+    return IntelligenceSignals(
+        learning_efficiency_score=8,
+        content_type="tutorial",
+        time_estimate_minutes=15,
+        recency="2025",
+        key_insight="Comprehensive walkthrough of core concepts with practical examples.",
+        coverage=["fundamentals", "best practices", "examples"],
+        evaluation_failed=False,
+    )
+
+
+@pytest.fixture
+def sample_evaluated_sources(sample_sources, sample_intelligence_signals):
+    """List of 5 EvaluatedSource objects with signals attached."""
+    from beacon.models import EvaluatedSource
+    evaluated = []
+    for i, src in enumerate(sample_sources):
+        from beacon.models import IntelligenceSignals
+        signals = IntelligenceSignals(
+            learning_efficiency_score=10 - i * 2,  # 10, 8, 6, 4, 2
+            content_type="tutorial",
+            time_estimate_minutes=10 + i * 5,
+            recency="2025",
+            key_insight=f"Key insight for source {i + 1}.",
+            coverage=["topic"],
+            evaluation_failed=False,
+        )
+        evaluated.append(EvaluatedSource(
+            url=src.url,
+            title=src.title,
+            snippet=src.snippet,
+            signals=signals,
+            deep_read_content=None,
+            extraction_method=None,
+        ))
+    return evaluated
+
+
+@pytest.fixture
+def sample_deep_read_content():
+    """Realistic markdown content string representing extracted page content."""
+    return (
+        "# Understanding the Topic\n\n"
+        "This guide covers the fundamentals of the topic in depth.\n\n"
+        "## Key Concepts\n\n"
+        "- Concept A: The foundational building block.\n"
+        "- Concept B: Builds on Concept A with additional patterns.\n"
+        "- Concept C: Advanced technique for production use.\n\n"
+        "## Best Practices\n\n"
+        "1. Always start with a clear problem statement.\n"
+        "2. Use iterative refinement to improve results.\n"
+        "3. Test with diverse inputs to ensure robustness.\n\n"
+        "## Conclusion\n\n"
+        "By following these practices, you can effectively apply these concepts."
+    )
+
+
+# ---------------------------------------------------------------------------
+# Mock client fixtures
+# ---------------------------------------------------------------------------
+
+@pytest.fixture
+def mock_anthropic_client():
+    """Returns an AsyncMock mimicking the anthropic.AsyncAnthropic client.
+
+    Pre-configured to return a valid JSON response from messages.create().
+    Override the return value in individual tests as needed.
+    """
+    client = AsyncMock()
+    mock_response = MagicMock()
+    mock_response.content = [MagicMock()]
+    mock_response.content[0].text = '{"learning_efficiency_score": 8, "content_type": "tutorial", "time_estimate_minutes": 15, "recency": "2025", "key_insight": "Great resource.", "coverage": ["topic"]}'
+    client.messages.create = AsyncMock(return_value=mock_response)
+    return client
+
+
+@pytest.fixture
+def mock_tavily_client():
+    """Returns an AsyncMock mimicking the tavily.AsyncTavilyClient.
+
+    Pre-configured with search() and extract() responses.
+    Override in individual tests as needed.
+    """
+    client = AsyncMock()
+
+    # Default search response
+    client.search = AsyncMock(return_value={
+        "results": [
+            {"url": "https://example.com/result1", "title": "Result 1", "content": "Snippet for result 1."},
+            {"url": "https://example.com/result2", "title": "Result 2", "content": "Snippet for result 2."},
+            {"url": "https://example.com/result3", "title": "Result 3", "content": "Snippet for result 3."},
+        ]
+    })
+
+    # Default extract response
+    client.extract = AsyncMock(return_value={
+        "results": [
+            {"url": "https://example.com/result1", "raw_content": "# Full Content\n\nDetailed markdown content for result 1." * 10},
+        ],
+        "failed_results": [],
+    })
+
+    return client
diff --git a/01-agent-pipeline/tests/test_config.py b/01-agent-pipeline/tests/test_config.py
new file mode 100644
index 0000000..4942319
--- /dev/null
+++ b/01-agent-pipeline/tests/test_config.py
@@ -0,0 +1,76 @@
+"""Tests for beacon.config -- write these FIRST."""
+import os
+import pytest
+from unittest.mock import patch
+
+
+class TestConfigLoading:
+    """Test that config loads environment variables correctly."""
+
+    def test_config_loads_anthropic_api_key_from_environment(self):
+        """Config must read ANTHROPIC_API_KEY from os.environ."""
+        with patch.dict(os.environ, {
+            "ANTHROPIC_API_KEY": "test-anthropic-key",
+            "TAVILY_API_KEY": "test-tavily-key",
+        }):
+            from beacon.config import get_config
+            config = get_config()
+            assert config.anthropic_api_key == "test-anthropic-key"
+
+    def test_config_loads_tavily_api_key_from_environment(self):
+        """Config must read TAVILY_API_KEY from os.environ."""
+        with patch.dict(os.environ, {
+            "ANTHROPIC_API_KEY": "test-anthropic-key",
+            "TAVILY_API_KEY": "test-tavily-key",
+        }):
+            from beacon.config import get_config
+            config = get_config()
+            assert config.tavily_api_key == "test-tavily-key"
+
+    def test_config_raises_on_missing_anthropic_key(self):
+        """Config must raise ValueError when ANTHROPIC_API_KEY is missing."""
+        with patch.dict(os.environ, {"TAVILY_API_KEY": "test"}, clear=True):
+            from beacon.config import get_config
+            with pytest.raises((ValueError, KeyError)):
+                get_config()
+
+    def test_config_raises_on_missing_tavily_key(self):
+        """Config must raise ValueError when TAVILY_API_KEY is missing."""
+        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}, clear=True):
+            from beacon.config import get_config
+            with pytest.raises((ValueError, KeyError)):
+                get_config()
+
+
+class TestDepthSettings:
+    """Test depth configuration values for each research depth level."""
+
+    def test_quick_depth_settings(self):
+        """Quick depth: max_results=10, num_queries=1, deep_read_top_n=3."""
+        from beacon.config import get_depth_settings
+        settings = get_depth_settings("quick")
+        assert settings["max_results"] == 10
+        assert settings["num_queries"] == 1
+        assert settings["deep_read_top_n"] == 3
+
+    def test_standard_depth_settings(self):
+        """Standard depth: max_results=20, num_queries=1, deep_read_top_n=7."""
+        from beacon.config import get_depth_settings
+        settings = get_depth_settings("standard")
+        assert settings["max_results"] == 20
+        assert settings["num_queries"] == 1
+        assert settings["deep_read_top_n"] == 7
+
+    def test_deep_depth_settings(self):
+        """Deep depth: max_results=20, num_queries=2, deep_read_top_n=10."""
+        from beacon.config import get_depth_settings
+        settings = get_depth_settings("deep")
+        assert settings["max_results"] == 20
+        assert settings["num_queries"] == 2
+        assert settings["deep_read_top_n"] == 10
+
+    def test_invalid_depth_raises_value_error(self):
+        """An unrecognized depth string must raise ValueError."""
+        from beacon.config import get_depth_settings
+        with pytest.raises(ValueError):
+            get_depth_settings("ultra")
