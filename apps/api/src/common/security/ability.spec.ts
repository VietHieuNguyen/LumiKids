import { subject } from '@casl/ability';
import { randomUUID } from 'node:crypto';
import { buildAbility } from './ability.js';
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
});
