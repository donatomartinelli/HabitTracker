# ⬛ Minimal Desktop Habit Tracker

A brutalist, Notion-inspired, ultra-lightweight desktop habit tracker built with **Vanilla JS** and **Tauri v2**. 
Designed to run perfectly as a borderless, floating desktop widget on Windows, consuming almost zero RAM.

## ✨ Features

* **Borderless Desktop Widget:** Runs as a clean, frameless window. Draggable from the top area, with a custom native close button.
* **Frosted Glass UI:** Subtle 92% opacity dark mode background that elegantly blends with your desktop wallpaper.
* **GitHub-Style Consistency Graph:** Visually track your daily habits over time, just like GitHub contributions.
* **Intelligent Pomodoro Timer:** Click "Focus" on any task to start a built-in timer. It auto-checks the habit instance upon completion and asks if you want to start the next one.
* **Specific Colored Events:** Add one-off events (like "Pay Bills") with custom colors that show up as colored dots on the calendar.
* **Local First & Private:** Zero tracking, zero cloud. All data is saved locally on your machine via Tauri's persistent secure storage.
* **Blazing Fast:** Powered by Rust and Tauri, meaning it avoids the heavy RAM usage typical of Electron apps.

## 🛠️ Tech Stack

* **Frontend:** Pure HTML, CSS (Vanilla), JavaScript
* **Backend/Wrapper:** [Tauri 2.0](https://tauri.app/) (Rust)
* **OS Target:** Windows 10/11