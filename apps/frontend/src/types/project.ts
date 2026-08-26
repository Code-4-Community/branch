import {
  ADMIN_MEMBER_ROLE,
  DEFAULT_PROJECT_ROLE,
  PROJECT_ROLES,
  type MemberDisplayRole,
  type ProjectRole,
} from '@branch/rbac';
import type { Expenditure } from './expenditure';

export interface Project {
    project_id: number;
    name: string;
    description: string;
    total_budget: string | null;
    start_date: string | null;
    end_date: string | null;
    currency: string | null;
    created_at: string | null;
};

export {
  ADMIN_MEMBER_ROLE,
  DEFAULT_PROJECT_ROLE,
  PROJECT_ROLES,
  type MemberDisplayRole,
  type ProjectRole,
};

export interface Member {
  user_id: number;
  name: string;
  email: string;
  role: MemberDisplayRole;
  profile_image?: string | null;
}

/**
 * A row from `GET /projects`. The aggregates are computed server-side so the
 * list can render "spent / budget", a headcount and the active/archived split
 * without a request per card.
 */
export interface ProjectSummary extends Project {
  total_spent: number;
  member_count: number;
  is_active: boolean;
}

/** Financial roll-up returned alongside the project by `GET /projects/{id}/overview`. */
export interface ProjectStats {
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  /** 0–100, already guarded against a zero budget. */
  spentPercentage: number;
  totalDonated: number;
  memberCount: number;
  expenditureCount: number;
}

export interface ProjectOverview {
  project: Project;
  stats: ProjectStats;
  members: Member[];
  expenditures: Expenditure[];
  isActive: boolean;
  /**
   * Whether the caller may edit this project. Decided server-side because the
   * rule is "admin **or** a Director on this project" — not something the
   * client can work out from the session alone.
   */
}

/** A user who can be assigned to a project, from `GET /projects/assignable-staff`. */
export interface AssignableStaff {
  user_id: number;
  name: string;
  email: string;
  profile_image?: string | null;
}

export interface MemberAssignment {
  user_id: number;
  role: ProjectRole;
}

/** Body accepted by `POST /projects` and `PUT /projects/{id}`. */
export interface ProjectWriteBody {
  name: string;
  description: string;
  total_budget: string | null;
  start_date: string | null;
  end_date: string | null;
  members: MemberAssignment[];
}
