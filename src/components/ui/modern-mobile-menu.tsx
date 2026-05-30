"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Home, Briefcase, Calendar, Shield, Settings } from 'lucide-react';

type IconComponentType = React.ElementType<{ className?: string }>;

export interface InteractiveMenuItem {
  label: string;
  icon: IconComponentType;
}

export interface InteractiveMenuProps {
  items?: InteractiveMenuItem[];
  accentColor?: string;
  activeIndex?: number;
  onItemClick?: (index: number) => void;
}

const defaultItems: InteractiveMenuItem[] = [
  { label: 'home', icon: Home },
  { label: 'strategy', icon: Briefcase },
  { label: 'period', icon: Calendar },
  { label: 'security', icon: Shield },
  { label: 'settings', icon: Settings },
];

const defaultAccentColor = 'var(--component-active-color-default)';

const InteractiveMenu: React.FC<InteractiveMenuProps> = ({
  items,
  accentColor,
  activeIndex: controlledIndex,
  onItemClick,
}) => {
  const finalItems = useMemo(() => {
    const isValid = items && Array.isArray(items) && items.length >= 2 && items.length <= 5;
    if (!isValid) return defaultItems;
    return items;
  }, [items]);

  const [internalActiveIndex, setInternalActiveIndex] = useState(controlledIndex ?? 0);

  const isControlled = controlledIndex !== undefined;
  const activeIndex = isControlled ? controlledIndex : internalActiveIndex;

  useEffect(() => {
    if (isControlled) setInternalActiveIndex(controlledIndex);
  }, [controlledIndex, isControlled]);

  useEffect(() => {
    if (activeIndex >= finalItems.length) setInternalActiveIndex(0);
  }, [finalItems, activeIndex]);

  const textRefs = useRef<(HTMLElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const setLineWidth = () => {
      const activeItemEl = itemRefs.current[activeIndex];
      const activeTextEl = textRefs.current[activeIndex];
      if (activeItemEl && activeTextEl) {
        activeItemEl.style.setProperty('--lineWidth', `${activeTextEl.offsetWidth}px`);
      }
    };
    setLineWidth();
    window.addEventListener('resize', setLineWidth);
    return () => window.removeEventListener('resize', setLineWidth);
  }, [activeIndex, finalItems]);

  const handleItemClick = (index: number) => {
    if (!isControlled) setInternalActiveIndex(index);
    onItemClick?.(index);
  };

  const navStyle = useMemo(
    () => ({ '--component-active-color': accentColor || defaultAccentColor }) as React.CSSProperties,
    [accentColor],
  );

  return (
    <nav className="menu" role="navigation" style={navStyle}>
      {finalItems.map((item, index) => {
        const isActive = index === activeIndex;
        const IconComponent = item.icon;
        return (
          <button
            key={item.label}
            className={`menu__item ${isActive ? 'active' : ''}`}
            onClick={() => handleItemClick(index)}
            ref={(el) => { itemRefs.current[index] = el; }}
            style={{ '--lineWidth': '0px' } as React.CSSProperties}
          >
            <div className="menu__icon">
              <IconComponent className="icon" />
            </div>
            <strong
              className={`menu__text ${isActive ? 'active' : ''}`}
              ref={(el) => { textRefs.current[index] = el; }}
            >
              {item.label}
            </strong>
          </button>
        );
      })}
    </nav>
  );
};

export { InteractiveMenu };
