import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/lib/graph/schema";

// Writes stay disabled until admin auth exists (M5).

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/graphs/[taskId]">
) {
  const { taskId } = await ctx.params;
  const parseResult = idSchema.safeParse(taskId);
  if (!parseResult.success) {
    return NextResponse.json({ error: "invalid_task_id" }, { status: 400 });
  }

  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}

export async function PUT(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/graphs/[taskId]">
) {
  // Writes stay disabled until admin auth exists (M5).
  const { taskId } = await ctx.params;
  const parseResult = idSchema.safeParse(taskId);
  if (!parseResult.success) {
    return NextResponse.json({ error: "invalid_task_id" }, { status: 400 });
  }

  return NextResponse.json({ error: "not_implemented" }, { status: 501 });
}
