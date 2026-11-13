import { randomUUID } from 'node:crypto';
import { cognitiveCurriculum, saveGameSchema } from '@lumikids/shared';
import type { SaveGameInput } from '@lumikids/shared';
import type { Principal } from '../../common/security/principal.js';
import { GameLibraryService } from './game-library.service.js';
import type {
  GameLibraryRepository,
  LibraryVersion,
} from './game-library.repository.js';
import type { CurriculumService } from '../curriculum/curriculum.service.js';
import type { GameAssetService } from '../game-assets/game-asset.service.js';
import type { GamePreviewAccessService } from '../game-generation/game-preview-access.service.js';
import { contentDigest } from '../game-generation/content-digest.js';
import { adminFixture } from '../../../test/game-asset.fixtures.js';

describe('Saved game library (offline)', () => {
  const user: Principal = {
    ...adminFixture,
    permissions: ['READ_GAMES', 'SAVE_GAMES', 'GENERATE_GAME_CONTENT'],
    roles: ['ROLE_TEACHER'],
  };
  const assetId = randomUUID(),
    versionId = randomUUID(),
    activityId = randomUUID();
  const input: SaveGameInput = {
    saveRequestId: randomUUID(),
    name: 'Bé đếm hình',
    description: '',
    difficulty: 'EASY',
    criterionCodes: ['42', '43'],
    reviewConfirmed: true,
    previewToken: 'signed-fixture',
    content: {
      schemaVersion: 1,
      gameType: 'COUNTING',
      instruction: 'Đếm hình',
      items: [{ id: 'a', assetId }],
      choices: [
        { id: 'one', value: 1 },
        { id: 'two', value: 2 },
      ],
      correctChoiceId: 'one',
      completionRule: 'CORRECT_CHOICE',
    },
  };
  const row: LibraryVersion = {
    versionId,
    activityId,
    versionNumber: 1,
    instruction: input.content.instruction,
    difficulty: 'EASY',
    gameType: 'COUNTING',
    content: input.content,
    completionRule: 'CORRECT_CHOICE',
    createdAt: new Date(),
    criterions: [{ criterionCode: '42' }, { criterionCode: '43' }],
    activity: {
      activityId,
      name: input.name,
      description: '',
      createdBy: user.userId,
      status: 'ACTIVE',
      saveRequestId: input.saveRequestId,
      saveFingerprint: 'fixture',
      createdAt: new Date(),
      updatedAt: new Date(),
      creator: { fullName: 'Giáo viên' },
    },
  };
  function fixture() {
    const repository = {
      find: vi.fn().mockResolvedValue(structuredClone(row)),
      findRequest: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ versions: [{ versionId }] }),
      list: vi
        .fn()
        .mockResolvedValue({
          items: [structuredClone(row)],
          pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
        }),
      setStatus: vi.fn(),
    };
    const curriculum = {
      list: vi.fn().mockResolvedValue(cognitiveCurriculum),
      requireCodes: vi.fn().mockResolvedValue(undefined),
    };
    const assets = {
      generationAssets: vi
        .fn()
        .mockResolvedValue([{ id: assetId, status: 'ACTIVE' }]),
      savedGameReadUrl: vi
        .fn()
        .mockResolvedValue({ url: 'https://fixture.test/image' }),
    };
    const previews = { verifyForSave: vi.fn().mockResolvedValue(undefined) };
    const service = new GameLibraryService(
      repository as unknown as GameLibraryRepository,
      curriculum as unknown as CurriculumService,
      assets as unknown as GameAssetService,
      previews as unknown as GamePreviewAccessService,
    );
    return { service, repository, curriculum, assets, previews };
  }
  const fingerprint = () =>
    contentDigest({
      name: input.name,
      description: input.description,
      difficulty: input.difficulty,
      criterionCodes: [...input.criterionCodes].sort(),
      content: input.content,
    });
  it('saves a reviewed version with multiple indices without AI calls', async () => {
    const { service, repository, previews } = fixture();
    const result = await service.save(user, input);
    expect(previews.verifyForSave).toHaveBeenCalledWith(
      user,
      input.previewToken,
      input.content,
    );
    expect(repository.create).toHaveBeenCalledWith(
      user.userId,
      input,
      fingerprint(),
    );
    expect(result.criterions.map((c) => c.criterionCode)).toEqual(['42', '43']);
    expect(result.content).toEqual(input.content);
  });
  it('retries an already committed save without duplicating it or rechecking an expired proof', async () => {
    const { service, repository, previews } = fixture();
    repository.findRequest.mockResolvedValue({
      saveFingerprint: fingerprint(),
      versions: [{ versionId }],
    });
    await service.save(user, input);
    expect(repository.create).not.toHaveBeenCalled();
    expect(previews.verifyForSave).not.toHaveBeenCalled();
    await expect(
      service.save(user, { ...input, name: 'Changed' }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('resolves a concurrent duplicate only if its content fingerprint is identical', async () => {
    const { service, repository } = fixture();
    repository.create.mockRejectedValue({ code: 'P2002' });
    repository.findRequest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        saveFingerprint: fingerprint(),
        versions: [{ versionId }],
      });
    await expect(service.save(user, input)).resolves.toMatchObject({
      versionId,
    });
  });
  it('does not write when proof is rejected or an asset becomes inactive', async () => {
    const { service, repository, previews, assets } = fixture();
    previews.verifyForSave.mockRejectedValueOnce({ status: 403 });
    await expect(service.save(user, input)).rejects.toMatchObject({
      status: 403,
    });
    assets.generationAssets.mockResolvedValue([
      { id: assetId, status: 'INACTIVE' },
    ]);
    await expect(service.save(user, input)).rejects.toMatchObject({
      status: 409,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('requires selected indices to exist before writing', async () => {
    const { service, curriculum, repository } = fixture();
    curriculum.requireCodes.mockRejectedValue({ status: 400 });
    await expect(service.save(user, input)).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('shares active games with another teacher, while hiding other teachers archived games', async () => {
    const { service, repository } = fixture();
    const other = { ...user, userId: randomUUID() };
    await expect(service.detail(other, versionId)).resolves.toMatchObject({
      createdBy: user.userId,
    });
    repository.find.mockResolvedValue({
      ...row,
      activity: { ...row.activity, status: 'ARCHIVED' },
    });
    await expect(service.detail(other, versionId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.detail(user, versionId)).resolves.toMatchObject({
      status: 'ARCHIVED',
    });
  });
  it('limits image URLs to the stored version asset scope', async () => {
    const { service, assets } = fixture();
    await expect(
      service.readUrl(user, versionId, randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    expect(assets.savedGameReadUrl).not.toHaveBeenCalled();
    await service.readUrl(user, versionId, assetId);
    expect(assets.savedGameReadUrl).toHaveBeenCalledWith(user, assetId);
  });
  it('permits owner and admin status changes, rejecting a different teacher', async () => {
    const { service, repository } = fixture();
    await expect(
      service.status({ ...user, userId: randomUUID() }, versionId, 'ARCHIVED'),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.setStatus).not.toHaveBeenCalled();
    await service.status(user, versionId, 'ARCHIVED');
    await service.status(
      {
        ...user,
        userId: randomUUID(),
        permissions: ['READ_GAMES', 'MANAGE_ALL_GAMES'],
      },
      versionId,
      'ACTIVE',
    );
    expect(repository.setStatus).toHaveBeenCalledTimes(2);
  });
  it('blocks a guardian before reading or writing repository data', async () => {
    const { service, repository } = fixture();
    const guardian = { ...user, permissions: [] };
    await expect(service.detail(guardian, versionId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.save(guardian, input)).rejects.toMatchObject({
      status: 403,
    });
    expect(repository.find).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('keeps the requested curriculum scope and requires adult review, difficulty, unique indices', () => {
    expect(cognitiveCurriculum.map((s) => s.skillCode)).toEqual([
      '15',
      '16',
      '17',
    ]);
    const indices = cognitiveCurriculum.flatMap((s) => s.criterions);
    expect(indices).toHaveLength(11);
    expect(
      indices.find((c) => c.criterionCode === '51')?.description,
    ).not.toContain('gọi tên');
    for (const patch of [
      { reviewConfirmed: false },
      { difficulty: null },
      { criterionCodes: [] },
      { criterionCodes: ['51', '51'] },
    ])
      expect(saveGameSchema.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
  });
});
