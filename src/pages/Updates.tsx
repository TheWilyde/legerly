import { useEffect, useState } from "react";
import { FiCheckCircle, FiDownloadCloud, FiRefreshCw, FiRotateCcw } from "react-icons/fi";
import type { ReleaseOption, UpdateState } from "../../electron/update-types";
import PageHeader from "../components/common/PageHeader";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${units[unit]}`;
}

export default function Updates() {
  const [state, setState] = useState<UpdateState>();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string>();

  async function loadHistory() {
    setLoadingHistory(true);
    setError(undefined);
    try {
      setReleases(await window.api.updates.listVersions());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    void window.api.updates.getState().then(setState);
    void loadHistory();
    return window.api.updates.onState(setState);
  }, []);

  async function checkNow() {
    setError(undefined);
    try {
      setState(await window.api.updates.check());
      await loadHistory();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError));
    }
  }

  async function selectRelease(release: ReleaseOption) {
    if (!release.compatibility.compatible || release.isCurrent) return;
    const direction = release.isNewer ? "install" : "reinstall the older";
    const confirmed = window.confirm(
      `Download ${formatBytes(release.installerSize)} and ${direction} Ledgerly ${release.version}?\n\nLedgerly will close to finish installation. Save active work before continuing.`,
    );
    if (!confirmed) return;
    setError(undefined);
    try {
      setState(await window.api.updates.installVersion(release.version));
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
    }
  }

  const busy = state?.status === "checking" || state?.status === "downloading";
  const progress = state?.progress?.percent ?? 0;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader title="App Updates" />

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Installed version</p>
            <h2 className="mt-1 text-2xl font-semibold text-neutral-900">
              Ledgerly {state?.currentVersion ?? "…"}
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              {state?.status === "disabled"
                ? "Automatic updates are disabled in development builds."
                : state?.status === "downloaded"
                  ? `Version ${state.availableVersion} is verified and ready.`
                  : state?.status === "downloading"
                    ? `Downloading version ${state.availableVersion}…`
                    : state?.status === "checking"
                      ? "Checking GitHub Releases…"
                      : "Ledgerly checks automatically every six hours."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || state?.status === "disabled"}
              onClick={() => void checkNow()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
              <FiRefreshCw className={busy ? "animate-spin" : ""} />
              Check now
            </button>
            {state?.status === "downloaded" && (
              <button
                type="button"
                onClick={() => void window.api.updates.installDownloaded()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800">
                <FiDownloadCloud /> Restart and install
              </button>
            )}
          </div>
        </div>

        {state?.status === "downloading" && (
          <div className="mt-5">
            <div className="mb-1 flex justify-between text-xs text-neutral-600">
              <span>{progress.toFixed(0)}%</span>
              <span>{formatBytes(state.progress?.transferred ?? 0)} / {formatBytes(state.progress?.total ?? 0)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {(error || state?.error) && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error ?? state?.error}</p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-neutral-900">Available versions</h2>
          <p className="text-sm text-neutral-600">The current release and up to three preceding stable releases are cryptographically verified.</p>
        </div>
        {loadingHistory ? (
          <p className="text-sm text-neutral-500">Loading signed release history…</p>
        ) : (
          <div className="divide-y divide-neutral-200">
            {releases.map((release) => (
              <div key={release.version} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">v{release.version}</span>
                    {release.isCurrent && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Installed</span>}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {new Date(release.publishedAt).toLocaleDateString()} · {formatBytes(release.installerSize)} · Windows x64
                  </p>
                  {!release.compatibility.compatible && (
                    <p className="mt-2 max-w-xl text-xs text-amber-700">{release.compatibility.reason}</p>
                  )}
                  <a className="mt-2 inline-block text-xs text-blue-700 hover:underline" href={release.notesUrl} target="_blank" rel="noreferrer">Release notes</a>
                </div>
                <button
                  type="button"
                  disabled={release.isCurrent || !release.compatibility.compatible || busy || state?.status === "downloaded"}
                  onClick={() => void selectRelease(release)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
                  {release.isCurrent ? <FiCheckCircle /> : <FiRotateCcw />}
                  {release.isCurrent ? "Installed" : release.isNewer ? "Install" : "Reinstall"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
