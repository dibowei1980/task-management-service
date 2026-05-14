import React, { useCallback, useEffect, useState } from 'react';
import { Task } from '../../types';
import { taskService } from '../../services/taskService';
import { userService } from '../../services/userService';
import { TaskDetailModal } from '../kanban/TaskDetailModal';
import { TaskEditModal } from '../kanban/TaskEditModal';
import { ProjectEditModal } from '../kanban/ProjectEditModal';
import { TASK_STATUS_LABELS, hasAnyPermission } from '../../utils/constants';
import { ColorProgressBar } from '../task/ColorProgressBar';
import { useAuth } from '../../context/AuthContext';
import { useProjectTypeStore } from '../../hooks/useProjectTypeStore';
import { CreateProjectModal } from '../common/CreateProjectModal';
import { ProjectInfoModal } from '../kanban/ProjectInfoModal';
import { useDeleteTask } from '../../hooks/useDeleteTask';
import { CreateChildTaskModal } from '../tree/CreateChildTaskModal';

export const ManagerDashboard: React.FC = () => {
  const [projects, setProjects] = useState<Task[]>([]);
  const [selectedProject, setSelectedProject] = useState<Task | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Task | null>(null);
  const [editProjectHasChildren, setEditProjectHasChildren] = useState(false);
  const [infoProject, setInfoProject] = useState<Task | null>(null);
  const [projectEditPermission, setProjectEditPermission] = useState<Record<string, { allowed: boolean; message?: string }>>({});
  const { getTypeDisplayName, getUnitName } = useProjectTypeStore();
  const { user } = useAuth();
  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canCreateProject = hasAnyPermission(allAuths, 'project:create');

  const loadProjects = useCallback(async () => {
    try {
      const data = await taskService.getAllTasks({ size: 200, sort: 'createdAt,desc', category: 'PROJECT' });
      const batchTasks = data.content.filter((t: Task) => t.category === 'PROJECT' && !t.parentTaskId);
      setProjects(batchTasks);
      const permissionMap: Record<string, { allowed: boolean; message?: string }> = {};
      await Promise.all(batchTasks.map(async (task: Task) => {
        try {
          const result = await taskService.checkEditPermission(task.id);
          permissionMap[task.id] = result;
        } catch {
          permissionMap[task.id] = { allowed: false, message: '权限校验失败' };
        }
      }));
      setProjectEditPermission(permissionMap);
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const { deleteTask, canDeleteTask } = useDeleteTask({
    currentUserId: user?.id,
    authorities: allAuths,
    onDeleted: loadProjects,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">管理驾驶舱</h1>
        {!selectedProject && (
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            disabled={!canCreateProject}
            className={`bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 ${!canCreateProject ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            新建项目
          </button>
        )}
      </div>

      {selectedProject ? (
        <ProjectDetailView 
          initialProject={selectedProject} 
          onBack={() => setSelectedProject(null)} 
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(p => (
            <div 
              key={p.id} 
              onClick={() => setSelectedProject(p)}
              className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-md border border-gray-200"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold">{p.name}</h3>
                <div className="space-x-2">
                  <button
                    className="text-blue-600 hover:text-blue-800 text-sm"
                    onClick={(e) => { e.stopPropagation(); setInfoProject(p); }}
                  >
                    详情
                  </button>
                  {Object.prototype.hasOwnProperty.call(projectEditPermission, p.id) ? (
                    projectEditPermission[p.id]?.allowed ? (
                      <button 
                        className="text-indigo-600 hover:text-indigo-900 text-sm"
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          try {
                            const children = await taskService.getSubTasks(p.id);
                            setEditProjectHasChildren(children.length > 0);
                          } catch {
                            setEditProjectHasChildren(false);
                          }
                          setEditProject(p); 
                        }}
                      >编辑</button>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {projectEditPermission[p.id]?.message || '无权限修改'}
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">权限校验中...</span>
                  )}
                  {canDeleteTask(p) && (
                    <button 
                      className="text-red-600 hover:text-red-800 text-sm"
                      onClick={async (e) => { 
                        e.stopPropagation();
                        await deleteTask(p);
                      }}
                    >删除</button>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-500 mb-4">
                ID: {p.id.substring(0, 8)}...
              </div>
              <div className="text-sm text-gray-500 mb-4">
                类型: {getTypeDisplayName(p.type, p.category)}
              </div>
              {p.progress != null && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">进度</span>
                    <span className="font-medium">{p.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-full rounded-full transition-all ${p.progress >= 100 ? 'bg-green-500' : p.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                    />
                  </div>
                  <div className="mt-[9px]">
                    <ColorProgressBar task={p} compact={true} isLeaf={!p?.hasChildren} unitName={p?.workloadUnit ? getUnitName(p.workloadUnit) : undefined} />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className={`px-2 py-1 rounded text-xs ${
                  p.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {TASK_STATUS_LABELS[p.status] || p.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="col-span-3 text-center py-10 text-gray-500">
              暂无项目，请点击右上角创建。
            </div>
          )}
        </div>
      )}

      {isCreateModalOpen && (
        <CreateProjectModal 
          onClose={() => setIsCreateModalOpen(false)} 
          onCreated={() => {
            setIsCreateModalOpen(false);
            loadProjects();
          }}
        />
      )}
      {editProject && (
        <ProjectEditModal 
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={() => {
            setEditProject(null);
            loadProjects();
          }}
          hasChildren={editProjectHasChildren}
        />
      )}
      {infoProject && (
        <ProjectInfoModal
          project={infoProject}
          onClose={() => setInfoProject(null)}
        />
      )}
    </div>
  );
};

// --- Sub Components ---

const ProjectDetailView: React.FC<{ initialProject: Task, onBack: () => void }> = ({ initialProject, onBack }) => {
  const { getTypeDisplayName, getUnitName } = useProjectTypeStore();
  const [navStack, setNavStack] = useState<Task[]>([initialProject]);
  const [subTasks, setSubTasks] = useState<Task[]>([]);
  const [showCreateChildModal, setShowCreateChildModal] = useState(false);
  const [createChildCategory, setCreateChildCategory] = useState<'PROJECT' | 'OPERATION_TASK'>('OPERATION_TASK');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editTaskHasChildren, setEditTaskHasChildren] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [taskEditPermission, setTaskEditPermission] = useState<Record<string, { allowed: boolean; message?: string }>>({});
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const allAuths = [...(user?.roles || []), ...(user?.permissions || [])];
  const canCreateSubProject = hasAnyPermission(allAuths, 'project:create');
  const canCreateSubTask = hasAnyPermission(allAuths, 'task:create');
  const currentDepth = navStack.length - 1;

  const currentProject = navStack[navStack.length - 1];

  const loadSubTasks = useCallback(async () => {
    try {
      const tasks = await taskService.getSubTasks(currentProject.id);
      setSubTasks(tasks);
      const permissionMap: Record<string, { allowed: boolean; message?: string }> = {};
      await Promise.all(tasks.map(async (task: Task) => {
        try {
          const result = await taskService.checkEditPermission(task.id);
          permissionMap[task.id] = result;
        } catch {
          permissionMap[task.id] = { allowed: false, message: '权限校验失败' };
        }
      }));
      setTaskEditPermission(permissionMap);
    } catch (e) {
      console.error(e);
    }
  }, [currentProject.id]);

  useEffect(() => {
    userService.getUsers()
      .then(users => {
        const map: Record<string, string> = {};
        users.forEach(u => { map[u.id] = u.username; });
        setUserNameMap(map);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadSubTasks();
  }, [loadSubTasks]);

  const { deleteTask, canDeleteTask } = useDeleteTask({
    currentUserId: user?.id,
    authorities: allAuths,
    onDeleted: loadSubTasks,
  });

  const navigateInto = (task: Task) => {
    setNavStack(prev => [...prev, task]);
    setDetailTask(null);
  };

  const navigateBack = () => {
    if (navStack.length > 1) {
      setNavStack(prev => prev.slice(0, -1));
    } else {
      onBack();
    }
  };

  const navigateTo = (index: number) => {
    setNavStack(prev => prev.slice(0, index + 1));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-2">
        <button onClick={navigateBack} className="mr-4 text-gray-500 hover:text-gray-700">← 返回</button>
        <h2 className="text-xl font-bold flex-1">
          {currentProject.name}
          <span className="ml-2 text-sm font-normal text-gray-500">{currentProject.category === 'PROJECT' ? '项目管理' : '任务管理'}</span>
          <span className="ml-2 inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {getTypeDisplayName(currentProject.type, currentProject.category)}
          </span>
        </h2>
        <button 
          onClick={() => setShowProjectInfo(true)}
          className="mr-2 text-blue-600 hover:text-blue-800 text-sm"
        >
          详情
        </button>
        <div className="flex gap-2">
          {canCreateSubTask && (
            <button 
              onClick={() => { setCreateChildCategory('OPERATION_TASK'); setShowCreateChildModal(true); }}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
            >
              + 新增子任务
            </button>
          )}
          {canCreateSubProject && currentProject.category === 'PROJECT' && (
            <button 
              onClick={() => { setCreateChildCategory('PROJECT'); setShowCreateChildModal(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
            >
              + 新增子项目
            </button>
          )}
        </div>
      </div>

      {navStack.length > 1 && (
        <div className="flex items-center gap-1 mb-4 text-sm">
          {navStack.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <span className="text-gray-400">/</span>}
              {idx < navStack.length - 1 ? (
                <button className="text-blue-600 hover:underline" onClick={() => navigateTo(idx)}>
                  {item.name}
                </button>
              ) : (
                <span className="text-gray-700 font-medium">{item.name}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">执行人</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">进度</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {subTasks.map(task => (
              <tr key={task.id} className={task.category === 'PROJECT' ? 'cursor-pointer hover:bg-blue-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {task.category === 'PROJECT' ? (
                    <button className="text-blue-700 hover:underline" onClick={() => navigateInto(task)}>
                      📁 {task.name}
                    </button>
                  ) : task.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.category === 'PROJECT' ? '子项目' : getTypeDisplayName(task.type, task.category)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {task.operatorIds?.length ? `执行人 ${task.operatorIds.length} 人` : (userNameMap[task.assigneeId || ''] || task.assigneeId || '未指派')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    task.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 
                    task.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {TASK_STATUS_LABELS[task.status] || task.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {task.progress != null ? (
                    <div className="min-w-[100px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-full rounded-full ${task.progress >= 100 ? 'bg-green-500' : task.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600 w-8 text-right">{task.progress}%</span>
                      </div>
                      <div className="mt-[5px]">
                        <ColorProgressBar task={task} compact={true} isLeaf={!task?.hasChildren} unitName={task?.workloadUnit ? getUnitName(task.workloadUnit) : undefined} />
                      </div>
                    </div>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-4">
                  <button 
                    className="text-blue-600 hover:text-blue-900"
                    onClick={() => setDetailTask(task)}
                  >
                    详情
                  </button>
                  {Object.prototype.hasOwnProperty.call(taskEditPermission, task.id) ? (
                    taskEditPermission[task.id]?.allowed ? (
                      <button 
                        className="text-indigo-600 hover:text-indigo-900"
                        onClick={async () => {
                          try {
                            const children = await taskService.getSubTasks(task.id);
                            setEditTaskHasChildren(children.length > 0);
                          } catch {
                            setEditTaskHasChildren(false);
                          }
                          setEditTask(task);
                        }}
                      >
                        修改
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {taskEditPermission[task.id]?.message || '无权限修改'}
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">权限校验中...</span>
                  )}
                  {canDeleteTask(task) && (
                    <button
                      className="text-red-600 hover:text-red-800"
                      type="button"
                      onClick={async () => {
                        await deleteTask(task);
                      }}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {subTasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">暂无子项</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailTask && (
        <TaskDetailModal 
          task={detailTask} 
          onClose={() => setDetailTask(null)} 
          userNameById={userNameMap}
        />
      )}

      {editTask && (
        <TaskEditModal 
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => {
            setEditTask(null);
            loadSubTasks();
          }}
          hasChildren={editTaskHasChildren}
        />
      )}
      
      {showProjectInfo && (
        <ProjectInfoModal 
          project={currentProject}
          onClose={() => setShowProjectInfo(false)}
        />
      )}

      {showCreateChildModal && (
        <CreateChildTaskModal
          parentTask={currentProject}
          parentDepth={currentDepth}
          siblings={subTasks}
          childCategory={createChildCategory}
          onClose={() => setShowCreateChildModal(false)}
          onSaved={() => {
            setShowCreateChildModal(false);
            loadSubTasks();
          }}
        />
      )}
    </div>
  );
};

