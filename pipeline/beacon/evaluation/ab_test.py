"""A/B testing for synthesis prompts.

Compare variant prompts against the baseline by re-synthesizing artifacts
from the same sources and evaluating both with the synthesis metrics.
"""
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from anthropic import AsyncAnthropic

from beacon.evaluation.models import (
    ABTestResult,
    ABTestSuite,
    MetricDelta,
    PromptVariant,
    SynthesisEvalReport,
)
from beacon.evaluation.runner import run_synthesis_eval
from beacon.models import ResearchResult
from beacon.synthesize import synthesize

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

async def re_synthesize(
    result: ResearchResult,
    client: AsyncAnthropic,
    prompt_overrides: dict[str, str],
) -> ResearchResult:
    """Re-run synthesis on *result*'s sources with different prompts.

    Returns a new ``ResearchResult`` whose ``artifacts`` were produced by
    the overridden prompts while keeping sources, topic, depth, session_id,
    and timestamp identical to the original.
    """
    new_artifacts = await synthesize(
        sources=result.sources,
        topic=result.topic,
        depth=result.depth,
        client=client,
        prompt_overrides=prompt_overrides,
    )
    return ResearchResult(
        topic=result.topic,
        depth=result.depth,
        sources=result.sources,
        artifacts=new_artifacts,
        session_id=result.session_id,
        timestamp=result.timestamp,
    )


def _extract_numeric_metrics(report: SynthesisEvalReport) -> dict[str, float]:
    """Pull all scalar numeric scores from a SynthesisEvalReport."""
    metrics: dict[str, float] = {}

    if report.citation_accuracy is not None:
        total = report.citation_accuracy.total_citations
        metrics["citation_valid_ratio"] = (
            report.citation_accuracy.valid_indices / total if total else 0.0
        )
    if report.groundedness is not None:
        metrics["groundedness_ratio"] = report.groundedness.groundedness_ratio
    if report.content_completeness is not None:
        metrics["content_completeness"] = report.content_completeness.completeness_ratio
    if report.flashcard_quality is not None:
        metrics["flashcard_quality"] = report.flashcard_quality.mean_score
    if report.timeline_validity is not None:
        total_events = report.timeline_validity.total_events
        metrics["timeline_has_dates_ratio"] = (
            report.timeline_validity.has_dates / total_events if total_events else 0.0
        )
    if report.conflict_quality is not None:
        total = report.conflict_quality.total
        metrics["conflict_genuine_ratio"] = (
            report.conflict_quality.genuine / total if total else 0.0
        )
    if report.assumption_quality is not None:
        total = report.assumption_quality.total
        metrics["assumption_valid_ratio"] = (
            report.assumption_quality.valid / total if total else 0.0
        )

    return metrics


def compare_reports(
    baseline: SynthesisEvalReport,
    variant: SynthesisEvalReport,
) -> list[MetricDelta]:
    """Compute deltas for every shared numeric metric between two reports."""
    base_metrics = _extract_numeric_metrics(baseline)
    var_metrics = _extract_numeric_metrics(variant)

    shared_keys = sorted(set(base_metrics) & set(var_metrics))
    deltas: list[MetricDelta] = []

    for key in shared_keys:
        bv = base_metrics[key]
        vv = var_metrics[key]
        delta = vv - bv
        pct = (delta / bv * 100.0) if bv != 0 else (0.0 if delta == 0 else float("inf"))
        deltas.append(MetricDelta(
            metric=key,
            baseline=round(bv, 4),
            variant=round(vv, 4),
            delta=round(delta, 4),
            pct_change=round(pct, 2),
        ))

    return deltas


def pick_winner(deltas: list[MetricDelta]) -> str:
    """Determine winner by simple majority of improved metrics."""
    if not deltas:
        return "tie"
    improved = sum(1 for d in deltas if d.delta > 0)
    worsened = sum(1 for d in deltas if d.delta < 0)
    if improved > worsened:
        return "variant"
    elif worsened > improved:
        return "baseline"
    return "tie"


# ---------------------------------------------------------------------------
# A/B test runners
# ---------------------------------------------------------------------------

