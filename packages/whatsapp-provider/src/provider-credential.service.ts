import type { EnvironmentCredentialReferenceResolver } from "./environment-credential-reference.resolver.js";
import {
  type ProviderCredentialCipher,
  unavailable,
  type CredentialBinding,
} from "./provider-credential-cipher.js";

export interface CredentialReferenceResolver {
  resolve(reference: string, accountId: string): string | Promise<string>;
}
export interface EncryptedCredentialRecord extends CredentialBinding {
  readonly encryptedToken: string;
}
export interface EncryptedCredentialRepository {
  findActive(reference: string, accountId: string): Promise<EncryptedCredentialRecord | undefined>;
}

/** Shared API/Worker credential policy; only its repository performs database queries. */
export class ProviderCredentialService implements CredentialReferenceResolver {
  constructor(
    private readonly repository: EncryptedCredentialRepository,
    private readonly cipher: ProviderCredentialCipher,
    private readonly development: EnvironmentCredentialReferenceResolver,
  ) {}

  async resolve(reference: string, accountId: string): Promise<string> {
    if (!reference.startsWith("encrypted://")) return this.development.resolve(reference);
    if (
      !/^encrypted:\/\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        reference,
      )
    )
      throw unavailable();
    try {
      const record = await this.repository.findActive(reference, accountId);
      if (record?.accountId !== accountId || reference !== `encrypted://${record.id}`)
        throw unavailable();
      return this.cipher.decrypt(record.encryptedToken, record);
    } catch {
      throw unavailable();
    }
  }
}
