import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { MAX_PHOTO_BYTES, MAX_PHOTO_UPLOAD_BYTES, PHOTO_FIELD_NAME } from '@dexa/contracts';
import multer from 'multer';
import type { Request, RequestHandler, Response } from 'express';
import type { Observable } from 'rxjs';
import { finished } from 'node:stream/promises';
import { photoTooLargeError, photoUploadRejectedError } from './photo.errors.js';

// Multer keeps the file in memory, and the limits stop it before the file is buffered past the photo size. One file
// in the photo field is the only part the route accepts.
const photoUpload: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 },
}).single(PHOTO_FIELD_NAME);

/**
 * Refuses an oversized upload before multer reads its body, using the declared Content-Length.
 * A body with no declared length is still bounded by the multer file size limit.
 */
@Injectable()
export class PhotoUploadInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (declaresOversizedBody(request)) {
      await discardBody(request);
      throw photoTooLargeError();
    }
    await runPhotoUpload(request, http.getResponse<Response>());
    if (request.file === undefined) throw photoUploadRejectedError();
    return next.handle();
  }
}

// The rest of the body is read and dropped, never stored, so the client finishes sending and receives the 413. It
// matches the multer limit path, which also drains the body before it answers.
async function discardBody(request: Request): Promise<void> {
  // A client that disconnects mid-body has no one left to answer, so the failure is not reported.
  await finished(request.resume()).catch(() => undefined);
}

function declaresOversizedBody(request: Request): boolean {
  const declaredLength = request.headers['content-length'];
  return declaredLength !== undefined && Number(declaredLength) > MAX_PHOTO_UPLOAD_BYTES;
}

function runPhotoUpload(request: Request, response: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    photoUpload(request, response, (error?: unknown) => {
      if (error === undefined) resolve();
      else reject(toPhotoUploadError(error));
    });
  });
}

function toPhotoUploadError(error: unknown): unknown {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return photoTooLargeError();
  }
  return photoUploadRejectedError(error);
}
