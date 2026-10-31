import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Updates from "../pages/Updates";
import type { ReleaseOption } from "../../electron/update-types";

const releases: ReleaseOption[] = [
  {
    version: "1.1.1",
    publishedAt: "2026-10-31T00:00:00.000Z",
    notesUrl: "https://github.com/TheWilyde/legerly/releases/tag/v1.1.1",
    installerSize: 600_000_000,
    architecture: "x64",
    isCurrent: true,
    isNewer: false,
    compatibility: { compatible: true, highestLocalSchema: 4, minReadableSchema: 0, maxReadableSchema: 4 },
  },
  {
    version: "1.1.0",
    publishedAt: "2026-10-30T00:00:00.000Z",
    notesUrl: "https://github.com/TheWilyde/legerly/releases/tag/v1.1.0",
    installerSize: 590_000_000,
    architecture: "x64",
    isCurrent: false,
    isNewer: false,
    compatibility: {
      compatible: false,
      highestLocalSchema: 5,
      minReadableSchema: 0,
      maxReadableSchema: 4,
      reason: "Local data uses schema 5; Ledgerly 1.1.0 supports schemas 0-4.",
    },
  },
];

describe("Updates page", () => {
  beforeEach(() => {
    window.api = {
      updates: {
        getState: vi.fn().mockResolvedValue({ status: "idle", currentVersion: "1.1.1" }),
        check: vi.fn(),
        listVersions: vi.fn().mockResolvedValue(releases),
        downloadLatest: vi.fn(),
        installDownloaded: vi.fn(),
        installVersion: vi.fn(),
        onState: vi.fn().mockReturnValue(() => {}),
        onProgress: vi.fn().mockReturnValue(() => {}),
      },
    } as unknown as typeof window.api;
  });

  it("shows the installed release and signed rollback history", async () => {
    render(<Updates />);
    expect(await screen.findByText("Ledgerly 1.1.1")).toBeInTheDocument();
    expect(screen.getByText("v1.1.0")).toBeInTheDocument();
    expect(screen.getByText(/Local data uses schema 5/)).toBeInTheDocument();
  });

  it("disables an incompatible rollback", async () => {
    render(<Updates />);
    await waitFor(() => expect(screen.getByText("v1.1.0")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reinstall" })).toBeDisabled();
  });
});
