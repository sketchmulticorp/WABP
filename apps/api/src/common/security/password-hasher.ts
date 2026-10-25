import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, encodedHash?: string): Promise<boolean>;
}

const ARGON2_VERSION = 19;
const MEMORY_KIB = 65_536;
const PASSES = 3;
const PARALLELISM = 1;
const TAG_LENGTH = 32;
const DUMMY_SALT = Buffer.from("whatsapp-auth-dummy-salt", "utf8");
const DUMMY_TAG = Buffer.alloc(TAG_LENGTH);

/** Produces a portable PHC-formatted Argon2id hash without retaining the plaintext. */
export class Argon2idPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await deriveArgon2id(password, salt);

    return [
      "$argon2id",
      `v=${String(ARGON2_VERSION)}`,
      `m=${String(MEMORY_KIB)},t=${String(PASSES)},p=${String(PARALLELISM)}`,
      toUnpaddedBase64(salt),
      toUnpaddedBase64(derivedKey),
    ].join("$");
  }

  async verify(password: string, encodedHash?: string): Promise<boolean> {
    const parsed = encodedHash === undefined ? undefined : parseArgon2idHash(encodedHash);
    const parameters = parsed ?? {
      memory: MEMORY_KIB,
      parallelism: PARALLELISM,
      passes: PASSES,
      salt: DUMMY_SALT,
      tag: DUMMY_TAG,
    };
    const derivedKey = await deriveArgon2id(password, parameters.salt, {
      memory: parameters.memory,
      parallelism: parameters.parallelism,
      passes: parameters.passes,
      tagLength: parameters.tag.length,
    });

    return parsed !== undefined && timingSafeEqual(derivedKey, parameters.tag);
  }
}

function deriveArgon2id(
  password: string,
  salt: Buffer,
  options: {
    readonly memory: number;
    readonly parallelism: number;
    readonly passes: number;
    readonly tagLength: number;
  } = {
    memory: MEMORY_KIB,
    parallelism: PARALLELISM,
    passes: PASSES,
    tagLength: TAG_LENGTH,
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message: Buffer.from(password, "utf8"),
        nonce: salt,
        parallelism: options.parallelism,
        tagLength: options.tagLength,
        memory: options.memory,
        passes: options.passes,
      },
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

function parseArgon2idHash(encodedHash: string):
  | {
      readonly memory: number;
      readonly parallelism: number;
      readonly passes: number;
      readonly salt: Buffer;
      readonly tag: Buffer;
    }
  | undefined {
  const match =
    /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/u.exec(
      encodedHash,
    );
  if (match === null) {
    return undefined;
  }

  const memory = Number(match[1]);
  const passes = Number(match[2]);
  const parallelism = Number(match[3]);
  const encodedSalt = match[4];
  const encodedTag = match[5];
  if (encodedSalt === undefined || encodedTag === undefined) {
    return undefined;
  }
  const salt = decodeUnpaddedBase64(encodedSalt);
  const tag = decodeUnpaddedBase64(encodedTag);
  if (
    !Number.isInteger(memory) ||
    memory < 8_192 ||
    memory > 262_144 ||
    !Number.isInteger(passes) ||
    passes < 1 ||
    passes > 10 ||
    !Number.isInteger(parallelism) ||
    parallelism < 1 ||
    parallelism > 16 ||
    salt.length < 16 ||
    tag.length < 16 ||
    tag.length > 64
  ) {
    return undefined;
  }

  return { memory, parallelism, passes, salt, tag };
}

function toUnpaddedBase64(value: Buffer): string {
  return value.toString("base64").replace(/=+$/u, "");
}

function decodeUnpaddedBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}
