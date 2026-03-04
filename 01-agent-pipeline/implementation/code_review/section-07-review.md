# Section 07 Pipeline - Code Review

## CRITICAL: Producer-Consumer Queue Deadlock When evaluate_sources Raises

**File:** `beacon/pipeline.py`, lines 108-127

If `evaluate_sources` raises an exception, `await eval_task` at line 127 re-raises it with no try/except. No CompleteEvent or ErrorEvent is yielded for the consumer, violating the "always yield CompleteEvent" contract from the plan.

**Recommendation:** Wrap `await eval_task` in try/except.

## HIGH: Missing Top-Level Exception Handler

**File:** `beacon/pipeline.py`, lines 56-201

The outer try block catches GeneratorExit but NOT generic Exception. Unexpected exceptions (e.g., Pydantic ValidationError, json.dumps failure) will leave the consumer without a CompleteEvent.

## HIGH: ArtifactEvent Construction Fragility

**File:** `beacon/pipeline.py`, lines 166-176

The isinstance check iterating all flashcards is wasteful for large lists. The json.dumps default=str fallback silently stringifies non-serializable objects.

## MEDIUM: synthesize() Called Without client Argument

**File:** `beacon/pipeline.py`, line 157

In production, `synthesize()` is called without a client. The synthesize module does NOT create a client when None is passed - it passes None directly to sub-functions that call `client.messages.create(...)`, causing AttributeError. Same issue for `extract_content()` at line 137. Hidden by mocks in tests.

## MEDIUM: No Test for evaluate_sources Exception During Queue Drain

No test verifies behavior when evaluate_sources raises after partially populating the queue.

## MEDIUM: No Test for synthesize() Failure as Recoverable

Only extraction failure is tested as recoverable. Synthesis failure path is untested.

## MEDIUM: No Test for search() Exception

Pipeline treats search() exception as fatal but this path is untested. Also, search failure path doesn't yield CompleteEvent.

## LOW: except (ValueError, Exception) Is Redundant

Line 61: ValueError is a subclass of Exception. Should just be `except Exception`.

## LOW: No Logging of Stage Timing

Plan requires timing logs at each stage boundary. Implementation only has error-level logging.

## LOW: SourcesFoundEvent Yielded Before Empty-Source Check

count=0 SourcesFoundEvent followed by fatal error is semantically confusing.

## LOW: Test Cancellation Test Does Not Assert Task Was Cancelled

Test relies on "not hanging" as implicit proof rather than asserting task.cancelled().
