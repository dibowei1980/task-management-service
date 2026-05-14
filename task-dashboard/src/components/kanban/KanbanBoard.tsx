import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { ChevronRight, Settings2, Check, RotateCcw, ShieldCheck, Archive, Plus } from 'lucide-react';
import { taskService } from '../../services/taskService';
import { taskTreeApi } from '../../services/taskTreeApi';
import { userService } from '../../services/userService';
import { useAuth } from '../../context/AuthContext';
import { Task } from '../../types';
import { TASK_STATUS_LABELS, WORKFLOW_STATUS_LABELS, TASK_CATEGORY_LABELS, hasAnyPermission, MAX_TREE_DEPTH } from '../../utils/constants';
import { TaskColumn } from './TaskColumn';
import TaskTreeView from '../tree/TaskTreeView';
import { CreateChildTaskModal } from '../tree/CreateChildTaskModal';
import CompositionModeBadge from './CompositionModeBadge';
import ProgressFormulaCard from './ProgressFormulaCard';
import LeafProgressFormulaCard from './LeafProgressFormulaCard';
import { useStatusLaneConfig } from '../../hooks/useStatusLaneConfig';
import { useTaskTreeStore } from '../../hooks/useTaskTreeStore';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { CreateProjectModal } from '../common/CreateProjectModal';
import { ProjectEditModal } from './ProjectEditModal';
import { TaskEditModal } from './TaskEditModal';
import { AssignModal } from '../task/AssignModal';
import { DecomposeModal } from '../task/DecomposeModal';
import { SubmitCompletionModal } from '../task/SubmitCompletionModal';
import { SubmitQaModal } from '../task/SubmitQaModal';
import { ViewAttachmentsModal } from '../task/ViewAttachmentsModal';
import { ColorProgressBar } from '../task/ColorProgressBar';
import { NonLeafChildrenView } from './NonLeafChildrenView';
import { WorkloadConsistencyAlert } from '../task/WorkloadConsistencyAlert';
import { useDeleteTask } from '../../hooks/useDeleteTask';
import { useSseNotification } from '../../hooks/useSseNotification';

const allStatusLanes = ['PENDING', 'ASSIGNED', 'RECEIVED', 'IN_PROGRESS', 'SUBMITTED_FOR_QA', 'QA_COMPLETING', 'QA_COMPLETED', 'COMPLETED', 'PAUSED', 'FAILED'];
const taskStatusLanes = ['PENDING', 'ASSIGNED', 'RECEIVED', 'IN_PROGRESS', 'SUBMITTED_FOR_QA', 'QA_COMPLETING', 'QA_COMPLETED', 'COMPLETED', 'PAUSED', 'FAILED'];
const projectStatusTabs = ['PENDING', 'ASSIGNED', 'RECEIVED', 'IN_PROGRESS', 'SUBMITTED_FOR_QA', 'QA_COMPLETING', 'QA_COMPLETED', 'COMPLETED', 'PAUSED', 'FAILED'];
const projectStatusLabels: Record<string, string> = {
  PENDING: '待处理',
  ASSIGNED: '待接收',
  RECEIVED: '已接收',
  IN_PROGRESS: '进行中',
  SUBMITTED_FOR_QA: '待质检',
  QA_COMPLETING: '质检中',
  QA_COMPLETED: '质检完成',
  COMPLETED: '已完成',
  PAUSED: '已暂停',
  FAILED: '失败',
};
const filterStorageKey = 'kanbanProjectFilters';

