"use client";

import { useEffect, useRef } from "react";
import type { GameType } from "@lumikids/shared";
import { GameRuntime } from "../game-runtime";
import { demoAssetUrls, demoContents } from "../game-runtime/demo-content";
import { LANDING_COPY } from "./landing-copy";

/**
 * A sample game played right on the landing page, without an account: the real runtime in PREVIEW mode with
 * the bundled example content and local pictures. Nothing is requested from the API and nothing is saved.
 */
export default function LandingDemo({ type, loginHref, onClose }: { type: GameType; loginHref: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // No close() on cleanup: it would fire the dialog's close event (and so onClose) during StrictMode's
    // mount/unmount/mount check. Removing an open dialog from the page dismisses it anyway.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="lk-demo"
      aria-label={LANDING_COPY.demo.title}
      onClose={onClose}
      // A click on the backdrop (the dialog element itself, outside its panel) closes it.
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    >
      <div className="lk-demoPanel">
        <div className="lk-demoBar">
          <p>{LANDING_COPY.demo.title}</p>
          <button type="button" className="lk-demoClose" aria-label={LANDING_COPY.demo.close} onClick={() => dialogRef.current?.close()}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 3.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        <GameRuntime content={demoContents[type]} assetUrls={demoAssetUrls} mode="PREVIEW" />
        <p className="lk-demoNote">{LANDING_COPY.demo.note} <a href={loginHref}>{LANDING_COPY.demo.login}</a></p>
      </div>
    </dialog>
  );
}
