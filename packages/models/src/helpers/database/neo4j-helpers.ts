import { Integer, isInt } from 'neo4j-driver';

/**
 * Converts Neo4j Integer objects to JavaScript numbers
 * Neo4j returns integers as objects with {low, high} properties for handling large integers
 * This utility safely converts them to regular JavaScript numbers
 */
export function convertNeo4jInt(value: any): number {
  if (isInt(value)) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Recursively converts all Neo4j Integer objects in an object to JavaScript numbers
 * This is useful for converting entire database records
 */
export function convertNeo4jIntsInObject<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const converted = { ...obj } as any;
  
  for (const key in converted) {
    const value = converted[key];
    
    if (isInt(value)) {
      converted[key] = value.toNumber();
    } else if (Array.isArray(value)) {
      converted[key] = value.map((item: any) =>
        typeof item === 'object' && item !== null
          ? convertNeo4jIntsInObject(item)
          : isInt(item) ? item.toNumber() : item
      );
    } else if (value && typeof value === 'object') {
      converted[key] = convertNeo4jIntsInObject(value);
    }
  }
  
  return converted;
}

/**
 * Converts an array of objects, handling Neo4j integers in each object
 */
export function convertNeo4jIntsInArray<T extends Record<string, any>>(arr: T[]): T[] {
  return arr.map(item => convertNeo4jIntsInObject(item));
}

/**
 * Type guard to check if a value is a Neo4j Integer
 */
export function isNeo4jInt(value: any): value is Integer {
  return isInt(value);
}