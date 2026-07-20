/**
 * MainWorkspace — layout orchestrator (architecture §8).
 *
 * CSS Grid layout hosting named PanelSlot placeholders for every
 * panel family per the §8 component tree. Implements §16.6 graceful
 * degradation: higher-priority panels win layout when space is
 * constrained — P6 collapses first, then P5, etc.
 *
 * §9.11 step 2: Dashboard Layout is a pure function of Operational State.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { PanelSlot } from "./PanelSlot";
import { IncidentWorkspace } from "./IncidentWorkspace";
import { RightSidebar } from "./RightSidebar";
import { BottomPanel } from "./BottomPanel";
import { DigitalTwinPanel } from "../panels/digital-twin/DigitalTwinPanel";

export function MainWorkspace() {
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [wrapperWidth, setWrapperWidth] = useState<number>(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedWidth = localStorage.getItem("digitalTwinWidth");
    if (savedWidth) setDraggedWidth(parseInt(savedWidth, 10));
    
    const savedCollapsed = localStorage.getItem("sidebarCollapsed");
    if (savedCollapsed) setSidebarCollapsed(savedCollapsed === "true");
  }, []);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setWrapperWidth(entries[0].contentRect.width);
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        let newWidth = e.clientX - rect.left;
        
        newWidth = Math.max(260, newWidth);
        const maxWidth = window.innerWidth * 0.85;
        newWidth = Math.min(maxWidth, newWidth);
        
        setDraggedWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Persist dragged width when dragging stops
  useEffect(() => {
    if (!isDragging && draggedWidth !== null) {
      localStorage.setItem("digitalTwinWidth", draggedWidth.toString());
    }
  }, [isDragging, draggedWidth]);
  
  const toggleSidebar = () => {
    const newVal = !sidebarCollapsed;
    setSidebarCollapsed(newVal);
    localStorage.setItem("sidebarCollapsed", newVal.toString());
  };

  const isOverlay = draggedWidth !== null && wrapperWidth > 0 && draggedWidth > wrapperWidth;
  const panelWidth = isOverlay ? `${draggedWidth}px` : "100%";

  return (
    <main className="flex-1 flex flex-col gap-2 p-2 w-full max-w-full relative">
      <div className="flex flex-row gap-2 w-full h-[calc(100vh-60px)] shrink-0 relative">
        
        {/* P3: Digital Twin Wrapper */}
        <div 
          ref={wrapperRef}
          className="relative h-full"
          style={{ flex: "1 1 auto", minWidth: 260 }}
        >
          <div
            className={isOverlay ? "absolute left-0 top-0 h-full z-[100] shadow-2xl overflow-visible transition-shadow" : "relative w-full h-full overflow-visible"}
            style={{ width: panelWidth }}
          >
            <PanelSlot
              panelId="digital-twin"
              priority={3}
              className="h-full overflow-hidden"
            >
              <DigitalTwinPanel />
            </PanelSlot>

            {/* Resize Handle */}
            <div
              className={`absolute -right-1 top-0 w-2 h-full cursor-col-resize z-50 transition-colors ${
                isDragging ? "bg-blue-500/80" : "hover:bg-blue-500/50"
              }`}
              onMouseDown={handleMouseDown}
            />
          </div>
        </div>

        {/* Center Column: Incident Workspace (CCTV) */}
        <div className="relative h-full" style={{ flex: "0 0 45%" }}>
          <IncidentWorkspace />

          {/* Sidebar Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="absolute top-2 -right-4 w-8 h-8 flex items-center justify-center z-50 bg-[#1E232A] border border-[#2E3640] rounded shadow hover:bg-[#2E3640] text-gray-300"
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarCollapsed ? (
                <polyline points="15 18 9 12 15 6" /> // Left chevron
              ) : (
                <polyline points="9 18 15 12 9 6" /> // Right chevron
              )}
            </svg>
          </button>
        </div>

        {/* Right Sidebar */}
        {!sidebarCollapsed && (
          <div className="relative h-full" style={{ flex: "0 0 30%" }}>
            <RightSidebar />
          </div>
        )}
      </div>

      {/* Bottom strip */}
      <BottomPanel />
    </main>
  );
}
