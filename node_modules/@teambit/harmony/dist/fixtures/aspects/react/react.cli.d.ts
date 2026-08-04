import { BabelCLI } from '../babel/babel.aspect';
import { SlotRegistry } from '../../../slots';
export declare class ReactCLI {
    private babel;
    constructor(babel: BabelCLI);
    static runtime: import("../../..").RuntimeDefinition;
    hello(): void;
    static dependencies: import("../../..").Aspect[];
    static slots: ((registerFn: () => string) => SlotRegistry<string>)[];
    static provider([babelCli]: [BabelCLI], config: {}, [stringSlot]: [SlotRegistry<string>]): Promise<ReactCLI>;
}
