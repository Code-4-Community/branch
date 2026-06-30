import { apiFetch } from './api';

export interface Report {
  report_id: number;
  project_id: number;
  title: string;
  object_url: string;
  report_type: 'technical' | 'narrative';
  date_created: string;
}

export interface Project {
  project_id: number;
  name: string;
}

export async function getReports(token: string, projectId?: number): Promise<Report[]> {
  const query = projectId ? `?projectId=${projectId}` : '';
  const res = await apiFetch<{ data: Report[] }>(`/reports${query}`, { token });
  return res.data ?? [];
}

export async function getUploadUrl(
  fileName: string,
  projectId: number,
  token: string,
): Promise<{ uploadUrl: string; objectUrl: string }> {
  return apiFetch(`/reports/upload-url?fileName=${encodeURIComponent(fileName)}&projectId=${projectId}`, { token });
}

export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!res.ok) throw new Error('Failed to upload file to S3');
}

export async function createReport(
  title: string,
  projectId: number,
  objectUrl: string,
  reportType: 'technical' | 'narrative',
  token: string,
): Promise<Report> {
  return apiFetch('/reports', {
    method: 'POST',
    token,
    body: JSON.stringify({ title, projectId, objectUrl, reportType }),
  });
}

export async function uploadReport(
  file: File,
  title: string,
  projectId: number,
  reportType: 'technical' | 'narrative',
  token: string,
): Promise<Report> {
  const { uploadUrl, objectUrl } = await getUploadUrl(file.name, projectId, token);
  await uploadFileToS3(uploadUrl, file);
  return createReport(title, projectId, objectUrl, reportType, token);
}
