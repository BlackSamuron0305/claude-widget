# Claude Widget

A beautiful, modern floating widget for Windows that displays your Claude API token usage in real-time. Built with Electron and React, featuring a sleek glassmorphism design.

## Features

✨ **Modern Glassmorphism UI** - Sleek, frosted glass design with dark theme
📊 **Real-time Token Tracking** - Current usage and monthly limit visualization
📈 **Usage History** - Sparkline chart showing your token usage over the last 30 days
🔄 **Auto-update** - Updates every 5 minutes automatically
🖥️ **Always On Top** - Floating window stays above other applications
🖱️ **System Tray** - Minimize to system tray for quick access
🔐 **Secure API Key Storage** - Your API key is stored locally and never shared

## Installation

### Prerequisites
- Windows 10 or later
- Node.js 16+ (for development)
- npm or yarn

### Quick Start

1. Clone the repository:
```bash
git clone https://github.com/BlackSamuron0305/claude-widget.git
cd claude-widget
```

2. Install dependencies:
```bash
npm install
```

3. Get your Claude API key from [console.anthropic.com](https://console.anthropic.com)

4. Run the widget:
```bash
npm start
```

## Development

### Build for development
```bash
npm run dev
```

### Build for production
```bash
npm run build
```

### Package as executable
```bash
npm run dist
```

## Usage

1. Launch the widget
2. Enter your Claude API key (obtained from [console.anthropic.com](https://console.anthropic.com))
3. The widget will connect to your Claude account and start tracking usage
4. Usage updates automatically every 5 minutes
5. Click the system tray icon to show/hide the widget

## Features Explained

### Current Usage Bar
Shows how many tokens you've used this month vs. your monthly limit
- Visual progress bar with percentage
- Formatted number display (K = thousands, M = millions)

### Remaining Quota
Displays how many tokens you have left in your monthly quota
- Separate progress bar for remaining tokens
- Percentage of quota remaining

### Usage History
A sparkline chart showing your token consumption over the last 30 days
- Helps you track trends and identify usage patterns

## Architecture

- **Electron** - Desktop application framework
- **React** - UI component library
- **TypeScript** - Type-safe development
- **Claude API** - Real-time usage data

## Security

- API key is stored locally in your user data directory
- Communication with Claude API uses HTTPS
- Context isolation enabled for security
- No telemetry or external tracking

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!

## Support

For issues or questions, please visit the [GitHub Issues](https://github.com/BlackSamuron0305/claude-widget/issues) page.
