import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bridgeSystemService, bridgeSettingsService } from '../../services/bridgeService';
import { authStorage } from '../../utils/storage';

interface SystemStatus {
  taskManagementConnected: boolean;
  tmsRegistered: boolean;
  localMode: boolean;
  ssoConnected: boolean;
  upmConnected: boolean;
}

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus>({
    taskManagementConnected: true,
    tmsRegistered: true,
    localMode: false,
    ssoConnected: true,
    upmConnected: true,
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enableShadow, setEnableShadow] = useState(false);
  const [polygonDilateIterations, setPolygonDilateIterations] = useState(2);
  const [sam2DilateIterations, setSam2DilateIterations] = useState(2);
  const [sam2LightExpandPixels, setSam2LightExpandPixels] = useState(1);
  const [inpaintCount, setInpaintCount] = useState(1);
  const [blurRadius, setBlurRadius] = useState(2);
  const [expandPixels, setExpandPixels] = useState(3);
  const [settingsTab, setSettingsTab] = useState<'polygon' | 'sam2' | 'inpaint'>('polygon');
  const [headerVisible, setHeaderVisible] = useState(true);
  const headerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      const s = await bridgeSystemService.getSystemStatus();
      setStatus(s);
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (settingsLoaded) return;
    let disposed = false;
    bridgeSettingsService.getSettings().then(s => {
      if (disposed) return;
      if (typeof s.enableShadow === 'boolean') setEnableShadow(s.enableShadow);
      if (typeof s.inpaintCount === 'number' && s.inpaintCount >= 1 && s.inpaintCount <= 8) setInpaintCount(s.inpaintCount);
      if (typeof s.blurRadius === 'number' && s.blurRadius >= 0 && s.blurRadius <= 20) setBlurRadius(s.blurRadius);
      if (typeof s.expandPixels === 'number' && s.expandPixels >= 0 && s.expandPixels <= 50) setExpandPixels(s.expandPixels);
      if (typeof s.polygonDilateIterations === 'number' && s.polygonDilateIterations >= 0 && s.polygonDilateIterations <= 10) setPolygonDilateIterations(s.polygonDilateIterations);
      if (typeof s.sam2DilateIterations === 'number' && s.sam2DilateIterations >= 0 && s.sam2DilateIterations <= 10) setSam2DilateIterations(s.sam2DilateIterations);
      if (typeof s.sam2LightExpandPixels === 'number' && s.sam2LightExpandPixels >= 0 && s.sam2LightExpandPixels <= 20) setSam2LightExpandPixels(s.sam2LightExpandPixels);
      setSettingsLoaded(true);
    }).catch(() => {
      setSettingsLoaded(true);
    });
    return () => { disposed = true; };
  }, [settingsLoaded]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col relative">
      {!status.ssoConnected && headerVisible && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-sm text-red-700">
          SSO 服务未连接 — 认证服务不可用，请检查网络连接
        </div>
      )}
      <div
        className={`fixed top-0 left-0 right-0 z-50 ${headerVisible ? '' : 'h-4'}`}
        onMouseEnter={() => {
          if (headerTimerRef.current) { clearTimeout(headerTimerRef.current); headerTimerRef.current = null; }
          setHeaderVisible(true);
        }}
      >
        <div
          className={`transition-transform duration-300 ease-in-out ${headerVisible ? 'translate-y-0' : '-translate-y-full'}`}
          onMouseLeave={() => {
            headerTimerRef.current = setTimeout(() => setHeaderVisible(false), 800);
          }}
        >
          <header className="bg-white shadow">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="text-xl font-bold text-gray-800">桥梁去除系统</div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.taskManagementConnected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`} title={status.localMode ? '任务管理服务未连接，任务上报与接收功能不可用，桥梁去除项目可独立运行' : undefined}>
                    <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.taskManagementConnected ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                    {status.localMode ? '本地模式' : '任务管理'}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.ssoConnected || status.upmConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} title={!status.ssoConnected && !status.upmConnected ? 'SSO/UPM 服务未连接' : undefined}>
                    <span className={`w-1.5 h-1.5 rounded-full mr-1 ${status.ssoConnected || status.upmConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {!(status.ssoConnected || status.upmConnected) ? '离线' : authStorage.getAuthMethod() === 'upm' ? 'UPM' : 'SSO'}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors duration-200"
                  title="生成设置"
                  onClick={() => setSettingsOpen(true)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="text-sm text-gray-600">欢迎, {user?.displayName || user?.username}</div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  退出登录
                </button>
              </div>
            </div>
          </header>
        </div>
      </div>

      <div className="flex flex-1">
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/30" onClick={() => setSettingsOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-base font-semibold text-gray-800">生成设置</h3>
              <button className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div className="flex border-b">
              {([
                { key: 'polygon' as const, label: '多边形掩膜' },
                { key: 'sam2' as const, label: 'SAM2掩膜' },
                { key: 'inpaint' as const, label: '影像生成' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${settingsTab === tab.key ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                  onClick={() => setSettingsTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="px-5 py-4 space-y-5">
              {settingsTab === 'polygon' && (
                <>
                  <label className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-700">阴影识别</div>
                      <div className="text-xs text-gray-500">多边形掩膜生成时是否识别并包含阴影区域</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableShadow}
                      onChange={e => setEnableShadow(e.target.checked)}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="text-sm font-medium text-gray-700">外扩像素</div>
                        <div className="text-xs text-gray-500">多边形掩膜外扩像素数，1次迭代=1像素</div>
                      </div>
                      <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{polygonDilateIterations}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={polygonDilateIterations}
                      onChange={e => setPolygonDilateIterations(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
                    </div>
                  </div>
                </>
              )}
              {settingsTab === 'sam2' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="text-sm font-medium text-gray-700">外扩像素</div>
                        <div className="text-xs text-gray-500">SAM2掩膜外扩像素数，1次迭代=1像素</div>
                      </div>
                      <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{sam2DilateIterations}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={sam2DilateIterations}
                      onChange={e => setSam2DilateIterations(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
                    </div>
                  </div>
                  <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <div className="text-sm font-medium text-gray-700">光照外扩像素</div>
                      <div className="text-xs text-gray-500">沿光照方向定向外扩，1=1像素</div>
                    </div>
                    <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{sam2LightExpandPixels}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={sam2LightExpandPixels}
                    onChange={e => setSam2LightExpandPixels(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>0</span><span>5</span><span>10</span><span>15</span><span>20</span>
                  </div>
                </div>
                </>
              )}
              {settingsTab === 'inpaint' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="text-sm font-medium text-gray-700">每次生成影像数量</div>
                        <div className="text-xs text-gray-500">单次 Inpaint 并行生成的结果数量</div>
                      </div>
                      <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{inpaintCount}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={inpaintCount}
                      onChange={e => setInpaintCount(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="text-sm font-medium text-gray-700">模糊像素</div>
                        <div className="text-xs text-gray-500">掩膜边缘模糊半径，使修复过渡更自然</div>
                      </div>
                      <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{blurRadius}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={blurRadius}
                      onChange={e => setBlurRadius(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>0</span><span>5</span><span>10</span><span>15</span><span>20</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <div className="text-sm font-medium text-gray-700">扩展像素</div>
                        <div className="text-xs text-gray-500">掩膜向外扩展的像素数，扩大修复范围</div>
                      </div>
                      <span className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{expandPixels}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={expandPixels}
                      onChange={e => setExpandPixels(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="border-t px-5 py-3 flex justify-end">
              <button
                className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  bridgeSettingsService.updateSettings({ enableShadow, polygonDilateIterations, sam2DilateIterations, sam2LightExpandPixels, inpaintCount, blurRadius, expandPixels }).catch(() => undefined);
                  setSettingsOpen(false);
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
