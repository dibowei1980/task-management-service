import React, { useEffect, useMemo, useState } from 'react';
import { taskTypeService } from '../../services/taskTypeService';
import { taskTypeGroupService } from '../../services/taskTypeGroupService';
import type { TaskTypeResponse } from '../../services/taskTypeService';
import type { TaskTypeGroupResponse } from '../../services/taskTypeGroupService';

interface Props {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const TaskTypeSelect: React.FC<Props> = ({
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
}) => {
  const [groups, setGroups] = useState<TaskTypeGroupResponse[]>([]);
  const [allTypes, setAllTypes] = useState<TaskTypeResponse[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [groupRes, typeRes] = await Promise.all([
          taskTypeGroupService.listEnabled(),
          taskTypeService.list(),
        ]);
        setGroups(groupRes);
        setAllTypes(typeRes);
      } catch {
        setGroups([]);
        setAllTypes([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredTypes = useMemo(() => {
    if (!selectedGroupId) return [];
    return allTypes.filter(t => t.groupId === selectedGroupId && t.enabled);
  }, [allTypes, selectedGroupId]);

  const selectedType = useMemo(() => allTypes.find(t => t.code === value), [allTypes, value]);

  useEffect(() => {
    if (selectedType && selectedType.groupId !== selectedGroupId) {
      setSelectedGroupId(selectedType.groupId);
    }
  }, [selectedType, selectedGroupId]);

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const gid = e.target.value;
    setSelectedGroupId(gid);
    if (value) {
      onChange('');
    }
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  if (loading) {
    return <select className={`w-full border rounded p-2 opacity-50 ${className}`} disabled><option>加载中...</option></select>;
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        value={selectedGroupId}
        onChange={handleGroupChange}
        className="w-2/5 border rounded p-2"
        disabled={disabled}
      >
        <option value="">-- 选择分组 --</option>
        {groups.map(g => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <select
        value={value}
        onChange={handleTypeChange}
        className="w-3/5 border rounded p-2"
        required={required}
        disabled={disabled || !selectedGroupId}
      >
        <option value="">-- 选择任务 --</option>
        {filteredTypes.map(t => (
          <option key={t.id} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
};
