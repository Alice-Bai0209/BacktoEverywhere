import { useStore } from '../store';
import { calculateDistance, playSuccessJingle } from '../lib/utils';
import { Play, Square, Navigation, Mic, MicOff, Route, Map as MapIcon, CheckCircle2, Mountain, Flag, X, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function Dashboard({ currentAltitude, currentLocation }: { currentAltitude: number | null, currentLocation: [number, number] | null }) {
  const { 
    status, 
    startTracking, 
    stopTracking, 
    startReturn, 
    currentTrip, 
    isVoiceEnabled, 
    setVoiceEnabled,
    isMountaineeringMode,
    setMountaineeringMode,
    returnMode,
    setReturnMode,
    saveCheckpoint,
    clearCheckpoints,
    setFocusedLocation,
    checkpoints,
    completeTrip
  } = useStore();

  const [showSaveEffect, setShowSaveEffect] = useState(false);
  const [saveModalConfig, setSaveModalConfig] = useState<{ isOpen: boolean, type: 'start' | 'end' | 'waypoint' } | null>(null);
  const [customSaveName, setCustomSaveName] = useState('');

  useEffect(() => {
    if (status === 'completed') {
      playSuccessJingle();
    }
  }, [status]);

  let distance = 0;
  if (currentTrip && currentTrip.points.length > 1) {
    for (let i = 1; i < currentTrip.points.length; i++) {
      distance += calculateDistance(
        currentTrip.points[i-1].lat,
        currentTrip.points[i-1].lng,
        currentTrip.points[i].lat,
        currentTrip.points[i].lng
      );
    }
  }

  const duration = currentTrip ? Math.floor((Date.now() - currentTrip.startTime) / 60000) : 0;

  const handleSaveCheckpoint = (type: 'start' | 'end' | 'waypoint', name: string) => {
    setSaveModalConfig(null);
    setCustomSaveName('');
    
    const finishSave = (lat: number, lng: number) => {
      saveCheckpoint({ name, lat, lng, type });
      setShowSaveEffect(true);
      setTimeout(() => setShowSaveEffect(false), 1000);
      if (type === 'end') {
        stopTracking();
      }
    };

    if (currentLocation) {
      finishSave(currentLocation[0], currentLocation[1]);
    } else {
      // Fallback if current location is not yet available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          finishSave(pos.coords.latitude, pos.coords.longitude);
        });
      } else if (type === 'end') {
        stopTracking();
      }
    }
  };

  const openSaveModal = (type: 'start' | 'end' | 'waypoint') => {
    setSaveModalConfig({ isOpen: true, type });
  };

  const speak = (text: string) => {
    if (!isVoiceEnabled) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.volume = 0.5;
    window.speechSynthesis.speak(utterance);
  };

  const unlockAudio = () => {
    if (!isVoiceEnabled) return;
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      ctx.resume();
    }
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance('');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <>
      {/* Top Bar for Common Locations */}
      <div className="absolute top-20 left-0 right-0 z-10 flex justify-center pointer-events-none">
        <div className="flex gap-2 overflow-x-auto px-4 pointer-events-auto max-w-full no-scrollbar">
          {checkpoints.map(cp => (
            <button
              key={cp.id}
              onClick={() => setFocusedLocation([cp.lat, cp.lng])}
              className="bg-black/50 backdrop-blur-md border border-white/10 text-white/70 text-xs px-4 py-2 rounded-full whitespace-nowrap hover:bg-[#00f3ff]/20 hover:text-[#00f3ff] hover:border-[#00f3ff]/50 transition-all font-bold"
            >
              {cp.name}
            </button>
          ))}
          {checkpoints.length > 0 && (
            <button
              onClick={clearCheckpoints}
              className="bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-400 text-xs px-3 py-2 rounded-full whitespace-nowrap hover:bg-red-500/40 transition-colors flex items-center justify-center"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {saveModalConfig?.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
            onClick={() => setSaveModalConfig(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#050505] border border-[#00f3ff]/30 rounded-3xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(0,243,255,0.15)] relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setSaveModalConfig(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
              <h3 className="text-xl font-bold text-white mb-4 tracking-widest">选择存档点名称</h3>
              
              <div className="grid grid-cols-3 gap-3 mb-4">
                {['家', '公司', '学校'].map(preset => (
                  <button
                    key={preset}
                    onClick={() => handleSaveCheckpoint(saveModalConfig.type, preset)}
                    className="bg-white/5 hover:bg-[#00f3ff]/20 text-white hover:text-[#00f3ff] border border-white/10 hover:border-[#00f3ff]/50 py-3 rounded-xl transition-colors font-bold"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="自定义名称..." 
                  value={customSaveName}
                  onChange={(e) => setCustomSaveName(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#00f3ff]/50"
                />
                <button
                  onClick={() => {
                    if (customSaveName.trim()) {
                      handleSaveCheckpoint(saveModalConfig.type, customSaveName.trim());
                    }
                  }}
                  disabled={!customSaveName.trim()}
                  className="bg-[#00f3ff] text-black font-bold px-6 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 p-4 z-10 pointer-events-none">
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-[#050505]/85 backdrop-blur-xl rounded-3xl border border-[#00f3ff]/30 shadow-[0_0_30px_rgba(0,243,255,0.15)] p-5 pointer-events-auto relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,243,255,0.05)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
          
          <div className="flex justify-between items-center mb-5 relative z-10">
            <div>
              <h2 className="text-xl font-black text-white tracking-widest">
                {status === 'idle' ? '准备就绪' : status === 'tracking' ? '探险中...' : status === 'returning' ? '返航模式' : '探险大成功！'}
              </h2>
              <p className="text-xs text-[#00f3ff] mt-1 font-mono">
                {status === 'idle' ? '等待出发' : status === 'completed' ? '欢迎安全回到起点' : `已探险 ${duration} 分钟`}
              </p>
            </div>
            <div className="flex gap-2">
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={() => setMountaineeringMode(!isMountaineeringMode)}
                className={cn(
                  "p-2.5 rounded-xl transition-colors border",
                  isMountaineeringMode ? "bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50" : "bg-white/5 text-gray-500 border-white/10"
                )}
              >
                <Mountain size={20} />
              </motion.button>
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={() => setVoiceEnabled(!isVoiceEnabled)}
                className={cn(
                  "p-2.5 rounded-xl transition-colors border",
                  isVoiceEnabled ? "bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50" : "bg-white/5 text-gray-500 border-white/10"
                )}
              >
                {isVoiceEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </motion.button>
            </div>
          </div>

          {(status === 'tracking' || status === 'returning') && (
            <div className={cn("grid gap-3 mb-5 relative z-10", isMountaineeringMode ? "grid-cols-2" : "grid-cols-1")}>
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col items-center justify-center">
                <p className="text-[10px] text-gray-400 mb-1 tracking-widest">已走多远</p>
                <p className="text-2xl font-bold font-mono text-white">{(distance / 1000).toFixed(2)} <span className="text-xs text-[#00f3ff] font-sans">km</span></p>
              </div>
              {isMountaineeringMode && (
                <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col items-center justify-center">
                  <p className="text-[10px] text-gray-400 mb-1 tracking-widest">当前海拔</p>
                  <p className="text-2xl font-bold font-mono text-white">{currentAltitude ? currentAltitude.toFixed(0) : '--'} <span className="text-xs text-[#00f3ff] font-sans">m</span></p>
                </div>
              )}
            </div>
          )}

          {status === 'returning' && (
            <div className="flex bg-white/5 p-1 rounded-xl mb-5 border border-white/10 relative z-10">
              <button
                onClick={() => {
                  setReturnMode('original');
                  speak('已为您规划原路返航路线');
                }}
                className={cn(
                  "flex-1 py-2.5 text-xs font-bold tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all",
                  returnMode === 'original' ? "bg-[#00f3ff] text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]" : "text-gray-400 hover:text-white"
                )}
              >
                <Route size={14} />
                原路退回
              </button>
              <button
                onClick={() => {
                  setReturnMode('shortcut');
                  speak('已为您规划抄近道返航路线');
                }}
                className={cn(
                  "flex-1 py-2.5 text-xs font-bold tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all",
                  returnMode === 'shortcut' ? "bg-[#00f3ff] text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]" : "text-gray-400 hover:text-white"
                )}
              >
                <MapIcon size={14} />
                抄近道
              </button>
            </div>
          )}

          <div className="flex gap-3 relative z-10">
            {status === 'completed' && (
              <>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => openSaveModal('end')}
                  className="flex-1 bg-[#00f3ff] text-black py-4 rounded-xl font-black text-sm tracking-widest flex items-center justify-center gap-2 hover:bg-[#00f3ff]/90 transition-colors shadow-[0_0_20px_rgba(0,243,255,0.3)]"
                >
                  存档
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={stopTracking}
                  className="flex-1 bg-white/10 text-white py-4 rounded-xl font-black text-sm tracking-widest flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
                >
                  直接结束
                </motion.button>
              </>
            )}

            {status === 'idle' && (
              <motion.button 
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  unlockAudio();
                  startTracking();
                  openSaveModal('start');
                }}
                className="flex-1 bg-[#00f3ff] text-black py-4 rounded-xl font-black text-sm tracking-widest flex items-center justify-center gap-2 hover:bg-[#00f3ff]/90 transition-colors shadow-[0_0_20px_rgba(0,243,255,0.3)]"
              >
                <Play size={20} fill="currentColor" />
                开始探险！
              </motion.button>
            )}

            {status === 'tracking' && (
              <>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => openSaveModal('waypoint')}
                  className="w-16 bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-[#00f3ff]/30 transition-colors relative overflow-hidden"
                >
                  <Flag size={18} />
                  <span className="text-[10px] font-bold">记个号</span>
                  {showSaveEffect && (
                    <motion.div 
                      initial={{ scale: 0, opacity: 1 }}
                      animate={{ scale: 2, opacity: 0 }}
                      className="absolute inset-0 bg-[#00f3ff] rounded-full"
                    />
                  )}
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={startReturn}
                  className="flex-1 bg-[#00f3ff] text-black py-4 rounded-xl font-black text-sm tracking-widest flex items-center justify-center gap-2 hover:bg-[#00f3ff]/90 transition-colors shadow-[0_0_20px_rgba(0,243,255,0.3)]"
                >
                  <Navigation size={20} fill="currentColor" />
                  一键返航
                </motion.button>
              </>
            )}

            {(status === 'tracking' || status === 'returning') && (
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={stopTracking}
                className="w-16 bg-white/10 text-white border border-white/20 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-white/20 transition-colors"
              >
                <Square size={18} fill="currentColor" />
                <span className="text-[10px] font-bold">停止</span>
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
