"use client";

import Link from "next/link";
import { useState } from "react";
import { GameRuntime } from "../game-runtime";
import { demoAssetUrls, demoContents } from "../game-runtime/demo-content";
import { GameBackdrop } from "../game-runtime/environment/game-backdrop";
import { SCENE_BACKGROUNDS } from "../game-runtime/model/backgrounds";
import "./savanna-demo.css";

type View = "game" | "scene";

const STATUS_TEXT: Record<string, string> = {
  loading: "Đang dựng thảo nguyên…",
  partial: "Một phần mô hình 3D chưa tải được",
  fallback: "Đang dùng phong cảnh tĩnh",
};

/** Development check for the savanna world, shown in the classification game it belongs to. */
export function SavannaDemo({ initialView = "game" }: { initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [sceneStatus, setSceneStatus] = useState("loading");
  return (
    <main className="savanna-demo">
      <header className="savanna-demo-bar">
        <Link href="/" className="savanna-demo-brand" aria-label="Về trang chủ">
          Lumi<span>Kids</span>
        </Link>
        <p className="savanna-demo-title">Thảo nguyên châu Phi · trò chơi phân loại</p>
        <div className="savanna-demo-switch" role="group" aria-label="Chế độ xem">
          <button type="button" aria-pressed={view === "game"} onClick={() => setView("game")}>Trò chơi</button>
          <button type="button" aria-pressed={view === "scene"} onClick={() => setView("scene")}>Chỉ phong cảnh</button>
        </div>
      </header>
      {view === "game" ? (
        <GameRuntime content={demoContents.CLASSIFICATION} assetUrls={demoAssetUrls} mode="PREVIEW" />
      ) : (
        <section
          className="savanna-demo-scene"
          aria-label="Phong cảnh thảo nguyên"
          data-scene-status={sceneStatus}
          style={{ backgroundImage: `url("${SCENE_BACKGROUNDS.savanna}")` }}
        >
          <GameBackdrop theme="savanna" className="savanna-demo-canvas" onStatus={setSceneStatus} />
          {STATUS_TEXT[sceneStatus] ? <span role="status" className="savanna-demo-status">{STATUS_TEXT[sceneStatus]}</span> : null}
        </section>
      )}
    </main>
  );
}
