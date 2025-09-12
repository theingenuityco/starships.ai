import { Integer, isInt } from 'neo4j-driver';

/** Converts Neo4j Integer objects to JavaScript numbers */
export function convertNeo4jInt(value: Integer | number | string | unknown): number {
  if (isInt(value)) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    // Check if the original string starts with the parsed number to ensure it's a valid number string
    return isNaN(parsed) || !value.match(/^-?\d+$/) ? 0 : parsed;
  }
  return 0;
}

/** Recursively converts all Neo4j Integer objects in an object to JavaScript numbers */
export function convertNeo4jIntsInObject<T>(obj: T, visited = new WeakSet<object>()): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (visited.has(obj as object)) {
    return obj;
  }
  visited.add(obj as object);

  // Handle arrays specifically to preserve array structure
  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => {
      if (isInt(item)) {
        return item.toNumber();
      } else if (item && typeof item === 'object') {
        return convertNeo4jIntsInObject(item, visited);
      }
      return item;
    }) as T;
  }

  const converted = { ...obj } as Record<string, unknown>;

  for (const key in converted) {
    const value = converted[key];

    if (isInt(value)) {
      converted[key] = value.toNumber();
    } else if (Array.isArray(value)) {
      converted[key] = value.map((item: unknown) => {
        if (isInt(item)) {
          return item.toNumber();
        } else if (item && typeof item === 'object') {
          return convertNeo4jIntsInObject(item, visited);
        }
        return item;
      });
    } else if (value && typeof value === 'object') {
      converted[key] = convertNeo4jIntsInObject(value, visited);
    }
  }

  return converted as T;
}

/** Converts an array of objects, handling Neo4j integers in each object */
export function convertNeo4jIntsInArray<T extends Record<string, unknown>>(arr: T[]): T[] {
  return arr.map((item) => convertNeo4jIntsInObject(item, new WeakSet<object>()));
}

/** Type guard to check if a value is a Neo4j Integer */
export function isNeo4jInt(value: unknown): value is Integer {
  return isInt(value);
}
