import { ForbiddenException } from '@nestjs/common';
import { assertTipoPermitido, tipoPermitido, tipoScopeWhere } from './analyst-scope.js';

const PLAN = 'tipo-plan';
const INDUCCION = 'tipo-induccion';
const REINDUCCION = 'tipo-reinduccion';

/**
 * EL ALCANCE POR TIPO DE FORMACION (2026-09-22).
 *
 * Lo pidio el cliente —*"el analista solo debe poder crear tipo plan"*— y se resolvio
 * configurandolo, no cableando «PLAN». Estas pruebas fijan las dos cosas que, si se rompen, no dan
 * error: **quedarse sin poder crear nada** y **el filtro que pisa al alcance**.
 */
describe('alcance por tipo de formacion', () => {
  describe('sin filas no se acota: el convenio que evita el desastre al desplegar', () => {
    it('`null` puede con cualquier tipo', () => {
      expect(tipoPermitido(null, PLAN)).toBe(true);
      expect(tipoPermitido(null, INDUCCION)).toBe(true);
    });

    it('y no filtra la consulta', () => {
      expect(tipoScopeWhere(null)).toEqual({});
    });

    /*
      Si «sin filas» significara «ninguno», el dia del despliegue TODO el mundo se habria quedado
      sin poder crear una formacion sin que nadie lo pidiera. Es el mismo convenio que el alcance
      por proceso, y por el mismo motivo: acotar es un acto deliberado.
    */
    it('que es lo contrario de una lista VACIA, que si acota a nada', () => {
      expect(tipoPermitido([], PLAN)).toBe(false);
      expect(tipoScopeWhere([])).toEqual({ activityTypeId: { in: [] } });
    });
  });

  describe('con alcance, solo lo suyo', () => {
    it('deja lo que esta en la lista', () => {
      expect(tipoPermitido([PLAN], PLAN)).toBe(true);
    });

    it('y rechaza lo que no, con un 403 que dice a quien pedirselo', () => {
      expect(() => assertTipoPermitido([PLAN], INDUCCION)).toThrow(ForbiddenException);
      try {
        assertTipoPermitido([PLAN], INDUCCION);
      } catch (error) {
        const cuerpo = (error as ForbiddenException).getResponse() as { code: string; message: string };
        expect(cuerpo.code).toBe('ACTIVITY_TYPE_OUT_OF_SCOPE');
        expect(cuerpo.message).toContain('administrador');
        // NO enumera lo que si puede: quien lo lee no puede arreglarlo solo, y la lista no le sirve.
        expect(cuerpo.message).not.toContain(PLAN);
      }
    });

    it('no lanza cuando el tipo si es suyo', () => {
      expect(() => assertTipoPermitido([PLAN, INDUCCION], INDUCCION)).not.toThrow();
    });
  });

  /*
    ─── LA PARTE QUE YA COSTO UNA TARDE EN OTRO SITIO ───

    El alcance y el filtro de la pantalla escriben la MISMA clave. Puestos como dos claves del
    mismo objeto, la segunda pisa a la primera en silencio y el alcance se pierde: es el fallo de
    la tajada de las convocatorias del 2026-09-04. Por eso `tipoScopeWhere` recibe el filtro y
    devuelve UNA sola clave — y por eso esto se prueba.
  */
  describe('el filtro de la pantalla se CRUZA con el alcance, no lo sustituye', () => {
    it('sin alcance, manda el filtro tal cual', () => {
      expect(tipoScopeWhere(null, INDUCCION)).toEqual({ activityTypeId: INDUCCION });
    });

    it('con alcance y sin filtro, manda el alcance', () => {
      expect(tipoScopeWhere([PLAN, REINDUCCION])).toEqual({ activityTypeId: { in: [PLAN, REINDUCCION] } });
    });

    it('pidiendo algo que SI es suyo, se queda con eso', () => {
      expect(tipoScopeWhere([PLAN, REINDUCCION], PLAN)).toEqual({ activityTypeId: { in: [PLAN] } });
    });

    it('pidiendo algo que NO es suyo, da vacio — ni lo suyo ni un 403', () => {
      // Devolverle lo suyo mientras la pantalla dice «Induccion» seria mentirle; un 403 le
      // confirmaria que ese tipo existe. Vacio es la unica respuesta honesta.
      expect(tipoScopeWhere([PLAN], INDUCCION)).toEqual({ activityTypeId: { in: [] } });
    });

    it('y NUNCA devuelve dos claves que se pisen', () => {
      for (const scope of [null, [], [PLAN], [PLAN, INDUCCION]]) {
        for (const pedido of [undefined, PLAN, REINDUCCION]) {
          const where = tipoScopeWhere(scope, pedido);
          expect(Object.keys(where).length).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
