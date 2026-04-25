# U Cluj Analytics Desktop App

Desktop application for viewing U Cluj football team analytics and player statistics.

## Project Structure

```
apps/desktop/
├── src/
│   ├── main.ts              # Electron main process
│   ├── api/
│   │   └── client.ts        # API client for backend communication
│   ├── types/
│   │   └── api.ts           # TypeScript type definitions
│   └── renderer/
│       ├── index.html       # Main UI
│       ├── styles.css       # Styling
│       └── app.js           # Frontend application logic
├── dist/                    # Compiled TypeScript output
├── package.json
├── tsconfig.json
└── README.md
```

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Backend API running on http://localhost:8000

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the TypeScript code:
   ```bash
   npm run build
   ```

## Running the App

**IMPORTANT:** Make sure your backend API is running first:
```bash
cd apps/api
run.bat
```

The API should be running on http://localhost:8000

### Quick Start (Windows)
```bash
cd apps/desktop
run.bat
```

### Development Mode
```bash
npm run dev
```

This will open the app with developer tools enabled.

### Production Mode
```bash
npm start
```

### Watch Mode (Auto-rebuild on changes)
```bash
npm run watch
```

Then in another terminal:
```bash
npm run dev
```

## Building for Distribution

To create distributable packages:

```bash
npm run package
```

This will create installers in the `build/` directory for your platform.

## Features

### Team Overview
- Match record (wins, draws, losses)
- Top 3 team strengths
- Top 3 team weaknesses
- 12-dimension tactical profile with scores

### Players
- Complete squad list from U Cluj analysis
- Player statistics (overall rating, games played, goals/assists per 90, minutes)
- Search functionality by name or position

### Match Statistics
- Total games played
- Win/draw/loss record
- Goals for and against

## API Configuration

The app connects to the backend API at `http://localhost:8000/api/v1` by default.

To change the API endpoint, edit [src/api/client.ts](src/api/client.ts):

```typescript
private config: APIConfig = {
  baseURL: 'http://localhost:8000/api/v1',  // Change this
  timeout: 10000,
};
```

## Development

The app is built with:
- **Electron** - Desktop framework
- **TypeScript** - Type safety for main process
- **Vanilla JavaScript** - Frontend logic
- **Axios** - HTTP client for API calls

## Troubleshooting

**App shows "Disconnected" status:**
- Ensure the backend API is running on port 8000
- Start the API: `cd apps/api && run.bat`

**Build errors:**
- Delete `node_modules` and `dist` folders
- Run `npm install` again
- Run `npm run build`

**TypeScript errors:**
- Make sure you have TypeScript installed: `npm install -g typescript`
- Check `tsconfig.json` configuration
