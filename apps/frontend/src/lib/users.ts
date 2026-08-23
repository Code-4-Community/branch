import { authedFetch } from './authClient';
import type { UserDetail } from '@/types';

export async function getUser(userId: number): Promise<UserDetail> {
  const res = await authedFetch<{ body: UserDetail }>(`/users/${userId}`);
  return res.body;
}

/**
 * `PATCH /users/{userId}` returns the identity fields under `body`, with the
 * photo as `profileImage` rather than the `profile_image` the GET uses.
 */
export async function updateUser(
  userId: number,
  updates: { name?: string; profileImage?: string },
): Promise<UserDetail> {
  const res = await authedFetch<{
    body: { email: string; name: string; isAdmin: boolean; profileImage: string | null; created_at?: string | null };
  }>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  return {
    userId,
    name: res.body.name,
    email: res.body.email,
    isAdmin: res.body.isAdmin,
    profile_image: res.body.profileImage,
    created_at: res.body.created_at ?? null,
  };
}

export async function getPhotoUploadUrl(
  userId: number,
  fileName: string,
): Promise<{ uploadUrl: string; key: string; contentType: string }> {
  return authedFetch(
    `/users/${userId}/photo-upload-url?fileName=${encodeURIComponent(fileName)}`,
  );
}

/** Extensions the backend will presign, mirrored here to reject early. */
export const PHOTO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

export function isSupportedPhoto(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return !!extension && PHOTO_EXTENSIONS.includes(extension);
}

/**
 * Uploads straight to S3 and reports real progress, which needs XHR: fetch
 * cannot report upload progress.
 *
 * `contentType` comes from the presign response, not from the file: the
 * signature covers the exact Content-Type the backend signed, so sending the
 * browser's guess instead would make S3 reject the PUT.
 */
export function uploadPhotoToS3(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (transferredBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);

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
