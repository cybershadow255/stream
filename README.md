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

1. **App starten**:
   - Starte StreamShare auf beiden Computern.
2. **Raum-Verbindung & Freund speichern**:
   - Kopiere deinen eigenen **Raum-Code** (z. B. `stream-982341`) und sende ihn deinem Freund.
   - Dein Freund gibt den Code ein, klickt auf **Verbinden** oder auf **⭐ Speichern**, um deinen Code dauerhaft in seiner Freundesliste zu hinterlegen!
3. **Bildschirm übertragen**:
   - Klicke auf **Bildschirm teilen**.
   - Wähle die gewünschte Qualität: **1080p Full HD**, **1440p 2K** oder **2160p 4K** sowie die FPS (**60 FPS** oder **120 FPS Ultra Smooth**).
   - Wähle das gewünschte Fenster oder den gesamten Bildschirm aus.
4. **Genießen**:
   - Das Übertragungsbild wird direkt ohne Einschränkungen oder Abos P2P in voller Qualität übertragen.
