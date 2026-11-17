export type Priority = "P0" | "P1" | "P2";
export type Mode = "greenfield" | "existing";
export type CriterionStatus = "passed" | "partial" | "failed" | "n_a" | "unverified" | "deferred";
export type WorkStatus = "pending" | "in_progress" | "verification_required" | "completed" | "blocked" | "deferred";
export type DimensionId = "CTX" | "VER" | "ARC" | "SEC" | "EVAL" | "WF";
export type StageApplicability = "active" | "deferred" | "n_a";

export interface RubricCriterion {
  id: string;
  dimension: DimensionId;
  title: string;
  priority: Priority;
  gate?: string;
  probe?: string;
  source: string;
  quote: string;
  applies?: Partial<Record<Mode, StageApplicability>>;
  activates_when?: string;
  evidence_required: string;
}

export interface Rubric {
  version: number;
  priorities: Record<Priority, { weight: number; label: string }>;
  levels: { id: string; name: string; summary: string }[];
  dimensions: { id: DimensionId; name: string; source: string }[];
  criteria: RubricCriterion[];
}

export interface CriterionState {
  id: string;
  status: CriterionStatus;
  evidence: string[];
  reason?: string;
  trigger?: string;
  notes?: string;
  stageDefault?: boolean;
  assessedBy?: string;
  assessedAt?: string;
}

export interface Finding {
  id: string;
  title: string;
  description?: string;
  kind: "verified" | "inferred" | "recommendation" | "unknown" | "deferred";
  dimension: DimensionId;
  priority: Priority;
  currentState: string;
  desiredState: string;
  evidence: string[];
  remediation: string;
  criterionIds: string[];
  taskIds: string[];
  dependsOn?: string[];
  complexity?: "S" | "M" | "L" | "XL";
  risks?: string;
  reason?: string;
  resolved?: boolean;
}

export interface Milestone {
  id: string;
  title: string;
  objective: string;
  scope?: string;
  outcomes?: string[];
  dependsOn: string[];
  exitCriteria: { id: string; text: string }[];
  status: WorkStatus;
}

export interface HistoryEntry {
  at: string;
  from: string;
  to: string;
  by: string;
  reason?: string;
  revision?: string | null;
}

export interface Task {
  id: string;
  milestoneId: string;
  title: string;
  description: string;
  priority: Priority;
  dependsOn: string[];
  findingIds: string[];
  acceptanceCriteria: { id: string; text: string }[];
  verification: string[];
  status: WorkStatus;
  blockedReason?: string;
  deferredTrigger?: string;
  implementer?: string;
  requiresApproval?: boolean;
  history: HistoryEntry[];
}

export interface Evidence {
  id: string;
  taskId?: string;
  milestoneId?: string;
  covers: string[];
  kind?: "test" | "check" | "ci" | "commit" | "pr" | "doc" | "setting" | "approval" | "eval" | "other";
  verifier: string;
  action: string;
  revision: string | null;
  result: "pass" | "fail";
  location?: string;
  notes?: string;
  at: string;
}

export interface Approval {
  id: string;
  subject: string;
  approvedBy: string;
  at: string;
  note?: string;
}

export interface ScoreEntry {
  at: string;
  revision: string | null;
  recordRevision: number;
  score: number;
  confidence: number;
  level: string;
  byDimension: Record<string, number>;
}

export type ConventionStatus = "documented" | "followed" | "contradicted" | "absent" | "n_a";

/** One baseline-library rule assessed for one app root. */
export interface ConventionAssessment {
  id: string;
  scope: string;
  rule: string;
  status: ConventionStatus;
  evidence: string[];
  reason?: string;
  promoteTo?: string;
  extraSources?: string[];
  decision?: "proposed" | "accepted" | "declined";
  notes?: string;
  assessedBy?: string;
  assessedAt?: string;
}

/** One app's test portfolio as judged by the test-strategy-auditor. A snapshot, replaced per app on each run. */
export interface TestingAssessment {
  scope: string;
  kinds: string[];
  strategy: { documented: boolean; path?: string; summary?: string };
  layers: { id: string; status: "present" | "absent" | "n_a"; evidence: string[]; reason?: string }[];
  criticalPaths: { total: number; covered: number; uncovered: string[] };
  coverage?: string;
  summary?: string;
  assessedRevision?: string | null;
  assessedBy?: string;
  assessedAt?: string;
}

/** The repository's documentation as judged by the context-auditor: inventory plus target layout. A snapshot, replaced whole on each run. */
export interface DocsAssessment {
  inventory: {
    location: string;
    purpose: string;
    audience?: string;
    scope?: string;
    authority?: "contract" | "fact" | "history" | "plan" | "operation" | "generated" | "enforcement" | "unclear";
    owner?: string;
    dependencies?: string;
    issue?: string;
    disposition: "retain" | "relocate" | "consolidate" | "generate" | "archive" | "investigate";
  }[];
  target: {
    id: string;
    scope: string;
    status: "present" | "absent" | "misplaced" | "n_a";
    action: "retain" | "create" | "relocate" | "consolidate" | "generate" | "archive" | "none";
    currentPaths?: string[];
    home?: string;
    reason?: string;
    evidence: string[];
    findingIds?: string[];
  }[];
  loading?: { alwaysLoadedLines: number; issues: string[] };
  navigation?: { goal: "requirements" | "decisions" | "boundaries" | "commands"; reachable: boolean; route: string[]; note?: string }[];
  summary?: string;
  assessedRevision?: string | null;
  assessedBy?: string;
  assessedAt?: string;
}

/** The repository's maintenance agents as judged by the workflow-auditor: which janitors to run, when, and with what limits. A snapshot, replaced whole on each run. */
export interface MaintenanceAssessment {
  roster: {
    id: string;
    status: "present" | "absent" | "n_a";
    recommend: "now" | "after-prerequisites" | "not-yet" | "none";
    blockedBy?: string[];
    trigger?: string;
    environment?: string;
    detector?: string[];
    autofix?: string;
    needsHuman?: string;
    noiseControls?: string;
    success?: string;
    reason?: string;
    evidence: string[];
    findingIds?: string[];
  }[];
  summary?: string;
  assessedRevision?: string | null;
  assessedBy?: string;
  assessedAt?: string;
}

export interface AssessmentRecord {
  schemaVersion: 1;
  assessmentId: string;
  mode: Mode;
  rubricVersion: number;
  repo: { name: string; remote?: string | null; defaultBranch?: string | null };
  assessedRevision: string | null;
  recordRevision: number;
  createdAt: string;
  updatedAt: string;
  criteria: CriterionState[];
  findings: Finding[];
  milestones: Milestone[];
  tasks: Task[];
  evidence: Evidence[];
  approvals: Approval[];
  conventions: ConventionAssessment[];
  testing?: TestingAssessment[];
  docs?: DocsAssessment;
  maintenance?: MaintenanceAssessment;
  scoreHistory: ScoreEntry[];
  artifact: { url: string; publishedRecordRevision: number; publishedAt: string } | null;
}

export class UsageError extends Error {}
