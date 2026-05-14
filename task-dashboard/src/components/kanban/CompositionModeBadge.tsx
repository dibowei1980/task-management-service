import React from 'react';

type CompositionMode = 'HOMOGENEOUS' | 'HETEROGENEOUS';

interface CompositionModeBadgeProps {
  mode: CompositionMode | null | undefined;
  size?: 'sm' | 'md';
}

const modeConfig: Record<string, { label: string; bg: string; text: string }> = {
  HOMOGENEOUS: { label: '同质', bg: 'bg-green-50', text: 'text-green-700' },
  HETEROGENEOUS: { label: '异质', bg: 'bg-amber-50', text: 'text-amber-700' },
};

const CompositionModeBadge: React.FC<CompositionModeBadgeProps> = ({ mode, size = 'sm' }) => {
  if (!mode) return null;
  const config = modeConfig[mode];
  if (!config) return null;
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizeClass} ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};

export default CompositionModeBadge;