export const KanbanBoard: React.FC = () => {
  const { user } = useAuth();
  const [allNodes, setAllNodes] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const treeStore = useTaskTreeStore(null);
  const { expandedIds, selectedNodeId: selectedProjectId, toggleExpand, expandAll, collapseAll, ensureExpanded, selectNode, searchQuery: treeSearch, setSearchQuery: setTreeSearch } = treeStore;
  const [activeProjectStatus, setActiveProjectStatus] = useState<string>('ALL');
  const [createdDepartmentFilter, setCreatedDepartmentFilter] = useState<string>('ALL');
  const [responsibleDepartmentFilter, setResponsibleDepartmentFilter] = useState<string>('ALL');
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ id: string; departmentName: string }>>([]);
  const [departmentLoading, setDepartmentLoading] = useState(false);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [userNameById, setUserNameById] = useState<Record<string, string>>({});
  const [openFilter, setOpenFilter] = useState<'status' | 'created' | 'responsible' | null>(null);
  const [openInfoTaskId, setOpenInfoTaskId] = useState<string | null>(null);
  const [showAllTaskInfo, setShowAllTaskInfo] = useState(false);
  const [progressDetailTask, setProgressDetailTask] = useState<Task | null>(null);
  const [showCreateChildModal, setShowCreateChildModal] = useState(false);
  const [createChildParent, setCreateChildParent] = useState<Task | null>(null);
  const [createChildParentDepth, setCreateChildParentDepth] = useState(0);
  const [createChildCategory, setCreateChildCategory] = useState<'PROJECT' | 'OPERATION_TASK'>('OPERATION_TASK');
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTaskHasChildren, setEditingTaskHasChildren] = useState(false);
  const [showLaneConfig, setShowLaneConfig] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignModalTask, setAssignModalTask] = useState<Task | null>(null);
  const [decomposeModalTask, setDecomposeModalTask] = useState<Task | null>(null);
  const [submitCompletionModalTask, setSubmitCompletionModalTask] = useState<Task | null>(null);
  const [submitQaModalTask, setSubmitQaModalTask] = useState<Task | null>(null);
  const [viewAttachmentsTarget, setViewAttachmentsTarget] = useState<{ task: Task; action: 'ASSIGN' | 'SUBMIT_QA' } | null>(null);
  const [leafActionLoading, setLeafActionLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [currentUserDepartmentId, setCurrentUserDepartmentId] = useState<string | undefined>();
  const [userAuthorities, setUserAuthorities] = useState<string[]>([]);
  const laneConfigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLaneConfig) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (laneConfigRef.current && !laneConfigRef.current.contains(e.target as Node)) {
        setShowLaneConfig(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLaneConfig]);

  const { allStatuses, visibleStatuses, toggleStatus, showAll } = useStatusLaneConfig();
  const { getTypeDisplayName, getUnitName } = useProjectTypeStore();

  const projectNodes = useMemo(() => {
    return allNodes.filter(n => n.category === 'PROJECT');
  }, [allNodes]);

  const projectMap = useMemo(() => {
    const map: Record<string, Task> = {};
    projectNodes.forEach(project => {
      map[project.id] = project;
    });
    return map;
  }, [projectNodes]);

  const departmentFilteredProjects = useMemo(() => {
    return projectNodes.filter(project => {
      if (createdDepartmentFilter !== 'ALL' && project.createdDepartmentId !== createdDepartmentFilter) return false;
      if (responsibleDepartmentFilter !== 'ALL' && project.departmentId !== responsibleDepartmentFilter) return false;
      return true;
    });
  }, [createdDepartmentFilter, responsibleDepartmentFilter, projectNodes]);

  const departmentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    departmentOptions.forEach(dept => {
      map[dept.id] = dept.departmentName;
    });
    return map;
  }, [departmentOptions]);

  const filteredProjects = useMemo(() => {
    return departmentFilteredProjects.filter(project => {
      if (activeProjectStatus !== 'ALL' && project.status !== activeProjectStatus) return false;
      return true;
    });
  }, [activeProjectStatus, departmentFilteredProjects]);

  const { rootProjects, childrenMap, allNodesMap } = useMemo(() => {
    const map: Record<string, Task[]> = {};
    const nodeMap: Record<string, Task> = {};
    allNodes.forEach(item => {
      nodeMap[item.id] = item;
      const parentId = item.parentTaskId;
      if (parentId) {
        if (!map[parentId]) {
          map[parentId] = [];
        }
        map[parentId].push(item);
      }
    });
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => a.name.localeCompare(b.name));
    });
    const filteredRootIds = new Set(filteredProjects.map(p => p.id));
    const roots = allNodes
      .filter(n => {
        if (n.parentTaskId && nodeMap[n.parentTaskId]) return false;
        if (n.category === 'PROJECT' && filteredRootIds.has(n.id)) return true;
        if (n.category !== 'PROJECT' && !n.parentTaskId) return true;
        return false;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { rootProjects: roots, childrenMap: map, allNodesMap: nodeMap };
  }, [allNodes, filteredProjects]);

  useEffect(() => {
    if (selectedTask && allNodesMap[selectedTask.id]) {
      setSelectedTask(allNodesMap[selectedTask.id]);
    }
  }, [allNodesMap, selectedTask]);

  const isRootProject = useMemo(() => {
    if (!selectedProjectId) return true;
    const node = allNodesMap[selectedProjectId];
    return !node || !node.parentTaskId;
  }, [selectedProjectId, allNodesMap]);

  const statusLanes = isRootProject ? allStatusLanes : taskStatusLanes;

  const visibleStatusLanes = useMemo(() => {
    return statusLanes.filter(s => {
      if (!visibleStatuses.has(s)) return false;
      return true;
    });
  }, [statusLanes, visibleStatuses]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projectStatusTabs.forEach(status => {
      counts[status] = 0;
    });
    const directChildren = selectedProjectId ? (childrenMap[selectedProjectId] || []) : rootProjects;
    directChildren.forEach(child => {
      if (projectStatusTabs.includes(child.status)) {
        counts[child.status] += 1;
      }
    });
    return counts;
  }, [selectedProjectId, childrenMap, rootProjects]);

  const visibleProjectIds = useMemo(() => {
    const search = treeSearch.trim().toLowerCase();
    if (!search) {
      return new Set(allNodes.map(item => item.id));
    }
    const allIdsSet = new Set(allNodes.map(item => item.id));
    const matched = allNodes.filter(item => item.name.toLowerCase().includes(search));
    const visible = new Set<string>();
    const stack: string[] = [];
    matched.forEach(item => {
      stack.push(item.id);
      let parentId = item.parentTaskId;
      while (parentId && allIdsSet.has(parentId)) {
        visible.add(parentId);
        parentId = allNodesMap[parentId]?.parentTaskId;
      }
    });
    stack.forEach(id => visible.add(id));
    const addDescendants = (id: string) => {
      const children = childrenMap[id] || [];
      children.forEach(child => {
        visible.add(child.id);
        addDescendants(child.id);
      });
    };
    matched.forEach(item => addDescendants(item.id));
    return visible;
  }, [childrenMap, allNodes, allNodesMap, treeSearch]);

  const expandableIds = useMemo(() => {
    const ids = new Set<string>();
    Object.keys(childrenMap).forEach(parentId => {
      if (childrenMap[parentId].length > 0) {
        ids.add(parentId);
      }
    });
    allNodes.forEach(n => {
      if (n.hasChildren) ids.add(n.id);
    });
    return ids;
  }, [childrenMap, allNodes]);

  const loadMyTree = useCallback(async () => {
    setLoading(true);
    try {
      const response = await taskService.getMyTree({ size: 5000 });
      const items: Task[] = Array.isArray(response?.content) ? response.content : [];
      setAllNodes(items);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('加载项目树失败');
      setAllNodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useSseNotification(useCallback(() => {
    loadMyTree();
  }, [loadMyTree]));

  const refreshAfterLeafAction = useCallback(async () => {
    await loadMyTree();
  }, [loadMyTree]);

  const handleLeafReceive = useCallback(async (task: Task) => {
    if (!confirm(`确认接收任务「${task.name}」？`)) return;
    setLeafActionLoading(true);
    try {
      await taskService.receiveTask(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '接收失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleLeafRevoke = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.revokeAssignment(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '撤销失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleRequestUndoReceive = useCallback(async (task: Task) => {
    const isAssigner = currentUserId && task.assignerId && task.assignerId === currentUserId;
    if (isAssigner) {
      if (!confirm(`确认撤销接收任务「${task.name}」？`)) return;
    } else {
      if (!confirm(`确认申请撤销接收任务「${task.name}」？需等待指派人审批。`)) return;
    }
    setLeafActionLoading(true);
    try {
      await taskService.requestUndoReceive(task.id);
      await refreshAfterLeafAction();
      if (!isAssigner) {
        alert('撤销申请已提交，请等待指派人审批');
      }
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '撤销失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction, currentUserId]);

  const handleApproveUndoReceive = useCallback(async (task: Task) => {
    if (!confirm(`确认同意撤销接收任务「${task.name}」？`)) return;
    setLeafActionLoading(true);
    try {
      await taskService.approveUndoReceive(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '审批撤销失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleCancelUndoReceive = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.cancelUndoReceive(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '取消撤销失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleLeafStartProgress = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.startProgress(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '开始处理失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleSubmitQa = useCallback(async (task: Task) => {
    setSubmitQaModalTask(task);
  }, []);

  const handleQaApprove = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.qaApprove(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '质检通过失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleQaReject = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.qaReject(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '质检不通过失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleAcceptQa = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.acceptQa(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '接收质检失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  const handleRevokeQa = useCallback(async (task: Task) => {
    setLeafActionLoading(true);
    try {
      await taskService.revokeQa(task.id);
      await refreshAfterLeafAction();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      alert(e?.response?.data?.message || '撤回质检失败');
    } finally {
      setLeafActionLoading(false);
    }
  }, [refreshAfterLeafAction]);

  useEffect(() => {
    loadMyTree().catch(console.error);
  }, [loadMyTree]);

  useEffect(() => {
    setDepartmentLoading(true);
    userService.getDepartments()
      .then(data => {
        setDepartmentOptions(Array.isArray(data) ? data : []);
        setDepartmentError(null);
      })
      .catch(err => {
        console.error(err);
        setDepartmentOptions([]);
        setDepartmentError('加载部门失败');
      })
      .finally(() => setDepartmentLoading(false));
  }, []);

  useEffect(() => {
    userService.getUsers()
      .then(users => {
        const map: Record<string, string> = {};
        users.forEach(user => {
          if (user?.id) {
            map[user.id] = user.username;
          }
        });
        setUserNameById(map);
      })
      .catch(() => {
        setUserNameById({});
      });
  }, []);

  useEffect(() => {
    userService.getCurrentUser()
      .then(user => {
        setCurrentUserId(user.id);
        setCurrentUserDepartmentId(user.departmentId || undefined);
        setUserAuthorities([...(user.roles || []), ...(user.permissions || [])]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(filterStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { status?: string; created?: string; responsible?: string };
      if (parsed.status) setActiveProjectStatus(parsed.status);
      if (parsed.created) setCreatedDepartmentFilter(parsed.created);
      if (parsed.responsible) setResponsibleDepartmentFilter(parsed.responsible);
    } catch {
      localStorage.removeItem(filterStorageKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(filterStorageKey, JSON.stringify({
      status: activeProjectStatus,
      created: createdDepartmentFilter,
      responsible: responsibleDepartmentFilter,
    }));
  }, [activeProjectStatus, createdDepartmentFilter, responsibleDepartmentFilter]);

  useEffect(() => {
    if (rootProjects.length === 0) return;

    if (selectedProjectId && allNodesMap[selectedProjectId]) {
      const ancestors: string[] = [];
      let current = allNodesMap[selectedProjectId];
      while (current?.parentTaskId) {
        ancestors.push(current.parentTaskId);
        current = allNodesMap[current.parentTaskId];
      }
      if (ancestors.length > 0) {
        ensureExpanded(ancestors);
      }
      return;
    }

    const firstProject = rootProjects[0];
    if (firstProject) {
      selectNode(firstProject.id);
      setSelectedTask(null);
      toggleExpand(firstProject.id);
    }
  }, [rootProjects, selectedProjectId, allNodesMap, selectNode, toggleExpand, ensureExpanded]);

  useEffect(() => {
    const search = treeSearch.trim();
    if (!search) return;
    const idsToExpand = new Set<string>();
    visibleProjectIds.forEach(id => {
      if (expandableIds.has(id)) idsToExpand.add(id);
    });
    expandAll(idsToExpand);
  }, [expandableIds, treeSearch, visibleProjectIds, expandAll]);

  const directChildren = useMemo(() => {
    if (!selectedProjectId) return [];
    const children = childrenMap[selectedProjectId];
    if (children && children.length > 0) return children;
    const node = allNodesMap[selectedProjectId];
    if (node && !node.hasChildren) {
      return [node];
    }
    return [];
  }, [selectedProjectId, childrenMap, allNodesMap]);

  const boardData = useMemo(() => {
    const tasksMap: Record<string, Task> = {};
    const columns: Record<string, { id: string; title: string; taskIds: string[] }> = {};
    statusLanes.forEach(status => {
      columns[status] = {
        id: status,
        title: TASK_STATUS_LABELS[status] || status,
        taskIds: [],
      };
    });

    const parseSw = (swJson: string | null | undefined): Record<string, number> => {
      if (!swJson) return {};
      try { return JSON.parse(swJson); } catch { return {}; }
    };

    const remapStatus = (status: string, _task?: Task): string => {
      void _task;
      return status;
    };

    const collectLeafDescendants = (task: Task): Task[] => {
      const children = childrenMap[task.id];
      if (!children || children.length === 0) return [task];
      const leaves: Task[] = [];
      for (const child of children) {
        if (child.category === 'PROJECT') {
          leaves.push(...collectLeafDescendants(child));
        } else {
          leaves.push(...collectLeafDescendants(child));
        }
      }
      return leaves;
    };

    directChildren.forEach(task => {
      const isLeaf = !task.hasChildren;

      if (isLeaf) {
        const sw = parseSw(task.statusWorkloads);
        const hasMultiStatus = Object.values(sw).some(v => v > 0.001);
        if (hasMultiStatus) {
          const mergedSw: Record<string, number> = {};
          statusLanes.forEach(s => { mergedSw[s] = 0; });
          Object.entries(sw).forEach(([status, wl]) => {
            const target = remapStatus(status, task);
            if (statusLanes.includes(target)) {
              mergedSw[target] += wl;
            }
          });
          statusLanes.forEach(status => {
            const wl = mergedSw[status] ?? 0;
            if (wl > 0.001) {
              const cardKey = `${task.id}-${status}`;
              tasksMap[cardKey] = {
                ...task,
                _cardKey: cardKey,
                _swStatus: status,
                _swWorkload: wl,
                _isMainStatus: status === remapStatus(task.status, task),
              } as Task & { _cardKey: string; _swStatus: string; _swWorkload: number; _isMainStatus: boolean };
              columns[status].taskIds.push(cardKey);
            }
          });
        } else {
          const status = remapStatus(statusLanes.includes(task.status) ? task.status : 'PENDING', task);
          const cardKey = `${task.id}-${status}`;
          tasksMap[cardKey] = {
            ...task,
            _cardKey: cardKey,
            _swStatus: status,
            _swWorkload: task.workload || 0,
            _isMainStatus: true,
          } as Task & { _cardKey: string; _swStatus: string; _swWorkload: number; _isMainStatus: boolean };
          columns[status].taskIds.push(cardKey);
        }
      } else {
        const leaves = collectLeafDescendants(task);
        const aggregatedSw: Record<string, number> = {};
        let aggregatedIpCompleted = 0;
        const units = new Set<string>();
        statusLanes.forEach(s => { aggregatedSw[s] = 0; });
        const isHeterogeneous = task.compositionMode === 'HETEROGENEOUS';
        const parentWorkload = task.workload ?? 0;
        if (isHeterogeneous && parentWorkload > 0 && leaves.length > 0) {
          leaves.forEach(leaf => {
            const leafSw = parseSw(leaf.statusWorkloads);
            if (leaf.workloadUnit) units.add(leaf.workloadUnit);
            const leafWorkload = leaf.workload ?? 0;
            if (leafWorkload <= 0) return;
            const factor = parentWorkload / leaves.length;
            const scale = factor / leafWorkload;
            aggregatedIpCompleted += (leaf.inProgressCompletedWorkload ?? 0) * scale;
            Object.entries(leafSw).forEach(([s, wl]) => {
              const target = remapStatus(s);
              if (statusLanes.includes(target)) {
                aggregatedSw[target] += wl * scale;
              }
            });
          });
        } else {
          leaves.forEach(leaf => {
            const leafSw = parseSw(leaf.statusWorkloads);
            if (leaf.workloadUnit) units.add(leaf.workloadUnit);
            aggregatedIpCompleted += leaf.inProgressCompletedWorkload ?? 0;
            Object.entries(leafSw).forEach(([s, wl]) => {
              const target = remapStatus(s);
              if (statusLanes.includes(target)) {
                aggregatedSw[target] += wl;
              }
            });
          });

          const totalAggregated = Object.values(aggregatedSw).reduce((s, v) => s + v, 0);
          if (totalAggregated > parentWorkload + 0.01 && parentWorkload > 0) {
            const ratio = parentWorkload / totalAggregated;
            statusLanes.forEach(s => { aggregatedSw[s] *= ratio; });
            aggregatedIpCompleted *= ratio;
          }
        }
        const hasAnyWorkload = Object.values(aggregatedSw).some(v => v > 0.001);
        const aggregatedSwJson = JSON.stringify(
          Object.fromEntries(Object.entries(aggregatedSw).filter(([, v]) => v > 0.001))
        );
        if (hasAnyWorkload) {
          statusLanes.forEach(status => {
            const wl = aggregatedSw[status] ?? 0;
            if (wl > 0.001) {
              const cardKey = `${task.id}-${status}`;
              tasksMap[cardKey] = {
                ...task,
                statusWorkloads: aggregatedSwJson,
                _inProgressCompletedWorkloadForBar: aggregatedIpCompleted,
                _cardKey: cardKey,
                _swStatus: status,
                _swWorkload: wl,
                _isMainStatus: status === remapStatus(task.status, task),
                _isNonLeaf: true,
                _aggregatedUnit: units.size === 1 ? [...units][0] : null,
                _leafCount: leaves.length,
              } as Task & { _cardKey: string; _swStatus: string; _swWorkload: number; _isMainStatus: boolean; _isNonLeaf: boolean; _aggregatedUnit: string | null; _leafCount: number };
              columns[status].taskIds.push(cardKey);
            }
          });
        } else {
          const status = remapStatus(statusLanes.includes(task.status) ? task.status : 'PENDING', task);
          const cardKey = `${task.id}-${status}`;
          tasksMap[cardKey] = {
            ...task,
            statusWorkloads: aggregatedSwJson,
            _inProgressCompletedWorkloadForBar: aggregatedIpCompleted,
            _cardKey: cardKey,
            _swStatus: status,
            _swWorkload: 0,
            _isMainStatus: true,
            _isNonLeaf: true,
            _aggregatedUnit: null,
            _leafCount: leaves.length,
          } as Task & { _cardKey: string; _swStatus: string; _swWorkload: number; _isMainStatus: boolean; _isNonLeaf: boolean; _aggregatedUnit: string | null; _leafCount: number };
          columns[status].taskIds.push(cardKey);
        }
      }
    });
    return { tasksMap, columns };
  }, [directChildren, childrenMap, statusLanes]);

  const selectedNodeIsLeaf = useMemo(() => {
    if (!selectedProjectId) return false;
    const node = allNodesMap[selectedProjectId];
    if (!node) return false;
    if (node.hasChildren === false) return true;
    if (node.hasChildren === true) return false;
    const children = childrenMap[selectedProjectId];
    return !children || children.length === 0;
  }, [selectedProjectId, allNodesMap, childrenMap]);

  const directChildrenList = useMemo(() => {
    if (!selectedProjectId || selectedNodeIsLeaf) return [];
    return childrenMap[selectedProjectId] || [];
  }, [selectedProjectId, selectedNodeIsLeaf, childrenMap]);

  const taskNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    allNodes.forEach(task => {
      map[task.id] = task.name;
    });
    return map;
  }, [allNodes]);

  const onSelectProject = (project: Task) => {
    selectNode(project.id);
    setSelectedTask(null);
    if (!expandedIds.has(project.id)) {
      toggleExpand(project.id);
    }
    if (project.parentTaskId && !expandedIds.has(project.parentTaskId)) {
      toggleExpand(project.parentTaskId);
    }
  };

  const onToggleExpandAll = () => {
    expandAll(expandableIds);
  };

  const handleAddChild = (parentTask: Task, parentDepth: number, childCategory: 'PROJECT' | 'OPERATION_TASK') => {
    setCreateChildParent(parentTask);
    setCreateChildParentDepth(parentDepth);
    setCreateChildCategory(childCategory);
    setShowCreateChildModal(true);
  };

  const handleEditNode = useCallback(async (task: Task) => {
    setEditingTask(task);
    try {
      const children = await taskService.getSubTasks(task.id);
      setEditingTaskHasChildren(children.length > 0);
    } catch {
      setEditingTaskHasChildren(false);
    }
  }, []);

  const { deleteTask } = useDeleteTask({
    currentUserId,
    authorities: userAuthorities,
    onDeleted: loadMyTree,
  });

  const handleDeleteNode = useCallback(async (task: Task) => {
    await deleteTask(task);
  }, [deleteTask]);

  const buildDisplayTaskForColorBar = useCallback((task: Task): Task => {
    const children = childrenMap[task.id];
    if (!children || children.length === 0) return task;

    const collectLeaves = (node: Task): Task[] => {
      const nodeChildren = childrenMap[node.id];
      if (!nodeChildren || nodeChildren.length === 0) return [node];
      return nodeChildren.flatMap(collectLeaves);
    };

    const parseStatusWorkloads = (swJson: string | null | undefined): Record<string, number> => {
      if (!swJson) return {};
      try { return JSON.parse(swJson); } catch { return {}; }
    };

    const leaves = collectLeaves(task);
    const aggregatedSw: Record<string, number> = {};
    let aggregatedIpCompleted = 0;
    const isHeterogeneous = task.compositionMode === 'HETEROGENEOUS';
    const parentWorkload = task.workload ?? 0;

    if (isHeterogeneous && parentWorkload > 0 && leaves.length > 0) {
      const pw = parentWorkload;
      const count = leaves.length;
      leaves.forEach(leaf => {
        const leafSw = parseStatusWorkloads(leaf.statusWorkloads);
        const leafWorkload = leaf.workload ?? 0;
        if (leafWorkload <= 0) return;
        const factor = pw / count;
        const scale = factor / leafWorkload;
        aggregatedIpCompleted += (leaf.inProgressCompletedWorkload ?? 0) * scale;
        Object.entries(leafSw).forEach(([status, workload]) => {
          aggregatedSw[status] = (aggregatedSw[status] ?? 0) + workload * scale;
        });
      });
    } else {
      leaves.forEach(leaf => {
        const leafSw = parseStatusWorkloads(leaf.statusWorkloads);
        aggregatedIpCompleted += leaf.inProgressCompletedWorkload ?? 0;
        Object.entries(leafSw).forEach(([status, workload]) => {
          aggregatedSw[status] = (aggregatedSw[status] ?? 0) + workload;
        });
      });

      const totalAggregated = Object.values(aggregatedSw).reduce((s, v) => s + v, 0);
      if (totalAggregated > parentWorkload + 0.01 && parentWorkload > 0) {
        const ratio = parentWorkload / totalAggregated;
        Object.keys(aggregatedSw).forEach(k => {
          aggregatedSw[k] *= ratio;
        });
        aggregatedIpCompleted *= ratio;
      }
    }

    return {
      ...task,
      statusWorkloads: JSON.stringify(Object.fromEntries(Object.entries(aggregatedSw).filter(([, value]) => value > 0.001))),
      _inProgressCompletedWorkloadForBar: aggregatedIpCompleted,
    };
  }, [childrenMap]);

  const selectedNode = selectedProjectId ? (allNodesMap[selectedProjectId] || projectMap[selectedProjectId]) : null;
  const displayTask = selectedTask || selectedNode;
  const colorBarDisplayTask = displayTask ? buildDisplayTaskForColorBar(displayTask) : null;
  const selectedProjectName = selectedNode?.name || '-';

  const isRootProjectForAction = useMemo(() => {
    if (!selectedNode) return false;
    return !selectedNode.parentTaskId && selectedNode.category === 'PROJECT';
  }, [selectedNode]);

  const rootProjectAction = useMemo(() => {
    if (!isRootProjectForAction || !selectedNode) return null;
    const ws = selectedNode.workflowStatus;
    if (ws === 'PENDING_ACCEPTANCE') return 'accept' as const;
    if (ws === 'ACCEPTANCE_COMPLETED') return 'archive' as const;
    return null;
  }, [isRootProjectForAction, selectedNode]);

  const handleRootProjectAction = useCallback(async (action: 'accept' | 'archive') => {
    if (!selectedNode) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const newStatus = action === 'accept' ? 'ACCEPTANCE_COMPLETED' : 'ARCHIVED';
      await taskService.updateWorkflowStatus(selectedNode.id, { workflowStatus: newStatus });
      await loadMyTree();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setActionError(e?.response?.data?.message || (action === 'accept' ? '确认验收失败' : '归档失败'));
    } finally {
      setActionLoading(false);
    }
  }, [selectedNode, loadMyTree]);

  const computedDepthLevel = useMemo(() => {
    const task = displayTask;
    if (!task) return undefined;
    let depth = 0;
    let currentId: string | null = task.parentTaskId || null;
    while (currentId) {
      const parent = allNodesMap[currentId] || projectMap[currentId];
      if (!parent) break;
      depth++;
      currentId = parent.parentTaskId || null;
    }
    return depth;
  }, [displayTask, allNodesMap, projectMap]);
  const assigneeDisplay = useMemo(() => {
    const id = displayTask?.assigneeId;
    if (!id) return '-';
    return userNameById[id] || id;
  }, [displayTask, userNameById]);
  const participantNames = useMemo(() => {
    if (!selectedNode) return '-';
    const ids = Array.isArray(selectedNode.operatorIds) ? selectedNode.operatorIds : [];
    if (!ids.length) return '-';
    return ids.map(id => userNameById[id] || id).join('、');
  }, [selectedNode, userNameById]);
  const totalProjectCount = rootProjects.length;
  const selectedStatusLabel = activeProjectStatus === 'ALL'
    ? '全部项目'
    : (projectStatusLabels[activeProjectStatus] || TASK_STATUS_LABELS[activeProjectStatus] || activeProjectStatus);
  const createdDepartmentLabel = createdDepartmentFilter === 'ALL'
    ? '创建部门'
    : (departmentOptions.find(d => d.id === createdDepartmentFilter)?.departmentName || createdDepartmentFilter);
  const responsibleDepartmentLabel = responsibleDepartmentFilter === 'ALL'
    ? '负责部门'
    : (departmentOptions.find(d => d.id === responsibleDepartmentFilter)?.departmentName || responsibleDepartmentFilter);

  const formatUtfText = (raw?: string) => {
    if (!raw) return '-';
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
      return JSON.stringify(parsed);
    } catch {
      return raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
    }
  };

  const getTaskTooltip = (task: Task) => {
    const parentId = task.parentTaskId;
    const parentName = parentId ? taskNameMap[parentId] : undefined;
    const departmentLabel = departmentNameMap[task.departmentId ?? ''] || task.departmentId || '-';
    const createdDepartmentLabel = departmentNameMap[task.createdDepartmentId ?? ''] || task.createdDepartmentId || '-';
    const lines = [
      `名称: ${task.name}`,
      `类型: ${getTypeDisplayName(task.type, task.category)}`,
      `分类: ${TASK_CATEGORY_LABELS[task.category ?? ''] || task.category || '-'}`,
      `状态: ${TASK_STATUS_LABELS[task.status ?? ''] || task.status || '-'}`,
      `优先级: ${task.priority}`,
      `负责人: ${task.assigneeId ? (userNameById[task.assigneeId] || task.assigneeId) : '-'}`,
      `父任务: ${parentName || parentId || '-'}`,
      `责任部门: ${departmentLabel}`,
      `创建部门: ${createdDepartmentLabel}`,
      `创建人: ${task.createdByName ?? '-'}`,
      `创建时间: ${task.createdAt ?? '-'}`,
      `计划完成: ${task.plannedDueAt ?? '-'}`,
      `进度: ${task.progress ?? '-'}`,
    ];
    return lines.join('\n');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              className={`px-3 py-1 rounded-full text-sm border ${openFilter === 'status' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
              onClick={() => setOpenFilter(prev => prev === 'status' ? null : 'status')}
            >
              {selectedStatusLabel}
            </button>
            {openFilter === 'status' && (
              <div className="absolute z-20 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <button
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${activeProjectStatus === 'ALL' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                  onClick={() => {
                    setActiveProjectStatus('ALL');
                    setSelectedTask(null);
                    setOpenFilter(null);
                  }}
                >
                  全部项目 ({projectNodes.length})
                </button>
                {projectStatusTabs.map(status => (
                  <button
                    key={status}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${activeProjectStatus === status ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                    onClick={() => {
                      setActiveProjectStatus(status);
                      setSelectedTask(null);
                      setOpenFilter(null);
                    }}
                  >
                    {projectStatusLabels[status] || TASK_STATUS_LABELS[status] || status} ({statusCounts[status] ?? 0})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              className={`px-3 py-1 rounded-full text-sm border ${openFilter === 'created' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
              onClick={() => setOpenFilter(prev => prev === 'created' ? null : 'created')}
            >
              {createdDepartmentLabel}
            </button>
            {openFilter === 'created' && (
              <div className="absolute z-20 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <button
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${createdDepartmentFilter === 'ALL' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                  onClick={() => {
                    setCreatedDepartmentFilter('ALL');
                    setOpenFilter(null);
                  }}
                >
                  创建部门 (全部)
                </button>
                {departmentLoading && (
                  <div className="px-3 py-2 text-sm text-gray-500">加载中...</div>
                )}
                {departmentError && (
                  <div className="px-3 py-2 text-sm text-red-600">{departmentError}</div>
                )}
                {!departmentLoading && !departmentError && departmentOptions.map(dept => (
                  <button
                    key={dept.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${createdDepartmentFilter === dept.id ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                    onClick={() => {
                      setCreatedDepartmentFilter(dept.id);
                      setOpenFilter(null);
                    }}
                  >
                    {dept.departmentName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              className={`px-3 py-1 rounded-full text-sm border ${openFilter === 'responsible' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
              onClick={() => setOpenFilter(prev => prev === 'responsible' ? null : 'responsible')}
            >
              {responsibleDepartmentLabel}
            </button>
            {openFilter === 'responsible' && (
              <div className="absolute z-20 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <button
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${responsibleDepartmentFilter === 'ALL' ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                  onClick={() => {
                    setResponsibleDepartmentFilter('ALL');
                    setOpenFilter(null);
                  }}
                >
                  负责部门 (全部)
                </button>
                {departmentLoading && (
                  <div className="px-3 py-2 text-sm text-gray-500">加载中...</div>
                )}
                {departmentError && (
                  <div className="px-3 py-2 text-sm text-red-600">{departmentError}</div>
                )}
                {!departmentLoading && !departmentError && departmentOptions.map(dept => (
                  <button
                    key={dept.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${responsibleDepartmentFilter === dept.id ? 'text-blue-600 bg-blue-50' : 'text-gray-700'}`}
                    onClick={() => {
                      setResponsibleDepartmentFilter(dept.id);
                      setOpenFilter(null);
                    }}
                  >
                    {dept.departmentName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="px-3 py-1 rounded-full text-sm border border-gray-300 text-gray-600 hover:bg-gray-100"
            onClick={() => {
              setActiveProjectStatus('ALL');
              setCreatedDepartmentFilter('ALL');
              setResponsibleDepartmentFilter('ALL');
              setSelectedTask(null);
            }}
          >
            清除筛选
          </button>
        </div>
        <div className="text-sm text-gray-500">
          {loading ? '加载中...' : error || ''} {totalProjectCount ? `项目数 ${totalProjectCount}` : ''}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 h-full">
        <div className="flex flex-col lg:w-[360px] flex-shrink-0">
          <button
            className="mb-2 w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center justify-center gap-1"
            onClick={() => setShowCreateProjectModal(true)}
          >
            + 新增项目
          </button>
          <div className="flex-1 min-h-0">
            <TaskTreeView
          rootNodes={rootProjects}
          childrenMap={childrenMap}
          expandedIds={expandedIds}
          visibleIds={visibleProjectIds}
          expandableIds={expandableIds}
          selectedId={selectedProjectId}
          treeSearch={treeSearch}
          onSelectNode={onSelectProject}
          onToggleExpand={toggleExpand}
          onToggleExpandAll={onToggleExpandAll}
          onCollapseAll={collapseAll}
          onTreeSearchChange={setTreeSearch}
          onAddChild={handleAddChild}
          onEditNode={handleEditNode}
          onMoveNode={async (taskId, newParentId) => {
            await taskTreeApi.moveNode(taskId, newParentId);
            await loadMyTree();
          }}
          onDeleteNode={handleDeleteNode}
          onAssignNode={(task) => setAssignModalTask(task)}
          onRevokeAssign={async (task) => {
            try {
              await taskService.revokeAssignment(task.id);
              await refreshAfterLeafAction();
            } catch (e) {
              const error = e as Error;
              alert(error.message || '撤销指派失败');
            }
          }}
          currentUser={user ? { id: user.id } : null}
          userAuthorities={userAuthorities}
          currentUserDepartmentId={currentUserDepartmentId}
        />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="text-lg font-semibold text-gray-900">{displayTask?.name || selectedProjectName}</div>
              {displayTask?.status ? (
                <span className={`text-xs px-2 py-1 rounded-full ${
                  displayTask.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {TASK_STATUS_LABELS[displayTask.status] || displayTask.status}
                </span>
              ) : displayTask?.hasChildren ? (
                <span className="text-xs px-2 py-1 rounded-full bg-gray-50 text-gray-400 italic">
                  状态未定
                </span>
              ) : null}
              {displayTask?.workflowStatus && displayTask.workflowStatus !== 'ARCHIVED' && (
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  {WORKFLOW_STATUS_LABELS[displayTask.workflowStatus] || displayTask.workflowStatus}
                </span>
              )}
              {displayTask?.compositionMode && (
                <CompositionModeBadge mode={displayTask.compositionMode} size="md" />
              )}
              {computedDepthLevel != null && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                  L{computedDepthLevel}
                </span>
              )}
              <button
                className="w-7 h-7 rounded-full bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-[0_4px_8px_rgba(37,99,235,0.35)] hover:from-blue-400 hover:to-blue-600 flex items-center justify-center"
                onClick={() => setShowAllTaskInfo(prev => !prev)}
                aria-label={showAllTaskInfo ? '收起' : '展开'}
              >
                <ChevronRight className={`w-4 h-4 drop-shadow-sm transition-transform ${showAllTaskInfo ? 'rotate-90' : ''}`} />
              </button>
            </div>
            {displayTask?.progress != null && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-500">进度</span>
                  <span className="font-medium">{displayTask.progress}%</span>
                </div>
                <div
                  className="w-full bg-gray-200 rounded-full h-2.5 cursor-pointer"
                  onClick={() => setProgressDetailTask(displayTask)}
                  title="点击查看进度计算详情"
                >
                  <div
                    className={`h-full rounded-full transition-all ${displayTask.progress >= 100 ? 'bg-green-500' : displayTask.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, displayTask.progress))}%` }}
                  />
                </div>
                <div className="mt-[9px]" >
                  <ColorProgressBar task={colorBarDisplayTask} compact={true} isLeaf={!colorBarDisplayTask?.hasChildren} unitName={colorBarDisplayTask?.workloadUnit ? getUnitName(colorBarDisplayTask.workloadUnit) : undefined} />
                </div>
              </div>
            )}
            {rootProjectAction && (
              <div className="mb-3 flex items-center gap-2">
                {rootProjectAction === 'accept' && (
                  <button
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 text-sm font-medium shadow-sm"
                    disabled={actionLoading}
                    onClick={() => handleRootProjectAction('accept')}
                  >
                    <ShieldCheck size={16} />
                    {actionLoading ? '处理中...' : '确认验收'}
                  </button>
                )}
                {rootProjectAction === 'archive' && (
                  <button
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-60 text-sm font-medium shadow-sm"
                    disabled={actionLoading}
                    onClick={() => handleRootProjectAction('archive')}
                  >
                    <Archive size={16} />
                    {actionLoading ? '处理中...' : '归档'}
                  </button>
                )}
                {isRootProjectForAction && selectedNode?.status === 'COMPLETED' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium">
                    <Check size={14} />
                    已完成
                  </span>
                )}
                {actionError && (
                  <span className="text-xs text-red-600">{actionError}</span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between mt-2 mb-1">
              <span className="font-semibold text-gray-700 text-sm">子任务</span>
              <div className="relative" ref={laneConfigRef}>
                <button
                  className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  onClick={() => setShowLaneConfig(prev => !prev)}
                  title="配置泳道列"
                >
                  <Settings2 size={14} />
                </button>
                {showLaneConfig && (
                  <div className="absolute right-0 top-7 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-56 max-h-80 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">显示状态列</span>
                      <button
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                        onClick={showAll}
                      >
                        <RotateCcw size={12} />
                        全部显示
                      </button>
                    </div>
                    {allStatuses.map(status => (
                      <label
                        key={status}
                        className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            visibleStatuses.has(status)
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'border-gray-300'
                          }`}
                          onClick={() => toggleStatus(status)}
                        >
                          {visibleStatuses.has(status) && <Check size={12} />}
                        </span>
                        <span className="text-gray-700">{TASK_STATUS_LABELS[status] || status}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-gray-500">类型</div>
                <div className="font-medium">{displayTask ? getTypeDisplayName(displayTask.type, displayTask.category) : '-'}</div>
              </div>
              <div>
                <div className="text-gray-500">工作量</div>
                <div className="font-medium">
                  {displayTask?.workload != null ? `${displayTask.workload} ${getUnitName(displayTask.workloadUnit || '')}` : '-'}
                </div>
              </div>
              <div>
                <div className="text-gray-500">权重</div>
                <div className="font-medium">{displayTask?.weight ?? '-'}</div>
              </div>
              <div>
                <div className="text-gray-500">责任部门</div>
                <div className="font-medium break-all">
                  {displayTask?.departmentId ? (departmentNameMap[displayTask.departmentId] || displayTask.departmentId) : '-'}
                </div>
              </div>
              <div>
                <div className="text-gray-500">负责人</div>
                <div className="font-medium">{assigneeDisplay}</div>
              </div>
              <div>
                <div className="text-gray-500">参与人员</div>
                <div className="font-medium break-all">{participantNames}</div>
              </div>
              {showAllTaskInfo && (
                <>
                  <div>
                    <div className="text-gray-500">任务ID</div>
                    <div className="font-medium break-all">{displayTask?.id || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">任务类型</div>
                    <div className="font-medium">{TASK_CATEGORY_LABELS[displayTask?.category ?? ''] || displayTask?.category || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">优先级</div>
                    <div className="font-medium">{displayTask?.priority ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">父任务</div>
                    <div className="font-medium break-all">
                      {displayTask?.parentTaskId ? (taskNameMap[displayTask.parentTaskId] || displayTask.parentTaskId) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">创建部门</div>
                    <div className="font-medium break-all">
                      {displayTask?.createdDepartmentId ? (departmentNameMap[displayTask.createdDepartmentId] || displayTask.createdDepartmentId) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">创建人</div>
                    <div className="font-medium">{displayTask?.createdByName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">创建时间</div>
                    <div className="font-medium">{displayTask?.createdAt || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">计划完成</div>
                    <div className="font-medium">{displayTask?.plannedDueAt || '-'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">结构模式</div>
                    <div className="font-medium">
                      <CompositionModeBadge mode={displayTask?.compositionMode} size="md" />
                      {!displayTask?.compositionMode && '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">层级深度</div>
                    <div className="font-medium">{computedDepthLevel != null ? `L${computedDepthLevel}` : '-'}</div>
                  </div>
                  <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
                    <div className="text-gray-500">输入</div>
                    <div className="font-medium whitespace-pre-wrap break-words select-text">{formatUtfText(displayTask?.inputParams)}</div>
                  </div>
                  <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
                    <div className="text-gray-500">输出</div>
                    <div className="font-medium whitespace-pre-wrap break-words select-text">{formatUtfText(displayTask?.outputResults)}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4">
              {selectedNodeIsLeaf ? (
                <div className="flex gap-4 h-full">
                  {visibleStatusLanes.map(status => {
                    const column = boardData.columns[status];
                    const tasks = column.taskIds.map(taskId => boardData.tasksMap[taskId]);
                    return (
                      <TaskColumn
                        key={status}
                        column={column}
                        tasks={tasks}
                        onTaskClick={(task) => {
                          setOpenInfoTaskId(prev => (prev === task.id ? null : task.id));
                        }}
                        canClick={() => true}
                        getTooltip={getTaskTooltip}
                        openInfoTaskId={openInfoTaskId}
                        onToggleInfo={(taskId) => {
                          setOpenInfoTaskId(prev => (prev === taskId ? null : taskId));
                        }}
                        onCloseInfo={() => setOpenInfoTaskId(null)}
                        userNameById={userNameById}
                        onReceive={handleLeafReceive}
                        onAssign={(task) => setAssignModalTask(task)}
                        onDecompose={(task) => setDecomposeModalTask(task)}
                        onRevokeAssignment={handleLeafRevoke}
                        onRequestUndoReceive={handleRequestUndoReceive}
                        onCancelUndoReceive={handleCancelUndoReceive}
                        onApproveUndoReceive={handleApproveUndoReceive}
                        onStartProgress={handleLeafStartProgress}
                        onSubmitCompletion={(task) => setSubmitCompletionModalTask(task)}
                        onSubmitQa={handleSubmitQa}
                        onAcceptQa={handleAcceptQa}
                        onQaApprove={handleQaApprove}
                        onQaReject={handleQaReject}
                        onRevokeQa={handleRevokeQa}
                        onViewAssignAttachments={(task) => setViewAttachmentsTarget({ task, action: 'ASSIGN' })}
                        onViewSubmitQaAttachments={(task) => setViewAttachmentsTarget({ task, action: 'SUBMIT_QA' })}
                        currentUserId={currentUserId}
                        currentUserDepartmentId={currentUserDepartmentId}
                        userAuthorities={userAuthorities}
                        actionLoading={leafActionLoading}
                        getTypeDisplayName={getTypeDisplayName}
                        getUnitName={getUnitName}
                        departmentNameMap={departmentNameMap}
                        hideCount={true}
                        showActions={true}
                      />
                    );
                  })}
                </div>
              ) : (
                <>
                  {!selectedNodeIsLeaf && selectedNode && (() => {
                    const isController = !!(currentUserId && selectedNode.controllerId && selectedNode.controllerId === currentUserId);
                    const canCreateProject = hasAnyPermission(userAuthorities, 'project:create');
                    const canCreateTask = hasAnyPermission(userAuthorities, 'task:create');
                    const nodeDepth = selectedNode.depthLevel ?? 0;
                    const isAtMaxDepth = nodeDepth >= MAX_TREE_DEPTH - 1;
                    if (!isController || isAtMaxDepth) return null;
                    return (
                      <div className="flex gap-2 mb-3">
                        {selectedNode.category === 'PROJECT' && canCreateProject && (
                          <button
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100"
                            onClick={() => handleAddChild(selectedNode, nodeDepth, 'PROJECT')}
                          >
                            <Plus size={13} /> 添加子项目
                          </button>
                        )}
                        {canCreateTask && (
                          <button
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100"
                            onClick={() => handleAddChild(selectedNode, nodeDepth, 'OPERATION_TASK')}
                          >
                            <Plus size={13} /> 添加子任务
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  <WorkloadConsistencyAlert
                    parent={selectedNode}
                    children={directChildrenList}
                    getUnitName={getUnitName}
                  />
                  <NonLeafChildrenView
                  children={directChildrenList}
                  userNameById={userNameById}
                  onLeafClick={(task) => {
                    selectNode(task.id);
                    setSelectedTask(null);
                    if (task.parentTaskId && !expandedIds.has(task.parentTaskId)) {
                      toggleExpand(task.parentTaskId);
                    }
                  }}
                  getUnitName={getUnitName}
                  getTypeDisplayName={getTypeDisplayName}
                  buildColorBarTask={buildDisplayTaskForColorBar}
                />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreateChildModal && createChildParent && (
        <CreateChildTaskModal
          parentTask={createChildParent}
          parentDepth={createChildParentDepth}
          siblings={childrenMap[createChildParent.id] || []}
          childCategory={createChildCategory}
          onClose={() => {
            setShowCreateChildModal(false);
            setCreateChildParent(null);
          }}
          onSaved={async () => {
            const parentId = createChildParent?.id;
            setShowCreateChildModal(false);
            setCreateChildParent(null);
            await loadMyTree();
            if (parentId && !expandedIds.has(parentId)) {
              toggleExpand(parentId);
            }
          }}
        />
      )}

      {showCreateProjectModal && (
        <CreateProjectModal
          onClose={() => setShowCreateProjectModal(false)}
          onCreated={() => {
            setShowCreateProjectModal(false);
            loadMyTree();
          }}
        />
      )}

      {editingTask && editingTask.category === 'PROJECT' && (
        <ProjectEditModal
          project={editingTask}
          onClose={() => { setEditingTask(null); }}
          onSaved={async () => {
            setEditingTask(null);
            await loadMyTree();
          }}
          hasChildren={editingTaskHasChildren}
        />
      )}

      {editingTask && editingTask.category !== 'PROJECT' && (
        <TaskEditModal
          task={editingTask}
          onClose={() => { setEditingTask(null); }}
          onSaved={async () => {
            setEditingTask(null);
            await loadMyTree();
          }}
          hasChildren={editingTaskHasChildren}
        />
      )}

      {progressDetailTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setProgressDetailTask(null)}>
          <div className="bg-white rounded-lg p-6 w-[560px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">进度计算详情</h2>
              <button onClick={() => setProgressDetailTask(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="mb-3">
              <span className="text-sm text-gray-600">{progressDetailTask.name}</span>
              <span className="ml-2 text-sm font-medium">{progressDetailTask.progress ?? 0}%</span>
            </div>
            {(childrenMap[progressDetailTask.id] || []).filter(c => c.category !== 'SELF_CHECK_TASK').length > 0 ? (
              <ProgressFormulaCard
                node={progressDetailTask}
                children={(childrenMap[progressDetailTask.id] || []).filter(c => c.category !== 'SELF_CHECK_TASK')}
              />
            ) : (
              <LeafProgressFormulaCard task={progressDetailTask} unitName={progressDetailTask.workloadUnit ? getUnitName(progressDetailTask.workloadUnit) : undefined} />
            )}
          </div>
        </div>
      )}

      {assignModalTask && (
        <AssignModal
          task={assignModalTask}
          userAuthorities={userAuthorities}
          currentUserDepartmentId={currentUserDepartmentId}
          currentUserId={currentUserId}
          onClose={() => setAssignModalTask(null)}
          onAssigned={async () => {
            setAssignModalTask(null);
            await refreshAfterLeafAction();
          }}
        />
      )}

      {decomposeModalTask && (
        <DecomposeModal
            task={decomposeModalTask}
            userAuthorities={userAuthorities}
            currentUserDepartmentId={currentUserDepartmentId}
            currentUserId={currentUserId}
            onClose={() => setDecomposeModalTask(null)}
          onDecomposed={async () => {
            setDecomposeModalTask(null);
            await refreshAfterLeafAction();
          }}
        />
      )}

      {submitCompletionModalTask && (
        <SubmitCompletionModal
          task={submitCompletionModalTask}
          onClose={() => setSubmitCompletionModalTask(null)}
          onSubmitted={async (updatedTask) => {
            setSubmitCompletionModalTask(null);
            setSelectedTask(prev => prev?.id === updatedTask.id ? updatedTask : prev);
            await refreshAfterLeafAction();
          }}
        />
      )}

      {submitQaModalTask && (
        <SubmitQaModal
          task={submitQaModalTask}
          currentUserId={currentUserId}
          onClose={() => setSubmitQaModalTask(null)}
          onSubmitted={async () => {
            setSubmitQaModalTask(null);
            await refreshAfterLeafAction();
          }}
        />
      )}

      {viewAttachmentsTarget && (
        <ViewAttachmentsModal
          task={viewAttachmentsTarget.task}
          action={viewAttachmentsTarget.action}
          onClose={() => setViewAttachmentsTarget(null)}
        />
      )}
    </div>
  );
};
