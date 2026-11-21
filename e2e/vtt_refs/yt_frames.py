"""Frames YouTube em 1080p sem chrome do player."""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

from e2e.vtt_refs.consent import dismiss_consent
from e2e.vtt_refs.image_quality import content_hash, save_png
from e2e.vtt_refs.manifest import filter_by_only, load_manifest

HIDE_YT_CSS = """
.ytp-chrome-bottom, .ytp-chrome-top, .ytp-ce-element,
.ytp-pause-overlay, .ytp-gradient-bottom { display: none !important; }
"""


def _youtube_id(url: str) -> str:
    match = re.search(r"(?:[?&]v=|youtu\.be/)([\w-]{6,})", url)
    if not match:
        raise ValueError(f"no youtube id in {url}")
    return match.group(1)


def _parse_ts(ts: str) -> float:
    parts = [int(p) for p in ts.strip().split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    raise ValueError(ts)


def _ffmpeg_exe() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def _extract_scene_frames(
    video: Path,
    out_dir: Path,
    start_s: float,
    *,
    max_frames: int = 4,
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(out_dir / "frame-%02d.png")
    window = 20.0
    cmd = [
        _ffmpeg_exe(),
        "-y",
        "-ss",
        str(max(0, start_s - 2)),
        "-i",
        str(video),
        "-t",
        str(window),
        "-vf",
        f"select='gt(scene,0.25)',scale=iw:min(ih\\,1080)",
        "-vsync",
        "vfr",
        "-frames:v",
        str(max_frames),
        pattern,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        cmd2 = [
            _ffmpeg_exe(),
            "-y",
            "-ss",
            str(start_s),
            "-i",
            str(video),
            "-vframes",
            "1",
            str(out_dir / "frame-01.png"),
        ]
        subprocess.run(cmd2, capture_output=True, check=False)
    return sorted(out_dir.glob("frame-*.png"))


def _download_video(url: str, work: Path) -> Path | None:
    if not shutil.which("yt-dlp"):
        return None
    template = str(work / "%(id)s.%(ext)s")
    node = shutil.which("node")
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-f",
        "bv*[height<=1080]/bv*+ba/b",
        "-o",
        template,
        url,
    ]
    if node:
        cmd.extend(["--js-runtimes", f"node:{node}"])
    cmd.append(url)
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300, check=False)
    if proc.returncode != 0:
        return None
    files = [p for p in work.iterdir() if p.is_file() and p.suffix.lower() in {".mp4", ".webm", ".mkv"}]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_size)


def _capture_playwright_video(page, entry: dict, out_path: Path, wait_ms: int) -> bool:
    vid = _youtube_id(entry["url"])
    ts = _parse_ts(entry.get("youtube_ts", "00:05"))
    page.goto(f"https://www.youtube.com/watch?v={vid}", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(wait_ms)
    dismiss_consent(page)
    page.add_style_tag(content=HIDE_YT_CSS)
    page.evaluate(
        f"""() => {{
          const v = document.querySelector('video');
          if (v) {{ v.currentTime = {ts}; v.play(); }}
        }}"""
    )
    page.wait_for_timeout(2500)
    video = page.locator("video").first
    if video.is_visible(timeout=5000):
        video.screenshot(path=str(out_path))
        return True
    return False


def process_yt_entry(
    entry: dict[str, Any],
    out_root: Path,
    page,
    work: Path,
    *,
    wait_ms: int,
) -> list[dict[str, Any]]:
    platform = entry.get("platform", "unknown")
    feature_id = entry.get("feature_id", "unknown")
    eid = entry.get("id", "yt")
    dest_dir = out_root / platform / feature_id / eid
    dest_dir.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    url = entry["url"]
    ts = _parse_ts(entry.get("youtube_ts", "00:05"))

    frames: list[Path] = []
    video = _download_video(url, work)
    if video:
        tmp = dest_dir / "_tmp_frames"
        frames = _extract_scene_frames(video, tmp, ts, max_frames=4)

    if not frames and shutil.which("yt-dlp"):
        single = dest_dir / "01-playwright.png"
        if _capture_playwright_video(page, entry, single, wait_ms):
            frames = [single]
    elif not frames:
        single = dest_dir / "01-playwright.png"
        if _capture_playwright_video(page, entry, single, wait_ms):
            frames = [single]

    for idx, frame in enumerate(frames, start=1):
        data = frame.read_bytes()
        final = dest_dir / f"{idx:02d}.png"
        save_png(data, final)
        rel = str(final.relative_to(out_root)).replace("\\", "/")
        items.append({
            "id": f"{eid}-{idx:02d}",
            "source": "youtube",
            "platform": platform,
            "feature_id": feature_id,
            "manifest_id": eid,
            "page_url": url,
            "youtube_ts": entry.get("youtube_ts"),
            "path": rel,
            "content_hash": content_hash(data),
        })
        if frame.parent.name == "_tmp_frames":
            frame.unlink(missing_ok=True)
    if (dest_dir / "_tmp_frames").is_dir():
        shutil.rmtree(dest_dir / "_tmp_frames", ignore_errors=True)
    return items


def run_yt_extract(
    out_dir: Path,
    *,
    only: str | None = None,
    wait_ms: int = 3500,
    viewport: dict | None = None,
) -> list[dict[str, Any]]:
    _, entries = load_manifest()
    yts = [e for e in entries if e.get("type") == "youtube"]
    yts = filter_by_only(yts, only)
    viewport = viewport or {"width": 1920, "height": 1080}
    all_items: list[dict[str, Any]] = []
    work = Path(tempfile.mkdtemp(prefix="vtt-yt-"))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport=viewport)
        page = context.new_page()
        for entry in yts:
            try:
                batch = process_yt_entry(entry, out_dir, page, work, wait_ms=wait_ms)
                all_items.extend(batch)
                print(f"OK yt {entry.get('id')}: {len(batch)} frames")
            except Exception as exc:
                print(f"FAIL yt {entry.get('id')}: {exc}", file=sys.stderr)
        browser.close()
    shutil.rmtree(work, ignore_errors=True)
    return all_items