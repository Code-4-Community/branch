import { sql } from 'kysely';
import { json, RouteHandler } from '@branch/lambda-http';
import db from '../db';
import { APPROVED_EXPENDITURE_STATUS } from '../validation-utils';
import { isProjectActive } from '../services/projects';
import { requireVisibleProject } from './project-guard';

// Authentication and each route's declared permission are enforced by dispatch
// before these run — see routes.ts. `dashboard:view` is admin-only, so this
// handler no longer re-checks it.

// GET /projects/dashboard
export const getDashboard: RouteHandler = async () => {
  try {
    // Cards read "this year" / "active projects", so spend is scoped to the
    // calendar year and the count to projects that have not ended. The
    // per-project budget breakdown below stays lifetime-to-date.
    const now = new Date();
    const year = now.getUTCFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const today = now.toISOString().slice(0, 10);

    // Projects stay active until their end_date passes; a null end_date
    // never ends. Shared by the count and by the spend feeding the average
    // so the two can never drift out of agreement.
    const isActive = (column: any) => (eb: any) =>
      eb.or([eb(column, 'is', null), eb(column, '>=', today as any)]);

    // Postgres does the month bucketing. Selecting raw rows and grouping them
    // in JS moved one row per expenditure into the lambda to produce at most
    // 12 x categories of them, and read a DATE through the runtime's local
    // timezone, which only lands on the right month because lambda runs UTC.
    const monthExpr = sql<string>`to_char(date_trunc('month', spent_on), 'YYYY-MM')`;

    const [
      totalSpentRow,
      totalProjectsRow,
      topCategoryRow,
      activeSpentRow,
      projectRows,
      monthRows,
    ] = await Promise.all([
      db.selectFrom('branch.expenditures')
        .select(db.fn.sum('amount').as('total'))
        .where('status', '=', APPROVED_EXPENDITURE_STATUS)
        .where('spent_on', '>=', yearStart as any)
        .where('spent_on', '<=', yearEnd as any)
        .executeTakeFirst(),
      db.selectFrom('branch.projects')
        .select(db.fn.count('project_id').as('count'))
        .where(isActive('end_date'))
        .executeTakeFirst(),
      db.selectFrom('branch.expenditures')
        .select(['category', db.fn.sum('amount').as('total')])
        .where('status', '=', APPROVED_EXPENDITURE_STATUS)
        .where('category', 'is not', null)
        .where('spent_on', '>=', yearStart as any)
        .where('spent_on', '<=', yearEnd as any)
        .groupBy('category')
        .orderBy(db.fn.sum('amount'), 'desc')
        .limit(1)
        .executeTakeFirst(),
      // Numerator for the average: this year's spend on the very projects the
      // denominator counts. expenditures.project_id is NOT NULL against a FK,
      // so the join can never drop a row.
      db.selectFrom('branch.expenditures as e')
        .innerJoin('branch.projects as p', 'p.project_id', 'e.project_id')
        .select((eb) => eb.fn.sum('e.amount').as('total'))
        .where('e.status', '=', APPROVED_EXPENDITURE_STATUS)
        .where('e.spent_on', '>=', yearStart as any)
        .where('e.spent_on', '<=', yearEnd as any)
        .where(isActive('p.end_date'))
        .executeTakeFirst(),
      // Spend and headcount arrive as pre-aggregated subqueries. Joining the
      // raw tables onto projects instead would multiply every expenditure by
      // the membership count and silently inflate `spent`.
      db.selectFrom('branch.projects as p')
        .leftJoin(
          (eb) =>
            eb.selectFrom('branch.expenditures')
              .select('project_id')
              .select((sub) => sub.fn.sum('amount').as('total'))
              .where('status', '=', APPROVED_EXPENDITURE_STATUS)
              .groupBy('project_id')
              .as('spend'),
          (join) => join.onRef('spend.project_id', '=', 'p.project_id'),
        )
        .leftJoin(
          (eb) =>
            eb.selectFrom('branch.project_memberships')
              .select('project_id')
              .select((sub) => sub.fn.count('user_id').as('count'))
              .groupBy('project_id')
              .as('staff'),
          (join) => join.onRef('staff.project_id', '=', 'p.project_id'),
        )
        .select([
          'p.project_id',
          'p.name',
          'p.total_budget',
          'p.currency',
          'spend.total as spent',
          'staff.count as staff_count',
        ])
        .orderBy('p.project_id', 'asc')
        .execute(),
      db.selectFrom('branch.expenditures')
        .select([monthExpr.as('month'), 'category', db.fn.sum('amount').as('total')])
        .where('status', '=', APPROVED_EXPENDITURE_STATUS)
        .where('category', 'is not', null)
        .where('spent_on', '>=', yearStart as any)
        .where('spent_on', '<=', yearEnd as any)
        .groupBy([monthExpr, 'category'])
        .orderBy(monthExpr)
        .orderBy('category')
        .execute(),
    ]);

    const totalSpent = Number(totalSpentRow?.total ?? 0);
    const totalProjects = Number(totalProjectsRow?.count ?? 0);

    // True aggregate over active projects: this year's spend on active
    // projects divided by how many there are. Dividing the all-projects total
    // by the active count inflated the figure whenever a project ended
    // mid-year, since its spend stayed in the numerator.
    const activeSpent = Number(activeSpentRow?.total ?? 0);
    const averageSpendPerProject = totalProjects > 0 ? activeSpent / totalProjects : 0;

    const projects = projectRows.map((p) => {
      const budget = p.total_budget !== null ? Number(p.total_budget) : null;
      const spent = Number(p.spent ?? 0);
      const spentPercentage = budget && budget > 0 ? (spent / budget) * 100 : 0;
      return {
        project_id: p.project_id,
        name: p.name,
        total_budget: budget,
        currency: p.currency,
        spent,
        staff_count: Number(p.staff_count ?? 0),
        spent_percentage: Number(spentPercentage.toFixed(2)),
      };
    });

    const expensesByMonth = monthRows.map((r) => ({
      month: r.month,
      category: r.category as string,
      amount: Number(r.total),
    }));

    // Computed here, not client-side: totalSpent is the divisor and may be 0.
    const topCategoryAmount = Number(topCategoryRow?.total ?? 0);
    const topExpenseCategory = topCategoryRow
      ? {
          category: topCategoryRow.category,
          amount: topCategoryAmount,
          percentage:
            totalSpent > 0
              ? Number(((topCategoryAmount / totalSpent) * 100).toFixed(2))
              : 0,
        }
      : null;

    return json(200, {
      year,
      summary: {
        topExpenseCategory,
        totalSpent,
        totalProjects,
        averageSpendPerProject: Number(averageSpendPerProject.toFixed(2)),
      },
      projects,
      expensesByMonth,
    });
  } catch (err) {
    console.error('Dashboard query failed:', err);
    return json(500, { message: 'Failed to load dashboard' });
  }
};

