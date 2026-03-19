"""Evaluation orchestrator and CLI entry point."""
import asyncio
import json
import logging
import sys
from datetime import datetime, timezone

from anthropic import AsyncAnthropic

from beacon.evaluation.models import (
    FullEvalReport,
    RAGEvalReport,
    SynthesisEvalReport,
)
from beacon.evaluation.rag_metrics import (
    compute_content_type_accuracy,
    compute_coverage_completeness,
    compute_extraction_success,
    compute_key_insight_quality,
    compute_precision_at_k,
    compute_relevance_correlation,
    compute_score_distribution,
)
from beacon.evaluation.synthesis_metrics import (
    check_structural_compliance,
    check_timeline_validity,
    compute_assumption_quality,
    compute_citation_accuracy,
    compute_conflict_quality,
    compute_content_completeness,
    compute_flashcard_quality,
    compute_groundedness,
)
from beacon.models import ResearchResult

logger = logging.getLogger(__name__)


async def run_rag_eval(
    result: ResearchResult,
    client: AsyncAnthropic,
    k: int = 5,
) -> RAGEvalReport:
    """Run all RAG retrieval metrics and return an aggregated report."""
    sources = result.sources
    summary = result.artifacts.get("summary", "")

    # Automated metrics (immediate)
    score_dist = compute_score_distribution(sources)
    extraction = compute_extraction_success(sources)
    correlation = compute_relevance_correlation(sources, summary)

    # LLM metrics (parallel)
    precision, content_type, insight, coverage = await asyncio.gather(
        compute_precision_at_k(sources, result.topic, k, client),
        compute_content_type_accuracy(sources, client),
        compute_key_insight_quality(sources, client),
        compute_coverage_completeness(sources, result.topic, client),
    )

    return RAGEvalReport(
        precision_at_k=precision,
        score_distribution=score_dist,
        content_type_accuracy=content_type,
        key_insight_quality=insight,
        coverage_completeness=coverage,
        extraction_success=extraction,
        relevance_correlation=correlation,
    )


async def run_synthesis_eval(
    result: ResearchResult,
    client: AsyncAnthropic,
) -> SynthesisEvalReport:
    """Run all synthesis quality metrics and return an aggregated report."""
    artifacts = result.artifacts
    sources = result.sources
    summary = artifacts.get("summary", "")

    # Automated metrics (immediate)
    compliance_results = []
    for artifact_type in ("timeline", "conflicts", "assumptions"):
        items = artifacts.get(artifact_type, [])
        if isinstance(items, list):
            compliance_results.append(
                check_structural_compliance(artifact_type, items)
            )

    timeline_events = artifacts.get("timeline", [])
    timeline_valid = check_timeline_validity(
        timeline_events if isinstance(timeline_events, list) else []
    )

    # Prepare flashcards as list of dicts
    flashcards_raw = artifacts.get("flashcards", [])
    flashcards: list[dict] = []
    for fc in flashcards_raw:
        if hasattr(fc, "model_dump"):
            flashcards.append(fc.model_dump())
        elif isinstance(fc, dict):
            flashcards.append(fc)

    conflicts = artifacts.get("conflicts", [])
    assumptions = artifacts.get("assumptions", [])

    # LLM metrics (parallel)
    (
        citation_acc,
        groundedness,
        completeness,
        fc_quality,
        conflict_qual,
        assumption_qual,
    ) = await asyncio.gather(
        compute_citation_accuracy(summary, sources, client),
        compute_groundedness(summary, sources, client),
        compute_content_completeness(summary, sources, result.topic, client),
        compute_flashcard_quality(flashcards, client),
        compute_conflict_quality(
            conflicts if isinstance(conflicts, list) else [], client
        ),
        compute_assumption_quality(
            assumptions if isinstance(assumptions, list) else [], client
        ),
    )

    return SynthesisEvalReport(
        citation_accuracy=citation_acc,
        groundedness=groundedness,
        structural_compliance=compliance_results,
        content_completeness=completeness,
        flashcard_quality=fc_quality,
        timeline_validity=timeline_valid,
        conflict_quality=conflict_qual,
        assumption_quality=assumption_qual,
    )


async def run_full_eval(
    result: ResearchResult,
    client: AsyncAnthropic,
    k: int = 5,
) -> FullEvalReport:
    """Run all RAG and synthesis metrics and return a combined report."""
    rag_report, synth_report = await asyncio.gather(
        run_rag_eval(result, client, k),
        run_synthesis_eval(result, client),
    )

    return FullEvalReport(
        topic=result.topic,
        rag=rag_report,
        synthesis=synth_report,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


async def _main() -> None:
    """CLI entry point for running evaluations."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Beacon LLM Evaluation Framework",
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Path to a saved ResearchResult JSON file",
    )
    parser.add_argument(
        "--topic",
        help="Topic to research and evaluate (runs live pipeline)",
    )
    parser.add_argument(
        "--depth",
        default="quick",
        choices=["quick", "standard", "deep"],
        help="Research depth (default: quick)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Path to save the evaluation report JSON",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="K value for precision@K (default: 5)",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    if not args.input and not args.topic:
        parser.error("Provide either a JSON file path or --topic")

    from beacon.config import get_config

    config = get_config()
    client = AsyncAnthropic(api_key=config.anthropic_api_key)

    if args.input:
        # Load saved result
        with open(args.input) as f:
            data = json.load(f)
        result = ResearchResult.model_validate(data)
        logger.info("Loaded result for topic: %s", result.topic)
    else:
        # Run live pipeline
        from beacon.pipeline import run_research

        logger.info("Running research on: %s (depth=%s)", args.topic, args.depth)
        result = None
        async for event in run_research(args.topic, args.depth):
            if hasattr(event, "result"):
                result = event.result
        if result is None:
            logger.error("Pipeline did not produce a result")
            sys.exit(1)

    # Run evaluation
    logger.info("Running full evaluation...")
    report = await run_full_eval(result, client, k=args.k)

    # Output
    report_json = report.model_dump_json(indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(report_json)
        logger.info("Report saved to %s", args.output)
    else:
        print(report_json)


if __name__ == "__main__":
    asyncio.run(_main())
