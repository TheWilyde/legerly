import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiMinus,
  FiSquare,
  FiX,
  FiFile,
  FiFolder,
  FiSave,
} from "react-icons/fi";
import { useDocument } from "../../contexts/DocumentContext";

type FeedbackType = "idle" | "success" | "info" | "warn" | "error";

type FeedbackPayload = {
  type: "success" | "info" | "warn" | "error";
  message?: string;
};

const DEFAULT_MESSAGE: Record<"success" | "info" | "warn" | "error", string> = {
  success: "Saved Successfully",
  info: "Notification",
  warn: "Warning",
  error: "Save Failed",
};

export default function TitleBar() {
  const [feedback, setFeedback] = useState<FeedbackType>("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const resetTimerRef = useRef<number | null>(null);
  const {
    currentDocument,
    newDocument,
    openDocument,
    saveDocument,
    saveDocumentAs,
  } = useDocument();

  const showFeedback = useCallback(
    (payload: "success" | "info" | "warn" | "error" | FeedbackPayload) => {
      const normalized: FeedbackPayload =
        typeof payload === "string" ? { type: payload } : payload;

      setFeedback(normalized.type);
      setFeedbackMessage(
        normalized.message?.trim() || DEFAULT_MESSAGE[normalized.type],
      );

      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = window.setTimeout(() => {
        setFeedback("idle");
        setFeedbackMessage("");
        resetTimerRef.current = null;
      }, 2000);
    },
    [],
  );

  useEffect(() => {
    // Listen for feedback events from main process and renderer.
    const cleanup = (window as any).api.window.onFeedback(
      (type: "success" | "error") => showFeedback(type),
    );

    const onRendererFeedback = (event: Event) => {
      const detail = (event as CustomEvent).detail;

      if (
        detail === "success" ||
        detail === "info" ||
        detail === "warn" ||
        detail === "error"
      ) {
        showFeedback(detail);
        return;
      }

      if (
        typeof detail === "object" &&
        detail !== null &&
        typeof (detail as { type?: unknown }).type === "string"
      ) {
        const type = (detail as { type: string }).type;
        const message =
          typeof (detail as { message?: unknown }).message === "string"
            ? (detail as { message: string }).message
            : undefined;

        if (
          type === "success" ||
          type === "info" ||
          type === "warn" ||
          type === "error"
        ) {
          showFeedback({ type, message } as FeedbackPayload);
        }
      }
    };

    window.addEventListener("app:feedback", onRendererFeedback);

    return () => {
      cleanup();
      window.removeEventListener("app:feedback", onRendererFeedback);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [showFeedback]);

  const getBgColor = () => {
    switch (feedback) {
      case "success":
        return "bg-green-500 text-white";
      case "info":
        return "bg-sky-500 text-white";
      case "warn":
        return "bg-amber-500 text-white";
      case "error":
        return "bg-red-500 text-white";
      default:
        return "bg-white text-neutral-600 border-b border-neutral-200";
    }
  };

  return (
    <div
      className={`h-8 flex items-center justify-between select-none transition-colors duration-500 ${getBgColor()}`}
      style={{ WebkitAppRegion: "drag" } as any} // Allow dragging
    >
      {/* Title / Logo Area */}
      <div className="px-3 text-sm font-bold tracking-wide uppercase flex items-center gap-2 min-w-0">
        <span className="shrink-0">Legerly</span>
        {currentDocument && (
          <span className="font-normal opacity-90 truncate normal-case">
            - {currentDocument.name}
            {currentDocument.isDirty ? " *" : ""}
          </span>
        )}
        {feedback !== "idle" && (
          <span className="font-normal opacity-90 truncate normal-case">
            - {feedbackMessage}
          </span>
        )}
      </div>

      {/* File Actions */}
      <div
        className="flex h-full items-center gap-0.5"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          onClick={() => void newDocument()}
          className="h-7 px-2 flex items-center gap-1 rounded-sm hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none text-xs"
          title="New Document"
        >
          <FiFile className="size-3.5" />
          <span>New</span>
        </button>
        <button
          onClick={() => void openDocument()}
          className="h-7 px-2 flex items-center gap-1 rounded-sm hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none text-xs"
          title="Open Document"
        >
          <FiFolder className="size-3.5" />
          <span>Open</span>
        </button>
        <button
          onClick={() => void saveDocument()}
          className="h-7 px-2 flex items-center gap-1 rounded-sm hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none text-xs"
          title="Save Document"
        >
          <FiSave className="size-3.5" />
          <span>Save</span>
        </button>
        <button
          onClick={() => void saveDocumentAs()}
          className="h-7 px-2 flex items-center gap-1 rounded-sm hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none text-xs"
          title="Save Document As"
        >
          <span>Save As</span>
        </button>
      </div>

      {/* Window Controls */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        <button
          onClick={() => (window as any).api.window.minimize()}
          className="h-full w-10 flex items-center justify-center hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none"
          tabIndex={-1}
        >
          <FiMinus className="size-4" />
        </button>
        <button
          onClick={() => (window as any).api.window.maximize()}
          className="h-full w-10 flex items-center justify-center hover:bg-black/5 active:bg-black/10 transition-colors focus:outline-none"
          tabIndex={-1}
        >
          <FiSquare className="size-3" />
        </button>
        <button
          onClick={() => (window as any).api.window.close()}
          className="h-full w-10 flex items-center justify-center hover:bg-red-500 hover:text-white active:bg-red-600 transition-colors focus:outline-none"
          tabIndex={-1}
        >
          <FiX className="size-4" />
        </button>
      </div>
    </div>
  );
}
