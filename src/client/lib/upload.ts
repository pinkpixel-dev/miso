import type { ApiError, Asset } from '../../shared/types.ts';

/**
 * Uploads one file, reporting progress as it goes.
 *
 * XMLHttpRequest rather than fetch, because fetch cannot report how much of a
 * request body has been sent, and a 200 MB import with no progress looks like a
 * hung page.
 *
 * The body is the raw file. The service reads the name from x-miso-filename,
 * URI encoded so a non-ASCII name survives the header.
 */

export interface Upload {
  promise: Promise<Asset>;
  abort: () => void;
}

function messageFrom(request: XMLHttpRequest): string {
  try {
    const body = JSON.parse(request.responseText) as ApiError;
    return body.detail ? `${body.error}: ${body.detail}` : body.error;
  } catch {
    return `Upload failed with HTTP ${request.status}`;
  }
}

export function uploadAsset(
  projectId: string,
  file: File,
  onProgress: (fraction: number) => void,
): Upload {
  const request = new XMLHttpRequest();

  const promise = new Promise<Asset>((resolve, reject) => {
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as Asset);
        } catch {
          reject(new Error('The service answered something that was not an asset'));
        }
        return;
      }
      reject(new Error(messageFrom(request)));
    });

    request.addEventListener('error', () => reject(new Error('The upload could not reach Miso')));
    request.addEventListener('abort', () => reject(new Error('Upload cancelled')));
  });

  request.open('POST', `/api/projects/${encodeURIComponent(projectId)}/assets`);
  request.setRequestHeader('x-miso-filename', encodeURIComponent(file.name));
  request.send(file);

  return { promise, abort: () => request.abort() };
}