async def run_ab_test(
    result: ResearchResult,
    variant: PromptVariant,
    client: AsyncAnthropic,
) -> ABTestResult:
    """Run a single A/B test: re-synthesize with *variant*, evaluate both."""
    # Re-synthesize with the variant prompt
    variant_result = await re_synthesize(
        result, client,
        prompt_overrides={variant.artifact_type: variant.prompt_template},
    )

    # Evaluate baseline and variant in parallel
    baseline_report, variant_report = await asyncio.gather(
        run_synthesis_eval(result, client),
        run_synthesis_eval(variant_result, client),
    )

    deltas = compare_reports(baseline_report, variant_report)
    winner = pick_winner(deltas)

    return ABTestResult(
        variant=variant,
        baseline_report=baseline_report,
        variant_report=variant_report,
        deltas=deltas,
        winner=winner,
    )


async def run_ab_suite(
    result: ResearchResult,
    variants: list[PromptVariant],
    client: AsyncAnthropic,
) -> ABTestSuite:
    """Run A/B tests for multiple variants against the same baseline."""
    results: list[ABTestResult] = []
    for variant in variants:
        logger.info("Testing variant: %s (%s)", variant.name, variant.artifact_type)
        try:
            ab_result = await run_ab_test(result, variant, client)
            results.append(ab_result)
            logger.info("  Winner: %s", ab_result.winner)
        except Exception as exc:
            logger.error("  Variant %s failed: %s", variant.name, exc)

    return ABTestSuite(
        topic=result.topic,
        num_sources=len(result.sources),
        results=results,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _load_variants(path: str) -> list[PromptVariant]:
    """Load prompt variants from a JSON file.

    Expected format: list of objects with ``name``, ``artifact_type``,
    and ``prompt_template`` fields.
    """
    with open(path) as f:
        data = json.load(f)
    return [PromptVariant(**item) for item in data]


async def _main() -> None:
    """CLI entry point for A/B testing prompts."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Beacon Prompt A/B Testing",
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Path to a saved ResearchResult JSON file",
    )
    parser.add_argument(
        "--topic",
        help="Topic to research live then A/B test",
    )
    parser.add_argument(
        "--depth",
        default="quick",
        choices=["quick", "standard", "deep"],
        help="Research depth for live pipeline (default: quick)",
    )
    parser.add_argument(
        "--variants",
        help="Path to variants JSON file",
    )
    parser.add_argument(
        "--output", "-o",
        help="Path to save the A/B test report JSON",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    if not args.input and not args.topic:
        parser.error("Provide either a JSON file path or --topic")

    from beacon.config import get_config

    config = get_config()
    client = AsyncAnthropic(api_key=config.anthropic_api_key)

    # Load or run research
    if args.input:
        with open(args.input) as f:
            data = json.load(f)
        result = ResearchResult.model_validate(data)
        logger.info("Loaded result for topic: %s", result.topic)
    else:
        from beacon.pipeline import run_research

        logger.info("Running research on: %s (depth=%s)", args.topic, args.depth)
        result = None
        async for event in run_research(args.topic, args.depth):
            if hasattr(event, "result"):
                result = event.result
        if result is None:
            logger.error("Pipeline did not produce a result")
            sys.exit(1)

    # Load variants
    if args.variants:
        variants = _load_variants(args.variants)
    else:
        # Use built-in example variants
        from beacon.prompt_variants import (
            GENERATE_FLASHCARDS_PROMPT_HARDER,
            GENERATE_SUMMARY_PROMPT_DETAILED,
            GENERATE_SUMMARY_PROMPT_VERBOSE,
        )

        variants = [
            PromptVariant(
                name="verbose_summary",
                artifact_type="summary",
                prompt_template=GENERATE_SUMMARY_PROMPT_VERBOSE,
            ),
            PromptVariant(
                name="detailed_summary",
                artifact_type="summary",
                prompt_template=GENERATE_SUMMARY_PROMPT_DETAILED,
            ),
            PromptVariant(
                name="harder_flashcards",
                artifact_type="flashcards",
                prompt_template=GENERATE_FLASHCARDS_PROMPT_HARDER,
            ),
        ]

    logger.info("Running A/B suite with %d variant(s)...", len(variants))
    suite = await run_ab_suite(result, variants, client)

    # Output
    report_json = suite.model_dump_json(indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(report_json)
        logger.info("Report saved to %s", args.output)
    else:
        print(report_json)


if __name__ == "__main__":
    asyncio.run(_main())
