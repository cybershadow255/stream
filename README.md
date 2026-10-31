# StreamShare - Eigene Discord-Alternative für kostenloses 1080p, 4K & 120 FPS Streaming

**StreamShare** ist eine leichtgewichtige, performante Desktop-App (Electron + WebRTC), die speziell dafür entwickelt wurde, ohne monatliche Abonnements (wie Discord Nitro) Bildschirme und Spiele in bester Qualität zu übertragen und miteinander zu sprechen.

---

## ✨ Features
- **Keine Qualitätsgrenzen:** Streame in **720p, 1080p, 1440p (2K) oder 2160p (4K)** mit **30, 60, 120 oder 144 FPS**.
- **Integrierter Voice-Chat:** Sofortige Sprachverbindung beim Beitreten inklusive Mikrofon-Stummschaltung (Mute) und Audio-Deafen.
- **Freundesliste:** Speichere deinen Freund mit Namen und ID. Ein Klick auf **„Call“** genügt, um sofort verbunden zu sein!
- **Feste Benutzer-ID:** Deine ID bleibt auch nach dem Schließen der App erhalten.
- **High-Bitrate P2P (Peer-to-Peer):** Direkte WebRTC-Verbindung mit SDP-Tuning (bis zu 35 Mbit/s) – keine künstliche Drosselung von Auflösung oder Bildrate.
- **Kinderleicht & portabel:** Funktioniert direkt als portable `.exe`, keine Installation nötig!

---

## 🛠️ Kinderleichte Anleitung: So erstellst du die `.exe` für dich und deinen Freund

### 1. Vorbereitung (einmalig)
Installiere [Node.js](https://nodejs.org) (Version 18 oder neuer) auf deinem PC.

### 2. Dependencies installieren
Öffne die Eingabeaufforderung / PowerShell in diesem Projektordner:
```bash
npm install
```

### 3. App testen
```bash
npm start
```

### 4. Fertige `.exe` Datei bauen
Führe folgenden Befehl aus:
```bash
npm run build
```
Nach dem Build findest du die fertige **`StreamShare.exe`** im neu erstellten Ordner **`dist/`**.
Schicke diese `.exe` einfach an deinen Freund (z.B. per Google Drive, WeTransfer, USB-Stick oder Cloud).

---

## 🎮 So benutzt ihr die App zusammen

1. **Starten:** Du und dein Freund startet jeweils die `StreamShare.exe`.
2. **Freund adden:**
   - Oben links sieht jeder seine persönliche ID (z.B. `user-4821`).
   - Klicke auf das Kopier-Icon 📋 neben deiner ID und schicke sie deinem Freund.
   - Dein Freund klickt auf **„+ Freund“**, gibt deinen Namen und deine ID ein und klickt auf **Speichern**.
3. **Verbinden & Sprechen:**
   - Klicke in der Freundesliste einfach auf **„📞 Call“** (oder gib den Code oben in das Feld ein und klicke auf *Anrufen / Verbinden*).
   - Ihr seid sofort miteinander im Voice-Chat verbunden!
4. **Bildschirm übertragen:**
   - Wähle bei *Auflösung* (z.B. **1080p** oder **4K**) und *Bildrate* (z.B. **60 FPS** oder **120 FPS**) deine Wunschqualität aus.
   - Klicke auf **„🖥️ Bildschirm übertragen“** und wähle den Monitor oder das Spielfenster aus.
   - Dein Freund sieht das Bild sofort in nativer Flüssigkeit und Schärfe! Mit der Taste **F** oder dem Button rechts unten kann er in den Vollbildmodus wechseln.

---

## 🔒 Architektur & Sicherheit
Die Übertragung erfolgt Peer-to-Peer über WebRTC mit Ende-zu-Ende-Verschlüsselung (DTLS/SRTP). Es werden keine Videostreams auf fremden Servern zwischengespeichert.
