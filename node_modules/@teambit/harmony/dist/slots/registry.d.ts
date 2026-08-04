export declare class SlotRegistry<T> {
    private registerFn;
    readonly map: Map<string, T>;
    constructor(registerFn: () => string, map?: Map<string, T>);
    /**
     * get a slot value by extension id.
     */
    get(id: string): T | undefined;
    /**
     * return an array of all slots.
     */
    toArray(): [string, T][];
    /**
     * get all registered values.
     */
    values(): T[];
    /**
     * register a new entry to the slot registry
     */
    register(value: T): void;
}
