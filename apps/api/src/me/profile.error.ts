export class ProfileError extends Error {
  constructor(readonly code: "PROFILE_SESSION_INVALID" | "PROFILE_UPDATE_UNAVAILABLE") {
    super(code);
    this.name = "ProfileError";
  }
}
