const LOGIN_EMAIL_KEY = "testmails-login-email";

export function rememberedLoginEmail() {
  return localStorage.getItem(LOGIN_EMAIL_KEY) ?? "";
}

export function rememberLoginEmail(email: string) {
  localStorage.setItem(LOGIN_EMAIL_KEY, email);
}
