import { RuntimeDefinition } from './runtime-definition';
import DependencyGraph from '../extension-graph/extension-graph';
export declare class Runtimes {
    readonly runtimeDefinition: {
        [key: string]: RuntimeDefinition;
    };
    constructor(runtimeDefinition: {
        [key: string]: RuntimeDefinition;
    });
    add(runtime: RuntimeDefinition): this;
    get(name: string): RuntimeDefinition;
    dispose(): void;
    static load(graph: DependencyGraph): Promise<Runtimes>;
}
