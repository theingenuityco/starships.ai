import { buildBasicAuthHeaderValue, encodeBasicAuthCredentials } from '@/utils/basicAuth';

describe('basicAuth', () => {
  test('encodes username:password as RFC7617 base64', () => {
    expect(encodeBasicAuthCredentials('user', 'pass')).toBe('dXNlcjpwYXNz');
    expect(buildBasicAuthHeaderValue('user', 'pass')).toBe('Basic dXNlcjpwYXNz');
  });

  test('supports API-key-only case (empty password => trailing colon)', () => {
    expect(encodeBasicAuthCredentials('API_KEY')).toBe(Buffer.from('API_KEY:', 'utf8').toString('base64'));
    expect(buildBasicAuthHeaderValue('API_KEY')).toBe(`Basic ${Buffer.from('API_KEY:', 'utf8').toString('base64')}`);
  });
});


