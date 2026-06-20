import { authenticateRequest as _authenticateRequest } from '@branch/lambda-auth';
import db from './db';

export * from '@branch/lambda-auth';

export async function authenticateRequest(
  event: any,
): Promise<import('@branch/lambda-auth').AuthContext> {
  return _authenticateRequest(db, event);
}

export async function canAccessProject(
  userId: number,
  projectId: number,
): Promise<boolean> {
  try {
    const user = await db
      .selectFrom('branch.users')
      .where('user_id', '=', userId)
      .select('is_admin')
      .executeTakeFirst();

    if (user?.is_admin) return true;

    const membership = await db
      .selectFrom('branch.project_memberships')
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .selectAll()
      .executeTakeFirst();

    return !!membership;
  } catch (error) {
    console.error('Error checking project access:', error);
    return false;
  }
}

export async function canEditProject(
  userId: number,
  projectId: number,
): Promise<boolean> {
  try {
    const user = await db
      .selectFrom('branch.users')
      .where('user_id', '=', userId)
      .select('is_admin')
      .executeTakeFirst();

    if (user?.is_admin) return true;

    const membership = await db
      .selectFrom('branch.project_memberships')
      .where('user_id', '=', userId)
      .where('project_id', '=', projectId)
      .select('role')
      .executeTakeFirst();

    if (!membership) return false;

    const editableRoles = ['PI', 'Accountant', 'Admin'];
    return editableRoles.includes(membership.role);
  } catch (error) {
    console.error('Error checking edit access:', error);
    return false;
  }
}

export async function canCreateProject(userId: number): Promise<boolean> {
  try {
    const user = await db
      .selectFrom('branch.users')
      .where('user_id', '=', userId)
      .select('is_admin')
      .executeTakeFirst();

    return user?.is_admin || false;
  } catch (error) {
    console.error('Error checking create access:', error);
    return false;
  }
}
