import type { CreateSuperAdminResponse } from "@whatsapp-platform/contracts";
import { request } from "../workspace/api-client";

export function createSuperAdmin(input: {
  readonly display_name: string;
  readonly email: string;
  readonly initial_password: string;
}): Promise<CreateSuperAdminResponse> {
  return request("/platform/super-admins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
