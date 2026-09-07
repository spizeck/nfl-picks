"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isiOS] = useState(
    () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)
  );
  const reloadOnControllerChange = useRef(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => setInstalled(isStandalone());
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (sessionStorage.getItem("install-prompt-dismissed") !== "true") {
        setInstallPrompt(event as BeforeInstallPromptEvent);
      }
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    queueMicrotask(updateInstalledState);
    displayMode.addEventListener("change", updateInstalledState);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(worker);
            }
          });
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadOnControllerChange.current) window.location.reload();
      });
    }

    return () => {
      displayMode.removeEventListener("change", updateInstalledState);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstructions(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "dismissed") {
      sessionStorage.setItem("install-prompt-dismissed", "true");
    }
  };

  const applyUpdate = () => {
    if (document.documentElement.dataset.hasUnsavedPicks === "true") {
      setUpdateMessage("Save or discard your pick changes before updating.");
      return;
    }
    reloadOnControllerChange.current = true;
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <>
      {!installed && (
        <Button variant="ghost" size="sm" onClick={handleInstall} className="font-semibold">
          <Download className="mr-2 h-4 w-4" />
          Install App
        </Button>
      )}

      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="install-title" className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg">
            <h2 id="install-title" className="text-lg font-semibold">Install NFL Picks</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isiOS
                ? "In Safari, tap Share, then choose Add to Home Screen."
                : "Open your browser menu and choose Install app or Add to Home screen."}
            </p>
            <Button className="mt-4 w-full" onClick={() => setShowInstructions(false)}>Close</Button>
          </div>
        </div>
      )}

      {waitingWorker && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-4 shadow-lg" role="status">
          <p className="font-medium">A new version is available.</p>
          {updateMessage && <p className="mt-1 text-sm text-muted-foreground">{updateMessage}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={applyUpdate}>Update now</Button>
            <Button size="sm" variant="outline" onClick={() => setWaitingWorker(null)}>Later</Button>
          </div>
        </div>
      )}
    </>
  );
}
