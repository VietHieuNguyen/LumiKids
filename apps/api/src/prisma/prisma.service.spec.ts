import { PrismaService } from './prisma.service.js';
import type { MockInstance } from 'vitest';

describe('PrismaService (without a database)', () => {
  let service: PrismaService;
  let connect: MockInstance<PrismaService['$connect']>;
  let disconnect: MockInstance<PrismaService['$disconnect']>;
  let query: MockInstance<PrismaService['$queryRaw']>;

  beforeEach(() => {
    service = new PrismaService({
      url: 'postgresql://fixture:fixture@localhost:5433/fixture',
    });
    connect = vi.spyOn(service, '$connect').mockResolvedValue(undefined);
    disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);
    query = vi.spyOn(service, '$queryRaw').mockResolvedValue([{ result: 1 }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects on initialization and releases the client on shutdown', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledExactlyOnceWith(['SELECT 1']);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('checks the connection with only a read-only query', async () => {
    await service.checkConnection();

    expect(query).toHaveBeenCalledExactlyOnceWith(['SELECT 1']);
  });

  it('does not expose driver credentials when startup fails', async () => {
    connect.mockRejectedValue(
      new Error(
        'Driver details: postgresql://fixture:private-password@localhost/fixture',
      ),
    );

    await expect(service.onModuleInit()).rejects.toThrow(
      /^Cannot connect to PostgreSQL\. Check the database and DATABASE_URL\.$/,
    );
  });

  it('does not expose driver details when the check query fails', async () => {
    query.mockRejectedValue(
      new Error(
        'Driver details: postgresql://fixture:private-password@localhost/fixture',
      ),
    );

    await expect(service.checkConnection()).rejects.toThrow(
      /^PostgreSQL connection check failed\. Check the database and DATABASE_URL\.$/,
    );
  });
});
