/** Creation returns account metadata only, never the temporary password or a session. */
export interface CreateSuperAdminResponse {
  readonly user: {
    readonly id: string;
    readonly display_name: string;
    readonly email: string;
    readonly role: "SUPER_ADMIN";
    readonly status: "ACTIVE";
    readonly password_change_required: true;
  };
}
