import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { PayloadTooLargeError, ValidationError } from '@dexa/common';
import {
  ErrorCode,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_UPLOAD_BYTES,
  PHOTO_FIELD_NAME,
} from '@dexa/contracts';
import multer from 'multer';
import type { Request, RequestHandler, Response } from 'express';
import type { Observable } from 'rxjs';
import { finished } from 'node:stream/promises';

const PHOTO_TOO_LARGE_MESSAGE = 'The photo must be 5 MiB or smaller.';
const PHOTO_UPLOAD_REJECTED_MESSAGE = 'Send one photo as a multipart file in the photo field.';

// The same limits as employee-service, so an oversized upload stops at the edge and never reaches the internal call.
const photoUpload: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 },
}).single(PHOTO_FIELD_NAME);

/**
 * Refuses an oversized upload before multer reads its body, from the declared Content-Length. The rest of the body
 * is read and dropped, never stored, so the client finishes sending and receives the 413.
 */
@Injectable()
export class PhotoUploadInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (declaresOversizedBody(request)) {
      // A client that disconnects mid-body has no one left to answer, so the failure is not reported.
      await finished(request.resume()).catch(() => undefined);
      throw photoTooLargeError();
    }
    await runPhotoUpload(request, http.getResponse<Response>());
    if (request.file === undefined) throw photoUploadRejectedError();
    return next.handle();
  }
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

function photoTooLargeError(): PayloadTooLargeError {
  return new PayloadTooLargeError(ErrorCode.PHOTO_TOO_LARGE, PHOTO_TOO_LARGE_MESSAGE);
}

function photoUploadRejectedError(cause?: unknown): ValidationError {
  return new ValidationError(ErrorCode.VALIDATION_FAILED, PHOTO_UPLOAD_REJECTED_MESSAGE, { cause });
}
