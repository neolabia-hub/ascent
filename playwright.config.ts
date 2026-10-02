import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de NEO PULSE. Levanta API (3002) y web (3100) y corre el flujo del sprint contra la base
 * de desarrollo real (docker compose + migrate + rls + seed ya aplicados).
 *
 * IMPORTANTE (leccion SAC-NEO, ver docs/RUNBOOK.md): estos tests corren con Node NATIVO de
 * Windows. Desde WSL sobre /mnt/c el arranque de los servidores es tan lento que expira.
 *
 * Uso: pnpm test:e2e   (o pnpm test:e2e:ui para el modo interactivo)
 */
export default defineConfig({
  testDir: './e2e',
  // La suite recoge lo que ensucia: ver e2e/global-teardown.ts.
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // comparten la misma base de datos
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /*
    CONTRA DEV, SIN LEVANTAR NADA MAS (2026-10-02, pedido del cliente: «usa solo dev»). Con
    E2E_BASE_URL=http://localhost:3200 y E2E_API_URL=http://localhost:3012/v1 la suite corre contra
    el stack de `scripts/mirar.ps1`, ya compilado: no levanta una segunda API ni una segunda web, que
    era lo que dejaba al equipo sin memoria, y no hace falta `pnpm build` aparte.
  */
  webServer: process.env.E2E_BASE_URL ? undefined : [
    {
      command: 'pnpm --filter @neo-pulse/api start',
      url: 'http://localhost:3002/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: '.',
    },
    {
      command: 'pnpm --filter @neo-pulse/web start',
      url: 'http://localhost:3100/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: '.',
    },
  ],
});
