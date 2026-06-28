import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { IikoError, loginToIiko, normalizeBaseUrl } from "@/lib/iiko";

const loginSchema = z.object({
  serverUrl: z.string().trim().min(1).optional(),
  login: z.string().min(1, "Введите логин."),
  password: z.string().min(1, "Введите пароль."),
});

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const baseUrl = normalizeBaseUrl(body.serverUrl ?? env.IIKO_SERVER_URL);
    const token = await loginToIiko({
      baseUrl,
      login: body.login,
      password: body.password,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set("iiko_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    response.cookies.set("iiko_base_url", baseUrl, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось войти в iiko.";
    const status = error instanceof IikoError ? error.status : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
