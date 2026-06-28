import { z } from "zod";

const envSchema = z.object({
  IIKO_SERVER_URL: z.string().trim().min(1).default("https://koza-dereza-slavnya-koza-co.iiko.it/resto"),
});

export const env = envSchema.parse({
  IIKO_SERVER_URL: process.env.IIKO_SERVER_URL,
});
