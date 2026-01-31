/**
 * @module internal
 * @description Internal TypeScript type definitions. Provides utility types and helper types
 * used throughout the Nodecaf framework.
 */

type DropFirst<T extends unknown[]> = T extends [unknown, ...infer U] ? U : never
