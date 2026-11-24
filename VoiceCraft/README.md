# VoiceCraft

In-game Minecraft Bedrock voice chat addon (`.mcaddon`) and external WebSocket + WebRTC voice bridge.

## Contents
- `addon/VoiceCraft.mcaddon` — Ready-to-import Minecraft Bedrock pack (Emote-adjacent HUD button, one-time Enable WebSockets popup, hotbar quick-toggles, `!vc` commands) pre-configured for `https://ais-dev-y4yn7xsfbwoxkdgpqkyywa-11612436337.asia-southeast1.run.app`.
- `addon/VoiceCraft_BP/` & `addon/VoiceCraft_RP/` — Unpacked Behavior & Resource pack source.
- `server.mjs` & `public/index.html` — Standalone Node.js WebSocket + WebRTC Voice Bridge website.

## Host Free Outside AI Studio (Render — No Credit Card)
1. Push all files in this folder to your **VoiceCraft** GitHub repository.
2. Open [Render](https://render.com) → **New +** → **Blueprint** (or **Web Service**) → connect your `VoiceCraft` GitHub repo.
3. Render reads `render.yaml` automatically and launches your live `https://<your-service>.onrender.com` bridge.
4. Players can download `/download/VoiceCraft.mcaddon` straight from your live site or from `addon/` in GitHub.

## Minecraft Bedrock Setup
1. Import `VoiceCraft.mcaddon` and enable both **VoiceCraft Behavior** and **VoiceCraft Minecraft UI** in your World/Server/Realm.
2. In Minecraft **Settings → Network Settings**, turn **ON** `Enable WebSockets`.
3. Run the `/wsserver` command shown in chat on spawn, keep your live external VoiceCraft website open in the background, and use the HUD button next to Emote or `!vc menu`.
