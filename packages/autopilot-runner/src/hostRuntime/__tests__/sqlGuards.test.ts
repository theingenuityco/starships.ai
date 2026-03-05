import { ensureSingleStatement, hostMatchesAllowlist, isPrivateIp, isReadOnlyStatement, stripSqlCommentsAndTrim } from '../sqlGuards';

describe('sqlGuards', () => {
  test('stripSqlCommentsAndTrim removes block and line comments', () => {
    expect(stripSqlCommentsAndTrim(' /*x*/ SELECT 1 -- ok\n')).toBe('SELECT 1');
  });

  test('ensureSingleStatement rejects multiple statements', () => {
    expect(() => ensureSingleStatement('SELECT 1; SELECT 2')).toThrow(/Multiple SQL statements/i);
  });

  test('ensureSingleStatement allows trailing semicolon', () => {
    expect(ensureSingleStatement('SELECT 1;')).toBe('SELECT 1');
  });

  test('isReadOnlyStatement detects read-only statements', () => {
    expect(isReadOnlyStatement('SELECT 1')).toBe(true);
    expect(isReadOnlyStatement('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
    expect(isReadOnlyStatement('SHOW search_path')).toBe(true);
    expect(isReadOnlyStatement('EXPLAIN SELECT 1')).toBe(true);
    expect(isReadOnlyStatement('WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x')).toBe(false);
    expect(isReadOnlyStatement('INSERT INTO t(a) VALUES (1)')).toBe(false);
    expect(isReadOnlyStatement('UPDATE t SET a=1')).toBe(false);
  });

  test('isPrivateIp detects common private/loopback ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.2')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  test('hostMatchesAllowlist supports exact and wildcard subdomains', () => {
    expect(hostMatchesAllowlist('db.example.com', ['db.example.com'])).toBe(true);
    expect(hostMatchesAllowlist('db.example.com', ['*.example.com'])).toBe(true);
    expect(hostMatchesAllowlist('example.com', ['*.example.com'])).toBe(false);
  });
});

