import { describe, expect, it } from 'vitest';
import { apiUrl } from './api';

describe('apiUrl', () => {
  it('normalizes endpoint slashes when no API base is configured', () => {
    expect(apiUrl('/api/overview')).toBe('/api/overview');
    expect(apiUrl('//api/overview')).toBe('/api/overview');
    expect(apiUrl('api/overview')).toBe('/api/overview');
  });
});
