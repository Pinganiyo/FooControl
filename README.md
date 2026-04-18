# 🎵 FooControl

**FooControl** is a premium, high-performance remote controller for **foobar2000**, built to provide a modern, high-visual-impact experience for your music collection. Leveraging the power of the **Beefweb API**, it offers real-time synchronization, adaptive aesthetics, and seamless library navigation in a sleek, glassmorphic interface.

---

## ✨ Features

- 💎 **Premium Glassmorphism Design**: A stunning, modern UI built with focus on depth, transparency, and vibrant colors.
- 🎨 **Adaptive Color Engine**: The interface dynamically shifts its accent colors based on the currently playing album artwork.
- 🔄 **Real-time Sync**: Utilizes Server-Sent Events (SSE) and smart polling fallbacks to ensure your player state is always in sync.
- 📱 **Native Mobile Support**: Fully packaged for Android using Capacitor, complete with status bar integration and native performance.
- 📁 **Universal Library Browser**: Browse by **Artists**, **Albums**, or explore your filesystem directly via the **Folder Browser**.
- 🔍 **Auto-Discovery**: Built-in network scanner to automatically find your foobar2000 server on the local Wi-Fi.
- ➕ **Queue Management**: Advanced playlist controls, including "Play Next", "Add to Queue", and shuffled album playback.

---

## 🚀 Technologies

### Frontend
- **React 19**: Modern component architecture.
- **Vite**: Ultra-fast build tool and development server.
- **Vanilla CSS**: Custom-built design system with modern CSS variables and animations.

### Mobile & Core
- **Capacitor 8**: Native bridge for Android integration.
- **Beefweb API**: The backbone for communicating with foobar2000.
- **SSE (Server-Sent Events)**: For low-latency updates.

---

## 🛠️ Requirements & Setup

To use FooControl, you need to set up the backend on your PC.

### 1. Install foobar2000
Download and install [foobar2000](https://www.foobar2000.org/) on your Windows machine.

### 2. Install Beefweb Remote Control Plugin
1. Download the **Beefweb Remote Control** (foo_beefweb) component from [github.com/hyper-pwn/beefweb](https://github.com/hyper-pwn/beefweb).
2. Install it in foobar2000 (File -> Preferences -> Components -> Install...).

### 3. Configure Beefweb (CRITICAL)
For FooControl to work correctly, you must configure the following in foobar2000 (**Preferences -> Tools -> Beefweb Remote Control**):

- **Enable Remote Connections**: Ensure the server is listening.
- **Allow File System Access**: **REQUIRED** for the Folder Browser and deep library syncing to work.
- **Input Sharing Routes**: In the settings, you must add the **local paths** of your music folders (e.g., `D:\Music`) that you want to share. This allows the app to browser folders and fetch artwork efficiently.

### 4. Network Setup
- Ensure your PC and your mobile device are on the **same Wi-Fi network**.
- By default, Beefweb uses port **8880**. Ensure this port is not blocked by your Windows Firewall.

---

## 📦 Installation & Development

If you want to build or run the project yourself:

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build the project
npm run build

# Sync with Android (requires Android Studio)
npx cap sync android
npx cap open android
```

---

## 📱 App Configuration
Once the app is running on your device:
1. Navigate to **Menu & Settings**.
2. Tap **Auto-Discover Server** or manually enter your PC's IP address (e.g., `http://192.168.1.50:8880`).
3. Once connected, the status indicator will turn green.
4. Run a **Library Sync** (if applicable) to populate your Artist and Album views.

---

## 📝 License
Built with ❤️ for music lovers. Designed for local network use.
