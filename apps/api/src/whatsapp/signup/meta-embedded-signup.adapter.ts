import { createHmac } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApplicationError } from "../../common/errors/application-error.js";
import {
  WHATSAPP_ONBOARDING_CONFIG,
  type OnboardingConfig,
} from "../whatsapp-onboarding.service.js";

export interface VerifiedSignup {
  readonly token: string;
  readonly wabaId: string;
  readonly phoneNumberId: string;
  readonly displayPhone: string;
  readonly displayName: string | null;
}

/** Official fixed-host Graph adapter; all browser asset IDs remain untrusted hints. */
@Injectable()
export class MetaEmbeddedSignupAdapter {
  constructor(@Inject(WHATSAPP_ONBOARDING_CONFIG) private readonly config: OnboardingConfig) {}

  async exchangeAndVerify(
    code: string,
    wabaId: string,
    phoneNumberId: string,
  ): Promise<VerifiedSignup> {
    const meta = this.config.meta;
    if (!meta?.appId || !meta.appSecret || !meta.graphApiVersion) throw failed();
    try {
      const exchanged = await this.get("oauth/access_token", {
        client_id: meta.appId,
        client_secret: meta.appSecret,
        redirect_uri: "",
        code,
      });
      if (
        typeof exchanged.access_token !== "string" ||
        exchanged.access_token.length < 1 ||
        exchanged.access_token.length > 16384
      )
        throw failed();
      const token = exchanged.access_token;
      const debug = await this.get(
        "debug_token",
        { input_token: token },
        `${meta.appId}|${meta.appSecret}`,
      );
      const details = object(debug.data);
      const scopes = Array.isArray(details.scopes) ? details.scopes : [];
      if (
        details.is_valid !== true ||
        details.app_id !== meta.appId ||
        !["whatsapp_business_management", "whatsapp_business_messaging"].every((scope) =>
          scopes.includes(scope),
        )
      )
        throw failed();
      for (const expiry of [details.expires_at, details.data_access_expires_at]) {
        if (
          expiry !== undefined &&
          (typeof expiry !== "number" || (expiry !== 0 && expiry <= Date.now() / 1000))
        )
          throw failed();
      }
      // Require WABA-targeted management permission, not merely a globally named scope.
      const granular = Array.isArray(details.granular_scopes) ? details.granular_scopes : [];
      if (
        !granular.some((item: unknown) => {
          const scope = object(item);
          return (
            scope.scope === "whatsapp_business_management" &&
            Array.isArray(scope.target_ids) &&
            scope.target_ids.includes(wabaId)
          );
        })
      )
        throw failed();
      const proof = createHmac("sha256", meta.appSecret).update(token).digest("hex");
      const account = await this.get(wabaId, { fields: "id", appsecret_proof: proof }, token);
      if (account.id !== wabaId) throw failed();
      const phones = await this.get(
        `${wabaId}/phone_numbers`,
        {
          fields: "id,display_phone_number,verified_name",
          limit: "100",
          appsecret_proof: proof,
        },
        token,
      );
      // Never follow provider-supplied URLs. Missing selection fails safely, including pagination.
      const phone = (Array.isArray(phones.data) ? phones.data : [])
        .map(object)
        .find((row) => row.id === phoneNumberId);
      if (
        !phone ||
        typeof phone.display_phone_number !== "string" ||
        phone.display_phone_number.length > 512
      )
        throw failed();
      return {
        token,
        wabaId,
        phoneNumberId,
        displayPhone: phone.display_phone_number,
        displayName:
          typeof phone.verified_name === "string" ? phone.verified_name.slice(0, 512) : null,
      };
    } catch {
      throw failed();
    }
  }

  private async get(
    path: string,
    query: Readonly<Record<string, string>>,
    token?: string,
  ): Promise<Record<string, unknown>> {
    const url = new URL(
      `https://graph.facebook.com/${this.config.meta?.graphApiVersion ?? ""}/${path}`,
    );
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw failed();
    const text = await response.text();
    if (text.length > 262144) throw failed();
    return object(JSON.parse(text) as unknown);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw failed();
  return value as Record<string, unknown>;
}
function failed() {
  return new ApplicationError({
    code: "WHATSAPP_SIGNUP_VERIFICATION_FAILED",
    message: "Meta connection could not be verified. Restart signup or check your Meta app access.",
    statusCode: 422,
  });
}
