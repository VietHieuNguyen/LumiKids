import { createMongoAbility } from '@casl/ability';
import type { ForcedSubject, MongoAbility, RawRuleOf } from '@casl/ability';
import type { AbilityActor } from './principal.js';
import type { PermissionCode } from '../../generated/prisma/enums.js';

type AppAbility = MongoAbility<
  [
    PermissionCode,
    (
      | string
      | ({ userId: string } & ForcedSubject<'Account'>)
      | ({ childId: string } & ForcedSubject<'PlaySession'>)
    ),
  ]
>;

export function buildAbility(actor: AbilityActor): AppAbility {
  const userId = 'userId' in actor ? actor.userId : undefined;
  const childId = 'childId' in actor ? actor.childId : undefined;
  const rules: RawRuleOf<AppAbility>[] = [];
  for (const permission of actor.permissions) {
    switch (permission) {
      case 'PLAY_GAMES':
        rules.push({ action: permission, subject: 'Gameplay' });
        break;
      case 'SUBMIT_OWN_INTERACTIONS':
      case 'READ_OWN_PLAY_SESSIONS':
        // Play sessions belong to a child; an adult account holding these grants owns none.
        if (childId)
          rules.push({
            action: permission,
            subject: 'PlaySession',
            conditions: { childId },
          });
        break;
      case 'READ_GAMES':
      case 'SAVE_GAMES':
      case 'MANAGE_ALL_GAMES':
        rules.push({ action: permission, subject: 'GameLibrary' });
        break;
      case 'READ_GAME_ASSETS':
      case 'MANAGE_GAME_ASSETS':
        rules.push({ action: permission, subject: 'GameAsset' });
        break;
      case 'READ_OWN_ACCOUNT':
        if (userId)
          rules.push({
            action: permission,
            subject: 'Account',
            conditions: { userId },
          });
        break;
      case 'MANAGE_USERS':
        rules.push({ action: permission, subject: 'Administration' });
        break;
      case 'GENERATE_GAME_CONTENT':
        rules.push({ action: permission, subject: 'GameContentGeneration' });
        break;
      case 'MANAGE_CLASSROOMS':
        rules.push({ action: permission, subject: 'ClassroomAdministration' });
        break;
      case 'READ_OWN_CLASSROOMS':
      case 'RESET_CHILD_LOGIN_CODES':
      case 'ASSIGN_ACTIVITIES':
        // Which classes a teacher may see is checked against ClassroomTeacher by the classrooms service.
        rules.push({ action: permission, subject: 'Classroom' });
        break;
    }
  }
  return createMongoAbility<AppAbility>(rules);
}

export function permissionSubject(
  permission: PermissionCode,
): string | undefined {
  switch (permission) {
    case 'PLAY_GAMES':
      return 'Gameplay';
    case 'SUBMIT_OWN_INTERACTIONS':
    case 'READ_OWN_PLAY_SESSIONS':
      return 'PlaySession';
    case 'READ_GAMES':
    case 'SAVE_GAMES':
    case 'MANAGE_ALL_GAMES':
      return 'GameLibrary';
    case 'READ_GAME_ASSETS':
    case 'MANAGE_GAME_ASSETS':
      return 'GameAsset';
    case 'READ_OWN_ACCOUNT':
      return 'Account';
    case 'MANAGE_USERS':
      return 'Administration';
    case 'GENERATE_GAME_CONTENT':
      return 'GameContentGeneration';
    case 'MANAGE_CLASSROOMS':
      return 'ClassroomAdministration';
    case 'READ_OWN_CLASSROOMS':
    case 'RESET_CHILD_LOGIN_CODES':
    case 'ASSIGN_ACTIVITIES':
      return 'Classroom';
    default:
      return undefined;
  }
}
