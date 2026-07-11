import React, { useState, useEffect } from 'react';
import './App.css';

interface UsageData {
  currentUsage: number;
  monthlyLimit: number;
  remainingQuota: number;
  lastUpdated: string;
  history: { date: string; usage: number }[];
}

const App: React.FC = () => {
  const [usageData, setUsageData] = useState<UsageData>({
    currentUsage: 0,
    monthlyLimit: 1000000,
    remainingQuota: 1000000,
    lastUpdated: new Date().toISOString(),
    history: []
  });

  const [apiKey, setApiKey] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      const hasKey = await (window as any).electronAPI.hasAPIKey();
      if (hasKey) {
        setShowSetup(false);
        const data = await (window as any).electronAPI.getUsageData();
        setUsageData(data);
      } else {
        setShowSetup(true);
      }
      setLoading(false);
    };

    initializeApp();

    const unsubscribe = (window as any).electronAPI.onUsageUpdate((data: UsageData) => {
      setUsageData(data);
    });

    return () => unsubscribe?.();
  }, []);

  const handleSetAPIKey = async () => {
    if (tempApiKey.trim()) {
      await (window as any).electronAPI.saveAPIKey(tempApiKey);
      setApiKey(tempApiKey);
      setTempApiKey('');
      setShowSetup(false);
      const data = await (window as any).electronAPI.getUsageData();
      setUsageData(data);
    }
  };

  const usagePercentage = (usageData.currentUsage / usageData.monthlyLimit) * 100;
  const remainingPercentage = (usageData.remainingQuota / usageData.monthlyLimit) * 100;

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(2) + 'K';
    }
    return num.toString();
  };

  if (loading) {
    return <div className="widget loading">Loading...</div>;
  }

  if (showSetup) {
    return (
      <div className="widget setup-mode">
        <div className="setup-container">
          <h2>Claude Widget</h2>
          <p>Enter your Claude API key to get started</p>
          <input
            type="password"
            placeholder="sk-..."
            value={tempApiKey}
            onChange={(e) => setTempApiKey(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSetAPIKey()}
            className="setup-input"
          />
          <button onClick={handleSetAPIKey} className="setup-button">
            Connect
          </button>
          <p className="setup-hint">
            Get your API key from <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="widget">
      <div className="widget-header">
        <h3>Claude Usage</h3>
        <div className="last-updated">
          {new Date(usageData.lastUpdated).toLocaleTimeString()}
        </div>
      </div>

      <div className="usage-section">
        <div className="usage-item">
          <div className="usage-label">
            <span className="label-text">Current Usage</span>
            <span className="usage-number">{formatNumber(usageData.currentUsage)}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.min(usagePercentage, 100)}%` }}>
            </div>
          </div>
          <div className="progress-info">
            <span>{usagePercentage.toFixed(1)}%</span>
            <span>{formatNumber(usageData.monthlyLimit)}</span>
          </div>
        </div>

        <div className="usage-item">
          <div className="usage-label">
            <span className="label-text">Remaining Quota</span>
            <span className="usage-number remaining">{formatNumber(usageData.remainingQuota)}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill remaining" style={{ width: `${Math.min(remainingPercentage, 100)}%` }}>
            </div>
          </div>
          <div className="progress-info">
            <span>{remainingPercentage.toFixed(1)}%</span>
            <span>{formatNumber(usageData.monthlyLimit)}</span>
          </div>
        </div>
      </div>

      {usageData.history.length > 0 && (
        <div className="history-section">
          <h4>Usage History (Last 30 days)</h4>
          <div className="sparkline">
            <svg viewBox="0 0 300 60" preserveAspectRatio="none">
              {usageData.history.map((point, i) => {
                const x = (i / (usageData.history.length - 1)) * 300 || 0;
                const y = 60 - (point.usage / usageData.monthlyLimit) * 60;
                return i === 0 ? <M key={i} x={x} y={y} /> : <L key={i} x={x} y={y} />;
              })}
            </svg>
          </div>
        </div>
      )}

      <div className="widget-footer">
        <button
          onClick={() => {
            setShowSetup(true);
            setTempApiKey('');
          }}
          className="footer-button"
        >
          Change Key
        </button>
        <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="footer-link">
          Dashboard
        </a>
      </div>
    </div>
  );
};

const M = ({ x, y }: { x: number; y: number }) => (
  <path d={`M ${x} ${y}`} stroke="none" />
);

const L = ({ x, y }: { x: number; y: number }) => (
  <line x1="0" y1="0" x2={x} y2={y} stroke="#60a5fa" strokeWidth="1" />
);

export default App;
