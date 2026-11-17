# Agent evaluations

Establish a lightweight strategy for measuring how effectively autonomous agents can operate within the repository.

Distinguish **repository readiness** from **observed autonomous development performance**.

Evaluate the feasibility of representative tasks covering:

- Repository comprehension.
- Locating relevant implementation boundaries.
- Implementing a bounded change.
- Detecting and repairing a deliberately introduced defect.
- Respecting architectural constraints.
- Running and interpreting validation results.
- Producing independently verifiable implementation evidence.
- Recognizing when human approval is required.

Where the application does not yet have meaningful functionality, use isolated synthetic fixtures rather than inventing product features.

Define how future evaluations will measure:

- Task completion success.
- Human interventions required.
- Verification pass rates.
- Architectural regression rates.
- Time and cost per accepted implementation.
- Repeated failure patterns.
- Improvements or regressions in agent performance over time.

Independent acceptance criteria must not rely solely on the implementing agent's own judgment.

Do not overbuild a comprehensive evaluation platform before the first meaningful application functionality exists.

Define each case with a task, starting state, approved acceptance criteria, permitted tools, and an independent evaluator. Keep repeatable fixtures and record the model, environment, outcome, and supporting evidence. Sample real work in established projects and use isolated synthetic fixtures for greenfield projects without meaningful application functionality. Include context discovery, architecture boundaries, and conflict recognition. Treat agent behavior as observed evidence. Deterministic CI retains its own verdict.
