import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { AUTH_CONFIG } from "./auth.constants.js";
import type { AccessTokenClaims, AuthModuleConfig } from "./auth.types.js";

const JWT_HEADER = Object.freeze({ alg: "HS256", typ: "JWT" });
const JWT_ISSUER = "whatsapp-saas-api";
const JWT_AUDIENCE = "whatsapp-saas-web";

@Injectable()
export class AccessTokenService {
  private readonly secret: Buffer;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthModuleConfig) {
    this.secret = Buffer.from(config.accessSecret, "utf8");
  }

  sign(input: {
    readonly sessionId: string;
    readonly tenantId: string | null;
    readonly userId: string;
  }): { readonly claims: AccessTokenClaims; readonly token: string } {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const claims: AccessTokenClaims = {
      aud: JWT_AUDIENCE,
      exp: issuedAt + this.config.accessTtlSeconds,
      iat: issuedAt,
      iss: JWT_ISSUER,
      sid: input.sessionId,
      sub: input.userId,
      tid: input.tenantId,
    };
    const unsigned = `${encodeJson(JWT_HEADER)}.${encodeJson(claims)}`;
    const signature = this.signValue(unsigned);

    return { claims, token: `${unsigned}.${signature}` };
  }

  verify(token: string): AccessTokenClaims | undefined {
    const segments = token.split(".");
    if (segments.length !== 3) {
      return undefined;
    }
    const [encodedHeader, encodedPayload, suppliedSignature] = segments;
    if (
      encodedHeader === undefined ||
      encodedPayload === undefined ||
      suppliedSignature === undefined
    ) {
      return undefined;
    }

    const expectedSignature = this.signValue(`${encodedHeader}.${encodedPayload}`);
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const suppliedBuffer = Buffer.from(suppliedSignature, "utf8");
    if (
      expectedBuffer.length !== suppliedBuffer.length ||
      !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      return undefined;
    }

    const header = decodeJson(encodedHeader);
    const payload = decodeJson(encodedPayload);
    if (!isJwtHeader(header) || !isAccessTokenClaims(payload)) {
      return undefined;
    }

    const now = Math.floor(Date.now() / 1_000);
    return payload.exp > now && payload.iat <= now ? payload : undefined;
  }

  private signValue(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isJwtHeader(value: unknown): boolean {
  return isRecord(value) && value.alg === "HS256" && value.typ === "JWT";
}

function isAccessTokenClaims(value: unknown): value is AccessTokenClaims {
  return (
    isRecord(value) &&
    value.aud === JWT_AUDIENCE &&
    value.iss === JWT_ISSUER &&
    typeof value.sub === "string" &&
    typeof value.sid === "string" &&
    (typeof value.tid === "string" || value.tid === null) &&
    typeof value.iat === "number" &&
    Number.isInteger(value.iat) &&
    typeof value.exp === "number" &&
    Number.isInteger(value.exp)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
