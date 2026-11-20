"use client";
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { SITE_LOGO_MAX_BYTES } from "@lumikids/shared";
import type { LandingScene, SiteSettings } from "@lumikids/shared";
import { LumiLogo, LumiWordmark } from "@/components/lumi-logo";
import { useSiteSettings } from "@/components/site-settings-provider";
import { classroomError } from "../classrooms/api";
import type { ClassroomApi } from "../classrooms/api";
import { ClassroomShell, Dialog, ErrorBanner, Notice, Panel } from "../classrooms/classroom-shell";
import { useClassroomSession } from "../classrooms/use-classroom-session";
import { useResource } from "../classrooms/use-resource";
import { LANDING_SCENES } from "../landing/landing-scenes";
import { AdminApi } from "./api";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function SiteSettingsPage() {
  const { session, loading, api, allowed } = useClassroomSession("MANAGE_USERS");
  if (loading || !session || !api) return <Notice>Đang kiểm tra phiên đăng nhập…</Notice>;
  if (!allowed) return <Notice>Chỉ quản trị viên được đổi cài đặt trang.</Notice>;
  return <Settings key={session.user.userId} api={api} />;
}

function Settings({ api }: { api: ClassroomApi }) {
  const admin = useMemo(() => new AdminApi(api), [api]);
  const site = useSiteSettings();
  const settings = useResource((signal) => admin.siteSettings(signal), "site-settings");
  // Every save returns the full settings: show them here and across the app at once.
  const saved = (next: SiteSettings) => {
    settings.replace(next);
    site.replace(next);
  };
  return (
    <ClassroomShell title="Cài đặt trang" eyebrow="Quản trị">
      {settings.error && <ErrorBanner message={settings.error} onRetry={settings.reload} />}
      {settings.loading && !settings.data && <p role="status" className="text-sm text-ink-soft">Đang tải cài đặt…</p>}
      {settings.data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <IdentityPanel key={settings.data.updatedAt ?? "new"} admin={admin} settings={settings.data} onSaved={saved} />
            <ScenePanel admin={admin} settings={settings.data} onSaved={saved} />
          </div>
          <aside className="space-y-6">
            <LogoPanel admin={admin} settings={settings.data} onSaved={saved} />
          </aside>
        </div>
      )}
    </ClassroomShell>
  );
}

