import { describe, expect, it } from "vitest";
import { BrowserBridge } from "./browser-bridge";

describe("BrowserBridge", () => {
  it("queues browser actions for an online extension profile and resolves returned results", async () => {
    const bridge = new BrowserBridge();

    bridge.handleNativeMessage({
      id: "evt_hello",
      method: "session.hello",
      params: {
        profileId: "profile_1",
        sessionId: "session_1",
        extensionId: "extension_1",
        extensionVersion: "0.2.0",
      },
    });

    const action = bridge.invoke({
      profileId: "profile_1",
      method: "browser.status",
      timeoutMs: 5_000,
    });

    const command = await bridge.poll("profile_1", "session_1", 100);
    expect(command?.method).toBe("browser.status");

    bridge.handleNativeMessage({
      id: command?.id,
      result: { ok: true },
    });

    await expect(action).resolves.toEqual({ ok: true });
  });

  it("rejects actions when no browser profile is online", async () => {
    const bridge = new BrowserBridge();

    await expect(
      bridge.invoke({
        method: "browser.status",
      }),
    ).rejects.toThrow("No Golemancy browser extension profile is online");
  });

  it("restores an online profile from native-host poll metadata after sidecar restart", async () => {
    const bridge = new BrowserBridge();

    await bridge.poll(
      "profile_1",
      {
        sessionId: "session_1",
        extensionId: "extension_1",
        extensionVersion: "0.2.0",
        browser: "chromium",
      },
      100,
    );

    const status = bridge.getStatus();
    expect(status).toMatchObject({
      onlineProfiles: 1,
      profiles: [
        {
          profileId: "profile_1",
          sessionId: "session_1",
          extensionId: "extension_1",
          status: "online",
        },
      ],
    });
  });
});
