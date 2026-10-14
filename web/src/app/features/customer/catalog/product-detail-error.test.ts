import '@angular/compiler';
import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpErrorResponse } from '@angular/common/http';
import { classifyProductDetailError } from './product-detail-error';

test('classifies only HTTP 404 as a missing product', () => {
  assert.equal(
    classifyProductDetailError(new HttpErrorResponse({ status: 404 })),
    'not-found'
  );
  assert.equal(
    classifyProductDetailError(new HttpErrorResponse({ status: 500 })),
    'load-failed'
  );
  assert.equal(classifyProductDetailError(new Error('Network failure')), 'load-failed');
});
