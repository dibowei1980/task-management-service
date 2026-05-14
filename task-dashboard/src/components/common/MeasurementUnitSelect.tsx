import React, { useMemo } from 'react';
import { MeasurementUnitDefinition } from '../../types';

interface Props {
  measurementUnits: MeasurementUnitDefinition[];
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  readOnlyLabel?: string;
}

export const MeasurementUnitSelect: React.FC<Props> = ({
  measurementUnits,
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = '-- 请选择单位 --',
  readOnly = false,
  readOnlyLabel,
}) => {
  const enabledUnits = useMemo(() => measurementUnits.filter(u => u.enabled), [measurementUnits]);

  if (readOnly) {
    const unitName = enabledUnits.find(u => u.code === value)?.name || readOnlyLabel || value || '-';
    return (
      <input
        value={unitName}
        readOnly
        className={`w-full border rounded p-2 bg-gray-50 text-gray-600 ${className}`}
        placeholder="选择类型后自动带出"
      />
    );
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full border rounded p-2 ${className}`}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {enabledUnits.map(item => (
        <option key={item.id} value={item.code}>
          {item.name}
        </option>
      ))}
    </select>
  );
};
