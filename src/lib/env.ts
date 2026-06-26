import { z } from "zod";

const envSchema = z.object({
  IIKO_SERVER_URL: z.string().url().default("http://127.0.0.1:9080/resto"),
});

export const env = envSchema.parse({
  IIKO_SERVER_URL: process.env.IIKO_SERVER_URL,
});
