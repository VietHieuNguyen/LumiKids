import { subject } from '@casl/ability';
import { randomUUID } from 'node:crypto';
import { buildAbility, permissionSubject } from './ability.js';
import {
  childPermissions,
  childPrincipalPermissions,
} from '../../modules/auth/child-permissions.js';
import type { ChildPrincipal, Principal } from './principal.js';

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
  it('limits child session reading and interaction submission to the signed-in child', () => {
    const child: ChildPrincipal = {
      childId: randomUUID(),
      fullName: 'Trẻ',
      permissions: [...childPrincipalPermissions],
    };
    const ability = buildAbility(child);
    for (const permission of [
      'SUBMIT_OWN_INTERACTIONS',
      'READ_OWN_PLAY_SESSIONS',
    ] as const) {
      expect(
        ability.can(
          permission,
          subject('PlaySession', { childId: child.childId }),
        ),
      ).toBe(true);
      expect(
        ability.can(
          permission,
          subject('PlaySession', { childId: randomUUID() }),
        ),
      ).toBe(false);
      expect(permissionSubject(permission)).toBe('PlaySession');
    }
    expect(ability.can('PLAY_GAMES', 'Gameplay')).toBe(true);
    expect(permissionSubject('PLAY_GAMES')).toBe('Gameplay');
  });
  it('gives an adult account holding the legacy child grants no play session', () => {
    const legacyAccount: Principal = {
      ...principal,
      roles: ['ROLE_CHILD'],
      permissions: [...childPermissions],
    };
    const legacy = buildAbility(legacyAccount);
    expect(
      legacy.can(
        'SUBMIT_OWN_INTERACTIONS',
        subject('PlaySession', { childId: principal.userId }),
      ),
    ).toBe(false);
  });
  it('does not grant gameplay from a role alone', () => {
    const ability = buildAbility({
      ...principal,
      permissions: ['READ_OWN_ACCOUNT'],
    });
    expect(ability.can('PLAY_GAMES', 'Gameplay')).toBe(false);
  });
  it('maps classroom permissions to their subjects', () => {
    const admin = buildAbility({
      ...principal,
      permissions: ['MANAGE_CLASSROOMS'],
    });
    expect(admin.can('MANAGE_CLASSROOMS', 'ClassroomAdministration')).toBe(
      true,
    );
    const teacher = buildAbility({
      ...principal,
      permissions: ['READ_OWN_CLASSROOMS', 'RESET_CHILD_LOGIN_CODES'],
    });
    expect(teacher.can('READ_OWN_CLASSROOMS', 'Classroom')).toBe(true);
    expect(teacher.can('RESET_CHILD_LOGIN_CODES', 'Classroom')).toBe(true);
    expect(teacher.can('MANAGE_CLASSROOMS', 'ClassroomAdministration')).toBe(
      false,
    );
    expect(permissionSubject('MANAGE_CLASSROOMS')).toBe(
      'ClassroomAdministration',
    );
    expect(permissionSubject('READ_OWN_CLASSROOMS')).toBe('Classroom');
  });
});
