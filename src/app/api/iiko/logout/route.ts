import { NextRequest, NextResponse } from "next/server";
import { logoutFromIiko } from "@/lib/iiko";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("iiko_token")?.value;
  const baseUrl = request.cookies.get("iiko_base_url")?.value;

  if (token && baseUrl) {
    await logoutFromIiko(baseUrl, token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("iiko_token");
  response.cookies.delete("iiko_base_url");

  return response;
}
