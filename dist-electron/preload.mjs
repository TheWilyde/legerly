"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  profiles: {
    list: () => electron.ipcRenderer.invoke("profiles:list"),
    create: (name) => electron.ipcRenderer.invoke("profiles:create", name),
    open: (id, pass) => electron.ipcRenderer.invoke("profiles:open", id, pass),
    close: (id) => electron.ipcRenderer.invoke("profiles:close", id),
    switch: (id) => electron.ipcRenderer.invoke("profiles:switch", id),
    getOpen: () => electron.ipcRenderer.invoke("profiles:getOpen"),
    getActive: () => electron.ipcRenderer.invoke("profiles:getActive"),
    delete: (id) => electron.ipcRenderer.invoke("profiles:delete", id)
  },
  invoices: {
    list: (profileId, filters) => electron.ipcRenderer.invoke("invoices:list", profileId, filters),
    create: (profileId, data) => electron.ipcRenderer.invoke("invoices:create", profileId, data),
    delete: (profileId, id) => electron.ipcRenderer.invoke("invoices:delete", profileId, id),
    get: (profileId, id) => electron.ipcRenderer.invoke("invoices:get", profileId, id),
    save: (profileId, payload) => electron.ipcRenderer.invoke("invoices:save", profileId, payload),
    savePdf: (profileId, kind, id, pageSize) => electron.ipcRenderer.invoke("invoice:savePdf", profileId, kind, id, pageSize)
  },
  saleInvoices: {
    list: (profileId, filters) => electron.ipcRenderer.invoke("sale-invoices:list", profileId, filters),
    create: (profileId, data) => electron.ipcRenderer.invoke("sale-invoices:create", profileId, data),
    delete: (profileId, id) => electron.ipcRenderer.invoke("sale-invoices:delete", profileId, id),
    get: (profileId, id) => electron.ipcRenderer.invoke("sale-invoices:get", profileId, id),
    save: (profileId, payload) => electron.ipcRenderer.invoke("sale-invoices:save", profileId, payload)
  },
  stock: {
    list: (profileId) => electron.ipcRenderer.invoke("stock:list", profileId),
    create: (profileId, data) => electron.ipcRenderer.invoke("stock:create", profileId, data),
    update: (profileId, id, data) => electron.ipcRenderer.invoke("stock:update", profileId, id, data),
    delete: (profileId, id) => electron.ipcRenderer.invoke("stock:delete", profileId, id),
    // FIX: Added missing snapshot methods
    createSnapshot: (profileId) => electron.ipcRenderer.invoke("stock:createSnapshot", profileId),
    listSnapshots: (profileId) => electron.ipcRenderer.invoke("stock:listSnapshots", profileId),
    getSnapshot: (profileId, date) => electron.ipcRenderer.invoke("stock:getSnapshot", profileId, date)
  },
  ledger: {
    list: (profileId) => electron.ipcRenderer.invoke("ledger:list", profileId),
    get: (profileId, id) => electron.ipcRenderer.invoke("ledger:get", profileId, id),
    save: (profileId, payload) => electron.ipcRenderer.invoke("ledger:save", profileId, payload),
    delete: (profileId, id) => electron.ipcRenderer.invoke("ledger:delete", profileId, id)
  },
  window: {
    minimize: () => electron.ipcRenderer.send("window:minimize"),
    maximize: () => electron.ipcRenderer.send("window:maximize"),
    close: () => electron.ipcRenderer.send("window:close"),
    // FIX: Added onFeedback method
    onFeedback: (callback) => {
      const handler = (_, type) => callback(type);
      electron.ipcRenderer.on("app:feedback", handler);
      return () => electron.ipcRenderer.removeListener("app:feedback", handler);
    }
  },
  on: (channel, func) => {
    const validChannels = ["app:feedback", "app:navigate", "app:restore-session"];
    if (validChannels.includes(channel)) {
      electron.ipcRenderer.on(channel, (_, ...args) => func(...args));
    }
  },
  off: (channel, func) => {
    electron.ipcRenderer.removeListener(channel, func);
  }
});
