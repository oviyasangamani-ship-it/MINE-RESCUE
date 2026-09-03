# Mining Rescue Rover: Offline Tactical Telemetry & Decision-Support Console

A professional, offline industrial SCADA web dashboard engineered for physical **Mining Rescue Rovers** in underground hazardous operations. Built for hackathon demonstrations and real-world deployment with zero cloud dependencies.

---

## ⚡ Key Highlights & Human-Designed SCADA Aesthetics

- **Control-Room SCADA Aesthetics**: Utilitarian dark charcoal/graphite palette (`#0c0f13`, `#13181f`, `#182029`), safety amber accents (`#f59e0b`), 1px hairline technical borders, left-stripe alert tags (Datadog/Grafana style), monospace numeric readouts (`JetBrains Mono`), and CAD grid overlays.
- **Strict Hardware Ground Truth**: Zero fabricated/random numbers on Page 1. When physical hardware is disconnected, all parameters display `—` and an honest `Awaiting Data` state. Automatic stale packet detection after 3.5s of silence.
- **Web Serial API & Wi-Fi Support**: Connects directly to Arduino / ESP32 over USB serial (`navigator.serial`) at 115200 / 9600 baud, or over local Wi-Fi via WebSocket (`ws://192.168.4.1:81`) or HTTP polling.
- **Live In-Browser Person Detection**: Real-time human candidate detection on ESP32-CAM or PC Webcam streams using TensorFlow.js COCO-SSD / offline edge detector, drawing tactical bounding boxes with confidence scores and alert sound.
- **Multi-Criteria Hazard & Readiness Index**: Evaluates atmospheric toxicity, water ingress, thermal stress, obstacle clearance, and telemetry link latency into an operational readiness score (0–100%) with a *"Why this score?"* granular factor breakdown.
- **2D Underground Mine Simulator (Page 2)**: Vector SVG mine map with handcrafted tunnels, moving rover navigation, hazard pockets (gas, flooding, rockfall), survivor beacon, and 8 emergency drill scenarios.

---

## 🚀 Quick Start (100% Offline)

To run the dashboard locally:

### Option A: Using Python local server (recommended for Web Serial & WebCam permissions)
```bash
cd "MINE RESCUE"
python3 -m http.server 8000
```
Open **`http://localhost:8000`** in Google Chrome, Edge, or Brave.

### Option B: Using Node / npx
```bash
npx serve .
```

---

## 🔌 Hardware Integration & Arduino Firmware

### 1. Serial Telemetry Packet Formats
The dashboard includes an auto-detecting configurable parser supporting 3 standard formats:

#### Format A: Standard Comma-Separated Values (CSV - Default)
```
gas,co,co2,temp,humidity,water,obstacle,rover_status
```
*Example line sent over serial:*
```text
120,14,480,26.4,62,0,95,EXPLORING
```

#### Format B: Key-Value Pairs
```text
GAS:120,CO:14,CO2:480,TEMP:26.4,HUM:62,WATER:0,DIST:95,STATUS:EXPLORING
```

#### Format C: Standard JSON Line
```json
{"gas":120, "co":14, "co2":480, "temp":26.4, "humidity":62, "water":0, "obstacle":95, "rover_status":"EXPLORING"}
```

### 2. Sample Arduino / ESP32 Sketch
```cpp
// Mining Rescue Rover - Telemetry Broadcast Firmware
#define MQ2_PIN A0
#define MQ7_PIN A1
#define WATER_PIN A2
#define TRIG_PIN 9
#define ECHO_PIN 10

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  // Read atmospheric sensors
  int gasValue = analogRead(MQ2_PIN);     // Gas ppm proxy
  int coValue = analogRead(MQ7_PIN);      // CO ppm proxy
  int waterValue = analogRead(WATER_PIN);  // Water level (mm proxy)
  
  // Ultrasonic distance measurement
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 25000);
  int distanceCm = (duration > 0) ? (duration * 0.034 / 2) : 200;

  // Temperature / Humidity (or DHT reading)
  float tempC = 24.5;
  float humPercent = 58.0;
  int co2Ppm = 450;

  // Output standard CSV packet:
  // gas,co,co2,temp,humidity,water,obstacle,rover_status
  Serial.print(gasValue);
  Serial.print(",");
  Serial.print(coValue);
  Serial.print(",");
  Serial.print(co2Ppm);
  Serial.print(",");
  Serial.print(tempC, 1);
  Serial.print(",");
  Serial.print(humPercent, 0);
  Serial.print(",");
  Serial.print(waterValue);
  Serial.print(",");
  Serial.print(distanceCm);
  Serial.println(",EXPLORING");

  delay(500); // 2 Hz telemetry stream
}
```

