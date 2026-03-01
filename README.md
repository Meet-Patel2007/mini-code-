# CodeLens — AI-Powered Code Error Analyzer 🔍🚀

CodeLens is a premium, single-page web application designed to help developers and students find, understand, and fix bugs in their code. Powered by **Google Gemini AI**, it goes beyond simple syntax checking by explaining the logic and suggesting human-readable solutions.

![CodeLens Preview](https://i.imgur.com/your-image-placeholder.png)

## ✨ Key Features

- 🔴 **Instant Error Detection**: Spots syntax, logical, and runtime errors across 10+ languages (Python, C, C++, JS, etc.).
- 📍 **Smart Highlighting**: Automatically highlights the exact line containing the error with a pulsing red glow.
- 💬 **Plain English Explanations**: No complex jargon. Errors are explained in simple, beginner-friendly language.
- 🛠️ **Step-by-Step Solutions**: Provides a clear path to fix each bug.
- 🧠 **C/DSA Deep Trace**: Specifically optimized for complex Data Structures and Algorithms (C/C++ pointers, memory, etc.).
- ✅ **Execution Simulation**: For correct code, it predicts the output and explains the underlying logic.
- 🎨 **Premium UI**: Sleek dark-mode aesthetic with glassmorphism and smooth animations.

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3 (Vanilla + Modern Tokens), JavaScript (ES6+)
- **Brain**: Google Gemini AI (v1beta API)
- **Design**: "JetBrains Mono" typography, HSL-based dark theme, responsive layout

## 🚀 Getting Started

### 1. Prerequisites
You only need a modern web browser. No server setup is required (though you can use one).

### 2. Get your Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com).
2. Click **"Get API key"** in the sidebar.
3. Create a new API key in a new project.
4. *Recommendation: Ensure your Google Cloud account has billing enabled (even for the free tier) to avoid rate limits.*

### 3. Usage
1. Open `index.html` in your browser.
2. Enter your API key when prompted (stored securely in your browser's local storage).
3. Select your programming language (e.g., C or Python).
4. Paste your code into the editor.
5. Click **⚡ Analyze Code**.

## 🏗️ Project Structure

```text
1Hackathon/
├── index.html        # Main structure and UI components
├── style.css         # Visual styles, animations, and dark theme
├── app.js            # Gemini API integration and editor logic
└── README.md         # Documentation
```

## 🤝 Troubleshooting

- **API Key Problem**: If you see a "Something went wrong" message, check that your API key is valid and that you have enabled the "Generative Language API" in your Google Cloud console.
- **Overlapping Code**: If highlights appear correctly, the app clears them as soon as you start typing to keep the view clean.

---
Built with ❤️ for the 1Hackathon.
