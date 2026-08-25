import type { Page } from '@playwright/test';

// Usuario de pruebas del seed (rol ADMIN, contrasena ya cambiada y politicas aceptadas):
// entra directo al panel, lo que hace el e2e repetible. Ver seedE2EUser en prisma/seed.ts.
export const E2E_DOCUMENT = '888888888';
export const E2E_PASSWORD = 'PruebaE2E2026*';
export const TENANT_SLUG = 'transprensa';

/**
 * Inicia sesion con el usuario de pruebas. En desarrollo no hay subdominios, asi que el tenant
 * se resuelve por query param `?tenant=` (ver src/lib/tenant.ts).
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`/login?tenant=${TENANT_SLUG}`);
  await page.getByLabel('Cedula o correo').fill(E2E_DOCUMENT);
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/inicio', { timeout: 20_000 });
}

/** Sufijo unico para codigos/documentos, para que el e2e sea repetible sobre la misma base. */
export function unique(): string {
  return String(Date.now()).slice(-8);
}
