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
1. Starte StreamShare auf beiden Computern.
2. Kopiere den oben gezeigten **Raum-Code** (z.B. `stream-982341`) und schicke ihn deinem Freund.
3. Dein Freund gibt den Code bei **Freund-Code eingeben** ein und klickt auf **Verbinden**.
4. Sobald „Verbunden“ erscheint, klickt einer von euch auf **Bildschirm teilen**, wählt die gewünschte Auflösung (z.B. 1080p / 4K) & FPS (z.B. 60 / 120 FPS) und wählt den Bildschirm aus.
5. Das Bild erscheint sofort beim Partner in höchster Flüssigkeit!
