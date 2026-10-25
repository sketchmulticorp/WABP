import { request } from "../workspace/api-client";

export function updateOwnName(displayName: string): Promise<{ display_name: string }> {
  return request("/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
}
