/**
 * Type additions for frida-il2cpp-bridge 0.14 — `bind()` exists at runtime
 * (see dist/index.js) but is missing from the shipped typings.
 */
declare global {
    namespace Il2Cpp {
        interface Method<T extends Il2Cpp.Method.ReturnType = Il2Cpp.Method.ReturnType> {
            /** Binds this instance method to `instance` (Object or ValueType). */
            bind(instance: Il2Cpp.Object | Il2Cpp.ValueType): Il2Cpp.BoundMethod<T>;
        }
    }
    const console: {
        log(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    };
}
export {};
