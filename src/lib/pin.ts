import { createHash } from "crypto";

export function hashPin(pin: string) {
  return createHash("sha256").update(pin.trim()).digest("hex");
}
