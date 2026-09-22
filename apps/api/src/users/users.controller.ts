import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createUserSchema,
  listUsersQuerySchema,
  setAnalystScopesSchema,
  setOverridesSchema,
  updateUserSchema,
} from '@neo-pulse/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { UserImportService } from './user-import.service.js';
import { UsersService } from './users.service.js';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly importer: UserImportService,
  ) {}

  @Get()
  @RequirePermissions('users:manage')
  list(@Query() query: Record<string, string>) {
    return this.users.list(listUsersQuerySchema.parse(query));
  }

  /**
   * LISTA PARA ELEGIR personas, que no es el directorio.
   *
   * Existe por dos razones. La primera, que quien asigna una formacion a personas concretas
   * necesita verlas, y eso es `assignments:manage`, no `users:manage`: pedirle el directorio
   * completo al Analista para que pueda marcar a tres conductores es darle de mas.
   * La segunda, que un selector no necesita correo, documento ni rol —solo nombre y de que cargo
   * es, para distinguir dos personas que se llaman parecido—, y lo que no se manda no se filtra.
   *
   * Sin paginar a proposito: un desplegable con "pagina 2" no es un desplegable.
   */
  @Get('pickable')
  @RequirePermissions('assignments:manage')
  pickable() {
    return this.users.pickable();
  }

  /** La plantilla va en XLSX: el cliente abre, llena y sube. Un CSV se lo tendria que fabricar el. */
  @Get('import-template')
  @RequirePermissions('users:import')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="plantilla-usuarios.xlsx"')
  async importTemplate(): Promise<StreamableFile> {
    // StreamableFile y no el Buffer pelado: devolver un Buffer hace que Nest lo serialice como
    // JSON ({"type":"Buffer","data":[...]}) y el .xlsx llega corrupto, con el tamaño correcto
    // y sin poder abrirse. Se ve solo al intentar abrirlo.
    return new StreamableFile(await this.importer.buildTemplateXlsx());
  }

  @Get(':id')
  @RequirePermissions('users:manage')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(id);
  }

  @Post()
  @RequirePermissions('users:manage')
  create(@CurrentUser() actor: AuthUser, @Body() body: unknown) {
    return this.users.create(actor, createUserSchema.parse(body));
  }

  @Patch(':id')
  @RequirePermissions('users:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.users.update(actor, id, updateUserSchema.parse(body));
  }

  @Post(':id/reset-password')
  @RequirePermissions('users:manage')
  resetPassword(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.resetPassword(actor, id);
  }

  @Post(':id/overrides')
  @RequirePermissions('users:manage_permissions')
  setOverrides(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.users.setOverrides(actor, id, setOverridesSchema.parse(body));
  }

  @Post(':id/analyst-scopes')
  @RequirePermissions('users:manage')
  setAnalystScopes(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.users.setAnalystScopes(actor, id, setAnalystScopesSchema.parse(body));
  }

  @Post('import')
  @RequirePermissions('users:import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  import(@CurrentUser() actor: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', field: 'file' });
    return this.importer.import(actor, file.originalname, file.buffer);
  }

  /**
   * LO MISMO, PERO SIN ESCRIBIR NADA (`PENDIENTES` 5.4, 2026-09-21).
   *
   * Desde que una recarga ACTUALIZA a quien ya esta, subir el archivo equivocado puede pisar
   * correcciones hechas a mano — lo cazo el cliente: *"si actualizan un usuario por la interfaz y
   * luego suben un archivo con el correo anterior, se va a reemplazar"*. No hay forma de que el
   * sistema adivine cual de los dos datos es el bueno, asi que la respuesta no es una regla mas
   * lista: es **enseñar lo que va a pasar antes de que pase**.
   *
   * Recorre exactamente el mismo camino que `import` —las mismas validaciones, los mismos mensajes y
   * la misma comparacion campo a campo— y no escribe ni una fila. Es un `POST` porque lleva un
   * archivo, no porque cambie algo.
   */
  @Post('import/simular')
  @RequirePermissions('users:import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  simularImport(@CurrentUser() actor: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', field: 'file' });
    return this.importer.import(actor, file.originalname, file.buffer, { simular: true });
  }
}
