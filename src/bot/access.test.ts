import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { isAllowed } from "./access";

describe("isAllowed", () => {
  test("owner always allowed regardless of whitelist", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "1", chatId: "any" }),
    ).toBe(true);
  });

  test("non-owner with whitelisted user passes in any chat", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "42", chatId: "x" }),
    ).toBe(true);
  });

  test("non-owner in whitelisted chat passes", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-100" });
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "42", chatId: "-100" }),
    ).toBe(true);
  });

  test("neither user nor chat whitelisted: denied", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({ storage, ownerId: "1", userId: "42", chatId: "x" }),
    ).toBe(false);
  });
});
