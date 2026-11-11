import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

@Injectable()
export class PasswordService {
  private readonly options = {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  } as const;
  private readonly dummyHash = this.hash(randomBytes(32).toString('base64url'));

  hash(password: string): Promise<string> {
    return hash(password, this.options);
  }

  async verify(password: string, passwordHash?: string): Promise<boolean> {
    try {
      const matches = await verify(
        passwordHash ?? (await this.dummyHash),
        password,
      );
      return passwordHash !== undefined && matches;
    } catch {
      await verify(await this.dummyHash, password);
      return false;
    }
  }
}
