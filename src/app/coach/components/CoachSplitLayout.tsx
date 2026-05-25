'use client';

import type {ReactNode} from 'react';
import {useState, useCallback, useRef} from 'react';
import {usePanelRef, useDefaultLayout, type Layout} from 'react-resizable-panels';
import {animate} from 'framer-motion';
import {PanelLeft, Columns2, PanelRight} from 'lucide-react';
import {ResizablePanelGroup, ResizablePanel, ResizableHandle} from '@/components/ui/resizable';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {useMediaQuery} from '../hooks/useMediaQuery';

type Mode = 'left' | 'split' | 'right';

// Left panel percentage for each mode
const MODE_PCT: Record<Mode, number> = {
  left: 100,
  split: 30,
  right: 0,
};

const PRESETS: {label: string; Icon: React.ComponentType<{size?: number}>; mode: Mode}[] = [
  {label: 'Chat only', Icon: PanelLeft, mode: 'left'},
  {label: '30 / 70 split', Icon: Columns2, mode: 'split'},
  {label: 'Plan only', Icon: PanelRight, mode: 'right'},
];

function detectMode(leftPct: number): Mode | null {
  if (leftPct >= 97) return 'left';
  if (leftPct <= 3) return 'right';
  if (Math.abs(leftPct - MODE_PCT.split) < 4) return 'split';
  return null;
}

export function CoachSplitLayout({
  leftPanel,
  rightPanel,
}: {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
}) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const leftPanelRef = usePanelRef();
  const isAnimatingRef = useRef(false);

  const {defaultLayout, onLayoutChanged: persistLayout} = useDefaultLayout({
    id: 'coach-split',
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    panelIds: ['left', 'right'],
  });

  const [activeMode, setActiveMode] = useState<Mode | null>(
    () => detectMode(defaultLayout?.['left'] ?? MODE_PCT.split),
  );

  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      persistLayout(layout);
      // Only reflect drag-based position changes, not programmatic animation frames
      if (!isAnimatingRef.current) {
        setActiveMode(detectMode(layout['left'] ?? 0));
      }
    },
    [persistLayout],
  );

  const snapTo = useCallback(
    (mode: Mode) => {
      const panel = leftPanelRef.current;
      if (!panel) return;

      const target = MODE_PCT[mode];
      const current = panel.getSize().asPercentage;

      setActiveMode(mode);
      isAnimatingRef.current = true;

      animate(current, target, {
        duration: 0.3,
        ease: 'easeInOut',
        onUpdate: (v) => panel.resize(`${v}`),
        onComplete: () => {
          isAnimatingRef.current = false;
        },
      });
    },
    [leftPanelRef],
  );

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="h-56 border-b border-white/[0.07] flex flex-col flex-shrink-0">
          {leftPanel}
        </div>
        <div className="flex-1 overflow-y-auto">{rightPanel}</div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
      className="flex-1"
    >
      <ResizablePanel
        id="left"
        panelRef={leftPanelRef}
        defaultSize={`${defaultLayout?.['left'] ?? MODE_PCT.split}`}
        minSize={'0'}
        className="flex flex-col overflow-hidden"
      >
        {leftPanel}
      </ResizablePanel>

      <ResizableHandle
        className="w-4 bg-transparent group"
        style={{borderRight: '1px solid rgba(255,255,255,0.07)', background: 'transparent'}}
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto z-20"
          onPointerDown={e => e.stopPropagation()}
        >
          <TooltipProvider>
            <div className="flex flex-col gap-0.5 bg-[#0f0f12] border border-white/10 rounded-full px-1 py-1 shadow-lg">
              {PRESETS.map(({label, Icon, mode}) => (
                <Tooltip key={mode}>
                  <TooltipTrigger
                    render={
                      <button
                        onClick={() => snapTo(mode)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                          activeMode === mode
                            ? 'text-[#0a84ff] bg-[#0a84ff]/10'
                            : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                        }`}
                      >
                        <Icon size={13} />
                      </button>
                    }
                  />
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      </ResizableHandle>

      <ResizablePanel
        id="right"
        defaultSize={`${defaultLayout?.['right'] ?? (100 - MODE_PCT.split)}`}
        minSize={'0'}
        className="overflow-hidden"
      >
        {rightPanel}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
