"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(
      channel,
      (event, ...args2) => listener(event, ...args2)
    );
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
electron.contextBridge.exposeInMainWorld("api", {
  invoices: {
    list: () => electron.ipcRenderer.invoke("invoices:list"),
    create: (input) => electron.ipcRenderer.invoke("invoices:create", input),
    delete: (id) => electron.ipcRenderer.invoke("invoices:delete", id),
    // New
    get: (id) => electron.ipcRenderer.invoke("invoices:get", id),
    save: (input) => electron.ipcRenderer.invoke("invoices:save", input)
  },
  stock: {
    list: () => electron.ipcRenderer.invoke("stock:list"),
    create: (input) => electron.ipcRenderer.invoke("stock:create", input),
    update: (id, input) => electron.ipcRenderer.invoke("stock:update", id, input),
    delete: (id) => electron.ipcRenderer.invoke("stock:delete", id)
  },
  sales: {
    list: () => electron.ipcRenderer.invoke("sales:list"),
    create: (input) => electron.ipcRenderer.invoke("sales:create", input),
    delete: (id) => electron.ipcRenderer.invoke("sales:delete", id),
    get: (id) => electron.ipcRenderer.invoke("sales:get", id),
    save: (input) => electron.ipcRenderer.invoke("sales:save", input)
  },
  print: {
    // add optional pageSize param
    saveInvoicePdf: (kind, id, pageSize) => electron.ipcRenderer.invoke("print:save-invoice-pdf", { kind, id, pageSize }),
    // expose a ready notifier for the print window
    ready: () => electron.ipcRenderer.send("print:ready")
  }
});