---

## ⌨️ Tactical Keyboard Shortcuts

| Key | Action |
|---|---|
| **`1`** | Switch to **Page 1: Live Rescue Monitor** |
| **`2`** | Switch to **Page 2: Rescue Simulator** |
| **`C`** | Open **Hardware Connection Modal** (Serial / Wi-Fi) |
| **`G`** | Open **Time-Series Graph Waveform Drawer** |
| **`T`** | Open **Reference Thresholds Configuration** |
| **`M`** | Toggle **Tactical Audio Mute / Unmute** |
| **`D`** | Toggle **Demo Bench Test Mode** |
| **`Esc`** | Close any open modal or graph drawer |

---

## 🛡️ Sensor Metric Mappings & Reference Guidelines

| Metric | Sensor Scope | Warning Threshold | Critical Threshold | Guidance |
|---|---|---|---|---|
| **Toxic & Flammable Gas** | CH₄, LPG, Smoke (MQ-2 scope) | `> 250 ppm` | `> 500 ppm` | Methane explosion risk. Deploy forced ventilation. |
| **Carbon Monoxide (CO)** | CO combustion byproduct (MQ-7 scope) | `> 35 ppm` | `> 100 ppm` | Lethal asphyxiant. SCBA breathing gear required. |
| **CO₂ Concentration** | Atmospheric displacement | `> 1,000 ppm` | `> 2,500 ppm` | Air staleness & oxygen deficiency indicator. |
| **Ambient Temperature** | Subterranean thermal sensor | `> 38.0 °C` | `> 50.0 °C` | Subsurface fire / thermal heat stress. |
| **Relative Humidity** | Moisture condensation | `> 85 %RH` | `> 95 %RH` | High humidity degrades breathing apparatus stamina. |
| **Water / Flood Level** | Inundation depth sensor | `> 25 mm` | `> 65 mm` | Ground impassable for rover tracks; water ingress. |
| **Obstacle Distance** | Ultrasonic LiDAR clearance | `< 35 cm` | `< 15 cm` | Tunnel blockage / rockfall collision warning. |

---

## 📁 File Structure

```
MINE RESCUE/
├── index.html               # Main single-page application (Live Monitor + Simulator)
├── css/
│   ├── styles.css           # Core SCADA layout, panels, cards, animations
│   ├── industrial-theme.css # Palette, status tags, hairline borders, custom crosshair
│   └── responsive.css       # Fluid responsive layouts for laptops and control monitors
├── js/
│   ├── app.js               # Main bootstrap, lifecycle, and telemetry orchestrator
│   ├── hardware.js          # Web Serial API & WebSocket connection manager + parser
│   ├── telemetry.js         # Telemetry store, rolling history buffer, persistent event log
│   ├── analytics.js         # Multi-criteria hazard matrix & readiness scoring engine
│   ├── vision.js            # Video stream, WebCam fallback, client-side person detection
│   ├── simulator.js         # 2D SVG mine map, rover pathfinding, crisis scenarios
│   ├── ui.js                # Canvas time-series chart renderer, modals, event timeline
│   └── audio.js             # Web Audio API tactical sound synthesis (procedural audio)
├── vendor/
│   ├── icons.js             # Industrial SVG icon definitions
│   └── tfjs-coco-loader.js  # Edge vision detector & COCO-SSD loader
└── README.md                # Documentation, hardware guide, and wiring specs
```
