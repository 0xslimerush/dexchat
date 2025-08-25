import React, { useEffect, useRef, useState } from 'react';

interface FloatingVoicePanelProps {
  title?: string;
  children: React.ReactNode;
}

export const FloatingVoicePanel: React.FC<FloatingVoicePanelProps> = ({ title = 'DexChat Voice', children }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 80, left: Math.max(16, window.innerWidth - 360) });
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      setPos(prev => ({
        top: Math.max(8, Math.min(e.clientY - offset.y, window.innerHeight - 80)),
        left: Math.max(8, Math.min(e.clientX - offset.x, window.innerWidth - 80)),
      }));
    };
    const onMouseUp = () => setDragging(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, offset]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setDragging(true);
    setOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    width: collapsed ? 220 : 320,
    background: 'rgba(15, 17, 26, 0.95)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    zIndex: 2147483647,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    userSelect: 'none',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    cursor: 'move',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.06)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    fontWeight: 600,
    fontSize: 14,
  };

  const bodyStyle: React.CSSProperties = {
    padding: 10,
    display: collapsed ? 'none' : 'block',
  };

  const buttonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#fff',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    cursor: 'pointer',
  };

  return (
    <div ref={panelRef} style={containerStyle}>
      <div style={headerStyle} onMouseDown={onMouseDown}>
        <span>{title}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={buttonStyle} onClick={() => setCollapsed(c => !c)}>{collapsed ? 'Expand' : 'Collapse'}</button>
        </div>
      </div>
      <div style={bodyStyle}>{children}</div>
    </div>
  );
};