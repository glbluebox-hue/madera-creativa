import { BaseCompiler } from '../base-compiler';
declare class Mock {
}
export declare class Babel {
    private mock?;
    constructor(mock?: Mock);
    provide([baseCompiler]: [BaseCompiler]): Promise<Babel>;
}
export {};
