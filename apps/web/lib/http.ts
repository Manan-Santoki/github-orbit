import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown): NextResponse {
  if (error instanceof Response) {
    return NextResponse.json(
      { error: error.statusText || "Request failed" },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (process.env.NODE_ENV !== "production") console.error(error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function noStoreJson(data: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const originUrl = new URL(origin);
  const expectedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    new URL(request.url).host;
  const expectedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (
    originUrl.host !== expectedHost ||
    (expectedProtocol && originUrl.protocol !== `${expectedProtocol}:`)
  ) {
    throw new Response("Invalid request origin", { status: 403, statusText: "Forbidden" });
  }
}
