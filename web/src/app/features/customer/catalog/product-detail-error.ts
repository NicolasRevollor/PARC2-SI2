import { HttpErrorResponse } from '@angular/common/http';

export type ProductDetailError = 'not-found' | 'load-failed';

export function classifyProductDetailError(error: unknown): ProductDetailError {
  return error instanceof HttpErrorResponse && error.status === 404
    ? 'not-found'
    : 'load-failed';
}
