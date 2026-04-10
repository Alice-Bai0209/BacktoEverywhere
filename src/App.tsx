/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import Map from './components/Map';
import Dashboard from './components/Dashboard';
import HistoryPanel from './components/HistoryPanel';
import { useLocationTracker } from './hooks/useLocationTracker';
import { History, LogIn, LogOut, MapPin } from 'lucide-react';
import { auth, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useStore } from './store';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const { currentLocation, currentAltitude } = useLocationTracker();
  const [showHistory, setShowHistory] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const { syncHistoryFromFirebase, status, setLocationPermissionGranted, locationPermissionGranted } = useStore();
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Check location permission status on load
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') {
          setLocationPermissionGranted(true);
        } else if (result.state === 'prompt') {
          setShowPermissionModal(true);
        }
      });
    } else {
      // Fallback for browsers that don't support permissions API (like Safari)
      setShowPermissionModal(true);
    }
  }, [setLocationPermissionGranted]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        syncHistoryFromFirebase();
      }
    });
    return () => unsubscribe();
  }, [syncHistoryFromFirebase]);

  // Request Wake Lock when tracking or returning
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.log('Wake Lock is active');
        }
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current !== null) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock released');
      }
    };

    if (status === 'tracking' || status === 'returning') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Re-request on visibility change
    const handleVisibilityChange = () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status]);

  return (
    <div className="relative w-full h-screen bg-[#151619] overflow-hidden flex flex-col font-sans text-white">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-start pointer-events-none">
        <div className="bg-[#1a1b1e]/90 backdrop-blur-md px-5 py-3 rounded-2xl shadow-lg border border-white/10 pointer-events-auto flex items-center gap-3">
          <h1 className="font-bold text-white tracking-widest uppercase text-sm">原路返回</h1>
          <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></div>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          {user ? (
            <button 
              onClick={logout}
              className="bg-[#1a1b1e]/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut size={20} />
            </button>
          ) : (
            <button 
              onClick={loginWithGoogle}
              className="bg-[#1a1b1e]/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white/10 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <LogIn size={20} />
            </button>
          )}
          <button 
            onClick={() => setShowHistory(true)}
            className="bg-[#1a1b1e]/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border border-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <History size={20} />
          </button>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0">
        <Map currentLocation={currentLocation} />
      </div>

      {/* Dashboard Area */}
      <Dashboard currentAltitude={currentAltitude} currentLocation={currentLocation} />

      {/* History Panel */}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}

      {/* Location Permission Pre-prompt Modal */}
      <AnimatePresence>
        {showPermissionModal && !locationPermissionGranted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#050505] border border-[#00f3ff]/30 rounded-3xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(0,243,255,0.15)] relative text-center"
            >
              <div className="w-16 h-16 bg-[#00f3ff]/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#00f3ff]/50">
                <MapPin size={32} className="text-[#00f3ff]" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2 tracking-widest">需要位置权限</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                “原路返回”需要获取您的实时位置，才能准确记录您的探险轨迹并为您导航回家。<br/><br/>
                <span className="text-[#00f3ff]">请在接下来的系统弹窗中，点击“允许”。</span>
              </p>
              
              <button
                onClick={() => {
                  setShowPermissionModal(false);
                  setLocationPermissionGranted(true);
                  // Trigger a dummy geolocation call to prompt the native dialog immediately
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(() => {}, () => {});
                  }
                }}
                className="w-full bg-[#00f3ff] text-black font-bold py-4 rounded-xl hover:bg-[#00f3ff]/90 transition-colors tracking-widest shadow-[0_0_20px_rgba(0,243,255,0.4)]"
              >
                我知道了，去授权
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

