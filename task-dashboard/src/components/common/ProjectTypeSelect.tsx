import React, { useMemo } from 'react';
import { ProjectTypeDefinition } from '../../types';

interface Props {
  projectTypes: ProjectTypeDefinition[];
  value: string;
  onChange: (code: string, type: ProjectTypeDefinition | null) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const ProjectTypeSelect: React.FC<Props> = ({
  projectTypes,
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  placeholder = '-- 请选择类型 --',
}) => {
  const enabledTypes = useMemo(() => projectTypes.filter(t => t.enabled), [projectTypes]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const selected = enabledTypes.find(t => t.code === code) || null;
    onChange(code, selected);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className={`w-full border rounded p-2 ${className}`}
      required={required}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {enabledTypes.map(item => (
        <option key={item.id} value={item.code}>
          {item.name}
        </option>
      ))}
    </select>
  );
};
