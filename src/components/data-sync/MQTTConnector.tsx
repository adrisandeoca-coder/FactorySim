import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader } from '../common/Card';
import { Button } from '../common/Button';
import { useAppStore } from '../../stores/appStore';
import type { MQTTMessageData, MQTTStatusResult } from '../../types';
import { Wifi, WifiOff, Send, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface MQTTConnectionForm {
  broker: string;
  port: number;
  username: string;
  password: string;
  clientId: string;
  topics: string;
}

const DEFAULT_FORM: MQTTConnectionForm = {
  broker: 'localhost',
  port: 1883,
  username: '',
  password: '',
  clientId: 'factorysim',
  topics: 'factory/#',
};

export function MQTTConnector() {
  const { addToast } = useAppStore();
  const [form, setForm] = useState<MQTTConnectionForm>(() => {
    try {
      const saved = localStorage.getItem('factorysim-mqtt-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_FORM, ...parsed };
      }
    } catch { /* ignore */ }
    return DEFAULT_FORM;
  });

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<MQTTMessageData[]>([]);
  const [latestByTopic, setLatestByTopic] = useState<Record<string, MQTTMessageData>>({});
  const [totalReceived, setTotalReceived] = useState(0);
  const [showSettings, setShowSettings] = useState(true);
  const [publishTopic, setPublishTopic] = useState('');
  const [publishPayload, setPublishPayload] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [additionalTopics, setAdditionalTopics] = useState('');

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const persistConfig = useCallback((config: MQTTConnectionForm) => {
    try {
      const { password, ...safe } = config;
      localStorage.setItem('factorysim-mqtt-config', JSON.stringify(safe));
    } catch { /* ignore */ }
  }, []);

  const updateField = <K extends keyof MQTTConnectionForm>(key: K, value: MQTTConnectionForm[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      persistConfig(next);
      return next;
    });
  };

  const fetchStatus = useCallback(async () => {
    const api = window.factorySim?.mqtt;
    if (!api) return;

    try {
      const status: MQTTStatusResult = await api.status({ limit: 100 });
      setConnected(status.connected);
      if (status.messages && status.messages.length > 0) {
        setMessages(prev => {
          const combined = [...prev, ...status.messages];
          // Keep last 500 messages
          return combined.slice(-500);
        });
        setTotalReceived(prev => prev + status.messages.length);
      }
      if (status.latestByTopic) {
        setLatestByTopic(status.latestByTopic);
      }
    } catch {
      // Silently fail during polling
    }
  }, []);

  // Start/stop polling when connected
  useEffect(() => {
    if (connected) {
      pollIntervalRef.current = setInterval(fetchStatus, 3000);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [connected, fetchStatus]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleConnect = async () => {
    const api = window.factorySim?.mqtt;
    if (!api) {
      addToast({ type: 'error', message: 'MQTT API not available (Electron bridge required)' });
      return;
    }

    setConnecting(true);
    try {
      const topics = form.topics.split(',').map(t => t.trim()).filter(Boolean);
      const result = await api.connect({
        broker: form.broker,
        port: form.port,
        username: form.username || undefined,
        password: form.password || undefined,
        clientId: form.clientId,
        topics,
      });

      if (result.status === 'connected') {
        setConnected(true);
        setShowSettings(false);
        addToast({ type: 'success', message: `Connected to ${form.broker}:${form.port}` });
        // Do initial status fetch
        await fetchStatus();
      } else {
        addToast({ type: 'error', message: `Connection failed: ${result.error || 'Unknown error'}` });
      }
    } catch (err) {
      addToast({ type: 'error', message: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const api = window.factorySim?.mqtt;
    if (!api) return;

    try {
      await api.disconnect();
      setConnected(false);
      setMessages([]);
      setLatestByTopic({});
      setTotalReceived(0);
      addToast({ type: 'info', message: 'Disconnected from MQTT broker' });
    } catch (err) {
      addToast({ type: 'error', message: `Disconnect error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    }
  };

  const handlePublish = async () => {
    const api = window.factorySim?.mqtt;
    if (!api || !publishTopic) return;

    try {
      let payload: unknown;
      try {
        payload = JSON.parse(publishPayload);
      } catch {
        payload = publishPayload;
      }

      const result = await api.publish({ topic: publishTopic, payload });
      if (result.status === 'published') {
        addToast({ type: 'success', message: `Published to ${publishTopic}` });
      } else {
        addToast({ type: 'error', message: result.error || 'Publish failed' });
      }
    } catch (err) {
      addToast({ type: 'error', message: `Publish error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    }
  };

  const handleSubscribeMore = async () => {
    const api = window.factorySim?.mqtt;
    if (!api || !additionalTopics) return;

    const topics = additionalTopics.split(',').map(t => t.trim()).filter(Boolean);
    if (topics.length === 0) return;

    try {
      const result = await api.subscribe({ topics });
      if (result.status === 'ok') {
        addToast({ type: 'success', message: `Subscribed to ${topics.join(', ')}` });
        setAdditionalTopics('');
        // Update form topics list
        const current = form.topics.split(',').map(t => t.trim()).filter(Boolean);
        const merged = [...new Set([...current, ...topics])];
        updateField('topics', merged.join(', '));
      }
    } catch (err) {
      addToast({ type: 'error', message: `Subscribe error: ${err instanceof Error ? err.message : 'Unknown error'}` });
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  const truncatePayload = (payload: Record<string, unknown>, maxLen = 120) => {
    const str = JSON.stringify(payload);
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  };

  return (
    <div className="space-y-4">
      {/* Connection Header */}
      <Card>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              connected ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {connected
                ? <Wifi className="w-5 h-5 text-green-600" strokeWidth={1.75} />
                : <WifiOff className="w-5 h-5 text-gray-400" strokeWidth={1.75} />
              }
            </div>
            <div>
              <div className="font-medium text-gray-900">
                MQTT Connector
                {connected && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    Connected
                  </span>
                )}
                {!connected && !connecting && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    Disconnected
                  </span>
                )}
                {connecting && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                    Connecting...
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {connected
                  ? `${form.broker}:${form.port} | ${totalReceived} messages received`
                  : 'Connect to an MQTT broker for real-time IoT data'
                }
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              title={showSettings ? 'Hide settings' : 'Show settings'}
            >
              {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            {connected ? (
              <Button variant="secondary" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnect} disabled={connecting || !form.broker}>
                {connecting ? 'Connecting...' : 'Connect'}
              </Button>
            )}
          </div>
        </div>

        {/* Settings Form */}
        {showSettings && (
          <div className="border-t border-gray-200 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Broker Host</label>
                <input
                  type="text"
                  className="input"
                  value={form.broker}
                  onChange={(e) => updateField('broker', e.target.value)}
                  placeholder="localhost or broker.hivemq.com"
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  className="input"
                  value={form.port}
                  onChange={(e) => updateField('port', parseInt(e.target.value) || 1883)}
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username (optional)</label>
                <input
                  type="text"
                  className="input"
                  value={form.username}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder="Leave blank if not required"
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password (optional)</label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Leave blank if not required"
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                <input
                  type="text"
                  className="input"
                  value={form.clientId}
                  onChange={(e) => updateField('clientId', e.target.value)}
                  disabled={connected}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topics (comma-separated)</label>
                <input
                  type="text"
                  className="input"
                  value={form.topics}
                  onChange={(e) => updateField('topics', e.target.value)}
                  placeholder="factory/#, sensors/+/status"
                  disabled={connected}
                />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Live Feed and Controls (only when connected) */}
      {connected && (
        <>
          {/* Subscribe + Publish Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Subscribe to more topics */}
            <Card>
              <div className="p-4">
                <div className="text-sm font-medium text-gray-700 mb-2">Subscribe to Topics</div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    className="input flex-1"
                    value={additionalTopics}
                    onChange={(e) => setAdditionalTopics(e.target.value)}
                    placeholder="sensors/temperature, machines/+/status"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubscribeMore()}
                  />
                  <Button size="sm" onClick={handleSubscribeMore} disabled={!additionalTopics}>
                    Subscribe
                  </Button>
                </div>
              </div>
            </Card>

            {/* Publish */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-700">Publish Message</div>
                  <Button variant="ghost" size="sm" onClick={() => setShowPublish(!showPublish)}>
                    <Send className="w-4 h-4" strokeWidth={1.75} />
                  </Button>
                </div>
                {showPublish && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      className="input"
                      value={publishTopic}
                      onChange={(e) => setPublishTopic(e.target.value)}
                      placeholder="Topic (e.g. factory/command)"
                    />
                    <textarea
                      className="input resize-none"
                      rows={2}
                      value={publishPayload}
                      onChange={(e) => setPublishPayload(e.target.value)}
                      placeholder='{"command": "start", "station": "s1"}'
                    />
                    <Button size="sm" onClick={handlePublish} disabled={!publishTopic}>
                      Publish
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Latest Values by Topic */}
          {Object.keys(latestByTopic).length > 0 && (
            <Card>
              <CardHeader
                title="Latest Values by Topic"
                subtitle={`${Object.keys(latestByTopic).length} active topic(s)`}
              />
              <div className="divide-y divide-gray-100">
                {Object.entries(latestByTopic).map(([topic, msg]) => (
                  <div key={topic} className="px-4 py-2 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-blue-600">{topic}</span>
                      <span className="text-xs text-gray-400">{formatTimestamp(msg.timestamp)}</span>
                    </div>
                    <div className="text-sm text-gray-700 font-mono mt-0.5 break-all">
                      {truncatePayload(msg.payload, 200)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Live Message Feed */}
          <Card>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <div className="font-medium text-gray-900">Live Message Feed</div>
                <div className="text-sm text-gray-500">
                  {messages.length} message{messages.length !== 1 ? 's' : ''} in buffer | {totalReceived} total received
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchStatus}
                  title="Refresh now"
                >
                  <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setMessages([]); setTotalReceived(0); }}
                  title="Clear messages"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto border-t border-gray-100">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Waiting for messages...
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {messages.map((msg, i) => (
                    <div key={i} className="px-4 py-2 hover:bg-gray-50 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-blue-600 text-xs">{msg.topic}</span>
                        <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                          {formatTimestamp(msg.timestamp)}
                          <span className="ml-1 text-gray-300">QoS {msg.qos}</span>
                        </span>
                      </div>
                      <div className="text-gray-700 font-mono text-xs mt-0.5 break-all">
                        {truncatePayload(msg.payload)}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
