/**
 * useVoiceOrders Hook
 * Manages WebSocket connection and voice order state
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = 'ws://localhost:3001/ws';
const API_URL = 'http://localhost:3001';

export function useVoiceOrders() {
  const [connected, setConnected] = useState(false);
  const [activeCalls, setActiveCalls] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [currentCall, setCurrentCall] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('[VoiceOrders] WebSocket connected');
        setConnected(true);
        setError(null);
        
        // Ping to keep connection alive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('[VoiceOrders] Error parsing message:', err);
        }
      };
      
      ws.onerror = (err) => {
        console.error('[VoiceOrders] WebSocket error:', err);
        setError('Connection error');
        setConnected(false);
      };
      
      ws.onclose = () => {
        console.log('[VoiceOrders] WebSocket disconnected');
        setConnected(false);
        
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[VoiceOrders] Attempting to reconnect...');
          connect();
        }, 3000);
      };
      
      wsRef.current = ws;
    } catch (err) {
      console.error('[VoiceOrders] Error connecting:', err);
      setError(err.message);
    }
  }, []);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    const { event, data } = message;
    
    switch (event) {
      case 'connected':
        console.log('[VoiceOrders] Connected with client ID:', data.clientId);
        break;
        
      case 'call.initiated':
        setCurrentCall(data);
        setActiveCalls(prev => [data, ...prev]);
        break;
        
      case 'call.updated':
        setCurrentCall(data);
        setActiveCalls(prev => 
          prev.map(call => call.sessionId === data.sessionId ? data : call)
        );
        break;
        
      case 'call.completed':
        setCurrentCall(null);
        setActiveCalls(prev => 
          prev.filter(call => call.sessionId !== data.sessionId)
        );
        setCallLogs(prev => [data, ...prev]);
        break;
        
      case 'call.status':
        // Handle status updates
        break;
        
      case 'transcript.updated':
        setCurrentCall(data);
        break;
        
      case 'order.parsed':
        setCurrentCall(data);
        break;
        
      case 'upsell.generated':
        setCurrentCall(data);
        break;
        
      case 'upsell.accepted':
      case 'upsell.rejected':
        setCurrentCall(data);
        break;
        
      case 'pos.push_status':
        // Handle POS push status
        if (data.status === 'success') {
          setCurrentCall(prev => prev ? { ...prev, posStatus: 'sent' } : null);
        }
        break;
        
      case 'pong':
        // Heartbeat response
        break;
        
      default:
        console.log('[VoiceOrders] Unknown event:', event);
    }
  }, []);

  // Fetch call logs
  const fetchCallLogs = useCallback(async (limit = 20) => {
    try {
      const response = await fetch(`${API_URL}/ai_voice_orders/calls?limit=${limit}`);
      const data = await response.json();
      
      if (data.success) {
        setCallLogs(data.calls);
      }
    } catch (err) {
      console.error('[VoiceOrders] Error fetching call logs:', err);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/ai_voice_orders/calls/stats/summary`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('[VoiceOrders] Error fetching stats:', err);
    }
  }, []);

  // Send order to POS
  const sendToPOS = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/ai_voice_orders/pos/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[VoiceOrders] Error sending to POS:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Get order details
  const getOrderDetails = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/ai_voice_orders/order/${sessionId}`);
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[VoiceOrders] Error getting order details:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    fetchCallLogs();
    fetchStats();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchStats();
    }, 10000);
    
    return () => {
      clearInterval(interval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, fetchCallLogs, fetchStats]);

  return {
    connected,
    activeCalls,
    callLogs,
    currentCall,
    stats,
    error,
    sendToPOS,
    getOrderDetails,
    refreshLogs: fetchCallLogs,
    refreshStats: fetchStats
  };
}

export default useVoiceOrders;
