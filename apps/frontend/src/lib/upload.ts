/**
 * Uploads a file to a presigned S3 PUT, reporting real byte progress.
 *
 * XHR rather than `fetch`, which exposes no upload progress. The request is
 * deliberately unauthenticated: the signature is in the URL, and an extra
 * Authorization header would not be part of what was signed.
 */
export function putWithProgress(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (transferredBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    // Must match the ContentType the URL was signed with, or S3 rejects the
    // signature -- so it comes from the caller, not from `file.type`.
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.send(file);
  });
}
