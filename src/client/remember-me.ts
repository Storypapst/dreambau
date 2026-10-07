const REMEMBER_KEY = "testmails-remember-me";

/** Last "stay signed in" choice on this browser. Defaults to off. */
export function rememberedStaySignedIn() {
  try { return localStorage.getItem(REMEMBER_KEY) === "1"; } catch { return false; }
}

export function rememberStaySignedIn(value: boolean) {
  try { localStorage.setItem(REMEMBER_KEY, value ? "1" : "0"); } catch { /* private mode or storage blocked */ }
}
