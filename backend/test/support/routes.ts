import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { API_PREFIX } from '../../src/app.setup';

export interface DiscoveredRoute {
  /** e.g. "GET /api/v1/students/:id" */
  key: string;
  method: string;
  path: string;
  isPublic: boolean;
  /** Roles named by @Roles on the handler or its controller, or null when any signed-in user may call it. */
  roles: string[] | null;
}

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

const join = (...parts: string[]): string => '/' + parts.flatMap((part) => part.split('/')).filter(Boolean).join('/');

/** Every HTTP route the running application exposes, read from the framework's own metadata. */
export function discoverRoutes(app: INestApplication): DiscoveredRoute[] {
  const reflector = app.get(Reflector);
  const routes: DiscoveredRoute[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const controllerPath = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        const methodCode = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        const handlerPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (methodCode === undefined || handlerPath === undefined) continue;
        const method = METHOD_NAMES[methodCode];
        const path = join(API_PREFIX, controllerPath, handlerPath);
        const roles = reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [handler, metatype]);
        routes.push({
          key: `${method} ${path}`,
          method,
          path,
          isPublic: Boolean(reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype])),
          roles: roles && roles.length > 0 ? [...roles].sort() : null,
        });
      }
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key));
}
