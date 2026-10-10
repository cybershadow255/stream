# StreamShare - High Performance 4K 120FPS Screen Share App

StreamShare ist eine performante Desktop-Anwendung (Electron + WebRTC), mit der du und deine Freunde ohne Abo-Einschränkungen Bildschirme in **720p, 1080p, 1440p oder 4K** bei **30, 60 oder 120 FPS** übertragen könnt.

## 🚀 WICHTIGER HINWEIS ZUR AUSFÜHRUNG

Damit die Bildschirmübertragung und die WebRTC-Netzwerkverbindung über das Internet zwischen verschiedenen Computern/Routern reibungslos funktioniert, **muss die Anwendung als Electron Desktop App gestartet werden** (oder über einen lokalen Server/HTTPS). Das direkte Öffnen der `.html`-Datei per Doppelklick in Google Chrome / Edge wird von Browser-Sicherheitsrichtlinien für Kamera/Mikrofon/WebRTC eingeschränkt.

---

## 💻 Anleitung zur Erstellung der `.exe` für dich und deinen Freund

### 1. Voraussetzungen
- Node.js (Version 18 oder höher) herunterladen und installieren: [https://nodejs.org](https://nodejs.org)

### 2. Projekt-Installation
Öffne das Terminal / die Eingabeaufforderung im Ordner der App:
```bash
npm install
```

### 3. App lokal starten
```bash
npm start
```

### 4. Portable Windows Executable (.exe) erstellen
Um eine fertige `.exe` Datei zu generieren, die du deinem Freund direkt schicken kannst:
```bash
npm run build
```
Die fertige `.exe` befindet sich danach im Ordner `dist/`.

---

## 🎮 Anwendungsschritte

### 1. Verbindung aufbauen & Freundeliste
1. Starte StreamShare auf beiden Computern.
2. Kopiere den oben gezeigten **Raum-Code** (z.B. `stream-982341`) und schicke ihn deinem Freund.
3. **Direkt verbinden:** Dein Freund gibt den Code bei **Freund-Code eingeben** ein und klickt auf **Verbinden**.
4. **Freund speichern:** Gib unter **Freundeliste** den Namen deines Freundes (z.B. „Alex“) und seinen Code ein und klicke auf **+ Freund hinzufügen**. Ab jetzt kannst du dich jederzeit per Klick auf das 🔗-Symbol direkt verbinden!

### 2. Bildschirm & Mikrofon übertragen
1. Sobald „Verbunden“ erscheint, wähle deine gewünschte **Auflösung** (720p, 1080p Full HD, 1440p 2K oder 2160p 4K) und **Bildrate** (30, 60 oder 120 FPS).
2. Klicke auf **Bildschirm teilen** und wähle den Monitor oder das Anwendungsfenster aus.
3. Der Stream wird in voller Flüssigkeit und ohne künstliche Drosselung direkt per WebRTC (P2P) an deinen Freund übertragen!
4. Über die Audio-Steuerung kannst du dein Mikrofon stummschalten oder die Lautstärke des empfangenen Streams anpassen.
