export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return null;
}
