import { NextResponse } from "next/server";
import { getPlatformAdminAccess } from "@/lib/platform-admin";

export async function GET() {
  const access = await getPlatformAdminAccess();
  if (!access.configured) {
    return NextResponse.json({ isAdmin: false }, { status: 503 });
  }
  if (!access.user) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }
  return NextResponse.json({ isAdmin: access.isAdmin });
}
