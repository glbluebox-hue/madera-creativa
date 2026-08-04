export declare class JestWorker {
    private onTestCompleteCb;
    onTestComplete(onTestComplete: any): void;
    watch(jestConfigPath: string, testFiles: string[], rootPath: string, jestModulePath: string, envRootDir: string): Promise<void>;
}
