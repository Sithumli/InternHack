/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCopyToClipboard } from "./useCopyToClipboard";

const writeTextMock = vi.fn();

Object.defineProperty(navigator, "clipboard", {
    value: {
        writeText: writeTextMock,
    },
    configurable: true,
});

describe("useCopyToClipboard", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("initializes with copied set to false", () => {
        const { result } = renderHook(() =>
            useCopyToClipboard()
        );

        expect(result.current.copied).toBe(false);
    });

    it("calls navigator.clipboard.writeText with the provided text", async () => {
        writeTextMock.mockResolvedValueOnce(undefined);

        const { result } = renderHook(() =>
            useCopyToClipboard()
        );

        await act(async () => {
            await result.current.copy("Hello InternHack");
        });

        expect(writeTextMock).toHaveBeenCalledTimes(1);
        expect(writeTextMock).toHaveBeenCalledWith("Hello InternHack");
    });

    it("sets copied to true after a successful copy", async () => {
        writeTextMock.mockResolvedValueOnce(undefined);

        const { result } = renderHook(() =>
            useCopyToClipboard()
        );

        await act(async () => {
            await result.current.copy("Copied text");
        });

        expect(result.current.copied).toBe(true);
    });

    it("resets copied to false after the configured delay", async () => {
        writeTextMock.mockResolvedValueOnce(undefined);

        const { result } = renderHook(() =>
            useCopyToClipboard(2000)
        );

        await act(async () => {
            await result.current.copy("Copied text");
        });

        expect(result.current.copied).toBe(true);

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(result.current.copied).toBe(false);
    });

    it("handles clipboard API failures without throwing", async () => {
        const error = new Error("Clipboard unavailable");

        writeTextMock.mockRejectedValueOnce(error);

        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => { });

        const { result } = renderHook(() =>
            useCopyToClipboard()
        );

        await expect(
            act(async () => {
                await result.current.copy("Hello");
            })
        ).resolves.not.toThrow();

        expect(consoleSpy).toHaveBeenCalledWith(
            "Failed to copy:",
            error
        );

        consoleSpy.mockRestore();
    });

    it("keeps copied false when clipboard write fails", async () => {
        writeTextMock.mockRejectedValueOnce(
            new Error("Clipboard error")
        );

        const consoleSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => { });

        const { result } = renderHook(() =>
            useCopyToClipboard()
        );

        await act(async () => {
            await result.current.copy("Hello");
        });

        expect(result.current.copied).toBe(false);

        consoleSpy.mockRestore();
    });

    it("uses the provided reset delay", async () => {
        writeTextMock.mockResolvedValueOnce(undefined);

        const { result } = renderHook(() =>
            useCopyToClipboard(500)
        );

        await act(async () => {
            await result.current.copy("Hello");
        });

        expect(result.current.copied).toBe(true);

        act(() => {
            vi.advanceTimersByTime(499);
        });

        expect(result.current.copied).toBe(true);

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(result.current.copied).toBe(false);
    });
});