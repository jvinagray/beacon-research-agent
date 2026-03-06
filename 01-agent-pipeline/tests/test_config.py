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
        with patch.dict(os.environ, {"TAVILY_API_KEY": "test"}, clear=True), \
             patch("beacon.config.load_dotenv"):
            from beacon.config import get_config
            with pytest.raises((ValueError, KeyError)):
                get_config()

    def test_config_raises_on_missing_tavily_key(self):
        """Config must raise ValueError when TAVILY_API_KEY is missing."""
        with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test"}, clear=True), \
             patch("beacon.config.load_dotenv"):
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
