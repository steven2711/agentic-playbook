# Agent evals

Cases start from a clean checkout of the pinned commit in each case file. Graders are the check
scripts in `checks/` (never the agent's own report). `just evals` runs every case 3 times and appends
to `runs/`.
