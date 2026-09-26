import { NextResponse } from "next/server";
import { z } from "zod";

const searchPathSchema = z.strictObject({
  query: z.string().trim().min(3).max(300),
  location: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const result = searchPathSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        issues: z.flattenError(result.error).fieldErrors,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
