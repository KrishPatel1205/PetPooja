/**
 * AI Voice Orders Tab Component
 * Main UI for monitoring and managing AI voice orders
 */

import React, { useState, useEffect } from 'react';
import { useVoiceOrders } from './useVoiceOrders';

// Design tokens - matching existing app
const C = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  surfaceAlt: "#222222",
  border: "#2e2e2e",
  text: "#f5ede0",
  textMd: "#c9b89e",
  textSub: "#8a7560",
  orange: "#ff6b1a",
  green: "#22c55e",
  red: "#f43f5e",
  blue: "#60a5fa",
  amber: "#f59e0b",
  purple: "#a78bfa",
  teal: "#2dd4bf"
};

const F = "'Sora', 'Inter', system-ui, sans-serif";

// Status badge component
function StatusBadge({ status }) {
  const colors = {
    initiated: { bg: C.blue + '22', color: C.blue },
    in_progress: { bg: C.amber + '22', color: C.amber },
    confirming: { bg: C.purple + '22', color: C.purple },
    completed: { bg: C.green + '22', color: C.green },
    failed: { bg: C.red + '22', color: C.red }
  };
  
  const { bg, color } = colors[status] || colors.initiated;
  
  return (
    <span style={{
      background: bg,
      color: color,
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      textTransform: 'uppercase',
      fontFamily: F
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}

// Card component
function Card({ title, children, style = {} }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '16px',
      padding: '20px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      fontFamily: F,
      ...style
    }}>
      {title && (
        <h3 style={{
          fontSize: '16px',
          fontWeight: 700,
          color: C.text,
          margin: '0 0 16px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

// Live Call Panel
function LiveCallPanel({ currentCall }) {
  if (!currentCall) {
    return (
      <Card title="📞 Live Call Status" style={{ minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: C.textSub }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📵</div>
          <div>No active calls</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            Waiting for incoming calls...
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="📞 Live Call Status">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', color: C.textSub, marginBottom: '4px' }}>Caller</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: C.text }}>
              {currentCall.customerPhone || 'Unknown'}
            </div>
          </div>
          <StatusBadge status={currentCall.status} />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: C.surfaceAlt, padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: C.textSub }}>Session ID</div>
            <div style={{ fontSize: '12px', color: C.textMd, fontFamily: 'monospace' }}>
              {currentCall.sessionId?.slice(0, 16)}...
            </div>
          </div>
          <div style={{ background: C.surfaceAlt, padding: '12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: C.textSub }}>Step</div>
            <div style={{ fontSize: '12px', color: C.textMd }}>
              {currentCall.currentStep}
            </div>
          </div>
        </div>
        
        {currentCall.upsellSuggestions?.length > 0 && (
          <div style={{ 
            background: C.orange + '15', 
            border: `1px solid ${C.orange}44`,
            padding: '12px', 
            borderRadius: '8px' 
          }}>
            <div style={{ fontSize: '12px', color: C.orange, marginBottom: '4px' }}>
              💡 Upsell Offered
            </div>
            <div style={{ fontSize: '14px', color: C.text }}>
              {currentCall.upsellSuggestions[0].item_name}
            </div>
            {currentCall.upsellAccepted && (
              <div style={{ fontSize: '12px', color: C.green, marginTop: '4px' }}>
                ✓ Customer accepted
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// Transcript Panel
function TranscriptPanel({ transcript = [] }) {
  return (
    <Card title="💬 Live Transcript" style={{ maxHeight: '300px', overflow: 'hidden' }}>
      <div style={{ 
        maxHeight: '240px', 
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {transcript.length === 0 ? (
          <div style={{ color: C.textSub, textAlign: 'center', padding: '20px' }}>
            No transcript available yet...
          </div>
        ) : (
          transcript.map((entry, index) => (
            <div key={index} style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: entry.speaker === 'customer' ? C.blue + '22' : C.orange + '22',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                flexShrink: 0
              }}>
                {entry.speaker === 'customer' ? '👤' : '🤖'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  fontSize: '12px', 
                  color: entry.speaker === 'customer' ? C.blue : C.orange,
                  marginBottom: '2px',
                  textTransform: 'capitalize'
                }}>
                  {entry.speaker}
                </div>
                <div style={{ fontSize: '14px', color: C.text }}>
                  {entry.text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// Parsed Order Panel
function ParsedOrderPanel({ order, onSendToPOS, posStatus }) {
  if (!order || !order.items || order.items.length === 0) {
    return (
      <Card title="🛒 Parsed Order">
        <div style={{ color: C.textSub, textAlign: 'center', padding: '20px' }}>
          No order items yet...
        </div>
      </Card>
    );
  }

  return (
    <Card title="🛒 Parsed Order">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {order.items.map((item, index) => (
          <div key={index} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px',
            background: C.surfaceAlt,
            borderRadius: '8px'
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>
                {item.qty}x {item.item_name}
              </div>
              {item.modifications?.length > 0 && (
                <div style={{ fontSize: '12px', color: C.textSub, marginTop: '2px' }}>
                  {item.modifications.join(', ')}
                </div>
              )}
            </div>
            <div style={{ fontSize: '14px', color: C.orange, fontWeight: 600 }}>
              ₹{item.total || (item.qty * item.price)}
            </div>
          </div>
        ))}
        
        {order.upsellItems?.length > 0 && (
          <>
            <div style={{ borderTop: `1px solid ${C.border}`, margin: '8px 0' }}></div>
            {order.upsellItems.map((item, index) => (
              <div key={`upsell-${index}`} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                background: C.green + '15',
                borderRadius: '8px',
                border: `1px solid ${C.green}33`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✨</span>
                  <span style={{ fontSize: '14px', color: C.text }}>
                    {item.qty}x {item.item_name}
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: C.green, fontWeight: 600 }}>
                  ₹{item.total || (item.qty * item.price)}
                </div>
              </div>
            ))}
          </>
        )}
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '16px',
          background: C.orange + '15',
          borderRadius: '8px',
          marginTop: '8px'
        }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>Total</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: C.orange }}>
            ₹{order.totalPrice}
          </span>
        </div>
        
        <button
          onClick={onSendToPOS}
          disabled={posStatus === 'sent'}
          style={{
            width: '100%',
            padding: '14px',
            background: posStatus === 'sent' ? C.green : `linear-gradient(135deg, ${C.orange}, ${C.orange}dd)`,
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: posStatus === 'sent' ? 'default' : 'pointer',
            marginTop: '8px'
          }}
        >
          {posStatus === 'sent' ? '✓ Sent to POS' : '📤 Send to POS'}
        </button>
      </div>
    </Card>
  );
}

// Upsell Suggestions Panel
function UpsellPanel({ suggestions, accepted }) {
  if (!suggestions || suggestions.length === 0) {
    return (
      <Card title="💡 Upsell Suggestions">
        <div style={{ color: C.textSub, textAlign: 'center', padding: '20px' }}>
          No upsell suggestions yet...
        </div>
      </Card>
    );
  }

  return (
    <Card title="💡 Upsell Suggestions">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {suggestions.map((suggestion, index) => (
          <div key={index} style={{
            padding: '16px',
            background: accepted ? C.green + '15' : C.surfaceAlt,
            borderRadius: '8px',
            border: `1px solid ${accepted ? C.green + '44' : C.border}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>
                {suggestion.item_name}
              </span>
              <span style={{ fontSize: '14px', color: C.orange, fontWeight: 700 }}>
                ₹{suggestion.selling_price}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: C.textSub, marginBottom: '8px' }}>
              {suggestion.reason}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '11px',
                padding: '4px 8px',
                background: C.purple + '22',
                color: C.purple,
                borderRadius: '4px'
              }}>
                {suggestion.margin_pct}% margin
              </span>
              <span style={{
                fontSize: '11px',
                padding: '4px 8px',
                background: C.blue + '22',
                color: C.blue,
                borderRadius: '4px'
              }}>
                Score: {Math.round(suggestion.score)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Order JSON Panel
function OrderJSONPanel({ order }) {
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(order, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card title="📋 Order JSON">
      <div style={{ position: 'relative' }}>
        <button
          onClick={copyToClipboard}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '6px 12px',
            background: C.surfaceAlt,
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            color: C.textMd,
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
        <pre style={{
          background: C.bg,
          padding: '16px',
          borderRadius: '8px',
          fontSize: '12px',
          color: C.textMd,
          overflow: 'auto',
          maxHeight: '300px',
          fontFamily: 'monospace',
          margin: 0
        }}>
          {JSON.stringify(order, null, 2)}
        </pre>
      </div>
    </Card>
  );
}

// Stats Panel
function StatsPanel({ stats }) {
  if (!stats) return null;

  const statItems = [
    { label: 'Total Calls', value: stats.totalCalls, color: C.blue },
    { label: 'Active', value: stats.activeCalls, color: C.amber },
    { label: 'Completed', value: stats.completedCalls, color: C.green },
    { label: 'With Upsell', value: stats.withUpsell, color: C.purple }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
      {statItems.map((item, index) => (
        <div key={index} style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: item.color }}>
            {item.value}
          </div>
          <div style={{ fontSize: '12px', color: C.textSub, marginTop: '4px' }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// Call Logs Table
function CallLogsTable({ logs, onSelectCall }) {
  return (
    <Card title="📊 Call Logs">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '12px', color: C.textSub, fontWeight: 600 }}>Time</th>
              <th style={{ textAlign: 'left', padding: '12px', color: C.textSub, fontWeight: 600 }}>Phone</th>
              <th style={{ textAlign: 'left', padding: '12px', color: C.textSub, fontWeight: 600 }}>Status</th>
              <th style={{ textAlign: 'left', padding: '12px', color: C.textSub, fontWeight: 600 }}>Items</th>
              <th style={{ textAlign: 'right', padding: '12px', color: C.textSub, fontWeight: 600 }}>Total</th>
              <th style={{ textAlign: 'center', padding: '12px', color: C.textSub, fontWeight: 600 }}>Upsell</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: C.textSub }}>
                  No call logs yet...
                </td>
              </tr>
            ) : (
              logs.slice(0, 10).map((log, index) => (
                <tr 
                  key={index} 
                  style={{ borderBottom: `1px solid ${C.border}44`, cursor: 'pointer' }}
                  onClick={() => onSelectCall(log)}
                  onMouseEnter={(e) => e.currentTarget.style.background = C.surfaceAlt}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px', color: C.textMd }}>
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '12px', color: C.text }}>
                    {log.customerPhone || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <StatusBadge status={log.status} />
                  </td>
                  <td style={{ padding: '12px', color: C.textMd }}>
                    {log.parsedOrder?.items?.length || 0} items
                  </td>
                  <td style={{ padding: '12px', color: C.orange, textAlign: 'right', fontWeight: 600 }}>
                    ₹{log.parsedOrder?.totalPrice || 0}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {log.upsellAccepted ? (
                      <span style={{ color: C.green }}>✓</span>
                    ) : (
                      <span style={{ color: C.textSub }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Connection Status
function ConnectionStatus({ connected }) {
  return (
    <div style={{
      position: 'fixed',
      top: '80px',
      right: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: '20px',
      fontSize: '12px',
      zIndex: 100
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: connected ? C.green : C.red,
        animation: connected ? 'none' : 'pulse 1s infinite'
      }} />
      <span style={{ color: connected ? C.green : C.red }}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// Main Component
export default function AIVoiceOrdersTab() {
  const {
    connected,
    activeCalls,
    callLogs,
    currentCall,
    stats,
    sendToPOS
  } = useVoiceOrders();

  const [posStatus, setPosStatus] = useState({});
  const [selectedCall, setSelectedCall] = useState(null);

  const handleSendToPOS = async () => {
    if (!currentCall) return;
    
    const result = await sendToPOS(currentCall.sessionId);
    if (result.success) {
      setPosStatus(prev => ({ ...prev, [currentCall.sessionId]: 'sent' }));
    }
  };

  const displayCall = selectedCall || currentCall;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <ConnectionStatus connected={connected} />
      
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: C.text, margin: '0 0 8px 0', fontFamily: F }}>
          🤖 AI Voice Orders
        </h2>
        <p style={{ color: C.textSub, fontSize: '14px', margin: 0, fontFamily: F }}>
          Real-time voice order monitoring and management
        </p>
      </div>

      <StatsPanel stats={stats} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <LiveCallPanel currentCall={currentCall} />
        <TranscriptPanel transcript={displayCall?.transcript} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <ParsedOrderPanel 
          order={displayCall?.parsedOrder} 
          onSendToPOS={handleSendToPOS}
          posStatus={posStatus[displayCall?.sessionId]}
        />
        <UpsellPanel 
          suggestions={displayCall?.upsellSuggestions} 
          accepted={displayCall?.upsellAccepted}
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <OrderJSONPanel order={displayCall?.parsedOrder} />
      </div>

      <CallLogsTable 
        logs={callLogs} 
        onSelectCall={setSelectedCall}
      />
    </div>
  );
}
