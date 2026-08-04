"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.viteConfigFile = void 0;
const viteConfigFile = () => {
    return {
        relativePath: `vite.config.js`,
        content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});    
`,
    };
};
exports.viteConfigFile = viteConfigFile;
//# sourceMappingURL=vite-config.js.map