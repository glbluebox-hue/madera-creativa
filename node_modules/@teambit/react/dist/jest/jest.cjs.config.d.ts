declare const _exports: {
    transformIgnorePatterns: string[];
    transform: {
        "^.+\\.(js|jsx|ts|tsx|cjs)$": string;
        "^.+\\.css$": string;
        "^.+\\.svg$": string;
    };
    modulePaths: any[];
    moduleNameMapper: {
        "\\.(jpg|jpeg|png|gif|eot|otf|webp|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": string;
        "^.+\\.(css|sass|scss|less)$": string;
        "^.+\\.module\\.(css|sass|scss|less)$": string;
        uuid: string;
    };
    moduleFileExtensions: string[];
    testEnvironment: string;
    setupFiles: string[];
    setupFilesAfterEnv: string[];
};
export = _exports;
