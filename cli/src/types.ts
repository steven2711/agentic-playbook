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
  scoreHistory: ScoreEntry[];
  artifact: { url: string; publishedRecordRevision: number; publishedAt: string } | null;
}

export class UsageError extends Error {}
