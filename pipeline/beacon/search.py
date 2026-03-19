"""Beacon search module: Tavily search integration."""
import asyncio
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from tavily import AsyncTavilyClient

from beacon.config import get_config
from beacon.models import Source


def normalize_url(url: str) -> str:
    """Normalize a URL for deduplication comparison.

    Strips trailing slashes, removes fragments, and drops utm_* query params.
    """
    parsed = urlparse(url)
    # Strip trailing slashes from path
    path = parsed.path.rstrip("/")
    # Remove utm_* query parameters
    params = parse_qs(parsed.query)
    filtered = {k: v for k, v in params.items() if not k.startswith("utm_")}
    query = urlencode(filtered, doseq=True)
    # Reconstruct without fragment
    return urlunparse((parsed.scheme, parsed.netloc, path, parsed.params, query, ""))


def _generate_complementary_query(topic: str) -> str:
    """Generate a second search query covering different angles."""
    return f"{topic} best practices tutorial guide"


def _deduplicate_sources(sources: list[Source]) -> list[Source]:
    """Deduplicate sources by normalized URL, keeping longest snippet."""
    seen: dict[str, Source] = {}
    for source in sources:
        key = normalize_url(source.url)
        if key not in seen or len(source.snippet) > len(seen[key].snippet):
            seen[key] = source
    return list(seen.values())


async def search(
    topic: str,
    depth_config: dict,
    client: AsyncTavilyClient | None = None,
) -> list[Source]:
    """Search for sources on a topic using the Tavily Search API.

    Args:
        topic: The research topic to search for.
        depth_config: Dict with keys 'max_results', 'num_queries', 'deep_read_top_n'.
        client: Optional pre-configured AsyncTavilyClient for dependency injection.
                If None, creates one using TAVILY_API_KEY from environment.

    Returns:
        List of Source objects. May be empty if no results found.

    Raises:
        Exception: If the Tavily API call fails.
    """
    if client is None:
        cfg = get_config()
        client = AsyncTavilyClient(api_key=cfg.tavily_api_key)

    search_kwargs = dict(
        search_depth="basic",
        topic="general",
        max_results=depth_config["max_results"],
    )

    if depth_config.get("num_queries", 1) >= 2:
        complementary_query = _generate_complementary_query(topic)
        response, response2 = await asyncio.gather(
            client.search(query=topic, **search_kwargs),
            client.search(query=complementary_query, **search_kwargs),
        )
        sources = [
            Source(url=r["url"], title=r["title"], snippet=r["content"])
            for r in response["results"]
        ]
        sources2 = [
            Source(url=r["url"], title=r["title"], snippet=r["content"])
            for r in response2["results"]
        ]
        sources = _deduplicate_sources(sources + sources2)
    else:
        response = await client.search(query=topic, **search_kwargs)
        sources = [
            Source(url=r["url"], title=r["title"], snippet=r["content"])
            for r in response["results"]
        ]

    return sources
