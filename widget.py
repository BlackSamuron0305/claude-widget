import sys
import json
import os
from pathlib import Path
from datetime import datetime
import urllib.request
import urllib.error

from PyQt6.QtWidgets import QApplication, QMainWindow, QWidget, QVBoxLayout, QLabel
from PyQt6.QtCore import Qt, QTimer, QSize
from PyQt6.QtGui import QFont, QColor

class ClaudeQuotaWidget(QMainWindow):
    def __init__(self):
        super().__init__()
        self.credentials_path = Path.home() / '.claude' / '.credentials.json'
        self.oauth_token = None
        self.quota_data = {}
        self.connection_error = False
        self.setup_window()
        self.load_oauth_credentials()
        self.setup_ui()
        self.setup_timer()
        self.fetch_quota_data()

    def setup_window(self):
        self.setWindowTitle("Claude")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(300, 240)
        self.setWindowOpacity(0.90)

        screen = QApplication.primaryScreen()
        screen_geo = screen.geometry()
        self.move(screen_geo.width() - 330, screen_geo.height() - 280)

    def load_oauth_credentials(self):
        try:
            if self.credentials_path.exists():
                with open(self.credentials_path, 'r') as f:
                    creds = json.load(f)
                    self.oauth_token = creds.get('claudeAiOauth', {}).get('accessToken')
        except Exception as e:
            print(f"Error loading credentials: {e}")

    def setup_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        central.setStyleSheet("""
            QWidget {
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);
                border: 1px solid rgba(100, 200, 255, 0.2);
                border-radius: 16px;
            }
            QLabel { background: transparent; }
        """)

        layout = QVBoxLayout(central)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(16)

        # Header
        header = QLabel("Claude Max")
        header.setFont(QFont("Segoe UI", 14, QFont.Weight.Bold))
        header.setStyleSheet("color: #0ea5e9;")
        layout.addWidget(header)

        # Session Quota
        session_title = QLabel("Session Quota")
        session_title.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        session_title.setStyleSheet("color: #94a3b8; margin-top: 4px;")
        layout.addWidget(session_title)

        self.session_bar = QLabel()
        self.session_bar.setFont(QFont("Courier New", 10))
        self.session_bar.setStyleSheet("color: #06b6d4;")
        layout.addWidget(self.session_bar)

        self.session_text = QLabel()
        self.session_text.setFont(QFont("Segoe UI", 8))
        self.session_text.setStyleSheet("color: #64748b;")
        layout.addWidget(self.session_text)

        # Weekly Quota
        weekly_title = QLabel("Weekly Quota")
        weekly_title.setFont(QFont("Segoe UI", 9, QFont.Weight.Bold))
        weekly_title.setStyleSheet("color: #94a3b8; margin-top: 6px;")
        layout.addWidget(weekly_title)

        self.weekly_bar = QLabel()
        self.weekly_bar.setFont(QFont("Courier New", 10))
        self.weekly_bar.setStyleSheet("color: #10b981;")
        layout.addWidget(self.weekly_bar)

        self.weekly_text = QLabel()
        self.weekly_text.setFont(QFont("Segoe UI", 8))
        self.weekly_text.setStyleSheet("color: #64748b;")
        layout.addWidget(self.weekly_text)

        layout.addStretch()

        # Status
        self.status = QLabel("Syncing...")
        self.status.setFont(QFont("Segoe UI", 7))
        self.status.setStyleSheet("color: #475569; text-align: center;")
        self.status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status)

    def fetch_quota_data(self):
        if not self.oauth_token:
            self.show_error()
            return

        try:
            req = urllib.request.Request(
                'https://api.anthropic.com/beta/usage',
                headers={
                    'x-api-key': self.oauth_token,
                    'anthropic-beta': 'usage-2024-06-01'
                }
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                data = json.loads(response.read())
                self.quota_data = data.get('usage', {})
                self.connection_error = False
                self.update_display()
        except urllib.error.URLError:
            self.connection_error = True
            self.hide_widget()
        except Exception as e:
            self.connection_error = True
            self.hide_widget()

    def update_display(self):
        if self.connection_error or not self.quota_data:
            return

        try:
            # Session quota
            session_used = self.quota_data.get('session_tokens', {}).get('used_tokens', 0)
            session_limit = self.quota_data.get('session_tokens', {}).get('token_limit', 100000)
            session_reset = self.quota_data.get('session_tokens', {}).get('reset_time_iso', '')
            session_pct = int((session_used / session_limit * 100)) if session_limit > 0 else 0

            # Weekly quota
            weekly_used = self.quota_data.get('weekly_tokens', {}).get('used_tokens', 0)
            weekly_limit = self.quota_data.get('weekly_tokens', {}).get('token_limit', 1000000)
            weekly_reset = self.quota_data.get('weekly_tokens', {}).get('reset_time_iso', '')
            weekly_pct = int((weekly_used / weekly_limit * 100)) if weekly_limit > 0 else 0

            # Draw progress bars
            bar_width = 20
            session_filled = int(bar_width * session_pct / 100)
            session_bar = '█' * session_filled + '░' * (bar_width - session_filled)
            self.session_bar.setText(f"{session_bar} {session_pct}%")

            weekly_filled = int(bar_width * weekly_pct / 100)
            weekly_bar = '█' * weekly_filled + '░' * (bar_width - weekly_filled)
            self.weekly_bar.setText(f"{weekly_bar} {weekly_pct}%")

            # Display info
            session_info = f"{self.format_tokens(session_used)} / {self.format_tokens(session_limit)}"
            if session_reset:
                session_reset_in = self.get_time_until(session_reset)
                session_info += f" • Resets {session_reset_in}"
            self.session_text.setText(session_info)

            weekly_info = f"{self.format_tokens(weekly_used)} / {self.format_tokens(weekly_limit)}"
            if weekly_reset:
                weekly_reset_in = self.get_time_until(weekly_reset)
                weekly_info += f" • Resets {weekly_reset_in}"
            self.weekly_text.setText(weekly_info)

            self.status.setText(f"Updated {datetime.now().strftime('%H:%M:%S')}")
            self.show()

        except Exception as e:
            print(f"Error updating display: {e}")
            self.hide_widget()

    def format_tokens(self, tokens):
        if tokens >= 1000000:
            return f"{tokens / 1000000:.1f}M"
        elif tokens >= 1000:
            return f"{tokens / 1000:.1f}K"
        return str(int(tokens))

    def get_time_until(self, iso_time):
        try:
            reset_time = datetime.fromisoformat(iso_time.replace('Z', '+00:00'))
            now = datetime.now(reset_time.tzinfo)
            delta = reset_time - now
            hours = delta.seconds // 3600
            minutes = (delta.seconds % 3600) // 60
            if delta.days > 0:
                return f"in {delta.days}d {hours}h"
            return f"in {hours}h {minutes}m"
        except:
            return "soon"

    def show_error(self):
        self.status.setText("No credentials found")
        self.hide_widget()

    def hide_widget(self):
        self.hide()

    def setup_timer(self):
        self.timer = QTimer()
        self.timer.timeout.connect(self.fetch_quota_data)
        self.timer.start(30 * 1000)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, event):
        if hasattr(self, 'drag_pos'):
            self.move(event.globalPosition().toPoint() - self.drag_pos)

def setup_autostart():
    startup_dir = Path.home() / 'AppData' / 'Roaming' / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs' / 'Startup'
    widget_path = Path(__file__).resolve()

    startup_script = startup_dir / 'claude-widget.vbs'
    vbs_content = f'''Set objShell = CreateObject("WScript.Shell")
objShell.Run "python ""{widget_path}""", 0, False
'''

    try:
        startup_script.write_text(vbs_content)
        print(f"Autostart configured: {startup_script}")
    except Exception as e:
        print(f"Could not configure autostart: {e}")

if __name__ == '__main__':
    setup_autostart()
    app = QApplication(sys.argv)
    widget = ClaudeQuotaWidget()
    widget.show()
    sys.exit(app.exec())
