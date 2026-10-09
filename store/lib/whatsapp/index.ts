// Validation (./schema) is not re-exported: it pulls in zod, so callers import it on demand.
export * from "./phone";
export * from "./link";
export * from "./order";
export * from "./message";
export * from "./variant";
