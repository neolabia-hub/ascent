import { generateInitialPassword } from './password.util.js';

describe('generateInitialPassword', () => {
  it('produce contrasenas que cumplen la politica (10+, mayuscula, minuscula, numero)', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateInitialPassword('1045876321');
      expect(password.length).toBeGreaterThanOrEqual(10);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password.startsWith('1045876321')).toBe(true);
    }
  });

  it('cumple la politica incluso con documentos cortos', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateInitialPassword('12345');
      expect(password.length).toBeGreaterThanOrEqual(10);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
    }
  });

  it('no repite la misma contrasena (sufijo aleatorio)', () => {
    const generated = new Set(Array.from({ length: 50 }, () => generateInitialPassword('900123456')));
    expect(generated.size).toBeGreaterThan(1);
  });

  it('evita caracteres ambiguos al dictar (i, l, o, 0, 1 en el sufijo)', () => {
    for (let i = 0; i < 100; i++) {
      const suffix = generateInitialPassword('99999999').slice('99999999'.length);
      expect(suffix).not.toMatch(/[ilo01IO]/);
    }
  });
});
