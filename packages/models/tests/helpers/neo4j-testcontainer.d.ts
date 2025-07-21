export declare class Neo4jTestContainer {
    private static container;
    private static startedContainer;
    static start(): Promise<{
        uri: any;
        username: string;
        password: string;
        database: string;
    }>;
    static stop(): Promise<void>;
}
//# sourceMappingURL=neo4j-testcontainer.d.ts.map