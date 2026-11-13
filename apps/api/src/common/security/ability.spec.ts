import { subject } from '@casl/ability';
import { randomUUID } from 'node:crypto';
import { buildAbility, permissionSubject } from './ability.js';
import { childPermissions } from '../../modules/auth/child-permissions.js';
import type { Principal } from './principal.js';

describe('CASL account ownership', () => {
  const principal: Principal = {
    userId: randomUUID(),
    fullName: 'Fixture',
    email: 'fixture@example.test',
    phone: '',
    address: '',
    status: 'ACTIVE',
    roles: ['ROLE_ADMIN'],
    permissions: ['READ_OWN_ACCOUNT'],
  };
  it('allows only the owned account', () => {
    const ability = buildAbility(principal);
    expect(
      ability.can(
        'READ_OWN_ACCOUNT',
        subject('Account', { userId: principal.userId }),
      ),
    ).toBe(true);
    expect(
      ability.can(
        'READ_OWN_ACCOUNT',
        subject('Account', { userId: randomUUID() }),
      ),
    ).toBe(false);
  });
  it('does not turn an admin role into permissions absent from the database', () => {
    expect(buildAbility(principal).can('MANAGE_USERS', 'Administration')).toBe(
      false,
    );
  });
  it('allows game generation only when its permission is granted', () => {
    const teacher: Principal = {
      ...principal,
      roles: ['ROLE_TEACHER'],
      permissions: ['READ_OWN_ACCOUNT', 'GENERATE_GAME_CONTENT'],
    };
    const guardian: Principal = {
      ...principal,
      roles: ['ROLE_GUARDIAN'],
      permissions: ['READ_OWN_ACCOUNT'],
    };
    expect(
      buildAbility(teacher).can(
        'GENERATE_GAME_CONTENT',
        'GameContentGeneration',
      ),
    ).toBe(true);
    expect(
      buildAbility(guardian).can(
        'GENERATE_GAME_CONTENT',
        'GameContentGeneration',
      ),
    ).toBe(false);
  });
  it('grants the child gameplay capabilities without authoring or library access', () => {
    const child: Principal = {
      ...principal,
      roles: ['ROLE_CHILD'],
      permissions: [...childPermissions],
    };
    const ability = buildAbility(child);
    expect(ability.can('PLAY_GAMES', 'Gameplay')).toBe(true);
    expect(ability.can('GENERATE_GAME_CONTENT', 'GameContentGeneration')).toBe(
      false,
    );
    for (const permission of [
      'READ_GAMES',
      'SAVE_GAMES',
      'MANAGE_ALL_GAMES',
    ] as const)
      expect(ability.can(permission, 'GameLibrary')).toBe(false);
    for (const permission of [
      'READ_GAME_ASSETS',
      'MANAGE_GAME_ASSETS',
    ] as const)
      expect(ability.can(permission, 'GameAsset')).toBe(false);
    expect(ability.can('MANAGE_USERS', 'Administration')).toBe(false);
  });
  it('limits child session reading and interaction submission to the authenticated owner', () => {
    const child: Principal = {
      ...principal,
      roles: ['ROLE_CHILD'],
      permissions: [...childPermissions],
    };
    const ability = buildAbility(child);
    for (const permission of [
      'SUBMIT_OWN_INTERACTIONS',
      'READ_OWN_PLAY_SESSIONS',
    ] as const) {
      expect(
        ability.can(
          permission,
          subject('PlaySession', { userId: child.userId }),
        ),
      ).toBe(true);
      expect(
        ability.can(
          permission,
          subject('PlaySession', { userId: randomUUID() }),
        ),
      ).toBe(false);
      expect(permissionSubject(permission)).toBe('PlaySession');
    }
    expect(permissionSubject('PLAY_GAMES')).toBe('Gameplay');
  });
  it('does not grant gameplay from a child or admin role alone', () => {
    for (const role of ['ROLE_CHILD', 'ROLE_ADMIN'] as const) {
      const ability = buildAbility({
        ...principal,
        roles: [role],
        permissions: ['READ_OWN_ACCOUNT'],
      });
      expect(ability.can('PLAY_GAMES', 'Gameplay')).toBe(false);
      expect(
        ability.can(
          'SUBMIT_OWN_INTERACTIONS',
          subject('PlaySession', { userId: principal.userId }),
        ),
      ).toBe(false);
    }
  });
});