function IdentityPanel({ admin, settings, onSaved }: { admin: AdminApi; settings: SiteSettings; onSaved: (next: SiteSettings) => void }) {
  const [siteName, setSiteName] = useState(settings.siteName);
  const [tagline, setTagline] = useState(settings.tagline ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const unchanged = siteName.trim() === settings.siteName && tagline.trim() === (settings.tagline ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || unchanged) return;
    setBusy(true);
    setError("");
    setDone(false);
    try {
      onSaved(await admin.updateSiteSettings({ siteName: siteName.trim(), tagline: tagline.trim() }));
      setDone(true);
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Tên trang" description="Hiện ở thanh bên, trang đăng nhập, trang chủ và khu vực của bé.">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="asset-label" htmlFor="site-name">Tên trang</label>
          <input id="site-name" className="asset-input mt-1" required maxLength={60} value={siteName} onChange={(event) => { setSiteName(event.target.value); setDone(false); }} disabled={busy} />
        </div>
        <div>
          <label className="asset-label" htmlFor="site-tagline">Khẩu hiệu <span className="font-normal text-ink-soft">(không bắt buộc)</span></label>
          <input id="site-tagline" className="asset-input mt-1" maxLength={160} value={tagline} onChange={(event) => { setTagline(event.target.value); setDone(false); }} placeholder="Học qua chơi cho bé 3–6 tuổi" disabled={busy} />
        </div>
        {error && <p role="alert" className="asset-error">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {done && <p role="status" className="text-sm text-leaf">Đã lưu.</p>}
          <button className="asset-button-primary" disabled={busy || unchanged || !siteName.trim()}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
        </div>
      </form>
    </Panel>
  );
}

function LogoPanel({ admin, settings, onSaved }: { admin: AdminApi; settings: SiteSettings; onSaved: (next: SiteSettings) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setError("Logo cần là ảnh PNG, JPEG hoặc WebP.");
    if (file.size > SITE_LOGO_MAX_BYTES) return setError("Logo tối đa 512 KB.");
    setBusy(true);
    setError("");
    try {
      onSaved(await admin.uploadLogo(file));
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      onSaved(await admin.removeLogo());
      setConfirmRemove(false);
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Logo" description="Ảnh vuông, nền trong suốt là đẹp nhất. PNG, JPEG hoặc WebP, tối đa 512 KB.">
      <div className="space-y-3">
        <p className="text-xs font-medium text-ink-soft">Xem trước</p>
        <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3">
          <LumiLogo size={36} />
          <LumiWordmark className="text-lg" />
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-ink px-4 py-3 text-[#fffdf8]">
          <LumiLogo size={28} />
          <LumiWordmark />
        </div>
        <p className="text-xs text-ink-soft">{settings.logoPath ? "Đang dùng logo đã tải lên." : "Đang dùng logo LumiKids mặc định."}</p>
      </div>
      <input ref={input} type="file" accept={LOGO_TYPES.join(",")} className="sr-only" onChange={pick} tabIndex={-1} aria-hidden="true" />
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="asset-button-primary" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Đang tải lên…" : settings.logoPath ? "Đổi logo" : "Tải logo lên"}
        </button>
        {settings.logoPath && (
          <button type="button" className="asset-button-secondary" onClick={() => setConfirmRemove(true)} disabled={busy}>Dùng logo mặc định</button>
        )}
      </div>
      {confirmRemove && (
        <Dialog title="Dùng lại logo mặc định?" onClose={() => setConfirmRemove(false)}>
          <p className="text-sm leading-6 text-ink-soft">Logo đã tải lên sẽ bị xóa và mọi trang quay về logo LumiKids. Bạn có thể tải logo khác bất cứ lúc nào.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="asset-button-secondary" onClick={() => setConfirmRemove(false)} disabled={busy}>Hủy</button>
            <button type="button" className="asset-button-primary" onClick={remove} disabled={busy}>{busy ? "Đang xóa…" : "Dùng logo mặc định"}</button>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}

function ScenePanel({ admin, settings, onSaved }: { admin: AdminApi; settings: SiteSettings; onSaved: (next: SiteSettings) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scenes = Object.entries(LANDING_SCENES) as [LandingScene, (typeof LANDING_SCENES)[LandingScene]][];
  async function choose(scene: LandingScene) {
    if (busy || scene === settings.landingScene) return;
    setBusy(true);
    setError("");
    try {
      onSaved(await admin.updateSiteSettings({ landingScene: scene }));
    } catch (failure) {
      setError(classroomError(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Cảnh trang chủ" description="Cảnh 3D khách thấy đầu tiên ở trang chủ.">
      <fieldset disabled={busy}>
        <legend className="sr-only">Chọn cảnh trang chủ</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {scenes.map(([key, scene]) => (
            <label key={key} className="cursor-pointer overflow-hidden rounded-lg border border-line bg-paper has-[:checked]:border-leaf has-[:checked]:ring-2 has-[:checked]:ring-leaf/25">
              <input type="radio" name="landing-scene" className="sr-only" checked={settings.landingScene === key} onChange={() => choose(key)} />
              {/* eslint-disable-next-line @next/next/no-img-element -- static poster of the scene */}
              <img src={scene.poster} alt="" className="aspect-[16/9] w-full object-cover" />
              <span className="block px-3 py-2.5">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {scene.label}
                  {settings.landingScene === key && <span className="text-xs font-medium text-leaf">Đang dùng</span>}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{scene.description}</span>
              </span>
            </label>
          ))}
          <div className="grid place-items-center rounded-lg border border-dashed border-line px-4 py-6 text-center text-xs leading-5 text-ink-soft">
            Cảnh mới (ví dụ núi tuyết) sẽ hiện ở đây khi được thêm vào hệ thống.
          </div>
        </div>
      </fieldset>
      {error && <p role="alert" className="asset-error mt-3">{error}</p>}
    </Panel>
  );
}
