"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  // ====== PROFILE MANAGEMENT ======
  profiles: {
    list: () => electron.ipcRenderer.invoke("profiles:list"),
    create: (name) => electron.ipcRenderer.invoke("profiles:create", name),
    open: (profileId) => electron.ipcRenderer.invoke("profiles:open", profileId),
    close: (profileId) => electron.ipcRenderer.invoke("profiles:close", profileId),
    switch: (profileId) => electron.ipcRenderer.invoke("profiles:switch", profileId),
    getOpen: () => electron.ipcRenderer.invoke("profiles:getOpen"),
    getActive: () => electron.ipcRenderer.invoke("profiles:getActive"),
    delete: (profileId) => electron.ipcRenderer.invoke("profiles:delete", profileId),
    rename: (profileId, newName) => electron.ipcRenderer.invoke("profiles:rename", profileId, newName)
  },
  // ✅ Add event listeners
  on: (channel, callback) => {
    const validChannels = ["profile:switched"];
    if (validChannels.includes(channel)) {
      electron.ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },
  off: (channel, callback) => {
    const validChannels = ["profile:switched"];
    if (validChannels.includes(channel)) {
      electron.ipcRenderer.removeListener(channel, callback);
    }
  }
});
electron.contextBridge.exposeInMainWorld("api", {
  // ====== PURCHASE INVOICES ======
  invoices: {
    list: (profileId) => electron.ipcRenderer.invoke("invoices:list", profileId),
    create: (profileId, data) => electron.ipcRenderer.invoke("invoices:create", profileId, data),
    delete: (profileId, id) => electron.ipcRenderer.invoke("invoices:delete", profileId, id),
    get: (profileId, id) => electron.ipcRenderer.invoke("invoices:get", profileId, id),
    save: (profileId, payload) => electron.ipcRenderer.invoke("invoices:save", profileId, payload)
  },
  // ====== STOCK ======
  stock: {
    list: (profileId) => electron.ipcRenderer.invoke("stock:list", profileId),
    create: (profileId, data) => electron.ipcRenderer.invoke("stock:create", profileId, data),
    update: (profileId, id, data) => electron.ipcRenderer.invoke("stock:update", profileId, id, data),
    delete: (profileId, id) => electron.ipcRenderer.invoke("stock:delete", profileId, id)
  },
  // ====== SALE INVOICES ======
  saleInvoices: {
    list: (profileId) => electron.ipcRenderer.invoke("sale-invoices:list", profileId),
    create: (profileId, data) => electron.ipcRenderer.invoke("sale-invoices:create", profileId, data),
    delete: (profileId, id) => electron.ipcRenderer.invoke("sale-invoices:delete", profileId, id),
    get: (profileId, id) => electron.ipcRenderer.invoke("sale-invoices:get", profileId, id),
    save: (profileId, payload) => electron.ipcRenderer.invoke("sale-invoices:save", profileId, payload)
  },
  // ====== LEDGER ======
  ledger: {
    save: (profileId, payload) => electron.ipcRenderer.invoke("ledger:save", profileId, payload),
    get: (profileId, id) => electron.ipcRenderer.invoke("ledger:get", profileId, id),
    list: (profileId) => electron.ipcRenderer.invoke("ledger:list", profileId),
    delete: (profileId, id) => electron.ipcRenderer.invoke("ledger:delete", profileId, id)
  },
  // ====== PDF EXPORT ======
  invoice: {
    savePdf: (profileId, kind, id, pageSize) => electron.ipcRenderer.invoke("invoice:savePdf", profileId, kind, id, pageSize)
  }
});
