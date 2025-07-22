/**
 * Mock implementation for jose library
 * Used in server unit tests to avoid ESM import issues
 */

declare const jest: any;

export const jwtVerify = jest.fn().mockResolvedValue({
  payload: {
    sub: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  },
  protectedHeader: {
    alg: 'RS256',
  },
});

export const createRemoteJWKSet = jest.fn().mockReturnValue({
  getKey: jest.fn().mockResolvedValue({
    alg: 'RS256',
    kty: 'RSA',
    use: 'sig',
  }),
});

export const SignJWT = jest.fn().mockImplementation(() => ({
  setProtectedHeader: jest.fn().mockReturnThis(),
  setIssuedAt: jest.fn().mockReturnThis(),
  setExpirationTime: jest.fn().mockReturnThis(),
  setIssuer: jest.fn().mockReturnThis(),
  setAudience: jest.fn().mockReturnThis(),
  setSubject: jest.fn().mockReturnThis(),
  sign: jest.fn().mockResolvedValue('mock-jwt-token'),
}));

export const importSPKI = jest.fn().mockResolvedValue({
  alg: 'RS256',
  kty: 'RSA',
  use: 'sig',
});

export const importPKCS8 = jest.fn().mockResolvedValue({
  alg: 'RS256',
  kty: 'RSA',
  use: 'sig',
});