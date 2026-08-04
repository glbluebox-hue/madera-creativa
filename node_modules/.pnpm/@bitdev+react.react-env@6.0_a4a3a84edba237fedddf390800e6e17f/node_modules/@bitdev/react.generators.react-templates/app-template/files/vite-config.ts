
export const viteConfigFile = () => {
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
