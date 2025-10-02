export enum TaskCategory {
  DRAFT = 'Draft',
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
}

export const CATEGORY_DESCRIPTIONS: Record<TaskCategory, string> = {
  [TaskCategory.DRAFT]: 'Tasks that are still being planned or outlined',
  [TaskCategory.TODO]: 'Tasks that are ready to be worked on',
  [TaskCategory.IN_PROGRESS]: 'Tasks that are currently being worked on',
  [TaskCategory.COMPLETED]: 'Tasks that have been finished',
};

export const CATEGORY_COLORS: Record<TaskCategory, string> = {
  [TaskCategory.DRAFT]: '#6B7280', // Gray
  [TaskCategory.TODO]: '#3B82F6', // Blue
  [TaskCategory.IN_PROGRESS]: '#F59E0B', // Orange
  [TaskCategory.COMPLETED]: '#10B981', // Green
};
