import {
  createContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  use,
} from "react";
import type {ReactNode} from 'react';
import { emitAppFeedback, toErrorText } from "../utils/feedback";

type DocumentInfo = {
  path: string;
  name: string;
  isDirty: boolean;
};

type DocumentCtx = {
  currentDocument: DocumentInfo | null;
  isDocumentMode: boolean;
  newDocument: () => Promise<void>;
  openDocument: () => Promise<void>;
  saveDocument: () => Promise<void>;
  saveDocumentAs: () => Promise<void>;
  closeDocument: () => Promise<void>;
};

const DocumentContext = createContext<DocumentCtx | null>(null);

function setWindowTitle(doc: DocumentInfo | null) {
  if (!doc) {
    document.title = "Legerly";
    return;
  }

  const dirty = doc.isDirty ? "*" : "";
  document.title = `Legerly - ${doc.name}${dirty}`;
}

export function DocumentProvider({children}: {children: ReactNode}) {
  const [currentDocument, setCurrentDocument] = useState<DocumentInfo | null>(
    null,
  );

  const syncCurrent = useCallback(async () => {
    try {
      const current = await window.api.document.getCurrent();
      setCurrentDocument(current ?? null);
      setWindowTitle(current ?? null);
    } catch (error) {
      emitAppFeedback(
        "error",
        toErrorText(error, "Failed to load current document state."),
      );
    }
  }, []);

  const onDocumentOpened = useEffectEvent((doc: DocumentInfo) => {
    setCurrentDocument(doc ?? null);
    setWindowTitle(doc ?? null);
  });

  const onDocumentStateChanged = useEffectEvent(
    (doc: DocumentInfo | null) => {
      setCurrentDocument(doc ?? null);
      setWindowTitle(doc ?? null);
    },
  );

  useEffect(() => {
    void syncCurrent();

    const offStateChanged = window.api.on(
      "document:state-changed",
      onDocumentStateChanged,
    );
    const offOpened = window.api.on("document:opened", onDocumentOpened);

    return () => {
      offOpened?.();
      offStateChanged?.();
    };
  }, [syncCurrent]);

  const newDocument = useCallback(async () => {
    try {
      const result = await window.api.document.new();
      if (!result) {
        return;
      }
      setCurrentDocument(result);
      setWindowTitle(result);
      emitAppFeedback("success", `Created document ${result.name}`);
    } catch (error) {
      emitAppFeedback(
        "error",
        toErrorText(error, "Failed to create document."),
      );
    }
  }, []);

  const openDocument = useCallback(async () => {
    try {
      const result = await window.api.document.open();
      if (!result) {
        return;
      }
      setCurrentDocument(result);
      setWindowTitle(result);
      emitAppFeedback("success", `Opened document ${result.name}`);
    } catch (error) {
      emitAppFeedback("error", toErrorText(error, "Failed to open document."));
    }
  }, []);

  const saveDocument = useCallback(async () => {
    try {
      if (!currentDocument) {
        const created = await window.api.document.saveAs();
        if (!created) {
          return;
        }
        setCurrentDocument(created);
        setWindowTitle(created);
        emitAppFeedback("success", `Saved ${created.name}`);
        return;
      }

      const result = await window.api.document.save();
      setCurrentDocument(result);
      setWindowTitle(result);
      emitAppFeedback("success", `Saved ${result.name}`);
    } catch (error) {
      emitAppFeedback("error", toErrorText(error, "Failed to save document."));
    }
  }, [currentDocument]);

  const saveDocumentAs = useCallback(async () => {
    try {
      const result = await window.api.document.saveAs();
      if (!result) {
        return;
      }
      setCurrentDocument(result);
      setWindowTitle(result);
      emitAppFeedback("success", `Saved as ${result.name}`);
    } catch (error) {
      emitAppFeedback(
        "error",
        toErrorText(error, "Failed to save document as new file."),
      );
    }
  }, []);

  const closeDocument = useCallback(async () => {
    try {
      await window.api.document.close();
      setCurrentDocument(null);
      setWindowTitle(null);
      emitAppFeedback("info", "Closed current document");
    } catch (error) {
      emitAppFeedback("error", toErrorText(error, "Failed to close document."));
    }
  }, []);

  const onBeforeUnload = useEffectEvent(async (event: BeforeUnloadEvent) => {
    if (!currentDocument?.isDirty) {
      return;
    }

    const confirmLeave = window.confirm(
      `You have unsaved changes in ${currentDocument.name}. Save before closing?`,
    );

    if (!confirmLeave) {
      return;
    }

    event.preventDefault();
    await saveDocument();
  });

  useEffect(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const value = useMemo(
    () => ({
      currentDocument,
      isDocumentMode: Boolean(currentDocument),
      newDocument,
      openDocument,
      saveDocument,
      saveDocumentAs,
      closeDocument,
    }),
    [
      currentDocument,
      newDocument,
      openDocument,
      saveDocument,
      saveDocumentAs,
      closeDocument,
    ],
  );

  return <DocumentContext value={value}>{children}</DocumentContext>;
}

export function useDocument() {
  const context = use(DocumentContext);
  if (!context) {
    throw new Error('useDocument must be used within DocumentProvider');
  }
  return context;
}
