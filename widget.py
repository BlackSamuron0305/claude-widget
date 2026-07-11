import sys
import json
import os
from pathlib import Path
from datetime import datetime, timedelta
import urllib.request
import urllib.error

from PyQt6.QtWidgets import QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont, QColor

class ClaudeQuotaWidget(QMainWindow):
    def __init__(self):
        super().__init__()
        self.credentials_path = Path.home() / '.claude' / '.credentials.json'
        self.oauth_token = None
        self.quota_data = {}
        self.setup_window()
        self.load_oauth_credentials()
        self.setup_ui()
        self.setup_timer()

    def setup_window(self):
        self.setWindowTitle("Claude Quota")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(320, 380)
        self.setWindowOpacity(0.87)

        screen = QApplication.primaryScreen()
        screen_geo = screen.geometry()
        self.move(screen_geo.width() - 340, screen_geo.height() - 420)

    def load_oauth_credentials(self):
        try:
            if self.credentials_path.exists():
                with open(self.credentials_path, 'r') as f:
                    creds = json.load(f)
                    self.oauth_token = creds.get('claudeAiOauth', {}).get('accessToken')
                    if self.oauth_token:
                        print(f"✓ OAuth token loaded successfully")
        except Exception as e:
            print(f"Could not load credentials: {e}")

    def fetch_quota_data(self):
        if not self.oauth_token:
            return

        try:
            req = urllib.request.Request(
                'https://api.anthropic.com/beta/usage',
                headers={
                    'x-api-key': self.oauth_token,
                    'anthropic-beta': 'usage-2024-06-01'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read())
                self.quota_data = data.get('usage', {})
                print(f"Quota data fetched: {self.quota_data}")
                self.update_display()
        except urllib.error.HTTPError as e:
            print(f"API Error {e.code}: {e.read().decode()}")
        except Exception as e:
            print(f"Error fetching quota: {e}")

    def setup_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        central.setStyleSheet("""
            QWidget {
                background: rgba(17, 24, 39, 0.92);
                border: 1px solid rgba(75, 85, 99, 0.3);
                border-radius: 14px;
            }
            QLabel { background: transparent; }
        """)

        layout = QVBoxLayout(central)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(14)

        # Header
        header = QHBoxLayout()
        title = QLabel("Claude")
        title.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        title.setStyleSheet("color: #60a5fa;")
        header.addWidget(title)

        self.status = QLabel("Max")
        self.status.setFont(QFont("Segoe UI", 10))
        self.status.setStyleSheet("color: #a78bfa;")
        header.addStretch()
        header.addWidget(self.status)
        layout.addLayout(header)

        # Session Quota
        self.add_quota_section(layout, "Session", "session_tokens")
        self.add_quota_section(layout, "Weekly", "weekly_tokens")

        # Token types breakdown
        layout.addSpacing(8)
        types_label = QLabel("Token Limits")
        types_label.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        types_label.setStyleSheet("color: #9ca3af; margin-top: 6px;")
        layout.addWidget(types_label)

        for model in ["claude_3_opus_tokens", "claude_3_sonnet_tokens", "claude_3_haiku_tokens"]:
            self.add_token_limit(layout, model)

        layout.addStretch()

        self.time_label = QLabel()
        self.time_label.setFont(QFont("Segoe UI", 8))
        self.time_label.setStyleSheet("color: #6b7280; text-align: center;")
        layout.addWidget(self.time_label)

    def add_quota_section(self, layout, label_text, key):
        container = QVBoxLayout()
        container.setSpacing(6)

        label = QLabel(label_text)
        label.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        label.setStyleSheet("color: #d1d5db;")
        container.addWidget(label)

        bar_layout = QHBoxLayout()
        bar_layout.setSpacing(8)

        # Progress visualization
        bar_label = QLabel("████░░░░░░")
        bar_label.setFont(QFont("Courier New", 9))
        bar_label.setStyleSheet("color: #60a5fa;")
        bar_layout.addWidget(bar_label)

        pct = QLabel("42%")
        pct.setFont(QFont("Segoe UI", 9))
        pct.setStyleSheet("color: #9ca3af;")
        bar_layout.addWidget(pct)
        container.addLayout(bar_layout)

        reset_label = QLabel("Resets in 4d 12h")
        reset_label.setFont(QFont("Segoe UI", 8))
        reset_label.setStyleSheet("color: #6b7280;")
        container.addWidget(reset_label)

        layout.addLayout(container)

    def add_token_limit(self, layout, model_key):
        row = QHBoxLayout()
        row.setSpacing(12)

        model_name = model_key.replace("claude_3_", "").replace("_tokens", "").capitalize()
        name = QLabel(model_name)
        name.setFont(QFont("Segoe UI", 8))
        name.setStyleSheet("color: #d1d5db; min-width: 50px;")
        row.addWidget(name)

        usage = QLabel("1.2M / 2M")
        usage.setFont(QFont("Segoe UI", 8))
        usage.setStyleSheet("color: #9ca3af; text-align: right;")
        row.addStretch()
        row.addWidget(usage)

        layout.addLayout(row)

    def update_display(self):
        if self.quota_data:
            self.time_label.setText(f"Updated {datetime.now().strftime('%H:%M:%S')}")

    def setup_timer(self):
        self.timer = QTimer()
        self.timer.timeout.connect(self.fetch_quota_data)
        self.timer.start(30 * 1000)  # Update every 30 seconds
        self.fetch_quota_data()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, event):
        if hasattr(self, 'drag_pos'):
            self.move(event.globalPosition().toPoint() - self.drag_pos)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    widget = ClaudeQuotaWidget()
    widget.show()
    sys.exit(app.exec())
