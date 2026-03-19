"""Beacon LLM Evaluation Framework: measure RAG retrieval and synthesis quality."""
from beacon.evaluation.ab_test import (
    run_ab_test,
    run_ab_suite,
)
from beacon.evaluation.models import (
    ABTestResult,
    ABTestSuite,
    FullEvalReport,
    RAGEvalReport,
    SynthesisEvalReport,
)
from beacon.evaluation.runner import (
    run_full_eval,
    run_rag_eval,
    run_synthesis_eval,
)

__all__ = [
    "run_ab_test",
    "run_ab_suite",
    "run_full_eval",
    "run_rag_eval",
    "run_synthesis_eval",
    "ABTestResult",
    "ABTestSuite",
    "FullEvalReport",
    "RAGEvalReport",
    "SynthesisEvalReport",
]
