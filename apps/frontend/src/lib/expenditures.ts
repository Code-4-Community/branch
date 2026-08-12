import { authedFetch } from './authClient';
import type { ExpenditureDetail, ExpenditureStatus } from '@/types';

export async function getExpenditure(id: number): Promise<ExpenditureDetail> {
  const res = await authedFetch<{ body: ExpenditureDetail }>(`/expenditures/${id}`);
  return res.body;
}

export async function getReceiptUploadUrl(
  fileName: string,
  projectId: number,
): Promise<{ uploadUrl: string; objectUrl: string }> {
  return authedFetch(
    `/expenditures/upload-url?fileName=${encodeURIComponent(fileName)}&projectId=${projectId}`,
  );
}

/**
 * The bucket is not publicly readable, so a receipt is fetched through a
 * short-lived presigned URL rather than linking at its object URL directly.
 */
export async function getReceiptDownloadUrl(
  id: number,
): Promise<{ downloadUrl: string; fileName: string }> {
  return authedFetch(`/expenditures/${id}/receipt`);
}

export async function reviewExpenditure(
  id: number,
  status: ExpenditureStatus,
  adminNotes: string,
): Promise<void> {
  await authedFetch(`/expenditures/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, adminNotes }),
  });
}

/**
 * Uploads the receipt straight to S3 and reports real progress, which needs
 * XHR: fetch cannot report upload progress.
 */
export function uploadReceiptToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (transferredBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('File failed to upload'));
    };
    xhr.onerror = () => reject(new Error('File failed to upload'));
    xhr.onabort = () => reject(new Error('File failed to upload'));

    xhr.send(file);
  });
}
