import { Download, FolderOpen, Link, Save, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { getScenario } from "../../data/scenarios";
import { track } from "../../lib/analytics";
import {
  deleteSavedBuild,
  encodeShareHash,
  listSavedBuilds,
  parseBuildJson,
  saveBuild,
  serializeBuild,
  type SavedBuild,
} from "../../persistence/builds";
import { useWorkbench } from "../../state/WorkbenchContext";
import { Button, IconButton, Modal, SectionLabel, cx } from "./ui";

type Tab = "save" | "share";

export function BuildsModal({ open, onClose, initialTab = "save" }: { open: boolean; onClose: () => void; initialTab?: Tab }) {
  const { build, dispatch, state, toast } = useWorkbench();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [saved, setSaved] = useState<SavedBuild[]>(() => listSavedBuilds());
  const [importText, setImportText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setSaved(listSavedBuilds());

  const doImport = (text: string) => {
    const res = parseBuildJson(text);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    setImportText("");
    dispatch({ type: "loadBuild", build: res.build, action: `Imported “${res.build.name}”` });
    toast(`Imported “${res.build.name}”.`, "success");
    onClose();
  };

  const download = () => {
    const blob = new Blob([serializeBuild(build)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${build.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "stackcraft-build"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    track("build_exported");
    toast("Build exported as JSON.", "success");
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeShareHash(build)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Share link copied. It contains only this build's components, connections and choices.", "success");
    } catch {
      setImportText(url);
      toast("Couldn't access the clipboard — the link is in the text box to copy manually.", "error");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Builds"
      description="Saved builds live in this browser only. They don't sync between devices — export JSON to move them."
    >
      <div role="tablist" className="mb-4 flex gap-1 rounded-lg bg-ink-850 p-1">
        {(
          [
            ["save", "Save & load"],
            ["share", "Export, import & share"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx("h-7 flex-1 rounded-md text-[12.5px] font-medium", tab === id ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-100")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "save" ? (
        <div className="space-y-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const res = saveBuild(build);
              if (res) {
                toast(`Saved “${build.name}” in this browser.`, "success");
                refresh();
              } else toast("Couldn't save — browser storage is unavailable or full.", "error");
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Build name</span>
              <input
                value={state.name}
                onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
                maxLength={80}
                className="h-8 w-full rounded-md border border-ink-700 bg-ink-850 px-2.5 text-[13px] focus:border-amber-glow/60 focus:outline-none"
              />
            </label>
            <Button type="submit" variant="primary">
              <Save size={13} /> Save copy
            </Button>
          </form>

          <section>
            <SectionLabel>Saved in this browser ({saved.length})</SectionLabel>
            {saved.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-700 p-4 text-center text-[12.5px] text-ink-400">
                No saved builds yet. Saving keeps a named snapshot you can load or compare against.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {saved.map((b) => (
                  <li key={b.key} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{b.name}</p>
                      <p className="truncate text-[11.5px] text-ink-400">
                        {getScenario(b.scenarioId).title} · {b.nodes.length} components · {new Date(b.savedAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        dispatch({ type: "loadBuild", build: b });
                        toast(`Loaded “${b.name}”.`, "success");
                        onClose();
                      }}
                    >
                      <FolderOpen size={13} /> Load
                    </Button>
                    <IconButton
                      label={`Delete saved build ${b.name}`}
                      onClick={() => {
                        deleteSavedBuild(b.key);
                        refresh();
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-2 sm:grid-cols-2">
            <Button onClick={download}>
              <Download size={13} /> Download JSON
            </Button>
            <Button onClick={copyLink}>
              <Link size={13} /> Copy share link
            </Button>
            <p className="text-[11.5px] leading-snug text-ink-400 sm:col-span-2">
              Share links compress the build into the URL fragment (after #), which browsers don't send to servers. Don't put private
              information in build names or labels.
            </p>
          </section>

          <section>
            <SectionLabel>Import</SectionLabel>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Choose a JSON build file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) doImport(await file.text());
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()} className="w-full">
              <Upload size={13} /> Choose a .json file
            </Button>
            <label className="mt-3 block">
              <span className="mb-1 block text-[11.5px] text-ink-400">…or paste build JSON</span>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full rounded-md border border-ink-700 bg-ink-850 p-2 font-mono text-[11.5px] focus:border-amber-glow/60 focus:outline-none"
                placeholder='{ "version": 1, "name": "…", … }'
              />
            </label>
            <Button size="sm" className="mt-1" disabled={!importText.trim()} onClick={() => doImport(importText)}>
              Import pasted JSON
            </Button>
            {errors.length > 0 && (
              <div role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/[0.07] p-3 text-[12.5px]">
                <p className="font-medium text-bad">This build couldn't be imported:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-[11.5px] text-ink-200">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
