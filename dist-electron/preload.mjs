"use strict";
const electron = require("electron");
const allowedInvoke = /* @__PURE__ */ new Set([
  "workspace:list",
  "workspace:rename",
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
  // print
  "print:save-invoice-pdf",
  "print:ready"
]);
const allowedSend = /* @__PURE__ */ new Set(["workspace:activate"]);
const allowedEvents = /* @__PURE__ */ new Set([
  "workspace:opened",
  "workspace:closed",
  "workspace:activated",
  "workspace:error"
]);
const safeInvoke = (channel, ...args) => {
  if (!allowedInvoke.has(channel))
    throw new Error(`Channel not allowed: ${channel}`);
  return electron.ipcRenderer.invoke(channel, ...args);
};
const safeSend = (channel, ...args) => {
  if (!allowedSend.has(channel)) return;
  electron.ipcRenderer.send(channel, ...args);
};
electron.contextBridge.exposeInMainWorld("api", {
  workspaces: {
    list: () => safeInvoke("workspace:list"),
    rename: (id, name) => safeInvoke("workspace:rename", id, name),
    activate: (id) => safeSend("workspace:activate", id)
  },
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
    list: () => safeInvoke("ledger:list")
  },
  print: {
    saveInvoicePdf: (kind, id, pageSize) => safeInvoke("print:save-invoice-pdf", kind, id, pageSize),
    ready: () => safeInvoke("print:ready")
  },
  events: {
    on: (channel, listener) => {
      if (!allowedEvents.has(channel)) return;
      electron.ipcRenderer.on(channel, listener);
      return () => electron.ipcRenderer.off(channel, listener);
    },
    off: (channel, listener) => {
      if (!allowedEvents.has(channel)) return;
      electron.ipcRenderer.off(channel, listener);
    }
  }
});
