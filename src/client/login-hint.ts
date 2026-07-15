const LOGIN_EMAIL_KEY = "testmails-login-email";

export function rememberedLoginEmail() {
  return sessionStorage.getItem(LOGIN_EMAIL_KEY) ?? "";
}

export function rememberLoginEmail(email: string) {
  if (email) sessionStorage.setItem(LOGIN_EMAIL_KEY, email);
  else sessionStorage.removeItem(LOGIN_EMAIL_KEY);
}

export function clearRememberedLoginEmail() {
  sessionStorage.removeItem(LOGIN_EMAIL_KEY);
}
