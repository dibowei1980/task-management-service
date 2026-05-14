import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Layers, Plus, Search, X, AlertTriangle, Pencil, MoreVertical, Trash2, UserPlus, UserMinus } from 'lucide-react';
import { Task } from '../../types';
import { taskTreeApi } from '../../services/taskTreeApi';
import { MAX_TREE_DEPTH, hasAnyPermission } from '../../utils/constants';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';

interface TaskTreeViewProps {
  rootNodes: Task[];
  childrenMap: Record<string, Task[]>;
  expandedIds: Set<string>;
  visibleIds: Set<string>;
  expandableIds: Set<string>;
  selectedId: string | null;
  treeSearch: string;
  onSelectNode: (task: Task) => void;
  onToggleExpand: (id: string) => void;
  onToggleExpandAll: () => void;
  onCollapseAll: () => void;
  onTreeSearchChange: (value: string) => void;
  onAddChild?: (parentTask: Task, parentDepth: number, childCategory: 'PROJECT' | 'OPERATION_TASK') => void;
  onEditNode?: (task: Task) => void;
  onMoveNode?: (taskId: string, newParentId: string) => Promise<void>;
  onDeleteNode?: (task: Task) => void;
  onAssignNode?: (task: Task) => void;
  onRevokeAssign?: (task: Task) => void;
  currentUser?: { id: string } | null;
  userAuthorities?: string[];
  currentUserDepartmentId?: string;
  pendingReceiveIds?: Set<string>;
  pendingReceiveLeafIds?: Set<string>;
}

const depthColorMap = [
  'text-blue-700',
  'text-indigo-600',
  'text-violet-600',
  'text-purple-600',
  'text-rose-600',
];

const depthBgMap = [
  'bg-blue-50',
  'bg-indigo-50',
  'bg-violet-50',
  'bg-purple-50',
  'bg-rose-50',
];

const depthBorderMap = [
  'border-blue-200',
  'border-indigo-200',
  'border-violet-200',
  'border-purple-200',
  'border-rose-200',
];

const compositionModeLabelMap: Record<string, string> = {
  HOMOGENEOUS: '同质',
  HETEROGENEOUS: '异质',
};

function isDescendantOf(ancestorId: string, nodeId: string, childrenMap: Record<string, Task[]>): boolean {
  const children = childrenMap[ancestorId] || [];
  for (const child of children) {
    if (child.id === nodeId) return true;
    if (isDescendantOf(child.id, nodeId, childrenMap)) return true;
  }
  return false;
}

function getDepthOf(nodeId: string, allNodesMap: Record<string, Task>): number {
  let depth = 0;
  let currentId: string | null = nodeId;
  while (currentId) {
    const node = allNodesMap[currentId];
    if (!node) break;
    if (node.category === 'PROJECT') return depth;
    currentId = node.parentTaskId || null;
    depth++;
  }
  return depth;
}

