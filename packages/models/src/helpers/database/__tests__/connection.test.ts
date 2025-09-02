/**
 * Neo4j Database Connection Unit Tests
 */

import { Neo4jConnection, createConnection, getConnection, resetConnection, Neo4jConfig } from '../connection';
import neo4j, { Driver, Session, ManagedTransaction, Integer } from 'neo4j-driver';

// Mock neo4j-driver
jest.mock('neo4j-driver', () => {
  const mockInteger = jest.fn((value: number) => ({ toNumber: () => value, toString: () => value.toString() }));
  
  return {
    driver: jest.fn(),
    auth: {
      basic: jest.fn()
    },
    isInt: jest.fn(),
    int: mockInteger,
    Integer: mockInteger
  };
});

describe('Neo4jConnection', () => {
  let mockDriver: any;
  let mockSession: any;
  let mockTransaction: any;
  let connection: Neo4jConnection;
  
  const testConfig: Neo4jConfig = {
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password',
    database: 'neo4j'
  };

  beforeEach(() => {
    mockTransaction = {
      run: jest.fn()
    };

    mockSession = {
      close: jest.fn(),
      executeRead: jest.fn(),
      executeWrite: jest.fn(),
      run: jest.fn()
    };

    mockDriver = {
      verifyConnectivity: jest.fn(),
      close: jest.fn(),
      session: jest.fn(() => mockSession)
    };

    (neo4j.driver as jest.Mock).mockReturnValue(mockDriver);
    connection = new Neo4jConnection(testConfig);
    
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create connection with config', () => {
      expect(connection).toBeInstanceOf(Neo4jConnection);
      expect((connection as any).config).toEqual(testConfig);
    });
  });

  describe('connect', () => {
    it('should connect to Neo4j successfully', async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);

      await connection.connect();

      expect(neo4j.driver).toHaveBeenCalledWith(
        testConfig.uri,
        neo4j.auth.basic(testConfig.username, testConfig.password),
        expect.objectContaining({
          connectionTimeout: 5000,
          maxConnectionLifetime: 30000,
          maxConnectionPoolSize: 100,
          connectionAcquisitionTimeout: 10000,
          encrypted: false,
          trust: 'TRUST_ALL_CERTIFICATES'
        })
      );
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);

      await connection.connect();
      await connection.connect(); // Second call

      expect(neo4j.driver).toHaveBeenCalledTimes(1);
      expect(mockDriver.verifyConnectivity).toHaveBeenCalledTimes(1);
    });

    it('should handle connection timeout', async () => {
      // Use fake timers to speed up the test
      jest.useFakeTimers();
      
      // Mock verifyConnectivity to never resolve, simulating a timeout scenario
      mockDriver.verifyConnectivity.mockImplementation(
        () => new Promise(() => {
          // Never resolves, causing the timeout to trigger
        })
      );

      // Start the connection attempt
      const connectPromise = connection.connect();
      
      // Fast-forward time to trigger the timeout
      jest.advanceTimersByTime(5000);
      
      await expect(connectPromise).rejects.toThrow('Neo4j connection timeout');
      
      // Restore real timers
      jest.useRealTimers();
    });

    it('should handle connection failure', async () => {
      const connectionError = new Error('Connection failed');
      mockDriver.verifyConnectivity.mockRejectedValue(connectionError);

      await expect(connection.connect()).rejects.toThrow('Connection failed');
      expect(console.error).toHaveBeenCalledWith('Failed to connect to Neo4j:', connectionError);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Neo4j', async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);
      await connection.connect();

      await connection.disconnect();

      expect(mockDriver.close).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await connection.disconnect();

      expect(mockDriver.close).not.toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('should create session with database config', async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);
      await connection.connect();

      const session = connection.getSession();

      expect(mockDriver.session).toHaveBeenCalledWith({
        database: testConfig.database
      });
      expect(session).toBe(mockSession);
    });

    it('should throw error when driver not connected', () => {
      expect(() => connection.getSession()).toThrow(
        'Neo4j driver is not connected. Call connect() first.'
      );
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);
      await connection.connect();
    });

    it('should execute read query successfully', async () => {
      const mockResult = {
        records: [
          {
            toObject: () => ({ u: { properties: { id: 'user-1', name: 'John' } } })
          }
        ]
      };

      mockSession.executeRead.mockImplementation((fn: any) => {
        return fn(mockTransaction).then(() => mockResult);
      });
      mockTransaction.run.mockResolvedValue(mockResult);

      const result = await connection.executeQuery('MATCH (u:User) RETURN u', { id: 'user-1' });

      expect(mockSession.executeRead).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();
      expect(result).toEqual([{ u: { id: 'user-1', name: 'John' } }]);
    });

    it('should handle query with no records', async () => {
      const mockResult = { records: [] };

      mockSession.executeRead.mockImplementation((fn: any) => {
        return fn(mockTransaction).then(() => mockResult);
      });
      mockTransaction.run.mockResolvedValue(mockResult);

      const result = await connection.executeQuery('MATCH (u:User) WHERE u.id = $id RETURN u', { id: 'nonexistent' });

      expect(result).toEqual([]);
    });

    it('should sanitize parameters before execution', async () => {
      const mockResult = { records: [] };
      const parametersWithMap = {
        id: 'user-1',
        metadata: new Map([['key', 'value']]),
        limit: 10
      };

      mockSession.executeRead.mockImplementation((fn: any) => {
        return fn(mockTransaction).then(() => mockResult);
      });
      mockTransaction.run.mockResolvedValue(mockResult);

      await connection.executeQuery('MATCH (u:User) RETURN u LIMIT $limit', parametersWithMap);

      expect(mockTransaction.run).toHaveBeenCalledWith(
        'MATCH (u:User) RETURN u LIMIT $limit',
        expect.objectContaining({
          id: 'user-1',
          metadata: { key: 'value' },
          limit: expect.any(Object) // Neo4j Integer object
        })
      );
    });

    it('should close session even if query fails', async () => {
      const queryError = new Error('Query failed');
      mockSession.executeRead.mockRejectedValue(queryError);

      await expect(
        connection.executeQuery('INVALID QUERY')
      ).rejects.toThrow('Query failed');

      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should handle records with non-node objects', async () => {
      const mockResult = {
        records: [
          {
            toObject: () => ({
              count: 5,
              name: 'test',
              node: { properties: { id: 'node-1' } }
            })
          }
        ]
      };

      mockSession.executeRead.mockImplementation((fn: any) => {
        return Promise.resolve(fn(mockTransaction)).then(() => mockResult);
      });
      mockTransaction.run.mockResolvedValue(mockResult);

      const result = await connection.executeQuery('MATCH (n) RETURN count(n) as count');

      expect(result).toEqual([{
        count: 5,
        name: 'test',
        node: { id: 'node-1' }
      }]);
    });
  });

  describe('executeWrite', () => {
    beforeEach(async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);
      await connection.connect();
    });

    it('should execute write query successfully', async () => {
      const mockResult = {
        records: [
          {
            toObject: () => ({ u: { properties: { id: 'user-1', name: 'John' } } })
          }
        ]
      };

      mockSession.executeWrite.mockImplementation((fn: any) => {
        return fn(mockTransaction).then(() => mockResult);
      });
      mockTransaction.run.mockResolvedValue(mockResult);

      const result = await connection.executeWrite(
        'CREATE (u:User $props) RETURN u',
        { props: { id: 'user-1', name: 'John' } }
      );

      expect(mockSession.executeWrite).toHaveBeenCalled();
      expect(mockSession.close).toHaveBeenCalled();
      expect(result).toEqual([{ u: { id: 'user-1', name: 'John' } }]);
    });

    it('should handle write query errors gracefully', async () => {
      const writeError = new Error('Write failed');
      mockSession.executeWrite.mockRejectedValue(writeError);

      await expect(
        connection.executeWrite('CREATE (u:User) RETURN u')
      ).rejects.toThrow('Write failed');

      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('initializeSchema', () => {
    beforeEach(async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(undefined);
      await connection.connect();
    });

    it('should create constraints and indexes successfully', async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await connection.initializeSchema();

      // Should create constraints
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT agent_id_unique')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT user_id_unique')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT starship_id_unique')
      );

      // Should create indexes
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX agent_name_index')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX user_email_index')
      );

      expect(mockSession.close).toHaveBeenCalled();
    });

    it('should handle schema initialization errors', async () => {
      const schemaError = new Error('Schema creation failed');
      mockSession.run.mockRejectedValue(schemaError);

      await expect(connection.initializeSchema()).rejects.toThrow('Schema creation failed');
      expect(console.error).toHaveBeenCalledWith('Failed to initialize Neo4j schema:', schemaError);
      expect(mockSession.close).toHaveBeenCalled();
    });
  });

  describe('sanitizeParameters', () => {
    let sanitizeMethod: any;

    beforeEach(() => {
      sanitizeMethod = (connection as any).sanitizeParameters.bind(connection);
    });

    it('should handle null and undefined values', () => {
      expect(sanitizeMethod(null)).toBe(null);
      expect(sanitizeMethod(undefined)).toBe(undefined);
    });

    it('should preserve Neo4j Integer objects', () => {
      const mockInt = { toNumber: () => 123 };
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(true);

      const result = sanitizeMethod(mockInt);

      expect(result).toBe(mockInt);
    });

    it('should convert Map objects to plain objects', () => {
      const map = new Map([['key1', 'value1'], ['key2', 'value2']]);
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(false);

      const result = sanitizeMethod(map);

      expect(result).toEqual({ key1: 'value1', key2: 'value2' }); // Maps are converted to plain objects
    });

    it('should handle nested Map objects', () => {
      const nestedMap = new Map([
        ['outer', new Map([['inner', 'value']])]
      ]);
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(false);

      const result = sanitizeMethod(nestedMap);

      expect(result).toEqual({
        outer: { inner: 'value' }
      }); // Nested Maps are recursively converted
    });

    it('should sanitize arrays', () => {
      const array = [new Map([['key', 'value']]), 'string', 123];
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(false);

      const result = sanitizeMethod(array);

      expect(result).toEqual([{ key: 'value' }, 'string', expect.any(Object)]); // Map converted, number becomes Neo4j Integer
    });

    it('should convert integers to Neo4j integers', () => {
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(false);
      
      const result = sanitizeMethod(42);

      expect(neo4j.int).toHaveBeenCalledWith(42);
      expect(result).toEqual(expect.any(Object));
    });

    it('should handle limit parameter specially', () => {
      const params = { limit: 10, other: 'value' };
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(false);

      const result = sanitizeMethod(params);

      expect(neo4j.int).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        limit: expect.any(Object),
        other: 'value'
      });
    });

    it('should preserve primitive types', () => {
      expect(sanitizeMethod('string')).toBe('string');
      expect(sanitizeMethod(true)).toBe(true);
      expect(sanitizeMethod(3.14)).toBe(3.14); // Non-integer numbers preserved
    });

    it('should handle deep recursion protection', () => {
      // Create a circular reference object
      const circular: any = { value: 'test' };
      circular.self = circular;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = sanitizeMethod(circular, 11); // Exceed max depth

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Neo4j] Maximum sanitization depth reached, returning value as-is:', 
        'object'
      );

      consoleSpy.mockRestore();
    });

    it('should handle complex nested structures', () => {
      const complex = {
        array: [1, 2, new Map([['nested', true]])],
        map: new Map([['key', { inner: 'value' }]]),
        limit: 50,
        string: 'text'
      };
      (neo4j.isInt as unknown as jest.Mock).mockReturnValue(false);

      const result = sanitizeMethod(complex);

      expect(result).toEqual({
        array: [expect.any(Object), expect.any(Object), { nested: true }],
        map: { key: { inner: 'value' } },
        limit: expect.any(Object), // Neo4j Integer
        string: 'text'
      });
    });
  });
});

