const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  timeZone: "Europe/Berlin"
});

export function testFixtureDateSuffix(date = new Date()) {
  const parts = dateFormatter.formatToParts(date);
  const month = parts.find((part) => part.type === "month")!.value.toLowerCase();
  const day = parts.find((part) => part.type === "day")!.value;
  return `-${month}${day}`;
}

export function testUsernameFromEmail(email: string) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") + testFixtureDateSuffix();
}