const TreeNode: React.FC<{
  node: Task;
  depth: number;
  childrenMap: Record<string, Task[]>;
  allNodesMap: Record<string, Task>;
  expandedIds: Set<string>;
  visibleIds: Set<string>;
  expandableIds: Set<string>;
  selectedId: string | null;
  dragState: { draggedId: string | null; dropTargetId: string | null; validationResult: { valid: boolean; message?: string } | null };
  onSelectNode: (task: Task) => void;
  onToggleExpand: (id: string) => void;
  onAddChild?: (parentTask: Task, parentDepth: number, childCategory: 'PROJECT' | 'OPERATION_TASK') => void;
  onEditNode?: (task: Task) => void;
  onDragStart: (nodeId: string) => void;
  onDragEnd: () => void;
  onDragOver: (nodeId: string) => void;
  onDrop: (targetId: string) => void;
  workloadWarnings?: Record<string, string[]>;
  warningDetailId: string | null;
  onToggleWarningDetail: (id: string) => void;
  getUnitName: (code: string) => string;
  getTypeDisplayName: (code: string | null | undefined, category?: string | null) => string;
  openMenuId: string | null;
  onToggleMenu: (id: string) => void;
  menuBtnRefs: React.MutableRefObject<Record<string, HTMLButtonElement>>;
  onDeleteNode?: (task: Task) => void;
  onAssignNode?: (task: Task) => void;
  onRevokeAssign?: (task: Task) => void;
  currentUser?: { id: string } | null;
  userAuthorities?: string[];
  pendingReceiveIds?: Set<string>;
  pendingReceiveLeafIds?: Set<string>;
}> = ({ node, depth, childrenMap, allNodesMap, expandedIds, visibleIds, expandableIds, selectedId, dragState, onSelectNode, onToggleExpand, onAddChild, onEditNode, onDragStart, onDragEnd, onDragOver, onDrop, workloadWarnings, warningDetailId, onToggleWarningDetail, getUnitName, getTypeDisplayName, openMenuId, onToggleMenu, menuBtnRefs, onDeleteNode, onAssignNode, onRevokeAssign, currentUser, userAuthorities = [], pendingReceiveIds, pendingReceiveLeafIds }) => {
  const children = childrenMap[node.id] || [];
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = children.length > 0 || expandableIds.has(node.id);
  const isAtMaxDepth = depth >= MAX_TREE_DEPTH - 1;
  const isController = !!(currentUser && node.controllerId && node.controllerId === currentUser.id);
  const colorKey = Math.min(depth, 4);

  const isDragged = dragState.draggedId === node.id;
  const isDropTarget = dragState.dropTargetId === node.id;
  const isInvalidDrop = isDropTarget && dragState.validationResult && !dragState.validationResult.valid;

  if (!visibleIds.has(node.id)) return null;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors group ${
          isSelected ? `${depthBgMap[colorKey]} ${depthColorMap[colorKey]} ${depthBorderMap[colorKey]} border` : 'hover:bg-gray-100 text-gray-700'
        } ${isDragged ? 'opacity-40' : ''} ${isInvalidDrop ? 'bg-red-50 border border-red-300' : isDropTarget ? 'bg-green-50 border border-green-300' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelectNode(node)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', node.id);
          onDragStart(node.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(node.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(node.id);
        }}
      >
        <button
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
          aria-label={hasChildren ? (isExpanded ? '折叠' : '展开') : '无子任务'}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="text-xs text-gray-300">•</span>
          )}
        </button>

        <div className="relative flex-shrink-0">
          <div className={hasChildren ? 'text-amber-500' : 'text-gray-400'}>
            {hasChildren ? (isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />) : <FileText size={16} />}
          </div>
          {pendingReceiveLeafIds && pendingReceiveLeafIds.has(node.id) && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center" title="待接收">
              <span className="text-white text-[8px] font-bold leading-none">!</span>
            </span>
          )}
          {pendingReceiveIds && pendingReceiveIds.has(node.id) && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center" title="有后代任务待接收">
              <span className="text-white text-[8px] font-bold leading-none">!</span>
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className={`truncate text-sm ${node.compositionMode === 'HOMOGENEOUS' ? 'text-blue-600' : node.compositionMode === 'HETEROGENEOUS' ? 'text-green-600' : ''}`}
            title={`${node.name}${node.compositionMode ? '(' + (compositionModeLabelMap[node.compositionMode] || node.compositionMode) + ')' : ''}${node.type ? '\n类型：' + getTypeDisplayName(node.type, node.category) : ''}`}
          >{node.name}</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {node.workload != null && node.workloadUnit && (
            <span className={`text-xs ${workloadWarnings?.[node.id] ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
              {node.workload}{getUnitName(node.workloadUnit)}
            </span>
          )}
          {node.progress != null && (
            <span className="text-xs text-gray-400 w-10 text-right">{node.progress}%</span>
          )}
          {workloadWarnings?.[node.id] && (
            <button
              className="w-5 h-5 flex items-center justify-center text-red-500 hover:text-red-700 flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onToggleWarningDetail(node.id); }}
              title="工作量警告"
            >
              <AlertTriangle size={14} />
            </button>
          )}
        </div>

        {isInvalidDrop && dragState.validationResult?.message && (
          <div className="flex items-center gap-1 text-xs text-red-600 flex-shrink-0 max-w-48 truncate" title={dragState.validationResult.message}>
            <AlertTriangle size={12} />
            <span className="truncate">{dragState.validationResult.message}</span>
          </div>
        )}

        <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            ref={(el) => { if (el) menuBtnRefs.current[node.id] = el; }}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); }}
            title="操作"
            aria-label="操作"
          >
            <MoreVertical size={14} />
          </button>
          {openMenuId === node.id && menuBtnRefs.current[node.id] && createPortal(
            <div
              className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]"
              style={{
                top: menuBtnRefs.current[node.id]!.getBoundingClientRect().bottom + 4,
                left: menuBtnRefs.current[node.id]!.getBoundingClientRect().right - 120,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {onEditNode && node.canUpdate && (
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); onEditNode(node); }}
                >
                  <Pencil size={13} /> 编辑
                </button>
              )}
              {onAssignNode && !node.hasChildren && (node.status === 'PENDING' || node.status === 'ASSIGNED') && isController && (
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); onAssignNode(node); }}
                >
                  <UserPlus size={13} /> 指派
                </button>
              )}
              {onRevokeAssign && !node.hasChildren && node.status === 'ASSIGNED' && node.canRevokeAssignment !== false && (() => {
                const isAssigner = currentUser && node.assignerId === currentUser.id;
                return isAssigner;
              })() && (
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); onRevokeAssign(node); }}
                >
                  <UserMinus size={13} /> 撤销指派
                </button>
              )}
              {onAddChild && !isAtMaxDepth && isController && node.category === 'PROJECT' && (
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-green-700 hover:bg-green-50 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); onAddChild(node, depth, 'PROJECT'); }}
                >
                  <Plus size={13} /> 添加子项目
                </button>
              )}
              {onAddChild && !isAtMaxDepth && isController && (
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); onAddChild(node, depth, 'OPERATION_TASK'); }}
                >
                  <Plus size={13} /> 添加子任务
                </button>
              )}
              {isAtMaxDepth && isController && (
                <span className="block px-3 py-1.5 text-xs text-gray-400">已达层级上限</span>
              )}
              {onDeleteNode && currentUser && node.createdById && node.createdById === currentUser.id && (
                node.progress != null && node.progress > 0 ? (
                  <span className="block px-3 py-1.5 text-xs text-gray-400 flex items-center gap-2" title="进度大于 0 时不可删除">
                    <Trash2 size={13} /> 删除（进度&gt;0）
                  </span>
                ) : (
                  <button
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); onToggleMenu(node.id); onDeleteNode(node); }}
                  >
                    <Trash2 size={13} /> 删除
                  </button>
                )
              )}
            </div>,
            document.body
          )}
        </div>
      </div>

      {warningDetailId === node.id && workloadWarnings?.[node.id] && (
        <div className="ml-8 mr-2 mb-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 space-y-1" style={{ marginLeft: `${depth * 20 + 28}px` }}>
          <div className="font-semibold mb-1">工作量警告：</div>
          {workloadWarnings[node.id].map((msg, i) => (
            <div key={i}>• {msg}</div>
          ))}
        </div>
      )}

      {isExpanded && hasChildren && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              childrenMap={childrenMap}
              allNodesMap={allNodesMap}
              expandedIds={expandedIds}
              visibleIds={visibleIds}
              expandableIds={expandableIds}
              selectedId={selectedId}
              dragState={dragState}
              onSelectNode={onSelectNode}
              onToggleExpand={onToggleExpand}
              onAddChild={onAddChild}
              onEditNode={onEditNode}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              workloadWarnings={workloadWarnings}
              warningDetailId={warningDetailId}
              onToggleWarningDetail={onToggleWarningDetail}
              getUnitName={getUnitName}
              getTypeDisplayName={getTypeDisplayName}
              openMenuId={openMenuId}
              onToggleMenu={onToggleMenu}
              menuBtnRefs={menuBtnRefs}
              onDeleteNode={onDeleteNode}
              onAssignNode={onAssignNode}
              onRevokeAssign={onRevokeAssign}
              currentUser={currentUser}
              userAuthorities={userAuthorities}
              pendingReceiveIds={pendingReceiveIds}
              pendingReceiveLeafIds={pendingReceiveLeafIds}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TaskTreeView: React.FC<TaskTreeViewProps> = ({
  rootNodes,
  childrenMap,
  expandedIds,
  visibleIds,
  expandableIds,
  selectedId,
  treeSearch,
  onSelectNode,
  onToggleExpand,
  onToggleExpandAll,
  onCollapseAll,
  onTreeSearchChange,
  onAddChild,
  onEditNode,
  onMoveNode,
  onDeleteNode,
  onAssignNode,
  onRevokeAssign,
  currentUser,
  userAuthorities = [],
  currentUserDepartmentId,
}) => {
  const [dragState, setDragState] = useState<{
    draggedId: string | null;
    dropTargetId: string | null;
    validationResult: { valid: boolean; message?: string } | null;
  }>({ draggedId: null, dropTargetId: null, validationResult: null });
  const [warningDetailId, setWarningDetailId] = useState<string | null>(null);
  const { getUnitName, getTypeDisplayName } = useProjectTypeStore();

  const allNodesMap = React.useMemo(() => {
    const map: Record<string, Task> = {};
    const walk = (nodes: Task[]) => {
      for (const n of nodes) {
        map[n.id] = n;
        const children = childrenMap[n.id] || [];
        walk(children);
      }
    };
    walk(rootNodes);
    return map;
  }, [rootNodes, childrenMap]);

  const workloadWarnings = useMemo(() => {
    const warnings: Record<string, string[]> = {};
    const walk = (nodes: Task[]) => {
      for (const n of nodes) {
        const children = childrenMap[n.id] || [];
        if (n.workload != null && n.workloadUnit && children.length > 0) {
          const totalDirectChildren = n.directChildCount ?? 0;
          if (totalDirectChildren > 0 && children.length < totalDirectChildren) {
            walk(children);
            continue;
          }
          const groups: Record<string, { sum: number; category?: string | null }> = {};
          for (const c of children) {
            if (c.workload != null && c.workloadUnit && c.type) {
              const key = `${c.type}::${c.workloadUnit}`;
              if (!groups[key]) groups[key] = { sum: 0, category: c.category };
              groups[key].sum += c.workload;
            }
          }
          for (const [key, group] of Object.entries(groups)) {
            const [childType, childUnit] = key.split('::');
            if (childUnit === n.workloadUnit && Math.abs(group.sum - n.workload) > 0.01) {
              const unitName = getUnitName(childUnit);
              const typeName = getTypeDisplayName(childType, group.category);
              if (!warnings[n.id]) warnings[n.id] = [];
              warnings[n.id].push(
                `任务类型"${typeName}"的子任务工作量之和为 ${group.sum} ${unitName}，与父任务工作量 ${n.workload} ${unitName} 不一致`
              );
            }
          }
        }
        walk(children);
      }
    };
    walk(rootNodes);
    return Object.keys(warnings).length > 0 ? warnings : undefined;
  }, [rootNodes, childrenMap, getUnitName, getTypeDisplayName]);

  const { pendingReceiveAncestorIds, pendingReceiveLeafIds } = useMemo(() => {
    const currentUserId = currentUser?.id;
    if (!currentUserId) return { pendingReceiveAncestorIds: new Set<string>(), pendingReceiveLeafIds: new Set<string>() };

    const canManage = hasAnyPermission(userAuthorities, 'department:manager');
    const canCreateProject = hasAnyPermission(userAuthorities, 'project:create');
    const canCreateTask = hasAnyPermission(userAuthorities, 'task:create');

    const leafReceiveIds = new Set<string>();

    const checkLeaf = (node: Task) => {
      const isLeaf = !node.hasChildren;
      const isProject = node.category === 'PROJECT';
      const hasAssignee = !!node.assigneeId;
      const hasOperators = Array.isArray(node.operatorIds) && node.operatorIds.length > 0;
      const isAssignedUser = currentUserId && (
        (hasAssignee && node.assigneeId === currentUserId) ||
        (hasOperators && node.operatorIds!.includes(currentUserId))
      );
      const isSameDepartment = !!(currentUserDepartmentId && node.departmentId && currentUserDepartmentId === node.departmentId);

      const canReceiveTask = isProject
        ? (hasAssignee ? isAssignedUser : (isSameDepartment && (canManage || canCreateProject)))
        : (hasAssignee ? isAssignedUser : (hasOperators ? isAssignedUser : isSameDepartment));
      const canReceiveByPermission = isProject ? canCreateProject : (canCreateProject || canCreateTask);

      if (isLeaf && node.status === 'ASSIGNED' && canReceiveByPermission && canReceiveTask) {
        leafReceiveIds.add(node.id);
      }

      const children = childrenMap[node.id] || [];
      for (const child of children) {
        checkLeaf(child);
      }
    };

    for (const root of rootNodes) {
      checkLeaf(root);
    }

    const result = new Set<string>();
    const markAncestors = (node: Task) => {
      const children = childrenMap[node.id] || [];
      let hasPendingChild = leafReceiveIds.has(node.id);
      for (const child of children) {
        if (markAncestors(child)) hasPendingChild = true;
      }
      if (hasPendingChild && !leafReceiveIds.has(node.id)) {
        result.add(node.id);
      }
      return hasPendingChild;
    };

    for (const root of rootNodes) {
      markAncestors(root);
    }

    return { pendingReceiveAncestorIds: result, pendingReceiveLeafIds: leafReceiveIds };
  }, [rootNodes, childrenMap, currentUser, userAuthorities, currentUserDepartmentId]);

  const handleToggleWarningDetail = useCallback((id: string) => {
    setWarningDetailId(prev => prev === id ? null : id);
  }, []);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuBtnRefs = useRef<Record<string, HTMLButtonElement>>({});
  const handleToggleMenu = useCallback((id: string) => {
    setOpenMenuId(prev => prev === id ? null : id);
  }, []);

  useEffect(() => {
    if (openMenuId === null) return;
    const handleClick = () => setOpenMenuId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openMenuId]);

  const handleDragStart = useCallback((nodeId: string) => {
    setDragState({ draggedId: nodeId, dropTargetId: null, validationResult: null });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedId: null, dropTargetId: null, validationResult: null });
  }, []);

  const handleDragOver = useCallback((targetId: string) => {
    setDragState(prev => {
      if (prev.dropTargetId === targetId) return prev;
      if (prev.draggedId === targetId) return { ...prev, dropTargetId: null, validationResult: null };

      if (prev.draggedId && isDescendantOf(prev.draggedId, targetId, childrenMap)) {
        return { ...prev, dropTargetId: targetId, validationResult: { valid: false, message: '不能移动到自身子节点下' } };
      }

      const draggedNode = allNodesMap[prev.draggedId || ''];
      const targetNode = allNodesMap[targetId];
      if (draggedNode && targetNode) {
        const targetDepth = getDepthOf(targetId, allNodesMap);
        const draggedSubtreeDepth = 1;
        if (targetDepth + draggedSubtreeDepth >= MAX_TREE_DEPTH) {
          return { ...prev, dropTargetId: targetId, validationResult: { valid: false, message: `移动后深度将超过 ${MAX_TREE_DEPTH} 层上限` } };
        }
      }

      return { ...prev, dropTargetId: targetId, validationResult: { valid: true } };
    });
  }, [childrenMap, allNodesMap]);

  const handleDrop = useCallback(async (targetId: string) => {
    const draggedId = dragState.draggedId;
    if (!draggedId || draggedId === targetId) return;

    if (isDescendantOf(draggedId, targetId, childrenMap)) return;

    const draggedNode = allNodesMap[draggedId];
    if (draggedNode && draggedNode.type) {
      const validation = await taskTreeApi.validateStructure(targetId, draggedNode.type);
      if (!validation.valid) {
        setDragState(prev => ({ ...prev, validationResult: validation }));
        return;
      }
    }

    if (onMoveNode) {
      try {
        await onMoveNode(draggedId, targetId);
      } catch {
        setDragState(prev => ({ ...prev, validationResult: { valid: false, message: '移动失败，请重试' } }));
        return;
      }
    }

    setDragState({ draggedId: null, dropTargetId: null, validationResult: null });
  }, [dragState.draggedId, childrenMap, allNodesMap, onMoveNode]);

  const handleAddChild = useCallback((parentTask: Task, parentDepth: number, childCategory: 'PROJECT' | 'OPERATION_TASK') => {
    if (onAddChild) {
      onAddChild(parentTask, parentDepth, childCategory);
    }
  }, [onAddChild]);

  return (
    <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} />
          项目树
        </div>
        <div className="flex items-center gap-1">
          <button
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
            onClick={onToggleExpandAll}
          >
            展开
          </button>
          <button
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100"
            onClick={onCollapseAll}
          >
            收起
          </button>
        </div>
      </div>

      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={treeSearch}
            onChange={(e) => onTreeSearchChange(e.target.value)}
            placeholder="搜索项目"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {treeSearch && (
            <button
              className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
              onClick={() => onTreeSearchChange('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="px-2 py-1 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-400 px-2">
          <span>名称（可拖拽移动）</span>
          <span className="flex items-center gap-1">
            <span>工作量</span>
            <span className="w-10 text-right">进度</span>
            <span className="w-12 text-right">操作</span>
          </span>
        </div>
      </div>

      <div className="p-2 overflow-y-auto flex-1">
        {rootNodes.length === 0 && (
          <div className="text-sm text-gray-500 px-2 py-3">暂无项目</div>
        )}
        {rootNodes.length > 0 && visibleIds.size === 0 && (
          <div className="text-sm text-gray-500 px-2 py-3">无匹配项目</div>
        )}
        {rootNodes.length > 0 && visibleIds.size > 0 && (
          <div className="space-y-1 mt-1">
            {rootNodes.map((root) => (
              <TreeNode
                key={root.id}
                node={root}
                depth={0}
                childrenMap={childrenMap}
                allNodesMap={allNodesMap}
                expandedIds={expandedIds}
                visibleIds={visibleIds}
                expandableIds={expandableIds}
                selectedId={selectedId}
                dragState={dragState}
                onSelectNode={onSelectNode}
                onToggleExpand={onToggleExpand}
                onAddChild={handleAddChild}
                onEditNode={onEditNode}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                workloadWarnings={workloadWarnings}
                warningDetailId={warningDetailId}
                onToggleWarningDetail={handleToggleWarningDetail}
                getUnitName={getUnitName}
                getTypeDisplayName={getTypeDisplayName}
                openMenuId={openMenuId}
                onToggleMenu={handleToggleMenu}
                menuBtnRefs={menuBtnRefs}
                onDeleteNode={onDeleteNode}
                onAssignNode={onAssignNode}
                onRevokeAssign={onRevokeAssign}
                currentUser={currentUser}
                userAuthorities={userAuthorities}
                pendingReceiveIds={pendingReceiveAncestorIds}
                pendingReceiveLeafIds={pendingReceiveLeafIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskTreeView;
