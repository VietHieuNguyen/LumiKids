import { createMongoAbility } from '@casl/ability';
import type { ForcedSubject, MongoAbility, RawRuleOf } from '@casl/ability';
import type { Principal } from './principal.js';
import type { PermissionCode } from '../../generated/prisma/enums.js';

type AppAbility = MongoAbility<
  [PermissionCode, string | ({ userId: string } & ForcedSubject<'Account'>)]
>;

export function buildAbility(principal: Principal): AppAbility {
  const rules: RawRuleOf<AppAbility>[] = [];
  for (const permission of principal.permissions) {
    switch (permission) {
      case 'READ_GAME_ASSETS':
      case 'MANAGE_GAME_ASSETS':
        rules.push({ action: permission, subject: 'GameAsset' });
        break;
      case 'READ_OWN_ACCOUNT':
        rules.push({
          action: permission,
          subject: 'Account',
          conditions: { userId: principal.userId },
        });
        break;
      case 'MANAGE_USERS':
        rules.push({ action: permission, subject: 'Administration' });
        break;
      case 'GENERATE_GAME_CONTENT':
        rules.push({ action: permission, subject: 'GameContentGeneration' });
        break;
    }
  }
  return createMongoAbility<AppAbility>(rules);
}

export function permissionSubject(
  permission: PermissionCode,
): string | undefined {
  switch (permission) {
    case 'READ_GAME_ASSETS':
    case 'MANAGE_GAME_ASSETS':
      return 'GameAsset';
    case 'READ_OWN_ACCOUNT':
      return 'Account';
    case 'MANAGE_USERS':
      return 'Administration';
    case 'GENERATE_GAME_CONTENT':
      return 'GameContentGeneration';
    default:
      return undefined;
  }
}
