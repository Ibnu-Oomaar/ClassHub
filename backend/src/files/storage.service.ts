import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, ReadStream } from 'node:fs';
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { loadAppConfig } from '../config/app.config';
import { STORAGE_DIRECTORIES, StorageDirectory } from './file-rules';

/**
 * Low-level access to the local storage folder. Everything is resolved inside the storage root
 * and re-checked, so a crafted stored name can never escape it.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = loadAppConfig(config).storagePath;
  }

  async onModuleInit(): Promise<void> {
    for (const directory of STORAGE_DIRECTORIES) {
      await mkdir(join(this.root, directory), { recursive: true, mode: 0o750 });
    }
    this.logger.log(`Local storage ready at ${this.root}`);
  }

  directoryFor(directory: StorageDirectory): string {
    return join(this.root, directory);
  }

  /** Absolute path of a stored file, guaranteed to be inside its storage directory. */
  resolveSafe(directory: StorageDirectory, storedName: string): string {
    const base = resolve(this.directoryFor(directory));
    const target = resolve(base, storedName);
    if (basename(storedName) !== storedName || !target.startsWith(base + sep)) {
      throw new Error('Invalid storage path');
    }
    return target;
  }

  /** Writes a new file; never overwrites an existing one. */
  async write(directory: StorageDirectory, storedName: string, content: Buffer): Promise<void> {
    await writeFile(this.resolveSafe(directory, storedName), content, { flag: 'wx', mode: 0o640 });
  }

  createReadStream(directory: StorageDirectory, storedName: string): ReadStream {
    return createReadStream(this.resolveSafe(directory, storedName));
  }

  async exists(directory: StorageDirectory, storedName: string): Promise<boolean> {
    try {
      await access(this.resolveSafe(directory, storedName));
      return true;
    } catch {
      return false;
    }
  }

  async size(directory: StorageDirectory, storedName: string): Promise<number> {
    return (await stat(this.resolveSafe(directory, storedName))).size;
  }

  async delete(directory: StorageDirectory, storedName: string): Promise<void> {
    await rm(this.resolveSafe(directory, storedName), { force: true });
  }
}
