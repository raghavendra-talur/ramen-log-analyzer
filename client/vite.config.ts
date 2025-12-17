import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

const getGitInfo = () => {
  try {
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const commitDate = execSync('git log -1 --format=%ci').toString().trim();
    return { commitHash, commitDate };
  } catch {
    return { commitHash: 'unknown', commitDate: 'unknown' };
  }
};

const gitInfo = getGitInfo();

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify(gitInfo.commitHash),
    __COMMIT_DATE__: JSON.stringify(gitInfo.commitDate),
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
  },
});
