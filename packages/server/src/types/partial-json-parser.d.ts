declare module 'partial-json-parser' {
  export const parse: (input: string, allow?: number) => unknown;
  export const Allow: {
    STR: number;
    ARR: number;
    OBJ: number;
    ALL: number;
  };
}
