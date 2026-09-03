# Mining Rescue Rover: Offline Tactical Telemetry & Decision-Support Console (v4)

A professional, offline industrial SCADA web dashboard engineered for physical **Mining Rescue Rovers** in underground hazardous operations. Built for hackathon demonstrations and real-world deployment with zero cloud dependencies.

---

## ⚡ Key Highlights & Specifications

- **Header Updates**:
  - Title: **"Mining Rescue Rover"** only.
  - Removed "Tactical Telemetry Console", "Demo Bench", switch controls, "D" shortcuts, and "Terminal" buttons completely from Page 1.
- **High-Contrast Visibly Lighter Panels & Cards**:
  - Dark graphite/navy page base (`#080c12`).
  - **Visibly lighter cards and panels** (`#222e40`, `#252b3b`, `#1e2f40`, `#1a3045`, `#24221e`, `#232d3b`) with crisp 1px hairline borders (`#3b4e6b`) that immediately stand out from the page background.
- **Large, High-Legibility Typography**:
  - Main title: **24px bold monospace**
  - Section headings: **19px bold**
  - Sensor titles: **18px bold**
  - Sensor values: **34px bold monospace** (`JetBrains Mono`)
  - Status labels, buttons, and metrics: **14px–16px bold**
- **Consolidated 6-Card Sensor Matrix**:
  1. **Toxic Gases** (Combines Combustible Gas, Carbon Monoxide, and CO₂ with inline sub-readouts).
  2. **Temperature** (°C)
  3. **Humidity** (%RH)
  4. **Water Level** (Renamed from Water / Flood Sensor).
  5. **Obstacle Status** (cm)
  6. **Rover Status** (Monitors real IMU accelerometer **Linear Speed** in m/s and **Tilt Angle** in degrees `°`).
- **Rover Status IMU Threshold Warnings**:
  - Monitors whether Linear Speed or Tilt Angle exceeds safety limits.
  - Shows a **small yellow warning icon** in the **bottom-right corner of the Rover Status card**.
  - Displays a **compact warning notification popup in the bottom-right corner of the webpage** (e.g., *"Warning: Rover accelerating too fast"*, *"Warning: Abnormal rover tilt detected"*).
  - Logs warnings to the Event Timeline.
  - "View Graph" button opens a dual-series waveform tracking Linear Speed (Amber) and Tilt Angle (Cyan) over time.
- **Single Switchable Video Panel**:
  - Clean dropdown switching between **ROVER CAM (ESP32-CAM)** and **PC CAM (Laptop Webcam)**.
  - Only one video feed displayed at a time; PC CAM uses `getUserMedia()` upon explicit user selection.
  - Client-side Person Detection with TensorFlow.js / edge detector runs on both sources.
- **Hazard Assessment**:
  - Removed "AWAITING TELEMETRY" badge from header.
  - Large hazard status, concise hazard item chips, recommended action, and ⓘ Info Matrix modal.
- **Decision Support & Terminal**:
  - Completely removed from Page 1 to ensure a clean, focused emergency dashboard.
- **Strict Graph Visibility Rule**:
  - Zero charts or empty graph placeholders on initial page load.
  - Interactive waveforms appear *only* upon clicking **"View Graph"** (`[G]`) or any sensor card.
- **Page 2: Mining Rescue Simulator**:
  - 2D SVG underground mine map, moving rover pathfinding, survivor beacon in Refuge Bay, 8 crisis drill presets, and simulation mission log.

---

## 🚀 Quick Start (100% Offline)

```bash
cd "MINE RESCUE"
python3 -m http.server 8000
```
Open **`http://localhost:8000`** in Chrome, Edge, or Brave.

---

## ⌨️ Tactical Keyboard Shortcuts

| Key | Action |
|---|---|
| **`1`** | **Page 1: Live Rescue Monitor** |
| **`2`** | **Page 2: Rescue Simulator** |
| **`C`** | **Connect Device** (Toggle Web Serial / Wi-Fi) |
| **`G`** | **View Graph** (Time-series waveform) |
| **`T`** | **Thresholds Config** |
| **`M`** | **Mute / Unmute Audio** |
| **`Esc`** | Close any open modal or graph drawer |
