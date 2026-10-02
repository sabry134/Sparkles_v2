import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    return { plugins: [react()] };
  }

  const environment = loadEnv(mode, process.cwd(), '');
  const frontendUrl = new URL(environment.DASHBOARD_FRONTEND_URL);
  const backendUrl = new URL(environment.DASHBOARD_PUBLIC_URL);

  return {
    plugins: [react()],
    server: {
      host: frontendUrl.hostname,
      port: Number(frontendUrl.port),
      strictPort: true,
      proxy: {
        '/api': backendUrl.origin,
        '/auth': backendUrl.origin,
        '/health': backendUrl.origin,
      },
    },
  };
});
