import require$$0$5, { BrowserWindow, dialog, app, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import require$$2 from "path";
import require$$0$1 from "child_process";
import require$$1 from "os";
import require$$0 from "fs";
import require$$0$2 from "util";
import require$$0$3 from "events";
import require$$0$4 from "http";
import require$$1$1 from "https";
import crypto from "crypto";
import keytar from "keytar";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fs$1 from "node:fs";
import Database from "better-sqlite3";
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var packageJson;
var hasRequiredPackageJson;
function requirePackageJson() {
  if (hasRequiredPackageJson) return packageJson;
  hasRequiredPackageJson = 1;
  const fs2 = require$$0;
  const path2 = require$$2;
  packageJson = {
    findAndReadPackageJson,
    tryReadJsonAt
  };
  function findAndReadPackageJson() {
    return tryReadJsonAt(getMainModulePath()) || tryReadJsonAt(extractPathFromArgs()) || tryReadJsonAt(process.resourcesPath, "app.asar") || tryReadJsonAt(process.resourcesPath, "app") || tryReadJsonAt(process.cwd()) || { name: void 0, version: void 0 };
  }
  function tryReadJsonAt(...searchPaths) {
    if (!searchPaths[0]) {
      return void 0;
    }
    try {
      const searchPath = path2.join(...searchPaths);
      const fileName = findUp("package.json", searchPath);
      if (!fileName) {
        return void 0;
      }
      const json = JSON.parse(fs2.readFileSync(fileName, "utf8"));
      const name = json?.productName || json?.name;
      if (!name || name.toLowerCase() === "electron") {
        return void 0;
      }
      if (name) {
        return { name, version: json?.version };
      }
      return void 0;
    } catch (e) {
      return void 0;
    }
  }
  function findUp(fileName, cwd) {
    let currentPath = cwd;
    while (true) {
      const parsedPath = path2.parse(currentPath);
      const root = parsedPath.root;
      const dir = parsedPath.dir;
      if (fs2.existsSync(path2.join(currentPath, fileName))) {
        return path2.resolve(path2.join(currentPath, fileName));
      }
      if (currentPath === root) {
        return null;
      }
      currentPath = dir;
    }
  }
  function extractPathFromArgs() {
    const matchedArgs = process.argv.filter((arg) => {
      return arg.indexOf("--user-data-dir=") === 0;
    });
    if (matchedArgs.length === 0 || typeof matchedArgs[0] !== "string") {
      return null;
    }
    const userDataDir = matchedArgs[0];
    return userDataDir.replace("--user-data-dir=", "");
  }
  function getMainModulePath() {
    try {
      return require.main?.filename;
    } catch {
      return void 0;
    }
  }
  return packageJson;
}
var NodeExternalApi_1;
var hasRequiredNodeExternalApi;
function requireNodeExternalApi() {
  if (hasRequiredNodeExternalApi) return NodeExternalApi_1;
  hasRequiredNodeExternalApi = 1;
  const childProcess = require$$0$1;
  const os = require$$1;
  const path2 = require$$2;
  const packageJson2 = requirePackageJson();
  class NodeExternalApi {
    appName = void 0;
    appPackageJson = void 0;
    platform = process.platform;
    getAppLogPath(appName = this.getAppName()) {
      if (this.platform === "darwin") {
        return path2.join(this.getSystemPathHome(), "Library/Logs", appName);
      }
      return path2.join(this.getAppUserDataPath(appName), "logs");
    }
    getAppName() {
      const appName = this.appName || this.getAppPackageJson()?.name;
      if (!appName) {
        throw new Error(
          "electron-log can't determine the app name. It tried these methods:\n1. Use `electron.app.name`\n2. Use productName or name from the nearest package.json`\nYou can also set it through log.transports.file.setAppName()"
        );
      }
      return appName;
    }
    /**
     * @private
     * @returns {undefined}
     */
    getAppPackageJson() {
      if (typeof this.appPackageJson !== "object") {
        this.appPackageJson = packageJson2.findAndReadPackageJson();
      }
      return this.appPackageJson;
    }
    getAppUserDataPath(appName = this.getAppName()) {
      return appName ? path2.join(this.getSystemPathAppData(), appName) : void 0;
    }
    getAppVersion() {
      return this.getAppPackageJson()?.version;
    }
    getElectronLogPath() {
      return this.getAppLogPath();
    }
    getMacOsVersion() {
      const release = Number(os.release().split(".")[0]);
      if (release <= 19) {
        return `10.${release - 4}`;
      }
      return release - 9;
    }
    /**
     * @protected
     * @returns {string}
     */
    getOsVersion() {
      let osName = os.type().replace("_", " ");
      let osVersion = os.release();
      if (osName === "Darwin") {
        osName = "macOS";
        osVersion = this.getMacOsVersion();
      }
      return `${osName} ${osVersion}`;
    }
    /**
     * @return {PathVariables}
     */
    getPathVariables() {
      const appName = this.getAppName();
      const appVersion = this.getAppVersion();
      const self = this;
      return {
        appData: this.getSystemPathAppData(),
        appName,
        appVersion,
        get electronDefaultDir() {
          return self.getElectronLogPath();
        },
        home: this.getSystemPathHome(),
        libraryDefaultDir: this.getAppLogPath(appName),
        libraryTemplate: this.getAppLogPath("{appName}"),
        temp: this.getSystemPathTemp(),
        userData: this.getAppUserDataPath(appName)
      };
    }
    getSystemPathAppData() {
      const home = this.getSystemPathHome();
      switch (this.platform) {
        case "darwin": {
          return path2.join(home, "Library/Application Support");
        }
        case "win32": {
          return process.env.APPDATA || path2.join(home, "AppData/Roaming");
        }
        default: {
          return process.env.XDG_CONFIG_HOME || path2.join(home, ".config");
        }
      }
    }
    getSystemPathHome() {
      return os.homedir?.() || process.env.HOME;
    }
    getSystemPathTemp() {
      return os.tmpdir();
    }
    getVersions() {
      return {
        app: `${this.getAppName()} ${this.getAppVersion()}`,
        electron: void 0,
        os: this.getOsVersion()
      };
    }
    isDev() {
      return process.env.NODE_ENV === "development" || process.env.ELECTRON_IS_DEV === "1";
    }
    isElectron() {
      return Boolean(process.versions.electron);
    }
    onAppEvent(_eventName, _handler) {
    }
    onAppReady(handler) {
      handler();
    }
    onEveryWebContentsEvent(eventName, handler) {
    }
    /**
     * Listen to async messages sent from opposite process
     * @param {string} channel
     * @param {function} listener
     */
    onIpc(channel, listener) {
    }
    onIpcInvoke(channel, listener) {
    }
    /**
     * @param {string} url
     * @param {Function} [logFunction]
     */
    openUrl(url, logFunction = console.error) {
      const startMap = { darwin: "open", win32: "start", linux: "xdg-open" };
      const start = startMap[process.platform] || "xdg-open";
      childProcess.exec(`${start} ${url}`, {}, (err) => {
        if (err) {
          logFunction(err);
        }
      });
    }
    setAppName(appName) {
      this.appName = appName;
    }
    setPlatform(platform) {
      this.platform = platform;
    }
    setPreloadFileForSessions({
      filePath,
      // eslint-disable-line no-unused-vars
      includeFutureSession = true,
      // eslint-disable-line no-unused-vars
      getSessions = () => []
      // eslint-disable-line no-unused-vars
    }) {
    }
    /**
     * Sent a message to opposite process
     * @param {string} channel
     * @param {any} message
     */
    sendIpc(channel, message) {
    }
    showErrorBox(title, message) {
    }
  }
  NodeExternalApi_1 = NodeExternalApi;
  return NodeExternalApi_1;
}
var ElectronExternalApi_1;
var hasRequiredElectronExternalApi;
function requireElectronExternalApi() {
  if (hasRequiredElectronExternalApi) return ElectronExternalApi_1;
  hasRequiredElectronExternalApi = 1;
  const path2 = require$$2;
  const NodeExternalApi = requireNodeExternalApi();
  class ElectronExternalApi extends NodeExternalApi {
    /**
     * @type {typeof Electron}
     */
    electron = void 0;
    /**
     * @param {object} options
     * @param {typeof Electron} [options.electron]
     */
    constructor({ electron } = {}) {
      super();
      this.electron = electron;
    }
    getAppName() {
      let appName;
      try {
        appName = this.appName || this.electron.app?.name || this.electron.app?.getName();
      } catch {
      }
      return appName || super.getAppName();
    }
    getAppUserDataPath(appName) {
      return this.getPath("userData") || super.getAppUserDataPath(appName);
    }
    getAppVersion() {
      let appVersion;
      try {
        appVersion = this.electron.app?.getVersion();
      } catch {
      }
      return appVersion || super.getAppVersion();
    }
    getElectronLogPath() {
      return this.getPath("logs") || super.getElectronLogPath();
    }
    /**
     * @private
     * @param {any} name
     * @returns {string|undefined}
     */
    getPath(name) {
      try {
        return this.electron.app?.getPath(name);
      } catch {
        return void 0;
      }
    }
    getVersions() {
      return {
        app: `${this.getAppName()} ${this.getAppVersion()}`,
        electron: `Electron ${process.versions.electron}`,
        os: this.getOsVersion()
      };
    }
    getSystemPathAppData() {
      return this.getPath("appData") || super.getSystemPathAppData();
    }
    isDev() {
      if (this.electron.app?.isPackaged !== void 0) {
        return !this.electron.app.isPackaged;
      }
      if (typeof process.execPath === "string") {
        const execFileName = path2.basename(process.execPath).toLowerCase();
        return execFileName.startsWith("electron");
      }
      return super.isDev();
    }
    onAppEvent(eventName, handler) {
      this.electron.app?.on(eventName, handler);
      return () => {
        this.electron.app?.off(eventName, handler);
      };
    }
    onAppReady(handler) {
      if (this.electron.app?.isReady()) {
        handler();
      } else if (this.electron.app?.once) {
        this.electron.app?.once("ready", handler);
      } else {
        handler();
      }
    }
    onEveryWebContentsEvent(eventName, handler) {
      this.electron.webContents?.getAllWebContents()?.forEach((webContents) => {
        webContents.on(eventName, handler);
      });
      this.electron.app?.on("web-contents-created", onWebContentsCreated);
      return () => {
        this.electron.webContents?.getAllWebContents().forEach((webContents) => {
          webContents.off(eventName, handler);
        });
        this.electron.app?.off("web-contents-created", onWebContentsCreated);
      };
      function onWebContentsCreated(_, webContents) {
        webContents.on(eventName, handler);
      }
    }
    /**
     * Listen to async messages sent from opposite process
     * @param {string} channel
     * @param {function} listener
     */
    onIpc(channel, listener) {
      this.electron.ipcMain?.on(channel, listener);
    }
    onIpcInvoke(channel, listener) {
      this.electron.ipcMain?.handle?.(channel, listener);
    }
    /**
     * @param {string} url
     * @param {Function} [logFunction]
     */
    openUrl(url, logFunction = console.error) {
      this.electron.shell?.openExternal(url).catch(logFunction);
    }
    setPreloadFileForSessions({
      filePath,
      includeFutureSession = true,
      getSessions = () => [this.electron.session?.defaultSession]
    }) {
      for (const session of getSessions().filter(Boolean)) {
        setPreload(session);
      }
      if (includeFutureSession) {
        this.onAppEvent("session-created", (session) => {
          setPreload(session);
        });
      }
      function setPreload(session) {
        if (typeof session.registerPreloadScript === "function") {
          session.registerPreloadScript({
            filePath,
            id: "electron-log-preload",
            type: "frame"
          });
        } else {
          session.setPreloads([...session.getPreloads(), filePath]);
        }
      }
    }
    /**
     * Sent a message to opposite process
     * @param {string} channel
     * @param {any} message
     */
    sendIpc(channel, message) {
      this.electron.BrowserWindow?.getAllWindows()?.forEach((wnd) => {
        if (wnd.webContents?.isDestroyed() === false && wnd.webContents?.isCrashed() === false) {
          wnd.webContents.send(channel, message);
        }
      });
    }
    showErrorBox(title, message) {
      this.electron.dialog?.showErrorBox(title, message);
    }
  }
  ElectronExternalApi_1 = ElectronExternalApi;
  return ElectronExternalApi_1;
}
var electronLogPreload = { exports: {} };
var hasRequiredElectronLogPreload;
function requireElectronLogPreload() {
  if (hasRequiredElectronLogPreload) return electronLogPreload.exports;
  hasRequiredElectronLogPreload = 1;
  (function(module) {
    let electron = {};
    try {
      electron = require("electron");
    } catch (e) {
    }
    if (electron.ipcRenderer) {
      initialize2(electron);
    }
    {
      module.exports = initialize2;
    }
    function initialize2({ contextBridge, ipcRenderer }) {
      if (!ipcRenderer) {
        return;
      }
      ipcRenderer.on("__ELECTRON_LOG_IPC__", (_, message) => {
        window.postMessage({ cmd: "message", ...message });
      });
      ipcRenderer.invoke("__ELECTRON_LOG__", { cmd: "getOptions" }).catch((e) => console.error(new Error(
        `electron-log isn't initialized in the main process. Please call log.initialize() before. ${e.message}`
      )));
      const electronLog = {
        sendToMain(message) {
          try {
            ipcRenderer.send("__ELECTRON_LOG__", message);
          } catch (e) {
            console.error("electronLog.sendToMain ", e, "data:", message);
            ipcRenderer.send("__ELECTRON_LOG__", {
              cmd: "errorHandler",
              error: { message: e?.message, stack: e?.stack },
              errorName: "sendToMain"
            });
          }
        },
        log(...data) {
          electronLog.sendToMain({ data, level: "info" });
        }
      };
      for (const level of ["error", "warn", "info", "verbose", "debug", "silly"]) {
        electronLog[level] = (...data) => electronLog.sendToMain({
          data,
          level
        });
      }
      if (contextBridge && process.contextIsolated) {
        try {
          contextBridge.exposeInMainWorld("__electronLog", electronLog);
        } catch {
        }
      }
      if (typeof window === "object") {
        window.__electronLog = electronLog;
      } else {
        __electronLog = electronLog;
      }
    }
  })(electronLogPreload);
  return electronLogPreload.exports;
}
var initialize;
var hasRequiredInitialize;
function requireInitialize() {
  if (hasRequiredInitialize) return initialize;
  hasRequiredInitialize = 1;
  const fs2 = require$$0;
  const os = require$$1;
  const path2 = require$$2;
  const preloadInitializeFn = requireElectronLogPreload();
  let preloadInitialized = false;
  let spyConsoleInitialized = false;
  initialize = {
    initialize({
      externalApi,
      getSessions,
      includeFutureSession,
      logger,
      preload = true,
      spyRendererConsole = false
    }) {
      externalApi.onAppReady(() => {
        try {
          if (preload) {
            initializePreload({
              externalApi,
              getSessions,
              includeFutureSession,
              logger,
              preloadOption: preload
            });
          }
          if (spyRendererConsole) {
            initializeSpyRendererConsole({ externalApi, logger });
          }
        } catch (err) {
          logger.warn(err);
        }
      });
    }
  };
  function initializePreload({
    externalApi,
    getSessions,
    includeFutureSession,
    logger,
    preloadOption
  }) {
    let preloadPath = typeof preloadOption === "string" ? preloadOption : void 0;
    if (preloadInitialized) {
      logger.warn(new Error("log.initialize({ preload }) already called").stack);
      return;
    }
    preloadInitialized = true;
    try {
      preloadPath = path2.resolve(
        __dirname,
        "../renderer/electron-log-preload.js"
      );
    } catch {
    }
    if (!preloadPath || !fs2.existsSync(preloadPath)) {
      preloadPath = path2.join(
        externalApi.getAppUserDataPath() || os.tmpdir(),
        "electron-log-preload.js"
      );
      const preloadCode = `
      try {
        (${preloadInitializeFn.toString()})(require('electron'));
      } catch(e) {
        console.error(e);
      }
    `;
      fs2.writeFileSync(preloadPath, preloadCode, "utf8");
    }
    externalApi.setPreloadFileForSessions({
      filePath: preloadPath,
      includeFutureSession,
      getSessions
    });
  }
  function initializeSpyRendererConsole({ externalApi, logger }) {
    if (spyConsoleInitialized) {
      logger.warn(
        new Error("log.initialize({ spyRendererConsole }) already called").stack
      );
      return;
    }
    spyConsoleInitialized = true;
    const levels = ["debug", "info", "warn", "error"];
    externalApi.onEveryWebContentsEvent(
      "console-message",
      (event, level, message) => {
        logger.processMessage({
          data: [message],
          level: levels[level],
          variables: { processType: "renderer" }
        });
      }
    );
  }
  return initialize;
}
var scope;
var hasRequiredScope;
function requireScope() {
  if (hasRequiredScope) return scope;
  hasRequiredScope = 1;
  scope = scopeFactory;
  function scopeFactory(logger) {
    return Object.defineProperties(scope2, {
      defaultLabel: { value: "", writable: true },
      labelPadding: { value: true, writable: true },
      maxLabelLength: { value: 0, writable: true },
      labelLength: {
        get() {
          switch (typeof scope2.labelPadding) {
            case "boolean":
              return scope2.labelPadding ? scope2.maxLabelLength : 0;
            case "number":
              return scope2.labelPadding;
            default:
              return 0;
          }
        }
      }
    });
    function scope2(label) {
      scope2.maxLabelLength = Math.max(scope2.maxLabelLength, label.length);
      const newScope = {};
      for (const level of logger.levels) {
        newScope[level] = (...d) => logger.logData(d, { level, scope: label });
      }
      newScope.log = newScope.info;
      return newScope;
    }
  }
  return scope;
}
var Buffering_1;
var hasRequiredBuffering;
function requireBuffering() {
  if (hasRequiredBuffering) return Buffering_1;
  hasRequiredBuffering = 1;
  class Buffering {
    constructor({ processMessage }) {
      this.processMessage = processMessage;
      this.buffer = [];
      this.enabled = false;
      this.begin = this.begin.bind(this);
      this.commit = this.commit.bind(this);
      this.reject = this.reject.bind(this);
    }
    addMessage(message) {
      this.buffer.push(message);
    }
    begin() {
      this.enabled = [];
    }
    commit() {
      this.enabled = false;
      this.buffer.forEach((item) => this.processMessage(item));
      this.buffer = [];
    }
    reject() {
      this.enabled = false;
      this.buffer = [];
    }
  }
  Buffering_1 = Buffering;
  return Buffering_1;
}
var Logger_1;
var hasRequiredLogger;
function requireLogger() {
  if (hasRequiredLogger) return Logger_1;
  hasRequiredLogger = 1;
  const scopeFactory = requireScope();
  const Buffering = requireBuffering();
  class Logger {
    static instances = {};
    dependencies = {};
    errorHandler = null;
    eventLogger = null;
    functions = {};
    hooks = [];
    isDev = false;
    levels = null;
    logId = null;
    scope = null;
    transports = {};
    variables = {};
    constructor({
      allowUnknownLevel = false,
      dependencies = {},
      errorHandler,
      eventLogger,
      initializeFn,
      isDev = false,
      levels = ["error", "warn", "info", "verbose", "debug", "silly"],
      logId,
      transportFactories = {},
      variables
    } = {}) {
      this.addLevel = this.addLevel.bind(this);
      this.create = this.create.bind(this);
      this.initialize = this.initialize.bind(this);
      this.logData = this.logData.bind(this);
      this.processMessage = this.processMessage.bind(this);
      this.allowUnknownLevel = allowUnknownLevel;
      this.buffering = new Buffering(this);
      this.dependencies = dependencies;
      this.initializeFn = initializeFn;
      this.isDev = isDev;
      this.levels = levels;
      this.logId = logId;
      this.scope = scopeFactory(this);
      this.transportFactories = transportFactories;
      this.variables = variables || {};
      for (const name of this.levels) {
        this.addLevel(name, false);
      }
      this.log = this.info;
      this.functions.log = this.log;
      this.errorHandler = errorHandler;
      errorHandler?.setOptions({ ...dependencies, logFn: this.error });
      this.eventLogger = eventLogger;
      eventLogger?.setOptions({ ...dependencies, logger: this });
      for (const [name, factory] of Object.entries(transportFactories)) {
        this.transports[name] = factory(this, dependencies);
      }
      Logger.instances[logId] = this;
    }
    static getInstance({ logId }) {
      return this.instances[logId] || this.instances.default;
    }
    addLevel(level, index = this.levels.length) {
      if (index !== false) {
        this.levels.splice(index, 0, level);
      }
      this[level] = (...args) => this.logData(args, { level });
      this.functions[level] = this[level];
    }
    catchErrors(options) {
      this.processMessage(
        {
          data: ["log.catchErrors is deprecated. Use log.errorHandler instead"],
          level: "warn"
        },
        { transports: ["console"] }
      );
      return this.errorHandler.startCatching(options);
    }
    create(options) {
      if (typeof options === "string") {
        options = { logId: options };
      }
      return new Logger({
        dependencies: this.dependencies,
        errorHandler: this.errorHandler,
        initializeFn: this.initializeFn,
        isDev: this.isDev,
        transportFactories: this.transportFactories,
        variables: { ...this.variables },
        ...options
      });
    }
    compareLevels(passLevel, checkLevel, levels = this.levels) {
      const pass = levels.indexOf(passLevel);
      const check = levels.indexOf(checkLevel);
      if (check === -1 || pass === -1) {
        return true;
      }
      return check <= pass;
    }
    initialize(options = {}) {
      this.initializeFn({ logger: this, ...this.dependencies, ...options });
    }
    logData(data, options = {}) {
      if (this.buffering.enabled) {
        this.buffering.addMessage({ data, date: /* @__PURE__ */ new Date(), ...options });
      } else {
        this.processMessage({ data, ...options });
      }
    }
    processMessage(message, { transports = this.transports } = {}) {
      if (message.cmd === "errorHandler") {
        this.errorHandler.handle(message.error, {
          errorName: message.errorName,
          processType: "renderer",
          showDialog: Boolean(message.showDialog)
        });
        return;
      }
      let level = message.level;
      if (!this.allowUnknownLevel) {
        level = this.levels.includes(message.level) ? message.level : "info";
      }
      const normalizedMessage = {
        date: /* @__PURE__ */ new Date(),
        logId: this.logId,
        ...message,
        level,
        variables: {
          ...this.variables,
          ...message.variables
        }
      };
      for (const [transName, transFn] of this.transportEntries(transports)) {
        if (typeof transFn !== "function" || transFn.level === false) {
          continue;
        }
        if (!this.compareLevels(transFn.level, message.level)) {
          continue;
        }
        try {
          const transformedMsg = this.hooks.reduce((msg, hook) => {
            return msg ? hook(msg, transFn, transName) : msg;
          }, normalizedMessage);
          if (transformedMsg) {
            transFn({ ...transformedMsg, data: [...transformedMsg.data] });
          }
        } catch (e) {
          this.processInternalErrorFn(e);
        }
      }
    }
    processInternalErrorFn(_e) {
    }
    transportEntries(transports = this.transports) {
      const transportArray = Array.isArray(transports) ? transports : Object.entries(transports);
      return transportArray.map((item) => {
        switch (typeof item) {
          case "string":
            return this.transports[item] ? [item, this.transports[item]] : null;
          case "function":
            return [item.name, item];
          default:
            return Array.isArray(item) ? item : null;
        }
      }).filter(Boolean);
    }
  }
  Logger_1 = Logger;
  return Logger_1;
}
var ErrorHandler_1;
var hasRequiredErrorHandler;
function requireErrorHandler() {
  if (hasRequiredErrorHandler) return ErrorHandler_1;
  hasRequiredErrorHandler = 1;
  class ErrorHandler {
    externalApi = void 0;
    isActive = false;
    logFn = void 0;
    onError = void 0;
    showDialog = true;
    constructor({
      externalApi,
      logFn = void 0,
      onError = void 0,
      showDialog = void 0
    } = {}) {
      this.createIssue = this.createIssue.bind(this);
      this.handleError = this.handleError.bind(this);
      this.handleRejection = this.handleRejection.bind(this);
      this.setOptions({ externalApi, logFn, onError, showDialog });
      this.startCatching = this.startCatching.bind(this);
      this.stopCatching = this.stopCatching.bind(this);
    }
    handle(error, {
      logFn = this.logFn,
      onError = this.onError,
      processType = "browser",
      showDialog = this.showDialog,
      errorName = ""
    } = {}) {
      error = normalizeError(error);
      try {
        if (typeof onError === "function") {
          const versions = this.externalApi?.getVersions() || {};
          const createIssue = this.createIssue;
          const result = onError({
            createIssue,
            error,
            errorName,
            processType,
            versions
          });
          if (result === false) {
            return;
          }
        }
        errorName ? logFn(errorName, error) : logFn(error);
        if (showDialog && !errorName.includes("rejection") && this.externalApi) {
          this.externalApi.showErrorBox(
            `A JavaScript error occurred in the ${processType} process`,
            error.stack
          );
        }
      } catch {
        console.error(error);
      }
    }
    setOptions({ externalApi, logFn, onError, showDialog }) {
      if (typeof externalApi === "object") {
        this.externalApi = externalApi;
      }
      if (typeof logFn === "function") {
        this.logFn = logFn;
      }
      if (typeof onError === "function") {
        this.onError = onError;
      }
      if (typeof showDialog === "boolean") {
        this.showDialog = showDialog;
      }
    }
    startCatching({ onError, showDialog } = {}) {
      if (this.isActive) {
        return;
      }
      this.isActive = true;
      this.setOptions({ onError, showDialog });
      process.on("uncaughtException", this.handleError);
      process.on("unhandledRejection", this.handleRejection);
    }
    stopCatching() {
      this.isActive = false;
      process.removeListener("uncaughtException", this.handleError);
      process.removeListener("unhandledRejection", this.handleRejection);
    }
    createIssue(pageUrl, queryParams) {
      this.externalApi?.openUrl(
        `${pageUrl}?${new URLSearchParams(queryParams).toString()}`
      );
    }
    handleError(error) {
      this.handle(error, { errorName: "Unhandled" });
    }
    handleRejection(reason) {
      const error = reason instanceof Error ? reason : new Error(JSON.stringify(reason));
      this.handle(error, { errorName: "Unhandled rejection" });
    }
  }
  function normalizeError(e) {
    if (e instanceof Error) {
      return e;
    }
    if (e && typeof e === "object") {
      if (e.message) {
        return Object.assign(new Error(e.message), e);
      }
      try {
        return new Error(JSON.stringify(e));
      } catch (serErr) {
        return new Error(`Couldn't normalize error ${String(e)}: ${serErr}`);
      }
    }
    return new Error(`Can't normalize error ${String(e)}`);
  }
  ErrorHandler_1 = ErrorHandler;
  return ErrorHandler_1;
}
var EventLogger_1;
var hasRequiredEventLogger;
function requireEventLogger() {
  if (hasRequiredEventLogger) return EventLogger_1;
  hasRequiredEventLogger = 1;
  class EventLogger {
    disposers = [];
    format = "{eventSource}#{eventName}:";
    formatters = {
      app: {
        "certificate-error": ({ args }) => {
          return this.arrayToObject(args.slice(1, 4), [
            "url",
            "error",
            "certificate"
          ]);
        },
        "child-process-gone": ({ args }) => {
          return args.length === 1 ? args[0] : args;
        },
        "render-process-gone": ({ args: [webContents, details] }) => {
          return details && typeof details === "object" ? { ...details, ...this.getWebContentsDetails(webContents) } : [];
        }
      },
      webContents: {
        "console-message": ({ args: [level, message, line, sourceId] }) => {
          if (level < 3) {
            return void 0;
          }
          return { message, source: `${sourceId}:${line}` };
        },
        "did-fail-load": ({ args }) => {
          return this.arrayToObject(args, [
            "errorCode",
            "errorDescription",
            "validatedURL",
            "isMainFrame",
            "frameProcessId",
            "frameRoutingId"
          ]);
        },
        "did-fail-provisional-load": ({ args }) => {
          return this.arrayToObject(args, [
            "errorCode",
            "errorDescription",
            "validatedURL",
            "isMainFrame",
            "frameProcessId",
            "frameRoutingId"
          ]);
        },
        "plugin-crashed": ({ args }) => {
          return this.arrayToObject(args, ["name", "version"]);
        },
        "preload-error": ({ args }) => {
          return this.arrayToObject(args, ["preloadPath", "error"]);
        }
      }
    };
    events = {
      app: {
        "certificate-error": true,
        "child-process-gone": true,
        "render-process-gone": true
      },
      webContents: {
        // 'console-message': true,
        "did-fail-load": true,
        "did-fail-provisional-load": true,
        "plugin-crashed": true,
        "preload-error": true,
        "unresponsive": true
      }
    };
    externalApi = void 0;
    level = "error";
    scope = "";
    constructor(options = {}) {
      this.setOptions(options);
    }
    setOptions({
      events,
      externalApi,
      level,
      logger,
      format: format2,
      formatters,
      scope: scope2
    }) {
      if (typeof events === "object") {
        this.events = events;
      }
      if (typeof externalApi === "object") {
        this.externalApi = externalApi;
      }
      if (typeof level === "string") {
        this.level = level;
      }
      if (typeof logger === "object") {
        this.logger = logger;
      }
      if (typeof format2 === "string" || typeof format2 === "function") {
        this.format = format2;
      }
      if (typeof formatters === "object") {
        this.formatters = formatters;
      }
      if (typeof scope2 === "string") {
        this.scope = scope2;
      }
    }
    startLogging(options = {}) {
      this.setOptions(options);
      this.disposeListeners();
      for (const eventName of this.getEventNames(this.events.app)) {
        this.disposers.push(
          this.externalApi.onAppEvent(eventName, (...handlerArgs) => {
            this.handleEvent({ eventSource: "app", eventName, handlerArgs });
          })
        );
      }
      for (const eventName of this.getEventNames(this.events.webContents)) {
        this.disposers.push(
          this.externalApi.onEveryWebContentsEvent(
            eventName,
            (...handlerArgs) => {
              this.handleEvent(
                { eventSource: "webContents", eventName, handlerArgs }
              );
            }
          )
        );
      }
    }
    stopLogging() {
      this.disposeListeners();
    }
    arrayToObject(array, fieldNames) {
      const obj = {};
      fieldNames.forEach((fieldName, index) => {
        obj[fieldName] = array[index];
      });
      if (array.length > fieldNames.length) {
        obj.unknownArgs = array.slice(fieldNames.length);
      }
      return obj;
    }
    disposeListeners() {
      this.disposers.forEach((disposer) => disposer());
      this.disposers = [];
    }
    formatEventLog({ eventName, eventSource, handlerArgs }) {
      const [event, ...args] = handlerArgs;
      if (typeof this.format === "function") {
        return this.format({ args, event, eventName, eventSource });
      }
      const formatter = this.formatters[eventSource]?.[eventName];
      let formattedArgs = args;
      if (typeof formatter === "function") {
        formattedArgs = formatter({ args, event, eventName, eventSource });
      }
      if (!formattedArgs) {
        return void 0;
      }
      const eventData = {};
      if (Array.isArray(formattedArgs)) {
        eventData.args = formattedArgs;
      } else if (typeof formattedArgs === "object") {
        Object.assign(eventData, formattedArgs);
      }
      if (eventSource === "webContents") {
        Object.assign(eventData, this.getWebContentsDetails(event?.sender));
      }
      const title = this.format.replace("{eventSource}", eventSource === "app" ? "App" : "WebContents").replace("{eventName}", eventName);
      return [title, eventData];
    }
    getEventNames(eventMap) {
      if (!eventMap || typeof eventMap !== "object") {
        return [];
      }
      return Object.entries(eventMap).filter(([_, listen]) => listen).map(([eventName]) => eventName);
    }
    getWebContentsDetails(webContents) {
      if (!webContents?.loadURL) {
        return {};
      }
      try {
        return {
          webContents: {
            id: webContents.id,
            url: webContents.getURL()
          }
        };
      } catch {
        return {};
      }
    }
    handleEvent({ eventName, eventSource, handlerArgs }) {
      const log2 = this.formatEventLog({ eventName, eventSource, handlerArgs });
      if (log2) {
        const logFns = this.scope ? this.logger.scope(this.scope) : this.logger;
        logFns?.[this.level]?.(...log2);
      }
    }
  }
  EventLogger_1 = EventLogger;
  return EventLogger_1;
}
var transform_1;
var hasRequiredTransform;
function requireTransform() {
  if (hasRequiredTransform) return transform_1;
  hasRequiredTransform = 1;
  transform_1 = { transform };
  function transform({
    logger,
    message,
    transport,
    initialData = message?.data || [],
    transforms = transport?.transforms
  }) {
    return transforms.reduce((data, trans) => {
      if (typeof trans === "function") {
        return trans({ data, logger, message, transport });
      }
      return data;
    }, initialData);
  }
  return transform_1;
}
var format;
var hasRequiredFormat;
function requireFormat() {
  if (hasRequiredFormat) return format;
  hasRequiredFormat = 1;
  const { transform } = requireTransform();
  format = {
    concatFirstStringElements,
    formatScope,
    formatText,
    formatVariables,
    timeZoneFromOffset,
    format({ message, logger, transport, data = message?.data }) {
      switch (typeof transport.format) {
        case "string": {
          return transform({
            message,
            logger,
            transforms: [formatVariables, formatScope, formatText],
            transport,
            initialData: [transport.format, ...data]
          });
        }
        case "function": {
          return transport.format({
            data,
            level: message?.level || "info",
            logger,
            message,
            transport
          });
        }
        default: {
          return data;
        }
      }
    }
  };
  function concatFirstStringElements({ data }) {
    if (typeof data[0] !== "string" || typeof data[1] !== "string") {
      return data;
    }
    if (data[0].match(/%[1cdfiOos]/)) {
      return data;
    }
    return [`${data[0]} ${data[1]}`, ...data.slice(2)];
  }
  function timeZoneFromOffset(minutesOffset) {
    const minutesPositive = Math.abs(minutesOffset);
    const sign = minutesOffset > 0 ? "-" : "+";
    const hours = Math.floor(minutesPositive / 60).toString().padStart(2, "0");
    const minutes = (minutesPositive % 60).toString().padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
  }
  function formatScope({ data, logger, message }) {
    const { defaultLabel, labelLength } = logger?.scope || {};
    const template = data[0];
    let label = message.scope;
    if (!label) {
      label = defaultLabel;
    }
    let scopeText;
    if (label === "") {
      scopeText = labelLength > 0 ? "".padEnd(labelLength + 3) : "";
    } else if (typeof label === "string") {
      scopeText = ` (${label})`.padEnd(labelLength + 3);
    } else {
      scopeText = "";
    }
    data[0] = template.replace("{scope}", scopeText);
    return data;
  }
  function formatVariables({ data, message }) {
    let template = data[0];
    if (typeof template !== "string") {
      return data;
    }
    template = template.replace("{level}]", `${message.level}]`.padEnd(6, " "));
    const date = message.date || /* @__PURE__ */ new Date();
    data[0] = template.replace(/\{(\w+)}/g, (substring, name) => {
      switch (name) {
        case "level":
          return message.level || "info";
        case "logId":
          return message.logId;
        case "y":
          return date.getFullYear().toString(10);
        case "m":
          return (date.getMonth() + 1).toString(10).padStart(2, "0");
        case "d":
          return date.getDate().toString(10).padStart(2, "0");
        case "h":
          return date.getHours().toString(10).padStart(2, "0");
        case "i":
          return date.getMinutes().toString(10).padStart(2, "0");
        case "s":
          return date.getSeconds().toString(10).padStart(2, "0");
        case "ms":
          return date.getMilliseconds().toString(10).padStart(3, "0");
        case "z":
          return timeZoneFromOffset(date.getTimezoneOffset());
        case "iso":
          return date.toISOString();
        default: {
          return message.variables?.[name] || substring;
        }
      }
    }).trim();
    return data;
  }
  function formatText({ data }) {
    const template = data[0];
    if (typeof template !== "string") {
      return data;
    }
    const textTplPosition = template.lastIndexOf("{text}");
    if (textTplPosition === template.length - 6) {
      data[0] = template.replace(/\s?{text}/, "");
      if (data[0] === "") {
        data.shift();
      }
      return data;
    }
    const templatePieces = template.split("{text}");
    let result = [];
    if (templatePieces[0] !== "") {
      result.push(templatePieces[0]);
    }
    result = result.concat(data.slice(1));
    if (templatePieces[1] !== "") {
      result.push(templatePieces[1]);
    }
    return result;
  }
  return format;
}
var object = { exports: {} };
var hasRequiredObject;
function requireObject() {
  if (hasRequiredObject) return object.exports;
  hasRequiredObject = 1;
  (function(module) {
    const util = require$$0$2;
    module.exports = {
      serialize,
      maxDepth({ data, transport, depth = transport?.depth ?? 6 }) {
        if (!data) {
          return data;
        }
        if (depth < 1) {
          if (Array.isArray(data)) return "[array]";
          if (typeof data === "object" && data) return "[object]";
          return data;
        }
        if (Array.isArray(data)) {
          return data.map((child) => module.exports.maxDepth({
            data: child,
            depth: depth - 1
          }));
        }
        if (typeof data !== "object") {
          return data;
        }
        if (data && typeof data.toISOString === "function") {
          return data;
        }
        if (data === null) {
          return null;
        }
        if (data instanceof Error) {
          return data;
        }
        const newJson = {};
        for (const i in data) {
          if (!Object.prototype.hasOwnProperty.call(data, i)) continue;
          newJson[i] = module.exports.maxDepth({
            data: data[i],
            depth: depth - 1
          });
        }
        return newJson;
      },
      toJSON({ data }) {
        return JSON.parse(JSON.stringify(data, createSerializer()));
      },
      toString({ data, transport }) {
        const inspectOptions = transport?.inspectOptions || {};
        const simplifiedData = data.map((item) => {
          if (item === void 0) {
            return void 0;
          }
          try {
            const str = JSON.stringify(item, createSerializer(), "  ");
            return str === void 0 ? void 0 : JSON.parse(str);
          } catch (e) {
            return item;
          }
        });
        return util.formatWithOptions(inspectOptions, ...simplifiedData);
      }
    };
    function createSerializer(options = {}) {
      const seen = /* @__PURE__ */ new WeakSet();
      return function(key, value) {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return void 0;
          }
          seen.add(value);
        }
        return serialize(key, value, options);
      };
    }
    function serialize(key, value, options = {}) {
      const serializeMapAndSet = options?.serializeMapAndSet !== false;
      if (value instanceof Error) {
        return value.stack;
      }
      if (!value) {
        return value;
      }
      if (typeof value === "function") {
        return `[function] ${value.toString()}`;
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (serializeMapAndSet && value instanceof Map && Object.fromEntries) {
        return Object.fromEntries(value);
      }
      if (serializeMapAndSet && value instanceof Set && Array.from) {
        return Array.from(value);
      }
      return value;
    }
  })(object);
  return object.exports;
}
var style;
var hasRequiredStyle;
function requireStyle() {
  if (hasRequiredStyle) return style;
  hasRequiredStyle = 1;
  style = {
    transformStyles,
    applyAnsiStyles({ data }) {
      return transformStyles(data, styleToAnsi, resetAnsiStyle);
    },
    removeStyles({ data }) {
      return transformStyles(data, () => "");
    }
  };
  const ANSI_COLORS = {
    unset: "\x1B[0m",
    black: "\x1B[30m",
    red: "\x1B[31m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    blue: "\x1B[34m",
    magenta: "\x1B[35m",
    cyan: "\x1B[36m",
    white: "\x1B[37m",
    gray: "\x1B[90m"
  };
  function styleToAnsi(style2) {
    const color = style2.replace(/color:\s*(\w+).*/, "$1").toLowerCase();
    return ANSI_COLORS[color] || "";
  }
  function resetAnsiStyle(string) {
    return string + ANSI_COLORS.unset;
  }
  function transformStyles(data, onStyleFound, onStyleApplied) {
    const foundStyles = {};
    return data.reduce((result, item, index, array) => {
      if (foundStyles[index]) {
        return result;
      }
      if (typeof item === "string") {
        let valueIndex = index;
        let styleApplied = false;
        item = item.replace(/%[1cdfiOos]/g, (match) => {
          valueIndex += 1;
          if (match !== "%c") {
            return match;
          }
          const style2 = array[valueIndex];
          if (typeof style2 === "string") {
            foundStyles[valueIndex] = true;
            styleApplied = true;
            return onStyleFound(style2, item);
          }
          return match;
        });
        if (styleApplied && onStyleApplied) {
          item = onStyleApplied(item);
        }
      }
      result.push(item);
      return result;
    }, []);
  }
  return style;
}
var console_1;
var hasRequiredConsole;
function requireConsole() {
  if (hasRequiredConsole) return console_1;
  hasRequiredConsole = 1;
  const {
    concatFirstStringElements,
    format: format2
  } = requireFormat();
  const { maxDepth, toJSON } = requireObject();
  const {
    applyAnsiStyles,
    removeStyles
  } = requireStyle();
  const { transform } = requireTransform();
  const consoleMethods = {
    error: console.error,
    warn: console.warn,
    info: console.info,
    verbose: console.info,
    debug: console.debug,
    silly: console.debug,
    log: console.log
  };
  console_1 = consoleTransportFactory;
  const separator = process.platform === "win32" ? ">" : "›";
  const DEFAULT_FORMAT = `%c{h}:{i}:{s}.{ms}{scope}%c ${separator} {text}`;
  Object.assign(consoleTransportFactory, {
    DEFAULT_FORMAT
  });
  function consoleTransportFactory(logger) {
    return Object.assign(transport, {
      colorMap: {
        error: "red",
        warn: "yellow",
        info: "cyan",
        verbose: "unset",
        debug: "gray",
        silly: "gray",
        default: "unset"
      },
      format: DEFAULT_FORMAT,
      level: "silly",
      transforms: [
        addTemplateColors,
        format2,
        formatStyles,
        concatFirstStringElements,
        maxDepth,
        toJSON
      ],
      useStyles: process.env.FORCE_STYLES,
      writeFn({ message }) {
        const consoleLogFn = consoleMethods[message.level] || consoleMethods.info;
        consoleLogFn(...message.data);
      }
    });
    function transport(message) {
      const data = transform({ logger, message, transport });
      transport.writeFn({
        message: { ...message, data }
      });
    }
  }
  function addTemplateColors({ data, message, transport }) {
    if (typeof transport.format !== "string" || !transport.format.includes("%c")) {
      return data;
    }
    return [
      `color:${levelToStyle(message.level, transport)}`,
      "color:unset",
      ...data
    ];
  }
  function canUseStyles(useStyleValue, level) {
    if (typeof useStyleValue === "boolean") {
      return useStyleValue;
    }
    const useStderr = level === "error" || level === "warn";
    const stream = useStderr ? process.stderr : process.stdout;
    return stream && stream.isTTY;
  }
  function formatStyles(args) {
    const { message, transport } = args;
    const useStyles = canUseStyles(transport.useStyles, message.level);
    const nextTransform = useStyles ? applyAnsiStyles : removeStyles;
    return nextTransform(args);
  }
  function levelToStyle(level, transport) {
    return transport.colorMap[level] || transport.colorMap.default;
  }
  return console_1;
}
var File_1;
var hasRequiredFile$1;
function requireFile$1() {
  if (hasRequiredFile$1) return File_1;
  hasRequiredFile$1 = 1;
  const EventEmitter = require$$0$3;
  const fs2 = require$$0;
  const os = require$$1;
  class File extends EventEmitter {
    asyncWriteQueue = [];
    bytesWritten = 0;
    hasActiveAsyncWriting = false;
    path = null;
    initialSize = void 0;
    writeOptions = null;
    writeAsync = false;
    constructor({
      path: path2,
      writeOptions = { encoding: "utf8", flag: "a", mode: 438 },
      writeAsync = false
    }) {
      super();
      this.path = path2;
      this.writeOptions = writeOptions;
      this.writeAsync = writeAsync;
    }
    get size() {
      return this.getSize();
    }
    clear() {
      try {
        fs2.writeFileSync(this.path, "", {
          mode: this.writeOptions.mode,
          flag: "w"
        });
        this.reset();
        return true;
      } catch (e) {
        if (e.code === "ENOENT") {
          return true;
        }
        this.emit("error", e, this);
        return false;
      }
    }
    crop(bytesAfter) {
      try {
        const content = readFileSyncFromEnd(this.path, bytesAfter || 4096);
        this.clear();
        this.writeLine(`[log cropped]${os.EOL}${content}`);
      } catch (e) {
        this.emit(
          "error",
          new Error(`Couldn't crop file ${this.path}. ${e.message}`),
          this
        );
      }
    }
    getSize() {
      if (this.initialSize === void 0) {
        try {
          const stats = fs2.statSync(this.path);
          this.initialSize = stats.size;
        } catch (e) {
          this.initialSize = 0;
        }
      }
      return this.initialSize + this.bytesWritten;
    }
    increaseBytesWrittenCounter(text) {
      this.bytesWritten += Buffer.byteLength(text, this.writeOptions.encoding);
    }
    isNull() {
      return false;
    }
    nextAsyncWrite() {
      const file2 = this;
      if (this.hasActiveAsyncWriting || this.asyncWriteQueue.length === 0) {
        return;
      }
      const text = this.asyncWriteQueue.join("");
      this.asyncWriteQueue = [];
      this.hasActiveAsyncWriting = true;
      fs2.writeFile(this.path, text, this.writeOptions, (e) => {
        file2.hasActiveAsyncWriting = false;
        if (e) {
          file2.emit(
            "error",
            new Error(`Couldn't write to ${file2.path}. ${e.message}`),
            this
          );
        } else {
          file2.increaseBytesWrittenCounter(text);
        }
        file2.nextAsyncWrite();
      });
    }
    reset() {
      this.initialSize = void 0;
      this.bytesWritten = 0;
    }
    toString() {
      return this.path;
    }
    writeLine(text) {
      text += os.EOL;
      if (this.writeAsync) {
        this.asyncWriteQueue.push(text);
        this.nextAsyncWrite();
        return;
      }
      try {
        fs2.writeFileSync(this.path, text, this.writeOptions);
        this.increaseBytesWrittenCounter(text);
      } catch (e) {
        this.emit(
          "error",
          new Error(`Couldn't write to ${this.path}. ${e.message}`),
          this
        );
      }
    }
  }
  File_1 = File;
  function readFileSyncFromEnd(filePath, bytesCount) {
    const buffer = Buffer.alloc(bytesCount);
    const stats = fs2.statSync(filePath);
    const readLength = Math.min(stats.size, bytesCount);
    const offset = Math.max(0, stats.size - bytesCount);
    const fd = fs2.openSync(filePath, "r");
    const totalBytes = fs2.readSync(fd, buffer, 0, readLength, offset);
    fs2.closeSync(fd);
    return buffer.toString("utf8", 0, totalBytes);
  }
  return File_1;
}
var NullFile_1;
var hasRequiredNullFile;
function requireNullFile() {
  if (hasRequiredNullFile) return NullFile_1;
  hasRequiredNullFile = 1;
  const File = requireFile$1();
  class NullFile extends File {
    clear() {
    }
    crop() {
    }
    getSize() {
      return 0;
    }
    isNull() {
      return true;
    }
    writeLine() {
    }
  }
  NullFile_1 = NullFile;
  return NullFile_1;
}
var FileRegistry_1;
var hasRequiredFileRegistry;
function requireFileRegistry() {
  if (hasRequiredFileRegistry) return FileRegistry_1;
  hasRequiredFileRegistry = 1;
  const EventEmitter = require$$0$3;
  const fs2 = require$$0;
  const path2 = require$$2;
  const File = requireFile$1();
  const NullFile = requireNullFile();
  class FileRegistry extends EventEmitter {
    store = {};
    constructor() {
      super();
      this.emitError = this.emitError.bind(this);
    }
    /**
     * Provide a File object corresponding to the filePath
     * @param {string} filePath
     * @param {WriteOptions} [writeOptions]
     * @param {boolean} [writeAsync]
     * @return {File}
     */
    provide({ filePath, writeOptions = {}, writeAsync = false }) {
      let file2;
      try {
        filePath = path2.resolve(filePath);
        if (this.store[filePath]) {
          return this.store[filePath];
        }
        file2 = this.createFile({ filePath, writeOptions, writeAsync });
      } catch (e) {
        file2 = new NullFile({ path: filePath });
        this.emitError(e, file2);
      }
      file2.on("error", this.emitError);
      this.store[filePath] = file2;
      return file2;
    }
    /**
     * @param {string} filePath
     * @param {WriteOptions} writeOptions
     * @param {boolean} async
     * @return {File}
     * @private
     */
    createFile({ filePath, writeOptions, writeAsync }) {
      this.testFileWriting({ filePath, writeOptions });
      return new File({ path: filePath, writeOptions, writeAsync });
    }
    /**
     * @param {Error} error
     * @param {File} file
     * @private
     */
    emitError(error, file2) {
      this.emit("error", error, file2);
    }
    /**
     * @param {string} filePath
     * @param {WriteOptions} writeOptions
     * @private
     */
    testFileWriting({ filePath, writeOptions }) {
      fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
      fs2.writeFileSync(filePath, "", { flag: "a", mode: writeOptions.mode });
    }
  }
  FileRegistry_1 = FileRegistry;
  return FileRegistry_1;
}
var file;
var hasRequiredFile;
function requireFile() {
  if (hasRequiredFile) return file;
  hasRequiredFile = 1;
  const fs2 = require$$0;
  const os = require$$1;
  const path2 = require$$2;
  const FileRegistry = requireFileRegistry();
  const { transform } = requireTransform();
  const { removeStyles } = requireStyle();
  const {
    format: format2,
    concatFirstStringElements
  } = requireFormat();
  const { toString } = requireObject();
  file = fileTransportFactory;
  const globalRegistry = new FileRegistry();
  function fileTransportFactory(logger, { registry = globalRegistry, externalApi } = {}) {
    let pathVariables;
    if (registry.listenerCount("error") < 1) {
      registry.on("error", (e, file2) => {
        logConsole(`Can't write to ${file2}`, e);
      });
    }
    return Object.assign(transport, {
      fileName: getDefaultFileName(logger.variables.processType),
      format: "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}]{scope} {text}",
      getFile,
      inspectOptions: { depth: 5 },
      level: "silly",
      maxSize: 1024 ** 2,
      readAllLogs,
      sync: true,
      transforms: [removeStyles, format2, concatFirstStringElements, toString],
      writeOptions: { flag: "a", mode: 438, encoding: "utf8" },
      archiveLogFn(file2) {
        const oldPath = file2.toString();
        const inf = path2.parse(oldPath);
        try {
          fs2.renameSync(oldPath, path2.join(inf.dir, `${inf.name}.old${inf.ext}`));
        } catch (e) {
          logConsole("Could not rotate log", e);
          const quarterOfMaxSize = Math.round(transport.maxSize / 4);
          file2.crop(Math.min(quarterOfMaxSize, 256 * 1024));
        }
      },
      resolvePathFn(vars) {
        return path2.join(vars.libraryDefaultDir, vars.fileName);
      },
      setAppName(name) {
        logger.dependencies.externalApi.setAppName(name);
      }
    });
    function transport(message) {
      const file2 = getFile(message);
      const needLogRotation = transport.maxSize > 0 && file2.size > transport.maxSize;
      if (needLogRotation) {
        transport.archiveLogFn(file2);
        file2.reset();
      }
      const content = transform({ logger, message, transport });
      file2.writeLine(content);
    }
    function initializeOnFirstAccess() {
      if (pathVariables) {
        return;
      }
      pathVariables = Object.create(
        Object.prototype,
        {
          ...Object.getOwnPropertyDescriptors(
            externalApi.getPathVariables()
          ),
          fileName: {
            get() {
              return transport.fileName;
            },
            enumerable: true
          }
        }
      );
      if (typeof transport.archiveLog === "function") {
        transport.archiveLogFn = transport.archiveLog;
        logConsole("archiveLog is deprecated. Use archiveLogFn instead");
      }
      if (typeof transport.resolvePath === "function") {
        transport.resolvePathFn = transport.resolvePath;
        logConsole("resolvePath is deprecated. Use resolvePathFn instead");
      }
    }
    function logConsole(message, error = null, level = "error") {
      const data = [`electron-log.transports.file: ${message}`];
      if (error) {
        data.push(error);
      }
      logger.transports.console({ data, date: /* @__PURE__ */ new Date(), level });
    }
    function getFile(msg) {
      initializeOnFirstAccess();
      const filePath = transport.resolvePathFn(pathVariables, msg);
      return registry.provide({
        filePath,
        writeAsync: !transport.sync,
        writeOptions: transport.writeOptions
      });
    }
    function readAllLogs({ fileFilter = (f) => f.endsWith(".log") } = {}) {
      initializeOnFirstAccess();
      const logsPath = path2.dirname(transport.resolvePathFn(pathVariables));
      if (!fs2.existsSync(logsPath)) {
        return [];
      }
      return fs2.readdirSync(logsPath).map((fileName) => path2.join(logsPath, fileName)).filter(fileFilter).map((logPath) => {
        try {
          return {
            path: logPath,
            lines: fs2.readFileSync(logPath, "utf8").split(os.EOL)
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
  }
  function getDefaultFileName(processType = process.type) {
    switch (processType) {
      case "renderer":
        return "renderer.log";
      case "worker":
        return "worker.log";
      default:
        return "main.log";
    }
  }
  return file;
}
var ipc;
var hasRequiredIpc;
function requireIpc() {
  if (hasRequiredIpc) return ipc;
  hasRequiredIpc = 1;
  const { maxDepth, toJSON } = requireObject();
  const { transform } = requireTransform();
  ipc = ipcTransportFactory;
  function ipcTransportFactory(logger, { externalApi }) {
    Object.assign(transport, {
      depth: 3,
      eventId: "__ELECTRON_LOG_IPC__",
      level: logger.isDev ? "silly" : false,
      transforms: [toJSON, maxDepth]
    });
    return externalApi?.isElectron() ? transport : void 0;
    function transport(message) {
      if (message?.variables?.processType === "renderer") {
        return;
      }
      externalApi?.sendIpc(transport.eventId, {
        ...message,
        data: transform({ logger, message, transport })
      });
    }
  }
  return ipc;
}
var remote;
var hasRequiredRemote;
function requireRemote() {
  if (hasRequiredRemote) return remote;
  hasRequiredRemote = 1;
  const http = require$$0$4;
  const https = require$$1$1;
  const { transform } = requireTransform();
  const { removeStyles } = requireStyle();
  const { toJSON, maxDepth } = requireObject();
  remote = remoteTransportFactory;
  function remoteTransportFactory(logger) {
    return Object.assign(transport, {
      client: { name: "electron-application" },
      depth: 6,
      level: false,
      requestOptions: {},
      transforms: [removeStyles, toJSON, maxDepth],
      makeBodyFn({ message }) {
        return JSON.stringify({
          client: transport.client,
          data: message.data,
          date: message.date.getTime(),
          level: message.level,
          scope: message.scope,
          variables: message.variables
        });
      },
      processErrorFn({ error }) {
        logger.processMessage(
          {
            data: [`electron-log: can't POST ${transport.url}`, error],
            level: "warn"
          },
          { transports: ["console", "file"] }
        );
      },
      sendRequestFn({ serverUrl, requestOptions, body }) {
        const httpTransport = serverUrl.startsWith("https:") ? https : http;
        const request = httpTransport.request(serverUrl, {
          method: "POST",
          ...requestOptions,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": body.length,
            ...requestOptions.headers
          }
        });
        request.write(body);
        request.end();
        return request;
      }
    });
    function transport(message) {
      if (!transport.url) {
        return;
      }
      const body = transport.makeBodyFn({
        logger,
        message: { ...message, data: transform({ logger, message, transport }) },
        transport
      });
      const request = transport.sendRequestFn({
        serverUrl: transport.url,
        requestOptions: transport.requestOptions,
        body: Buffer.from(body, "utf8")
      });
      request.on("error", (error) => transport.processErrorFn({
        error,
        logger,
        message,
        request,
        transport
      }));
    }
  }
  return remote;
}
var createDefaultLogger_1;
var hasRequiredCreateDefaultLogger;
function requireCreateDefaultLogger() {
  if (hasRequiredCreateDefaultLogger) return createDefaultLogger_1;
  hasRequiredCreateDefaultLogger = 1;
  const Logger = requireLogger();
  const ErrorHandler = requireErrorHandler();
  const EventLogger = requireEventLogger();
  const transportConsole = requireConsole();
  const transportFile = requireFile();
  const transportIpc = requireIpc();
  const transportRemote = requireRemote();
  createDefaultLogger_1 = createDefaultLogger;
  function createDefaultLogger({ dependencies, initializeFn }) {
    const defaultLogger = new Logger({
      dependencies,
      errorHandler: new ErrorHandler(),
      eventLogger: new EventLogger(),
      initializeFn,
      isDev: dependencies.externalApi?.isDev(),
      logId: "default",
      transportFactories: {
        console: transportConsole,
        file: transportFile,
        ipc: transportIpc,
        remote: transportRemote
      },
      variables: {
        processType: "main"
      }
    });
    defaultLogger.default = defaultLogger;
    defaultLogger.Logger = Logger;
    defaultLogger.processInternalErrorFn = (e) => {
      defaultLogger.transports.console.writeFn({
        message: {
          data: ["Unhandled electron-log error", e],
          level: "error"
        }
      });
    };
    return defaultLogger;
  }
  return createDefaultLogger_1;
}
var main;
var hasRequiredMain$1;
function requireMain$1() {
  if (hasRequiredMain$1) return main;
  hasRequiredMain$1 = 1;
  const electron = require$$0$5;
  const ElectronExternalApi = requireElectronExternalApi();
  const { initialize: initialize2 } = requireInitialize();
  const createDefaultLogger = requireCreateDefaultLogger();
  const externalApi = new ElectronExternalApi({ electron });
  const defaultLogger = createDefaultLogger({
    dependencies: { externalApi },
    initializeFn: initialize2
  });
  main = defaultLogger;
  externalApi.onIpc("__ELECTRON_LOG__", (_, message) => {
    if (message.scope) {
      defaultLogger.Logger.getInstance(message).scope(message.scope);
    }
    const date = new Date(message.date);
    processMessage({
      ...message,
      date: date.getTime() ? date : /* @__PURE__ */ new Date()
    });
  });
  externalApi.onIpcInvoke("__ELECTRON_LOG__", (_, { cmd = "", logId }) => {
    switch (cmd) {
      case "getOptions": {
        const logger = defaultLogger.Logger.getInstance({ logId });
        return {
          levels: logger.levels,
          logId
        };
      }
      default: {
        processMessage({ data: [`Unknown cmd '${cmd}'`], level: "error" });
        return {};
      }
    }
  });
  function processMessage(message) {
    defaultLogger.Logger.getInstance(message)?.processMessage(message);
  }
  return main;
}
var main_1;
var hasRequiredMain;
function requireMain() {
  if (hasRequiredMain) return main_1;
  hasRequiredMain = 1;
  const main2 = requireMain$1();
  main_1 = main2;
  return main_1;
}
var mainExports = requireMain();
const log = /* @__PURE__ */ getDefaultExportFromCjs(mainExports);
log.transports.console.level = process.env.VITE_DEV_SERVER_URL ? "debug" : "warn";
log.transports.file.level = "info";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SERVICE_NAME = "ledgerly";
const ACCOUNT_NAME = "encryption-key";
class EncryptionService {
  encryptionKey = null;
  activeProfileKey = null;
  /**
   * Initialize encryption key from OS keychain/credential manager
   */
  async initialize() {
    try {
      let keyHex = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (!keyHex) {
        const key = crypto.randomBytes(KEY_LENGTH);
        keyHex = key.toString("hex");
        await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, keyHex);
        console.log(
          "✅ Generated new encryption key and stored in OS keychain"
        );
      } else {
        console.log("✅ Loaded encryption key from OS keychain");
      }
      this.encryptionKey = Buffer.from(keyHex, "hex");
    } catch (error) {
      console.error("Failed to initialize encryption:", error);
      throw new Error("Could not initialize encryption service");
    }
  }
  /**
   * Get or create profile-specific encryption key
   */
  async getProfileKey(profileId) {
    const accountName = `profile-${profileId}`;
    let keyHex = await keytar.getPassword(SERVICE_NAME, accountName);
    if (!keyHex) {
      const key = crypto.randomBytes(KEY_LENGTH);
      keyHex = key.toString("hex");
      await keytar.setPassword(SERVICE_NAME, accountName, keyHex);
      console.log(`✅ Generated encryption key for profile: ${profileId}`);
    }
    return Buffer.from(keyHex, "hex");
  }
  /**
   * Delete profile encryption key
   */
  async deleteProfileKey(profileId) {
    const accountName = `profile-${profileId}`;
    await keytar.deletePassword(SERVICE_NAME, accountName);
    console.log(`🗑️ Deleted encryption key for profile: ${profileId}`);
  }
  /**
   * Set active profile key for current operations
   */
  setActiveKey(key) {
    this.activeProfileKey = key;
  }
  /**
   * Encrypt a string value
   */
  encrypt(plaintext, key) {
    const encryptionKey = key || this.activeProfileKey || this.encryptionKey;
    if (!encryptionKey) {
      throw new Error("Encryption key not initialized");
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }
  /**
   * Decrypt an encrypted value
   */
  decrypt(ciphertext, key) {
    const encryptionKey = key || this.activeProfileKey || this.encryptionKey;
    if (!encryptionKey) {
      throw new Error("Encryption key not initialized");
    }
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
  /**
   * Check if a value is encrypted (starts with hex:hex:hex pattern)
   */
  isEncrypted(value) {
    return /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/.test(value);
  }
  /**
   * Encrypt an object (encrypts specified fields)
   */
  encryptFields(obj, fields, key) {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] && typeof result[field] === "string") {
        result[field] = this.encrypt(result[field], key);
      }
    }
    return result;
  }
  /**
   * Decrypt an object (decrypts specified fields)
   */
  decryptFields(obj, fields, key) {
    const result = { ...obj };
    for (const field of fields) {
      if (result[field] && typeof result[field] === "string" && this.isEncrypted(result[field])) {
        try {
          result[field] = this.decrypt(result[field], key);
        } catch (err) {
          console.warn(`Failed to decrypt field ${String(field)}:`, err);
        }
      }
    }
    return result;
  }
}
const encryptionService = new EncryptionService();
const ErrorCodes = {
  DUPLICATE_CODE: "DUPLICATE_CODE"
};
class AppError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}
function normalizeCode(code) {
  return String(code ?? "").trim().toUpperCase();
}
const ENCRYPTED_INVOICE_FIELDS = ["supplierName", "address"];
const ENCRYPTED_LEDGER_FIELDS = ["customerName", "contactNo"];
function encryptNumber(value, key) {
  return encryptionService.encrypt(String(value), key);
}
function decryptNumber(encrypted, key) {
  if (!encryptionService.isEncrypted(encrypted)) {
    return Number(encrypted);
  }
  return Number(encryptionService.decrypt(encrypted, key));
}
function listInvoices(db, encryptionKey) {
  const results = db.prepare(
    `SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC`
  ).all();
  return results.map((invoice) => {
    const decrypted = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    return {
      ...decrypted,
      total: decryptNumber(invoice.total, encryptionKey)
    };
  });
}
function createInvoice(input, db, encryptionKey) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `PI-${randomUUID()}`;
  const encrypted = encryptionService.encryptFields(
    input,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );
  const stmt = db.prepare(
    `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  };
}
function deleteInvoice(id, db, _encryptionKey) {
  db.prepare(`DELETE FROM invoices WHERE id = ?`).run(id);
}
function getInvoice(id, db, encryptionKey) {
  const inv = db.prepare(
    `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
  ).get(id);
  if (!inv) return void 0;
  const decrypted = encryptionService.decryptFields(
    inv,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );
  const items = db.prepare(
    `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
  ).all(id);
  const decryptedItems = items.map((item) => ({
    ...item,
    rate: decryptNumber(item.rate, encryptionKey)
  }));
  return {
    invoice: {
      ...decrypted,
      total: decryptNumber(inv.total, encryptionKey)
    },
    items: decryptedItems
  };
}
function saveInvoice(payload, db, encryptionKey) {
  const encrypted = encryptionService.encryptFields(
    payload,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );
  const items = (payload.items ?? []).map((it) => ({
    code: normalizeCode(it.code),
    name: String(it.name ?? "").trim(),
    rate: +it.rate || 0,
    qty: +it.qty || 0,
    position: +it.position || 0
  }));
  const tx = db.transaction((p) => {
    let invoiceId = p.id ?? 0;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    let previousItems;
    if (p.id) {
      const prevRaw = db.prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ?`
      ).all(p.id);
      previousItems = prevRaw.map((item) => ({
        ...item,
        rate: decryptNumber(item.rate, encryptionKey)
      }));
    }
    if (!p.id) {
      const uid = `PI-${randomUUID()}`;
      const info = db.prepare(
        `INSERT INTO invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
      ).run({
        uid,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        createdAt,
        address: encrypted.address ?? "",
        invoiceDate: p.invoiceDate ?? null
      });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE invoices
         SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        address: encrypted.address ?? "",
        invoiceDate: p.invoiceDate ?? null
      });
      db.prepare(`DELETE FROM invoice_items WHERE invoiceId = ?`).run(p.id);
    }
    const insertItem = db.prepare(
      `INSERT INTO invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        qty: it.qty,
        position: it.position
      });
    }
    updateStockOnPurchase(db, items, !!p.id, previousItems, encryptionKey);
    const invoice = db.prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM invoices WHERE id = ?`
    ).get(invoiceId);
    const decryptedInvoice = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    const itemsOut = db.prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    ).all(invoiceId);
    const decryptedItems = itemsOut.map((item) => ({
      ...item,
      rate: decryptNumber(item.rate, encryptionKey)
    }));
    return {
      invoice: {
        ...decryptedInvoice,
        total: decryptNumber(invoice.total, encryptionKey)
      },
      items: decryptedItems
    };
  });
  return tx(payload);
}
function listStock(db, encryptionKey) {
  const results = db.prepare(
    `SELECT id, code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt
       FROM stock ORDER BY id DESC`
  ).all();
  return results.map((item) => ({
    ...item,
    purchaseRate: decryptNumber(item.purchaseRate, encryptionKey),
    saleRate: decryptNumber(item.saleRate, encryptionKey)
  }));
}
function createStock(input, db, encryptionKey) {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? "").trim();
  try {
    const stmt = db.prepare(`
      INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
      VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))
    `);
    const info = stmt.run({
      code,
      name,
      purchaseRate: encryptNumber(+input.purchaseRate || 0, encryptionKey),
      purchaseQty: +input.purchaseQty || 0,
      saleRate: encryptNumber(+input.saleRate || 0, encryptionKey),
      saleQty: +input.saleQty || 0
    });
    const result = db.prepare(`SELECT * FROM stock WHERE id=@id`).get({ id: info.lastInsertRowid });
    return {
      ...result,
      purchaseRate: decryptNumber(result.purchaseRate, encryptionKey),
      saleRate: decryptNumber(result.saleRate, encryptionKey)
    };
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("code")) {
      throw new AppError(
        `Code "${code}" already exists. Please use a unique code.`,
        ErrorCodes.DUPLICATE_CODE
      );
    }
    throw e;
  }
}
function updateStock(id, input, db, encryptionKey) {
  const code = normalizeCode(input.code);
  const name = String(input.name ?? "").trim();
  try {
    db.prepare(
      `UPDATE stock
       SET code=@code, name=@name, purchaseRate=@purchaseRate, purchaseQty=@purchaseQty,
           saleRate=@saleRate, saleQty=@saleQty
       WHERE id=@id`
    ).run({
      id,
      code,
      name,
      purchaseRate: encryptNumber(+input.purchaseRate || 0, encryptionKey),
      purchaseQty: +input.purchaseQty || 0,
      saleRate: encryptNumber(+input.saleRate || 0, encryptionKey),
      saleQty: +input.saleQty || 0
    });
    const result = db.prepare(`SELECT * FROM stock WHERE id=@id`).get({ id });
    return {
      ...result,
      purchaseRate: decryptNumber(result.purchaseRate, encryptionKey),
      saleRate: decryptNumber(result.saleRate, encryptionKey)
    };
  } catch (e) {
    if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("code")) {
      throw new AppError(
        `Code "${code}" already exists. Please use a unique code.`,
        ErrorCodes.DUPLICATE_CODE
      );
    }
    throw e;
  }
}
function deleteStock(id, db, _encryptionKey) {
  db.prepare(`DELETE FROM stock WHERE id = ?`).run(id);
}
function updateStockOnPurchase(db, items, isEdit, previousItems, encryptionKey) {
  if (isEdit && previousItems) {
    for (const prevItem of previousItems) {
      const stock = db.prepare(`SELECT * FROM stock WHERE code = ?`).get(prevItem.code);
      if (stock) {
        db.prepare(
          `UPDATE stock
           SET purchaseQty = purchaseQty - @qty
           WHERE code = @code`
        ).run({
          code: prevItem.code,
          qty: prevItem.qty
        });
      }
    }
  }
  for (const item of items) {
    const stock = db.prepare(`SELECT * FROM stock WHERE code = ?`).get(item.code);
    if (stock) {
      db.prepare(
        `UPDATE stock
         SET name = @name,
             purchaseQty = purchaseQty + @qty,
             purchaseRate = @rate
         WHERE code = @code`
      ).run({
        code: item.code,
        name: item.name,
        qty: item.qty,
        rate: encryptNumber(item.rate, encryptionKey)
      });
    } else {
      db.prepare(
        `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
         VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))`
      ).run({
        code: item.code,
        name: item.name,
        purchaseRate: encryptNumber(item.rate, encryptionKey),
        purchaseQty: item.qty,
        saleRate: encryptNumber(0, encryptionKey),
        saleQty: 0
      });
    }
  }
}
function updateStockOnSale(db, items, isEdit, previousItems, encryptionKey) {
  if (isEdit && previousItems) {
    for (const prevItem of previousItems) {
      const stock = db.prepare(`SELECT * FROM stock WHERE code = ?`).get(prevItem.code);
      if (stock) {
        db.prepare(
          `UPDATE stock
           SET saleQty = saleQty - @qty
           WHERE code = @code`
        ).run({
          code: prevItem.code,
          qty: prevItem.qty
        });
      }
    }
  }
  for (const item of items) {
    const stock = db.prepare(`SELECT * FROM stock WHERE code = ?`).get(item.code);
    if (stock) {
      db.prepare(
        `UPDATE stock
         SET name = @name,
             saleQty = saleQty + @qty,
             saleRate = @rate
         WHERE code = @code`
      ).run({
        code: item.code,
        name: item.name,
        qty: item.qty,
        rate: encryptNumber(item.rate, encryptionKey)
      });
    } else {
      db.prepare(
        `INSERT INTO stock (code, name, purchaseRate, purchaseQty, saleRate, saleQty, createdAt)
         VALUES (@code, @name, @purchaseRate, @purchaseQty, @saleRate, @saleQty, datetime('now'))`
      ).run({
        code: item.code,
        name: item.name,
        purchaseRate: encryptNumber(0, encryptionKey),
        purchaseQty: 0,
        saleRate: encryptNumber(item.rate, encryptionKey),
        saleQty: item.qty
      });
    }
  }
}
function listSaleInvoices(db, encryptionKey) {
  const results = db.prepare(
    `SELECT
        i.id, i.number, i.supplierName, i.address, i.invoiceDate, i.total, i.createdAt,
        COALESCE(SUM(ii.qty), 0) AS totalQty
      FROM sale_invoices i
      LEFT JOIN sale_invoice_items ii ON ii.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.id DESC`
  ).all();
  return results.map((invoice) => {
    const decrypted = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    return {
      ...decrypted,
      total: decryptNumber(invoice.total, encryptionKey)
    };
  });
}
function createSaleInvoice(input, db, encryptionKey) {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const uid = `SI-${randomUUID()}`;
  const encrypted = encryptionService.encryptFields(
    input,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );
  const stmt = db.prepare(
    `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
     VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
  );
  const info = stmt.run({
    uid,
    number: input.number,
    supplierName: encrypted.supplierName,
    total: encryptNumber(input.total, encryptionKey),
    createdAt,
    address: encrypted.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  });
  return {
    id: Number(info.lastInsertRowid),
    number: input.number,
    supplierName: input.supplierName,
    total: input.total,
    createdAt,
    address: input.address ?? "",
    invoiceDate: input.invoiceDate ?? null
  };
}
function deleteSaleInvoice(id, db, _encryptionKey) {
  db.prepare(`DELETE FROM sale_invoices WHERE id = ?`).run(id);
}
function getSaleInvoice(id, db, encryptionKey) {
  const inv = db.prepare(
    `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
  ).get(id);
  if (!inv) return void 0;
  const decrypted = encryptionService.decryptFields(
    inv,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );
  const items = db.prepare(
    `SELECT id, invoiceId, code, name, rate, qty, position
       FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
  ).all(id);
  const decryptedItems = items.map((item) => ({
    ...item,
    rate: decryptNumber(item.rate, encryptionKey)
  }));
  return {
    invoice: {
      ...decrypted,
      total: decryptNumber(inv.total, encryptionKey)
    },
    items: decryptedItems
  };
}
function saveSaleInvoice(payload, db, encryptionKey) {
  const encrypted = encryptionService.encryptFields(
    payload,
    ENCRYPTED_INVOICE_FIELDS,
    encryptionKey
  );
  const items = (payload.items ?? []).map((it) => ({
    code: normalizeCode(it.code),
    name: String(it.name ?? "").trim(),
    rate: +it.rate || 0,
    qty: +it.qty || 0,
    position: +it.position || 0
  }));
  const tx = db.transaction((p) => {
    let invoiceId = p.id ?? 0;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    let previousItems;
    if (p.id) {
      const prevRaw = db.prepare(
        `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ?`
      ).all(p.id);
      previousItems = prevRaw.map((item) => ({
        ...item,
        rate: decryptNumber(item.rate, encryptionKey)
      }));
    }
    if (!p.id) {
      const uid = `SI-${randomUUID()}`;
      const info = db.prepare(
        `INSERT INTO sale_invoices (uid, number, supplierName, total, createdAt, address, invoiceDate)
           VALUES (@uid, @number, @supplierName, @total, @createdAt, @address, @invoiceDate)`
      ).run({
        uid,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        createdAt,
        address: encrypted.address ?? "",
        invoiceDate: p.invoiceDate ?? null
      });
      invoiceId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE sale_invoices
         SET number=@number, supplierName=@supplierName, total=@total, address=@address, invoiceDate=@invoiceDate
         WHERE id=@id`
      ).run({
        id: p.id,
        number: p.number,
        supplierName: encrypted.supplierName,
        total: encryptNumber(p.total, encryptionKey),
        address: encrypted.address ?? "",
        invoiceDate: p.invoiceDate ?? null
      });
      db.prepare(`DELETE FROM sale_invoice_items WHERE invoiceId = ?`).run(
        p.id
      );
    }
    const insertItem = db.prepare(
      `INSERT INTO sale_invoice_items (invoiceId, code, name, rate, qty, position)
       VALUES (@invoiceId, @code, @name, @rate, @qty, @position)`
    );
    for (const it of items) {
      insertItem.run({
        invoiceId,
        code: it.code,
        name: it.name,
        rate: encryptNumber(it.rate, encryptionKey),
        qty: it.qty,
        position: it.position
      });
    }
    updateStockOnSale(db, items, !!p.id, previousItems, encryptionKey);
    const invoice = db.prepare(
      `SELECT id, number, supplierName, total, createdAt, address, invoiceDate FROM sale_invoices WHERE id = ?`
    ).get(invoiceId);
    const decryptedInvoice = encryptionService.decryptFields(
      invoice,
      ENCRYPTED_INVOICE_FIELDS,
      encryptionKey
    );
    const itemsOut = db.prepare(
      `SELECT id, invoiceId, code, name, rate, qty, position FROM sale_invoice_items WHERE invoiceId = ? ORDER BY position ASC`
    ).all(invoiceId);
    const decryptedItems = itemsOut.map((item) => ({
      ...item,
      rate: decryptNumber(item.rate, encryptionKey)
    }));
    return {
      invoice: {
        ...decryptedInvoice,
        total: decryptNumber(invoice.total, encryptionKey)
      },
      items: decryptedItems
    };
  });
  return tx(payload);
}
function ledgerSave(payload, db, encryptionKey) {
  const customerName = String(payload.customerName || "").trim();
  const contactNo = String(payload.contactNo || "").trim();
  if (!customerName) {
    return { error: "Customer name is required" };
  }
  const encrypted = encryptionService.encryptFields(
    { customerName, contactNo },
    ENCRYPTED_LEDGER_FIELDS,
    encryptionKey
  );
  const tx = db.transaction(() => {
    let ledgerId = payload.id ?? 0;
    if (!payload.id) {
      const info = db.prepare(
        `INSERT INTO ledgers (customerName, contactNo, totalDebit, totalCredit, netBalance)
           VALUES (@customerName, @contactNo, @totalDebit, @totalCredit, @netBalance)`
      ).run({
        customerName: encrypted.customerName,
        contactNo: encrypted.contactNo,
        totalDebit: encryptNumber(+payload.totals.debit || 0, encryptionKey),
        totalCredit: encryptNumber(
          +payload.totals.credit || 0,
          encryptionKey
        ),
        netBalance: encryptNumber(+payload.totals.net || 0, encryptionKey)
      });
      ledgerId = Number(info.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE ledgers
         SET customerName=@customerName, contactNo=@contactNo,
             totalDebit=@totalDebit, totalCredit=@totalCredit, netBalance=@netBalance
         WHERE id=@id`
      ).run({
        id: payload.id,
        customerName: encrypted.customerName,
        contactNo: encrypted.contactNo,
        totalDebit: encryptNumber(+payload.totals.debit || 0, encryptionKey),
        totalCredit: encryptNumber(+payload.totals.credit || 0, encryptionKey),
        netBalance: encryptNumber(+payload.totals.net || 0, encryptionKey)
      });
      db.prepare(`DELETE FROM ledger_rows WHERE ledgerId = ?`).run(payload.id);
    }
    const insertRow = db.prepare(
      `INSERT INTO ledger_rows (ledgerId, date, particulars, debit, credit, crDr, position)
       VALUES (@ledgerId, @date, @particulars, @debit, @credit, @crDr, @position)`
    );
    for (const row of payload.rows) {
      const encryptedParticulars = encryptionService.encrypt(
        String(row.particulars || "").trim(),
        encryptionKey
      );
      insertRow.run({
        ledgerId,
        date: row.date,
        particulars: encryptedParticulars,
        debit: encryptNumber(+row.debit || 0, encryptionKey),
        credit: encryptNumber(+row.credit || 0, encryptionKey),
        crDr: row.crDr === "DR" ? "DR" : "CR",
        position: +row.position || 0
      });
    }
    return { id: ledgerId };
  });
  return tx();
}
function getLedger(id, db, encryptionKey) {
  const ledger = db.prepare(
    `SELECT
        id,
        customerName,
        contactNo,
        totalDebit,
        totalCredit,
        netBalance
       FROM ledgers WHERE id = ?`
  ).get(id);
  if (!ledger) return void 0;
  const decryptedLedger = encryptionService.decryptFields(
    ledger,
    ENCRYPTED_LEDGER_FIELDS,
    encryptionKey
  );
  const rows = db.prepare(
    `SELECT id, ledgerId, date, particulars, debit, credit, crDr, position
       FROM ledger_rows WHERE ledgerId = ? ORDER BY position ASC`
  ).all(id);
  const decryptedRows = rows.map((row) => ({
    ...row,
    particulars: encryptionService.isEncrypted(row.particulars) ? encryptionService.decrypt(row.particulars, encryptionKey) : row.particulars,
    debit: decryptNumber(row.debit, encryptionKey),
    credit: decryptNumber(row.credit, encryptionKey)
  }));
  return {
    ledger: {
      ...decryptedLedger,
      totalDebit: decryptNumber(ledger.totalDebit, encryptionKey),
      totalCredit: decryptNumber(ledger.totalCredit, encryptionKey),
      netBalance: decryptNumber(ledger.netBalance, encryptionKey)
    },
    rows: decryptedRows
  };
}
function listLedgers(db, encryptionKey) {
  const results = db.prepare(
    `SELECT
        id,
        customerName,
        totalDebit,
        totalCredit,
        netBalance
       FROM ledgers
       ORDER BY id DESC`
  ).all();
  return results.map((ledger) => {
    const decrypted = encryptionService.decryptFields(
      ledger,
      ["customerName"],
      encryptionKey
    );
    return {
      ...decrypted,
      totalDebit: decryptNumber(ledger.totalDebit, encryptionKey),
      totalCredit: decryptNumber(ledger.totalCredit, encryptionKey),
      netBalance: decryptNumber(ledger.netBalance, encryptionKey)
    };
  });
}
function deleteLedger(id, db, _encryptionKey) {
  db.prepare(`DELETE FROM ledgers WHERE id = ?`).run(id);
}
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL,
      supplierName TEXT NOT NULL,
      total TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      address TEXT,
      invoiceDate TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate TEXT NOT NULL,
      qty INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL,
      customerName TEXT NOT NULL,
      total TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      address TEXT,
      invoiceDate TEXT,
      contactNo TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceId INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      rate TEXT NOT NULL,
      qty INTEGER NOT NULL,
      position INTEGER NOT NULL,
      FOREIGN KEY(invoiceId) REFERENCES sale_invoices(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      purchaseRate TEXT NOT NULL,
      purchaseQty REAL NOT NULL,
      saleRate TEXT NOT NULL,
      saleQty REAL NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerName TEXT NOT NULL,
      contactNo TEXT DEFAULT '',
      totalDebit TEXT NOT NULL,
      totalCredit TEXT NOT NULL,
      netBalance TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledgerId INTEGER NOT NULL,
      date TEXT NOT NULL,
      particulars TEXT NOT NULL,
      debit TEXT NOT NULL,
      credit TEXT NOT NULL,
      crDr TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(ledgerId) REFERENCES ledgers(id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoiceId ON invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoiceId ON sale_invoice_items(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_stock_code ON stock(code);
    CREATE INDEX IF NOT EXISTS idx_ledger_rows_ledgerId ON ledger_rows(ledgerId);
  `);
  const getMeta2 = (k) => {
    try {
      const row = db.prepare("SELECT value FROM meta WHERE key=?").get(k);
      return row?.value;
    } catch {
      return null;
    }
  };
  const schemaVersion = getMeta2("schema_version");
  if (!schemaVersion) {
    log.info("Creating initial schema...");
    db.exec(`
      INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')
    `);
  }
}
const __dirname$2 = path.dirname(fileURLToPath(import.meta.url));
async function saveInvoicePdf(kind, id, pageSize = "A4", profileManager2, profileId) {
  if (profileManager2 && profileId) {
    const db = profileManager2.getConnection(profileId);
    const key = profileManager2.getEncryptionKey(profileId);
    if (!db || !key) {
      throw new Error("Profile not open");
    }
  }
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(
        MAIN_DIST,
        VITE_DEV_SERVER_URL ? "preload.mjs" : "preload.js"
      ),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false
    }
  });
  const devServerUrl = process.env["VITE_DEV_SERVER_URL"];
  const printUrl = devServerUrl ? `${devServerUrl}#/print/${kind}/${id}?size=${pageSize}` : `file://${path.join(
    __dirname$2,
    "../dist/index.html"
  )}#/print/${kind}/${id}?size=${pageSize}`;
  await win.loadURL(printUrl);
  return new Promise((resolve, reject) => {
    win.webContents.once("did-finish-load", async () => {
      try {
        await new Promise((r) => setTimeout(r, 500));
        const data = await win.webContents.printToPDF({
          pageSize: pageSize === "A5" ? "A5" : "A4",
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          printBackground: true
        });
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: "Save Invoice PDF",
          defaultPath: path.join(
            app.getPath("documents"),
            `invoice-${kind}-${id}.pdf`
          ),
          filters: [{ name: "PDF", extensions: ["pdf"] }]
        });
        if (!canceled && filePath) {
          await fs.writeFile(filePath, data);
          win.destroy();
          resolve();
        } else {
          win.destroy();
          resolve();
        }
      } catch (err) {
        win.close();
        reject(err);
      }
    });
  });
}
class ProfileManager {
  profiles = /* @__PURE__ */ new Map();
  connections = /* @__PURE__ */ new Map();
  profilesDir;
  constructor() {
    this.profilesDir = path.join(app.getPath("userData"), "profiles");
    if (!fs$1.existsSync(this.profilesDir)) {
      fs$1.mkdirSync(this.profilesDir, { recursive: true });
    }
  }
  loadProfiles() {
    if (!fs$1.existsSync(this.profilesDir)) {
      return [];
    }
    const dirs = fs$1.readdirSync(this.profilesDir);
    const profiles = [];
    for (const dir of dirs) {
      const metadataPath = path.join(this.profilesDir, dir, "metadata.json");
      if (fs$1.existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(
            fs$1.readFileSync(metadataPath, "utf8")
          );
          const profile = {
            id: dir,
            name: metadata.name,
            createdAt: metadata.createdAt,
            lastOpened: metadata.lastOpened,
            path: path.join(this.profilesDir, dir),
            hasPassword: metadata.hasPassword || false
          };
          profiles.push(profile);
          this.profiles.set(profile.id, profile);
        } catch (err) {
          console.error(`Failed to load profile ${dir}:`, err);
        }
      }
    }
    return profiles;
  }
  hasProfiles() {
    return this.profiles.size > 0;
  }
  async createProfile(name, password) {
    const id = `profile-${randomUUID()}`;
    const profilePath = path.join(this.profilesDir, id);
    fs$1.mkdirSync(profilePath, { recursive: true });
    const profile = {
      id,
      name,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastOpened: (/* @__PURE__ */ new Date()).toISOString(),
      path: profilePath,
      hasPassword: !!password
    };
    const metadata = {
      name,
      createdAt: profile.createdAt,
      lastOpened: profile.lastOpened,
      hasPassword: profile.hasPassword
    };
    fs$1.writeFileSync(
      path.join(profilePath, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );
    this.profiles.set(id, profile);
    await encryptionService.getProfileKey(id);
    return profile;
  }
  async openProfile(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    if (this.connections.has(profileId)) {
      return;
    }
    const dbPath = path.join(profile.path, "data.db");
    const db = new Database(dbPath);
    const profileKey = await encryptionService.getProfileKey(profileId);
    ensureSchema(db);
    this.connections.set(profileId, { db, encryptionKey: profileKey });
    profile.lastOpened = (/* @__PURE__ */ new Date()).toISOString();
    this.updateProfileMetadata(profile);
  }
  closeProfile(profileId) {
    const connection = this.connections.get(profileId);
    if (connection) {
      connection.db.close();
      this.connections.delete(profileId);
    }
  }
  getConnection(profileId) {
    return this.connections.get(profileId)?.db;
  }
  getEncryptionKey(profileId) {
    return this.connections.get(profileId)?.encryptionKey;
  }
  getProfile(profileId) {
    return this.profiles.get(profileId);
  }
  listProfiles() {
    return Array.from(this.profiles.values()).sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime()
    );
  }
  async deleteProfile(profileId) {
    this.closeProfile(profileId);
    const profile = this.profiles.get(profileId);
    if (profile) {
      fs$1.rmSync(profile.path, { recursive: true, force: true });
      await encryptionService.deleteProfileKey(profileId);
      this.profiles.delete(profileId);
    }
  }
  renameProfile(profileId, newName) {
    const profile = this.profiles.get(profileId);
    if (profile) {
      profile.name = newName;
      this.updateProfileMetadata(profile);
    }
  }
  updateProfileMetadata(profile) {
    const metadata = {
      name: profile.name,
      createdAt: profile.createdAt,
      lastOpened: profile.lastOpened,
      hasPassword: profile.hasPassword
    };
    fs$1.writeFileSync(
      path.join(profile.path, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );
  }
}
class AppStateManager {
  statePath;
  state;
  constructor(dataDir) {
    this.statePath = path.join(dataDir, "app-state.json");
    this.state = this.loadState();
  }
  loadState() {
    try {
      if (fs$1.existsSync(this.statePath)) {
        const raw = fs$1.readFileSync(this.statePath, "utf8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error("Failed to load app state:", err);
    }
    return {
      openProfiles: [],
      lastActiveProfile: null,
      windowBounds: { width: 1200, height: 800 },
      version: "1.0.0"
    };
  }
  saveState() {
    try {
      fs$1.writeFileSync(
        this.statePath,
        JSON.stringify(this.state, null, 2),
        "utf8"
      );
    } catch (err) {
      console.error("Failed to save app state:", err);
    }
  }
  getOpenProfiles() {
    return this.state.openProfiles.map((p) => p.profileId);
  }
  getLastActiveProfile() {
    return this.state.lastActiveProfile;
  }
  setOpenProfiles(profileIds) {
    this.state.openProfiles = profileIds.map((id, index) => ({
      profileId: id,
      windowIndex: 0,
      isActive: index === 0,
      lastFocusedAt: (/* @__PURE__ */ new Date()).toISOString()
    }));
    this.saveState();
  }
  setActiveProfile(profileId) {
    this.state.lastActiveProfile = profileId;
    this.state.openProfiles = this.state.openProfiles.map((p) => ({
      ...p,
      isActive: p.profileId === profileId,
      lastFocusedAt: p.profileId === profileId ? (/* @__PURE__ */ new Date()).toISOString() : p.lastFocusedAt
    }));
    this.saveState();
  }
  addOpenProfile(profileId) {
    if (!this.state.openProfiles.find((p) => p.profileId === profileId)) {
      this.state.openProfiles.push({
        profileId,
        windowIndex: 0,
        isActive: this.state.openProfiles.length === 0,
        lastFocusedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (this.state.openProfiles.length === 1) {
        this.state.lastActiveProfile = profileId;
      }
      this.saveState();
    }
  }
  removeOpenProfile(profileId) {
    this.state.openProfiles = this.state.openProfiles.filter(
      (p) => p.profileId !== profileId
    );
    if (this.state.lastActiveProfile === profileId) {
      this.state.lastActiveProfile = this.state.openProfiles[0]?.profileId || null;
    }
    this.saveState();
  }
  getWindowBounds() {
    return this.state.windowBounds;
  }
  setWindowBounds(bounds) {
    this.state.windowBounds = bounds;
    this.saveState();
  }
  clearState() {
    this.state = {
      openProfiles: [],
      lastActiveProfile: null,
      windowBounds: { width: 1200, height: 800 },
      version: "1.0.0"
    };
    this.saveState();
  }
}
const profileManager = new ProfileManager();
const appStateManager = new AppStateManager(app.getPath("userData"));
function registerIpcHandlers() {
  ipcMain.handle("profiles:list", async () => {
    try {
      return profileManager.listProfiles();
    } catch (error) {
      log.error("Failed to list profiles:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:create", async (_, name) => {
    try {
      const profile = await profileManager.createProfile(name);
      await profileManager.openProfile(profile.id);
      appStateManager.addOpenProfile(profile.id);
      return profile;
    } catch (error) {
      log.error("Failed to create profile:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:open", async (_, profileId) => {
    try {
      await profileManager.openProfile(profileId);
      appStateManager.addOpenProfile(profileId);
      return { success: true };
    } catch (error) {
      log.error("Failed to open profile:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:close", async (_, profileId) => {
    try {
      profileManager.closeProfile(profileId);
      appStateManager.removeOpenProfile(profileId);
      return { success: true };
    } catch (error) {
      log.error("Failed to close profile:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:switch", async (event, profileId) => {
    try {
      const oldProfile = appStateManager.getLastActiveProfile();
      appStateManager.setActiveProfile(profileId);
      event.sender.send("profile:switched", {
        from: oldProfile,
        to: profileId,
        timestamp: Date.now()
      });
      return { success: true };
    } catch (error) {
      log.error("Failed to switch profile:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:getOpen", async () => {
    try {
      return appStateManager.getOpenProfiles();
    } catch (error) {
      log.error("Failed to get open profiles:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:getActive", async () => {
    try {
      return appStateManager.getLastActiveProfile();
    } catch (error) {
      log.error("Failed to get active profile:", error);
      throw error;
    }
  });
  ipcMain.handle("profiles:delete", async (_, profileId) => {
    try {
      await profileManager.deleteProfile(profileId);
      appStateManager.removeOpenProfile(profileId);
      return { success: true };
    } catch (error) {
      log.error("Failed to delete profile:", error);
      throw error;
    }
  });
  ipcMain.handle(
    "profiles:rename",
    async (_, profileId, newName) => {
      try {
        profileManager.renameProfile(profileId, newName);
        return { success: true };
      } catch (error) {
        log.error("Failed to rename profile:", error);
        throw error;
      }
    }
  );
  ipcMain.handle("invoices:list", async (_, profileId) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      return listInvoices(db, key);
    } catch (error) {
      log.error("Failed to list invoices:", error);
      throw error;
    }
  });
  ipcMain.handle(
    "invoices:create",
    async (_, profileId, data) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return createInvoice(data, db, key);
      } catch (error) {
        log.error("Failed to create invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle(
    "invoices:delete",
    async (_, profileId, id) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        deleteInvoice(id, db, key);
        return { success: true };
      } catch (error) {
        log.error("Failed to delete invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle("invoices:get", async (_, profileId, id) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      return getInvoice(id, db, key);
    } catch (error) {
      log.error("Failed to get invoice:", error);
      throw error;
    }
  });
  ipcMain.handle(
    "invoices:save",
    async (_, profileId, payload) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return saveInvoice(payload, db, key);
      } catch (error) {
        log.error("Failed to save invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle("stock:list", async (_, profileId) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      return listStock(db, key);
    } catch (error) {
      log.error("Failed to list stock:", error);
      throw error;
    }
  });
  ipcMain.handle(
    "stock:create",
    async (_, profileId, data) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return createStock(data, db, key);
      } catch (error) {
        log.error("Failed to create stock:", error);
        throw error;
      }
    }
  );
  ipcMain.handle(
    "stock:update",
    async (_, profileId, id, data) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return updateStock(id, data, db, key);
      } catch (error) {
        log.error("Failed to update stock:", error);
        throw error;
      }
    }
  );
  ipcMain.handle("stock:delete", async (_, profileId, id) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      deleteStock(id, db, key);
      return { success: true };
    } catch (error) {
      log.error("Failed to delete stock:", error);
      throw error;
    }
  });
  ipcMain.handle("sale-invoices:list", async (_, profileId) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      return listSaleInvoices(db, key);
    } catch (error) {
      log.error("Failed to list sale invoices:", error);
      throw error;
    }
  });
  ipcMain.handle(
    "sale-invoices:create",
    async (_, profileId, data) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return createSaleInvoice(data, db, key);
      } catch (error) {
        log.error("Failed to create sale invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle(
    "sale-invoices:delete",
    async (_, profileId, id) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        deleteSaleInvoice(id, db, key);
        return { success: true };
      } catch (error) {
        log.error("Failed to delete sale invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle(
    "sale-invoices:get",
    async (_, profileId, id) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return getSaleInvoice(id, db, key);
      } catch (error) {
        log.error("Failed to get sale invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle(
    "sale-invoices:save",
    async (_, profileId, payload) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return saveSaleInvoice(payload, db, key);
      } catch (error) {
        log.error("Failed to save sale invoice:", error);
        throw error;
      }
    }
  );
  ipcMain.handle(
    "ledger:save",
    async (_, profileId, payload) => {
      try {
        const db = profileManager.getConnection(profileId);
        const key = profileManager.getEncryptionKey(profileId);
        if (!db || !key) throw new Error("Profile not open");
        return ledgerSave(payload, db, key);
      } catch (error) {
        log.error("Failed to save ledger:", error);
        throw error;
      }
    }
  );
  ipcMain.handle("ledger:get", async (_, profileId, id) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      return getLedger(id, db, key);
    } catch (error) {
      log.error("Failed to get ledger:", error);
      throw error;
    }
  });
  ipcMain.handle("ledger:list", async (_, profileId) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      return listLedgers(db, key);
    } catch (error) {
      log.error("Failed to list ledgers:", error);
      throw error;
    }
  });
  ipcMain.handle("ledger:delete", async (_, profileId, id) => {
    try {
      const db = profileManager.getConnection(profileId);
      const key = profileManager.getEncryptionKey(profileId);
      if (!db || !key) throw new Error("Profile not open");
      deleteLedger(id, db, key);
      return { success: true };
    } catch (error) {
      log.error("Failed to delete ledger:", error);
      throw error;
    }
  });
  ipcMain.handle(
    "invoice:savePdf",
    async (_, profileId, kind, id, pageSize) => {
      try {
        const result = await dialog.showSaveDialog({
          title: "Save Invoice PDF",
          defaultPath: `invoice-${id}.pdf`,
          filters: [{ name: "PDF", extensions: ["pdf"] }]
        });
        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }
        await saveInvoicePdf(kind, id, pageSize, profileManager, profileId);
        return { success: true, path: result.filePath };
      } catch (error) {
        log.error("Failed to save invoice PDF:", error);
        throw error;
      }
    }
  );
  log.info("✅ IPC handlers registered (with profile support)");
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: "Ledgerly"
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  mainWindow.webContents.openDevTools();
  mainWindow.on("close", () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      appStateManager.setWindowBounds(bounds);
    }
  });
}
async function initializeApp() {
  try {
    log.info("🚀 Initializing Bartan Markaz...");
    await encryptionService.initialize();
    log.info("✅ Encryption service initialized");
    const profiles = profileManager.loadProfiles();
    log.info(`✅ Loaded ${profiles.length} profile(s)`);
    registerIpcHandlers();
    log.info("✅ IPC handlers registered");
    createWindow();
    log.info("✅ Main window created");
    const hasProfiles = profileManager.hasProfiles();
    const openProfileIds = appStateManager.getOpenProfiles();
    if (!hasProfiles) {
      log.info("📋 No profiles found - showing welcome screen");
      if (mainWindow) {
        mainWindow.webContents.once("did-finish-load", () => {
          mainWindow?.webContents.send("app:navigate", "/welcome");
        });
      }
      return;
    }
    if (openProfileIds.length > 0) {
      log.info(`🔄 Restoring ${openProfileIds.length} open profile(s)...`);
      const validProfileIds = [];
      for (const profileId of openProfileIds) {
        try {
          await profileManager.openProfile(profileId);
          validProfileIds.push(profileId);
          log.info(`✅ Restored profile: ${profileId}`);
        } catch (err) {
          log.error(`❌ Failed to restore profile ${profileId}:`, err);
        }
      }
      if (validProfileIds.length > 0) {
        const lastActive = appStateManager.getLastActiveProfile();
        const activeProfile = validProfileIds.includes(lastActive) ? lastActive : validProfileIds[0];
        appStateManager.setActiveProfile(activeProfile);
        log.info(`✅ Active profile: ${activeProfile}`);
        if (mainWindow) {
          mainWindow.webContents.once("did-finish-load", () => {
            mainWindow?.webContents.send("app:restore-session", {
              profiles: validProfileIds,
              activeProfile
            });
          });
        }
        return;
      }
    }
    log.info("📋 No open profiles - showing profile selector");
    if (mainWindow) {
      mainWindow.webContents.once("did-finish-load", () => {
        mainWindow?.webContents.send("app:navigate", "/profile-selector");
      });
    }
  } catch (error) {
    log.error("❌ Failed to initialize app:", error);
    app.quit();
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    mainWindow = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.on("before-quit", () => {
  log.info("💾 Saving app state...");
  const openProfiles = appStateManager.getOpenProfiles();
  log.info(`📋 Open profiles: ${openProfiles.length}`);
  for (const profileId of openProfiles) {
    try {
      profileManager.closeProfile(profileId);
      log.info(`✅ Closed profile: ${profileId}`);
    } catch (err) {
      log.error(`❌ Failed to close profile ${profileId}:`, err);
    }
  }
  log.info("✅ App state saved");
});
app.whenReady().then(initializeApp);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
