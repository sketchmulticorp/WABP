export interface FirstSuperAdminInput {
  readonly email: string;
  readonly password: string;
}

export interface FirstSuperAdminResult {
  readonly user_id: string;
  readonly role: "SUPER_ADMIN";
}
