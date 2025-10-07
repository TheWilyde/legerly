"use strict";
const electron = require("electron");
const isPrintWindow = (() => {
  try {
    return typeof location?.hash === "string" && location.hash.startsWith("#/print");
  } catch {
    return false;
  }
})();
const allowedInvoke = new Set(
  isPrintWindow ? ["invoices:get", "sales:get", "print:ready"] : [
    "invoices:list",
    "invoices:create",
    "invoices:delete",
    "invoices:get",
    "invoices:save",
    "stock:list",
    "stock:create",
    "stock:update",
    "stock:delete",
    "sales:list",
    "sales:create",
    "sales:delete",
    "sales:get",
    "sales:save",
    "ledger:save",
    "ledger:get",
    "ledger:list",
    "ledger:delete",
    "print:save-invoice-pdf",
    "print:ready"
  ]
);
const safeInvoke = (channel, ...args) => {
  if (!allowedInvoke.has(channel))
    throw new Error(`Channel not allowed: ${channel}`);
  return electron.ipcRenderer.invoke(channel, ...args);
};
electron.contextBridge.exposeInMainWorld("api", {
  invoices: {
    list: () => safeInvoke("invoices:list"),
    create: (input) => safeInvoke("invoices:create", input),
    delete: (id) => safeInvoke("invoices:delete", id),
    get: (id) => safeInvoke("invoices:get", id),
    save: (payload) => safeInvoke("invoices:save", payload)
  },
  stock: {
    list: () => safeInvoke("stock:list"),
    create: (input) => safeInvoke("stock:create", input),
    update: (id, input) => safeInvoke("stock:update", id, input),
    delete: (id) => safeInvoke("stock:delete", id)
  },
  sales: {
    list: () => safeInvoke("sales:list"),
    create: (input) => safeInvoke("sales:create", input),
    delete: (id) => safeInvoke("sales:delete", id),
    get: (id) => safeInvoke("sales:get", id),
    save: (payload) => safeInvoke("sales:save", payload)
  },
  ledger: {
    save: (payload) => safeInvoke("ledger:save", payload),
    get: (id) => safeInvoke("ledger:get", id),
    list: () => safeInvoke("ledger:list"),
    delete: (id) => safeInvoke("ledger:delete", id)
  },
  print: {
    saveInvoicePdf: (payload) => safeInvoke("print:save-invoice-pdf", payload),
    ready: () => safeInvoke("print:ready")
  }
});
