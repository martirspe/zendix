import { Injectable, Inject } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from '../database';

export function seal(value: unknown, key: Buffer, context: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(context));
  const content = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [nonce, cipher.getAuthTag(), content].map(buffer => buffer.toString('base64url')).join('.');
}
export function unseal(value: string, key: Buffer, context: string): unknown {
  const parts = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const [nonce, tag, content] = parts;
  if (parts.length !== 3 || !nonce || !tag || !content) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8')) as unknown;
}

@Injectable()
export class SecretVault {
  private readonly directory = process.env['MAILCRAFT_KEYS_PATH'] ?? '/var/lib/mailcraft/keys';
  private keyPromise?: Promise<Buffer>;
  constructor(@Inject(Database) private readonly db: Database) {}

  masterKey(): Promise<Buffer> {
    return this.keyPromise ??= (async () => {
      const external=process.env['MAILCRAFT_MASTER_KEY_FILE'];
      if(external){const key=Buffer.from((await readFile(external,'utf8')).trim(),'base64');if(key.length!==32)throw new Error('Invalid master key');return key;}
      if(process.env['NODE_ENV']==='production')throw new Error('A persistent master key is required');
      await mkdir(this.directory, {recursive: true, mode: 0o700});
      const path = join(this.directory, 'master.key');
      try { await writeFile(path, randomBytes(32), {flag: 'wx', mode: 0o600}); }
      catch (error: unknown) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
      const key = await readFile(path);
      if (key.length !== 32) throw new Error('Invalid encryption key');
      return key;
    })();
  }

  async store(tenantId: string, kind: string, value: unknown): Promise<void> {
    const encryptedPayload = seal(value, await this.masterKey(), tenantId + ':' + kind);
    await this.db.integrationCredential.upsert({where: {tenantId_kind: {tenantId, kind}}, create: {tenantId, kind, encryptedPayload}, update: {encryptedPayload}});
  }
  async load<T>(tenantId: string, kind: string): Promise<T | null> {
    const record = await this.db.integrationCredential.findUnique({where: {tenantId_kind: {tenantId, kind}}});
    return record ? unseal(record.encryptedPayload, await this.masterKey(), tenantId + ':' + kind) as T : null;
  }

}