// GET /projects/{id}/overview
// One call for the whole detail page: the header, the funding donut, the
// staff column and the expenses table previously needed three round trips
// and still could not show a spend total without summing on the client.
export const getOverview: RouteHandler = async (ctx) => {
  const { projectId: id, response } = requireVisibleProject(ctx);
  if (response) return response;

  const project = await db
    .selectFrom('branch.projects')
    .where('project_id', '=', id)
    .selectAll()
    .executeTakeFirst();
  if (!project) return json(404, { message: `Project not found for id: ${id}` });

  const [members, expenditures, donationRow] = await Promise.all([
    db
      .selectFrom('branch.project_memberships as pm')
      .innerJoin('branch.users as u', 'u.user_id', 'pm.user_id')
      .select(['u.user_id', 'u.name', 'u.email', 'u.profile_image', 'pm.role'])
      .where('pm.project_id', '=', id)
      .orderBy('u.name', 'asc')
      .execute(),
    db
      .selectFrom('branch.expenditures')
      .where('project_id', '=', id)
      .selectAll()
      .orderBy('spent_on', 'desc')
      .execute(),
    db
      .selectFrom('branch.project_donations')
      .select(db.fn.sum('amount').as('total'))
      .where('project_id', '=', id)
      .executeTakeFirst(),
  ]);

  const totalBudget = project.total_budget !== null ? Number(project.total_budget) : 0;
  // The table below lists every expenditure, including the ones still in
  // review; the stats beside it count only what was approved.
  const approved = expenditures.filter((e) => e.status === APPROVED_EXPENDITURE_STATUS);
  const totalSpent = approved.reduce((sum, e) => sum + Number(e.amount), 0);
  // Guarded because a project may legitimately have no budget set yet, and
  // 0/0 would render as NaN% in the donut.
  const spentPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return json(200, {
    project,
    stats: {
      totalBudget,
      totalSpent,
      totalRemaining: totalBudget - totalSpent,
      spentPercentage: Number(spentPercentage.toFixed(2)),
      totalDonated: Number(donationRow?.total ?? 0),
      memberCount: members.length,
      expenditureCount: approved.length,
    },
    members,
    expenditures,
    isActive: isProjectActive(project.end_date),
  });
};
