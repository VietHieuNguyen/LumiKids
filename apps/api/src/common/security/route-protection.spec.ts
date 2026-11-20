import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import {
  CHILD_ROUTE,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS,
  REQUIRED_ROLES,
} from '../../modules/auth/decorators/auth.decorators.js';

/**
 * Authentication is deny-by-default (global JwtAuthGuard), but permissions are opt-in per route.
 * This test makes every new route state who may call it: a permission or role, a child route, or
 * public. Public routes and the few "any signed-in adult" routes are listed here so adding one is
 * a reviewed decision.
 */
const PUBLIC = [
  'AppController.getHello',
  'AuthController.login',
  'AuthController.register',
  'AuthController.verifyEmail',
  'AuthController.resendVerification',
  'AuthController.refresh',
  'AuthController.logout',
  'ChildAuthController.login',
  'ChildAuthController.refresh',
  'ChildAuthController.logout',
];
/** Any signed-in adult: these only ever read or change the caller's own account. */
const OWN_ACCOUNT = ['AuthController.me'];

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const controllerFiles = (readdirSync(sourceRoot, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.controller.ts'))
  .map((file) => pathToFileURL(join(sourceRoot, file)).href);
type Handler = (...args: unknown[]) => unknown;

function routes(modules: Record<string, unknown>[]) {
  const found: { id: string; target: Handler; controller: object }[] = [];
  for (const exported of modules)
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function' || Reflect.getMetadata(PATH_METADATA, value) === undefined) continue;
      const proto = (value as { prototype: Record<string, unknown> }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const target = proto[name];
        if (name === 'constructor' || typeof target !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, target) === undefined) continue;
        found.push({ id: `${(value as { name: string }).name}.${name}`, target: target as Handler, controller: value });
      }
    }
  return found;
}
const meta = (key: string, route: { target: Handler; controller: object }) =>
  Reflect.getMetadata(key, route.target) ?? Reflect.getMetadata(key, route.controller);

describe('route protection', () => {
  let all: ReturnType<typeof routes> = [];
  beforeAll(async () => {
    // One at a time: importing Nest modules in parallel races on their shared ESM graph.
    const modules: Record<string, unknown>[] = [];
    for (const file of controllerFiles) modules.push((await import(file)) as Record<string, unknown>);
    all = routes(modules);
  });
  it('finds the controllers', () => {
    expect(all.length).toBeGreaterThan(50);
  });
  it('every route requires a permission or role, is a child route, or is a reviewed exception', () => {
    const open = all
      .filter((route) => !meta(PUBLIC_ROUTE, route) && !meta(CHILD_ROUTE, route))
      .filter((route) => !(meta(REQUIRED_PERMISSIONS, route)?.length || meta(REQUIRED_ROLES, route)?.length))
      .map((route) => route.id)
      .filter((id) => !OWN_ACCOUNT.includes(id));
    expect(open).toEqual([]);
  });
  it('public routes are exactly the reviewed list', () => {
    expect(all.filter((route) => meta(PUBLIC_ROUTE, route)).map((route) => route.id).sort()).toEqual([...PUBLIC].sort());
  });
  it('no route is both public and a child route', () => {
    expect(all.filter((route) => meta(PUBLIC_ROUTE, route) && meta(CHILD_ROUTE, route)).map((route) => route.id)).toEqual([]);
  });
});
