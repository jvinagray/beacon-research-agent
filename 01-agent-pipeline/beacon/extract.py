"""Beacon extract module: content extraction cascade."""
import asyncio
import logging

import trafilatura

from beacon.config import CONTENT_MAX_LENGTH, CONTENT_MIN_LENGTH, EXTRACT_SEMAPHORE_LIMIT
from beacon.models import EvaluatedSource

logger = logging.getLogger(__name__)


def _validate_content(
    content: str | None,
    min_length: int = CONTENT_MIN_LENGTH,
    max_length: int = CONTENT_MAX_LENGTH,
) -> str | None:
    """Validate and truncate extracted content.

    Returns None if content is None or shorter than min_length.
    Truncates to max_length if longer.
    """
    if content is None or len(content) < min_length:
        return None
    return content[:max_length]


def _trafilatura_extract(url: str) -> str | None:
    """Synchronous helper: fetch and extract content with trafilatura."""
    downloaded = trafilatura.fetch_url(url)
    if downloaded is None:
        return None
    return trafilatura.extract(
        downloaded,
        favor_precision=True,
        output_format="markdown",
        include_tables=True,
        include_links=True,
    )


async def extract_content(
    sources: list[EvaluatedSource],
    client=None,
) -> list[EvaluatedSource]:
    """Extract full page content for a list of evaluated sources.

    Uses a three-tier extraction cascade per source:
    1. Tavily Extract API (batch call for all URLs)
    2. trafilatura fallback (for URLs that Tavily failed on)
    3. Original snippet fallback (if both methods fail)
    """
    if not sources:
        return []

    # Step 1: Try Tavily Extract batch call
    tavily_results: dict[str, str | None] = {}
    failed_urls: set[str] = set()

    try:
        response = await client.extract(
            urls=[s.url for s in sources],
        )
        for item in response.get("results", []):
            tavily_results[item["url"]] = item.get("raw_content")
        for item in response.get("failed_results", []):
            failed_urls.add(item["url"])
    except Exception:
        logger.warning(
            "Tavily Extract batch failed for %d URLs, falling back to trafilatura",
            len(sources),
            exc_info=True,
        )
        failed_urls = {s.url for s in sources}

    # Step 2: Determine which URLs need trafilatura fallback
    needs_fallback: list[str] = []
    for source in sources:
        if source.url in failed_urls:
            needs_fallback.append(source.url)
        elif source.url in tavily_results:
            validated = _validate_content(tavily_results[source.url])
            if validated is None:
                needs_fallback.append(source.url)
        else:
            needs_fallback.append(source.url)

    if needs_fallback:
        logger.info(
            "Running trafilatura fallback for %d/%d URLs",
            len(needs_fallback),
            len(sources),
        )

    # Step 3: Run trafilatura fallbacks in parallel with semaphore
    semaphore = asyncio.Semaphore(EXTRACT_SEMAPHORE_LIMIT)
    traf_results: dict[str, str | None] = {}

    async def _fetch_with_trafilatura(url: str) -> tuple[str, str | None]:
        async with semaphore:
            try:
                content = await asyncio.to_thread(_trafilatura_extract, url)
                return url, content
            except Exception:
                logger.warning("trafilatura failed for %s", url, exc_info=True)
                return url, None

    if needs_fallback:
        tasks = [_fetch_with_trafilatura(url) for url in needs_fallback]
        results = await asyncio.gather(*tasks)
        for url, content in results:
            traf_results[url] = content

    # Step 4: Build output list
    output: list[EvaluatedSource] = []
    for source in sources:
        # Try Tavily first
        if source.url in tavily_results and source.url not in failed_urls:
            validated = _validate_content(tavily_results[source.url])
            if validated is not None:
                output.append(source.model_copy(update={
                    "deep_read_content": validated,
                    "extraction_method": "tavily_extract",
                }))
                continue

        # Try trafilatura
        if source.url in traf_results:
            validated = _validate_content(traf_results[source.url])
            if validated is not None:
                output.append(source.model_copy(update={
                    "deep_read_content": validated,
                    "extraction_method": "trafilatura",
                }))
                continue

        # Snippet-only fallback
        output.append(source.model_copy(update={
            "deep_read_content": source.snippet,
            "extraction_method": "snippet_only",
        }))

    return output
