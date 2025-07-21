"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const connection_1 = require("@/connection");
const neo4j_driver_1 = __importStar(require("neo4j-driver"));
jest.mock('neo4j-driver');
describe('Neo4jConnection', () => {
    let connection;
    const mockConfig = {
        uri: '[NEO4J-LOCAL-URL]',
        username: 'neo4j',
        [DEFAULT-PASSWORD]: '[DEFAULT-PASSWORD]',
        database: 'test'
    };
    const mockDriver = {
        verifyConnectivity: jest.fn(),
        close: jest.fn(),
        session: jest.fn()
    };
    const mockSession = {
        close: jest.fn(),
        executeRead: jest.fn(),
        executeWrite: jest.fn(),
        run: jest.fn()
    };
    beforeEach(() => {
        jest.clearAllMocks();
        connection = new connection_1.Neo4jConnection(mockConfig);
        neo4j_driver_1.default.driver.mockReturnValue(mockDriver);
        neo4j_driver_1.auth.basic.mockReturnValue({});
        mockDriver.session.mockReturnValue(mockSession);
    });
    describe('connect()', () => {
        it('should establish connection successfully', async () => {
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            await connection.connect();
            expect(neo4j_driver_1.default.driver).toHaveBeenCalledWith(mockConfig.uri, expect.anything());
            expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
        });
        it('should handle connection failures', async () => {
            const mockError = new Error('Connection failed');
            mockDriver.verifyConnectivity.mockRejectedValue(mockError);
            await expect(connection.connect()).rejects.toThrow('Connection failed');
        });
        it('should not create multiple connections', async () => {
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            await connection.connect();
            await connection.connect();
            expect(neo4j_driver_1.default.driver).toHaveBeenCalledTimes(1);
        });
    });
    describe('disconnect()', () => {
        it('should close driver when connected', async () => {
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
    describe('getSession()', () => {
        it('should return session when connected', async () => {
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            await connection.connect();
            const session = connection.getSession();
            expect(mockDriver.session).toHaveBeenCalledWith({
                database: mockConfig.database
            });
            expect(session).toBe(mockSession);
        });
        it('should throw error when not connected', () => {
            expect(() => connection.getSession()).toThrow('Neo4j driver is not connected. Call connect() first.');
        });
    });
    describe('executeQuery()', () => {
        it('should execute read queries and process results', async () => {
            const mockResult = {
                records: [
                    {
                        toObject: () => ({
                            a: { properties: { id: '1', name: 'Test Agent' } }
                        })
                    }
                ]
            };
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.executeRead.mockResolvedValue(mockResult);
            await connection.connect();
            const result = await connection.executeQuery('MATCH (a:Agent) RETURN a', { limit: 10 });
            expect(result).toEqual([
                { a: { id: '1', name: 'Test Agent' } }
            ]);
            expect(mockSession.close).toHaveBeenCalled();
        });
        it('should handle queries with non-node results', async () => {
            const mockResult = {
                records: [
                    {
                        toObject: () => ({
                            count: 5,
                            name: 'Test Name'
                        })
                    }
                ]
            };
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.executeRead.mockResolvedValue(mockResult);
            await connection.connect();
            const result = await connection.executeQuery('RETURN count(*) as count, "Test Name" as name');
            expect(result).toEqual([
                { count: 5, name: 'Test Name' }
            ]);
        });
        it('should close session even when query fails', async () => {
            const mockError = new Error('Query failed');
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.executeRead.mockRejectedValue(mockError);
            await connection.connect();
            await expect(connection.executeQuery('INVALID QUERY')).rejects.toThrow('Query failed');
            expect(mockSession.close).toHaveBeenCalled();
        });
    });
    describe('executeWrite()', () => {
        it('should execute write queries and process results', async () => {
            const mockResult = {
                records: [
                    {
                        toObject: () => ({
                            a: { properties: { id: '1', name: 'Created Agent' } }
                        })
                    }
                ]
            };
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.executeWrite.mockResolvedValue(mockResult);
            await connection.connect();
            const result = await connection.executeWrite('CREATE (a:Agent $props) RETURN a', { props: { id: '1', name: 'Created Agent' } });
            expect(result).toEqual([
                { a: { id: '1', name: 'Created Agent' } }
            ]);
            expect(mockSession.close).toHaveBeenCalled();
        });
        it('should close session even when write fails', async () => {
            const mockError = new Error('Write failed');
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.executeWrite.mockRejectedValue(mockError);
            await connection.connect();
            await expect(connection.executeWrite('INVALID WRITE')).rejects.toThrow('Write failed');
            expect(mockSession.close).toHaveBeenCalled();
        });
    });
    describe('initializeSchema()', () => {
        it('should create all constraints and indexes', async () => {
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.run.mockResolvedValue({});
            await connection.connect();
            await connection.initializeSchema();
            // Verify constraint creation calls
            expect(mockSession.run).toHaveBeenCalledWith(expect.stringContaining('CREATE CONSTRAINT agent_id_unique'));
            expect(mockSession.run).toHaveBeenCalledWith(expect.stringContaining('CREATE CONSTRAINT llm_id_unique'));
            expect(mockSession.run).toHaveBeenCalledWith(expect.stringContaining('CREATE CONSTRAINT user_id_unique'));
            // Verify index creation calls
            expect(mockSession.run).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX agent_name_index'));
            expect(mockSession.run).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX user_username_index'));
            expect(mockSession.close).toHaveBeenCalled();
        });
        it('should handle schema initialization failures', async () => {
            const mockError = new Error('Schema creation failed');
            mockDriver.verifyConnectivity.mockResolvedValue(undefined);
            mockSession.run.mockRejectedValue(mockError);
            await connection.connect();
            await expect(connection.initializeSchema()).rejects.toThrow('Schema creation failed');
            expect(mockSession.close).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=connection.test.js.map