declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export interface QueryExecResult {
    columns: string[];
    values: (number | string | Uint8Array | null)[][];
  }

  export interface StatementIteratorResult {
    /** `true` if there are no more available statements */
    done: boolean;
    /** the next available Statement (as returned by `Database.prepare`) */
    value: Statement;
  }

  export interface SqlValue {
    [key: string]: number | string | Uint8Array | null;
  }

  export class Statement {
    bind(params?: (number | string | Uint8Array | null)[] | Record<string, number | string | Uint8Array | null>): boolean;
    step(): boolean;
    getAsObject(params?: Record<string, number | string | Uint8Array | null>): SqlValue;
    get(params?: Record<string, number | string | Uint8Array | null>): (number | string | Uint8Array | null)[];
    getColumnNames(): string[];
    run(params?: (number | string | Uint8Array | null)[] | Record<string, number | string | Uint8Array | null>): void;
    reset(): void;
    free(): boolean;
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null);
    run(sql: string, params?: (number | string | Uint8Array | null)[] | Record<string, number | string | Uint8Array | null>): Database;
    exec(sql: string, params?: (number | string | Uint8Array | null)[] | Record<string, number | string | Uint8Array | null>): QueryExecResult[];
    each(sql: string, params: (number | string | Uint8Array | null)[] | Record<string, number | string | Uint8Array | null>, callback: (row: SqlValue) => void, done?: () => void): Database;
    each(sql: string, callback: (row: SqlValue) => void, done?: () => void): Database;
    prepare(sql: string, params?: (number | string | Uint8Array | null)[] | Record<string, number | string | Uint8Array | null>): Statement;
    iterateStatements(sql: string): StatementIterator;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    create_function(name: string, func: (...args: unknown[]) => unknown): Database;
    create_aggregate(name: string, functions: { init?: () => unknown; step: (state: unknown, ...args: unknown[]) => unknown; finalize: (state: unknown) => unknown }): Database;
  }

  export interface StatementIterator {
    next(): StatementIteratorResult;
    [Symbol.iterator](): Iterator<Statement>;
    getRemainingSql(): string;
  }

  export interface SqlJsConfig {
    locateFile?: (filename: string) => string;
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