describe('Connection Factory Functions', () => {
  const testConfig: Neo4jConfig = {
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password'
  };

  beforeEach(() => {
    // Reset the connection instance
    resetConnection();
    jest.clearAllMocks();
  });

  describe('createConnection', () => {
    it('should create new connection instance', () => {
      const connection = createConnection(testConfig);

      expect(connection).toBeInstanceOf(Neo4jConnection);
    });

    it('should return same instance on subsequent calls', () => {
      const connection1 = createConnection(testConfig);
      const connection2 = createConnection(testConfig);

      expect(connection1).toBe(connection2);
    });
  });

  describe('getConnection', () => {
    it('should return existing connection instance', () => {
      const createdConnection = createConnection(testConfig);
      const retrievedConnection = getConnection();

      expect(retrievedConnection).toBe(createdConnection);
    });

    it('should throw error when no connection exists', () => {
      // Reset the connection instance to simulate no connection
      resetConnection();
      
      expect(() => getConnection()).toThrow(
        'Neo4j connection not initialized. Call createConnection() first.'
      );
    });
  });
});

describe('Neo4jConnection Integration Scenarios', () => {
  let connection: Neo4jConnection;
  let mockDriver: any;
  let mockSession: any;

  const testConfig: Neo4jConfig = {
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password',
    database: 'test'
  };

  beforeEach(() => {
    mockSession = {
      close: jest.fn(),
      executeRead: jest.fn(),
      executeWrite: jest.fn(),
      run: jest.fn()
    };

    mockDriver = {
      verifyConnectivity: jest.fn(),
      close: jest.fn(),
      session: jest.fn(() => mockSession)
    };

    (neo4j.driver as jest.Mock).mockReturnValue(mockDriver);
    connection = new Neo4jConnection(testConfig);
  });

  it('should handle full user creation workflow', async () => {
    mockDriver.verifyConnectivity.mockResolvedValue(undefined);
    await connection.connect();

    // Mock user creation result
    const createResult = {
      records: [{
        toObject: () => ({ u: { properties: { id: 'user-1', email: 'test@example.com' } } })
      }]
    };

    mockSession.executeWrite.mockImplementation((fn: any) => 
      Promise.resolve(createResult)
    );

    const result = await connection.executeWrite(
      'CREATE (u:User $props) RETURN u',
      { props: { id: 'user-1', email: 'test@example.com' } }
    );

    expect(result).toEqual([{ u: { id: 'user-1', email: 'test@example.com' } }]);
    expect(mockSession.close).toHaveBeenCalled();
  });

  it('should handle connection lifecycle properly', async () => {
    // Connect
    mockDriver.verifyConnectivity.mockResolvedValue(undefined);
    await connection.connect();

    // Execute query
    mockSession.executeRead.mockResolvedValue({ records: [] });
    await connection.executeQuery('MATCH (n) RETURN n');

    // Disconnect
    await connection.disconnect();

    expect(mockDriver.close).toHaveBeenCalled();
    expect(() => connection.getSession()).toThrow();
  });

  it('should handle transaction failures gracefully', async () => {
    mockDriver.verifyConnectivity.mockResolvedValue(undefined);
    await connection.connect();

    const transactionError = new Error('Transaction failed');
    mockSession.executeWrite.mockRejectedValue(transactionError);

    await expect(
      connection.executeWrite('INVALID QUERY')
    ).rejects.toThrow('Transaction failed');

    // Session should still be closed
    expect(mockSession.close).toHaveBeenCalled();
  });
});