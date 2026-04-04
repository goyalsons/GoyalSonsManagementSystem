import type { UserAuth } from "@/lib/auth-context";

/**
 * Card/OTP employee channel or session has card — use for labels and employee-scoped UI.
 * Matches server session semantics (loginType + employeeCardNo).
 */
export function usesEmployeeChannelDisplay(
  user: Pick<UserAuth, "loginType" | "employeeCardNo"> | null | undefined
): boolean {
  if (!user) return false;
  return user.loginType === "employee" || Boolean(user.employeeCardNo);
}
